'use client';

import { useState, useEffect, useRef } from 'react';
import { saveDraft, getDrafts, deleteDraft } from '../../../../utils/idb';
import { processImageToWebP } from '../../../../utils/imageProcessor';
import { uploadProductImage, saveProduct, getInventory } from '../../../actions/inventoryActions';
import { Upload, Camera, Trash2, Save, CloudUpload, Plus, Loader2 } from 'lucide-react';

export default function InventoryClient({ commerceId, businessName, themeHex, scope, authToken }: { commerceId: string, businessName: string, themeHex: string, scope: string, authToken: string }) {
    const [drafts, setDrafts] = useState<any[]>([]);
    const [syncing, setSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
    
    // Form State
    const [form, setForm] = useState({
        name: '', brand: '', reference: '', description: '', provider: '',
        costPrice: '', normalPrice: '', wholesalePrice: '', area: scope === 'MASTER' ? '' : scope
    });
    const [variations, setVariations] = useState<{name: string, stock: number}[]>([]);
    const [imageWebp, setImageWebp] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadDrafts();
    }, []);

    const loadDrafts = async () => {
        try {
            const list = await getDrafts();
            // Si la app se cerró durante una subida, revertir los que se quedaron en "syncing" a "error"
            const fixedList = await Promise.all(list.map(async d => {
                if (d.status === 'syncing') {
                    const fixed = { ...d, status: 'error' };
                    await saveDraft(fixed);
                    return fixed;
                }
                return d;
            }));
            setDrafts(fixedList.reverse()); // Newest first
        } catch (e) {
            console.error("Error loading drafts", e);
        }
    };

    const handleImageCapture = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const webp = await processImageToWebP(file);
            setImageWebp(webp);
        } catch (err) {
            alert("Error procesando imagen. Intenta de nuevo.");
        }
    };

    const addVariation = () => {
        setVariations([...variations, { name: '', stock: 0 }]);
    };

    const updateVariation = (index: number, field: string, value: any) => {
        const newVars = [...variations];
        newVars[index] = { ...newVars[index], [field]: value };
        setVariations(newVars);
    };

    const removeVariation = (index: number) => {
        setVariations(variations.filter((_, i) => i !== index));
    };

    const saveToDrafts = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!imageWebp) {
            alert("Debes tomar o subir una foto del producto.");
            return;
        }
        if (scope === 'MASTER' && !form.area) {
            alert("Como administrador central, debes seleccionar el Área de destino.");
            return;
        }

        const newDraft = {
            localId: crypto.randomUUID(),
            ...form,
            costPrice: Number(form.costPrice),
            normalPrice: Number(form.normalPrice),
            wholesalePrice: Number(form.wholesalePrice),
            variations,
            imageWebp,
            status: 'draft', // draft | syncing | synced | error
            createdAt: new Date().toISOString()
        };

        await saveDraft(newDraft);
        await loadDrafts();

        // Reset form
        setForm({
            name: '', brand: '', reference: '', description: '', provider: '',
            costPrice: '', normalPrice: '', wholesalePrice: '', area: scope === 'MASTER' ? '' : scope
        });
        setVariations([]);
        setImageWebp(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeDraft = async (localId: string) => {
        if (!confirm("¿Eliminar este borrador?")) return;
        await deleteDraft(localId);
        await loadDrafts();
    };

    const formatCurrency = (val: number) => `$${(val || 0).toLocaleString('es-CO')}`;

    const syncToDatabase = async () => {
        const pending = drafts.filter(d => d.status === 'draft' || d.status === 'error');
        if (pending.length === 0) return;
        
        setSyncing(true);
        setSyncProgress({ current: 0, total: pending.length });

        // Chunking the uploads to 5 parallel at a time to prevent blocking
        const chunkSize = 5;
        let completed = 0;

        for (let i = 0; i < pending.length; i += chunkSize) {
            const chunk = pending.slice(i, i + chunkSize);
            
            const promises = chunk.map(async (draft) => {
                try {
                    // Update UI to syncing
                    const syncingDraft = { ...draft, status: 'syncing' };
                    await saveDraft(syncingDraft);
                    setDrafts(prev => prev.map(d => d.localId === draft.localId ? syncingDraft : d));

                    // 1. Upload Image
                    const publicUrl = await uploadProductImage(commerceId, draft.imageWebp);
                    
                    // 2. Save Product
                    const productPayload = {
                        name: draft.name, brand: draft.brand, reference: draft.reference,
                        description: draft.description, provider: draft.provider,
                        costPrice: draft.costPrice, normalPrice: draft.normalPrice, wholesalePrice: draft.wholesalePrice,
                        area: draft.area, variations: draft.variations,
                        imageUrl: publicUrl, status: 'active'
                    };
                    
                    await saveProduct(commerceId, authToken, productPayload);
                    
                    // 3. Mark as Synced
                    const syncedDraft = { ...syncingDraft, status: 'synced' };
                    await saveDraft(syncedDraft);
                    setDrafts(prev => prev.map(d => d.localId === draft.localId ? syncedDraft : d));
                } catch (e) {
                    console.error("Sync error for " + draft.name, e);
                    const errorDraft = { ...draft, status: 'error' };
                    await saveDraft(errorDraft);
                    setDrafts(prev => prev.map(d => d.localId === draft.localId ? errorDraft : d));
                } finally {
                    completed++;
                    setSyncProgress({ current: completed, total: pending.length });
                }
            });

            await Promise.all(promises);
        }

        setSyncing(false);
        // Automatically clear synced items after 3 seconds
        setTimeout(async () => {
            const syncedItems = drafts.filter(d => d.status === 'synced'); // need fresh state ideally, but we fetch all again
            const currentDrafts = await getDrafts();
            for (const d of currentDrafts) {
                if (d.status === 'synced') {
                    await deleteDraft(d.localId);
                }
            }
            await loadDrafts();
        }, 3000);
    };

    return (
        <div className="max-w-6xl mx-auto p-4 sm:p-6 pb-24">
            <div className="mb-6 flex flex-col sm:flex-row justify-between sm:items-end gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-1">Inventariado PIMS</h1>
                    <p className="text-white/50 text-sm">{businessName} • Acceso: {scope === 'MASTER' ? 'Central de Entradas' : `Área ${scope}`}</p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={syncToDatabase} 
                        disabled={syncing || drafts.filter(d => d.status === 'draft' || d.status === 'error').length === 0}
                        className="flex items-center gap-2 px-5 py-2 rounded-xl text-black font-bold disabled:opacity-50 transition-all hover:scale-105 active:scale-95"
                        style={{ backgroundColor: themeHex }}
                    >
                        {syncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CloudUpload className="w-5 h-5" />}
                        {syncing ? `Sincronizando ${syncProgress.current}/${syncProgress.total}` : 'Sincronizar a BD'}
                    </button>
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                
                {/* FORM PANEL */}
                <div className="lg:col-span-1 bg-[#111] border border-white/10 rounded-2xl p-5 h-fit">
                    <h2 className="text-white font-bold mb-4 flex items-center gap-2">
                        <Plus className="w-5 h-5" style={{ color: themeHex }} />
                        Nuevo Producto
                    </h2>

                    <form onSubmit={saveToDrafts} className="flex flex-col gap-4">
                        
                        {/* Image Capture */}
                        <div 
                            className="w-full aspect-square bg-black border-2 border-dashed border-white/20 rounded-xl overflow-hidden relative flex flex-col items-center justify-center cursor-pointer hover:border-white/50 transition-colors"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {imageWebp ? (
                                <img src={imageWebp} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                                <>
                                    <Camera className="w-10 h-10 text-white/30 mb-2" />
                                    <span className="text-white/50 text-xs text-center px-4">Tocar para Cámara o Galería<br/>(Recorte Automático 1:1)</span>
                                </>
                            )}
                            <input 
                                type="file" 
                                accept="image/*" 
                                capture="environment" 
                                ref={fileInputRef} 
                                className="hidden" 
                                onChange={handleImageCapture}
                            />
                        </div>

                        {scope === 'MASTER' && (
                            <div>
                                <label className="text-xs text-white/50 mb-1 block">Área de Destino</label>
                                <input required type="text" placeholder="Ej. Cova, Cacharros..." value={form.area} onChange={e => setForm({...form, area: e.target.value})} className="w-full bg-black border border-white/10 rounded-lg p-3 text-white text-sm focus:border-white/30 focus:outline-none" />
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                                <label className="text-xs text-white/50 mb-1 block">Nombre del Producto</label>
                                <input required type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-black border border-white/10 rounded-lg p-3 text-white text-sm focus:border-white/30 focus:outline-none" />
                            </div>
                            <div>
                                <label className="text-xs text-white/50 mb-1 block">Marca</label>
                                <input required type="text" value={form.brand} onChange={e => setForm({...form, brand: e.target.value})} className="w-full bg-black border border-white/10 rounded-lg p-3 text-white text-sm focus:border-white/30 focus:outline-none" />
                            </div>
                            <div>
                                <label className="text-xs text-white/50 mb-1 block">Referencia</label>
                                <input required type="text" value={form.reference} onChange={e => setForm({...form, reference: e.target.value})} className="w-full bg-black border border-white/10 rounded-lg p-3 text-white text-sm focus:border-white/30 focus:outline-none" />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="text-xs text-white/50 mb-1 block">Costo ($)</label>
                                <input required type="number" value={form.costPrice} onChange={e => setForm({...form, costPrice: e.target.value})} className="w-full bg-black border border-white/10 rounded-lg p-3 text-white text-sm focus:border-white/30 focus:outline-none" />
                            </div>
                            <div>
                                <label className="text-xs text-white/50 mb-1 block">Mayorista ($)</label>
                                <input required type="number" value={form.wholesalePrice} onChange={e => setForm({...form, wholesalePrice: e.target.value})} className="w-full bg-black border border-white/10 rounded-lg p-3 text-white text-sm focus:border-white/30 focus:outline-none" />
                            </div>
                            <div>
                                <label className="text-xs text-white/50 mb-1 block">Detal ($)</label>
                                <input required type="number" value={form.normalPrice} onChange={e => setForm({...form, normalPrice: e.target.value})} className="w-full bg-black border border-white/10 rounded-lg p-3 text-white text-sm focus:border-white/30 focus:outline-none" />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs text-white/50 mb-1 block">Proveedor</label>
                            <input required type="text" value={form.provider} onChange={e => setForm({...form, provider: e.target.value})} className="w-full bg-black border border-white/10 rounded-lg p-3 text-white text-sm focus:border-white/30 focus:outline-none" />
                        </div>

                        <div>
                            <label className="text-xs text-white/50 mb-1 block">Descripción</label>
                            <textarea required rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full bg-black border border-white/10 rounded-lg p-3 text-white text-sm focus:border-white/30 focus:outline-none resize-none"></textarea>
                        </div>

                        {/* Variaciones */}
                        <div className="bg-black/50 p-3 rounded-xl border border-white/5">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs text-white/50 font-bold">Variaciones e Inventario</label>
                                <button type="button" onClick={addVariation} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white">+</button>
                            </div>
                            <div className="flex flex-col gap-2">
                                {variations.map((v, idx) => (
                                    <div key={idx} className="flex gap-2">
                                        <input type="text" placeholder="Ej. Talla S / Rojo" value={v.name} onChange={e => updateVariation(idx, 'name', e.target.value)} className="flex-1 bg-black border border-white/10 rounded-lg p-2 text-white text-xs focus:outline-none" />
                                        <input type="number" placeholder="Stock" value={v.stock || ''} onChange={e => updateVariation(idx, 'stock', Number(e.target.value))} className="w-20 bg-black border border-white/10 rounded-lg p-2 text-white text-xs focus:outline-none" />
                                        <button type="button" onClick={() => removeVariation(idx)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                ))}
                                {variations.length === 0 && <p className="text-[10px] text-white/30 italic">No hay variaciones. Añade una para controlar stock específico.</p>}
                            </div>
                        </div>

                        <button type="submit" className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold transition-colors mt-2 flex justify-center items-center gap-2">
                            <Save className="w-4 h-4" /> Guardar en Borradores
                        </button>
                    </form>
                </div>

                {/* DRAFTS PANEL */}
                <div className="lg:col-span-2">
                    <div className="bg-[#111] border border-white/10 rounded-2xl p-5 min-h-[500px]">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-white font-bold flex items-center gap-2">
                                Bandeja de Salida (Memoria Local)
                            </h2>
                            <span className="bg-white/10 text-white/60 text-xs px-3 py-1 rounded-full">{drafts.length} items</span>
                        </div>

                        {drafts.length === 0 ? (
                            <div className="h-64 flex flex-col items-center justify-center text-white/30 border-2 border-dashed border-white/5 rounded-xl">
                                <Upload className="w-10 h-10 mb-2 opacity-50" />
                                <p className="text-sm">Todo está sincronizado.</p>
                                <p className="text-xs opacity-50">Los borradores aparecerán aquí.</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {drafts.map(draft => (
                                    <div key={draft.localId} className={`flex items-center gap-4 p-3 rounded-xl border ${draft.status === 'synced' ? 'bg-green-500/10 border-green-500/20' : draft.status === 'error' ? 'bg-red-500/10 border-red-500/20' : 'bg-black border-white/10'}`}>
                                        <img src={draft.imageWebp} alt="Draft" className="w-16 h-16 rounded-lg object-cover bg-white/5" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between">
                                                <h3 className="text-white font-bold text-sm truncate">{draft.name}</h3>
                                                <span className="text-xs font-bold" style={{ color: themeHex }}>{formatCurrency(draft.normalPrice)}</span>
                                            </div>
                                            <p className="text-white/40 text-xs truncate">{draft.brand} • Ref: {draft.reference} • Área: {draft.area}</p>
                                            
                                            <div className="mt-1 flex items-center gap-2">
                                                {draft.status === 'draft' && <span className="text-[10px] bg-white/10 text-white/70 px-2 py-0.5 rounded">Pendiente</span>}
                                                {draft.status === 'syncing' && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/> Subiendo...</span>}
                                                {draft.status === 'synced' && <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded">¡Subido y Cacheado!</span>}
                                                {draft.status === 'error' && <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded">Error de red</span>}
                                            </div>
                                        </div>
                                        {(draft.status === 'draft' || draft.status === 'error') && (
                                            <button onClick={() => removeDraft(draft.localId)} disabled={syncing} className="p-2 text-white/30 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
