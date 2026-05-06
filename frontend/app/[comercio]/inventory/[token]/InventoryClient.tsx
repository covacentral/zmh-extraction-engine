'use client';

import { useState, useEffect, useRef } from 'react';
import { saveDraft, getDrafts, deleteDraft } from '../../../../utils/idb';
import { processImageToWebP } from '../../../../utils/imageProcessor';
import { uploadProductImage, saveProduct } from '../../../actions/inventoryActions';
import { Upload, Camera, Trash2, Save, CloudUpload, Plus, Loader2, List, FileSpreadsheet, Edit3 } from 'lucide-react';

export default function InventoryClient({ commerceId, businessName, themeHex, scope, authToken, catalogCache = [], areasList = [], providersList = [] }: { commerceId: string, businessName: string, themeHex: string, scope: string, authToken: string, catalogCache?: any[], areasList?: string[], providersList?: string[] }) {
    const [activeTab, setActiveTab] = useState<'ingreso' | 'inventario'>('ingreso');
    const [drafts, setDrafts] = useState<any[]>([]);
    const [syncing, setSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
    
    // Form State
    const [form, setForm] = useState({
        name: '', brand: '', reference: '', description: '', provider: '',
        costPrice: '', normalPrice: '', wholesalePrice: '', area: scope === 'MASTER' ? '' : scope
    });
    
    // Default Variation = Parent
    const [variations, setVariations] = useState<{name: string, stock: number, imageWebp: string|null}>([{ name: 'Estándar', stock: 0, imageWebp: null }]);
    
    const [editingLocalId, setEditingLocalId] = useState<string | null>(null);
    const variationFileInputRefs = useRef<{[key: number]: HTMLInputElement | null}>({});

    // Inventory State
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadDrafts();
    }, []);

    const loadDrafts = async () => {
        try {
            const list = await getDrafts();
            const fixedList = await Promise.all(list.map(async d => {
                if (d.status === 'syncing') {
                    const fixed = { ...d, status: 'error' };
                    await saveDraft(fixed);
                    return fixed;
                }
                return d;
            }));
            setDrafts(fixedList.reverse());
        } catch (e) {
            console.error("Error loading drafts", e);
        }
    };

    const handleVariationImageCapture = async (e: any, index: number) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const webp = await processImageToWebP(file);
            const newVars = [...variations];
            newVars[index].imageWebp = webp;
            setVariations(newVars);
        } catch (err) {
            alert("Error procesando imagen de la variación.");
        }
    };

    const addVariation = () => setVariations([...variations, { name: '', stock: 0, imageWebp: null }]);
    
    const updateVariation = (index: number, field: string, value: any) => {
        const newVars = [...variations];
        newVars[index] = { ...newVars[index], [field]: value };
        setVariations(newVars);
    };
    
    const removeVariation = (index: number) => {
        if (variations.length === 1) return alert("Debe existir al menos 1 variación base (Padre).");
        setVariations(variations.filter((_, i) => i !== index));
    };

    const saveToDrafts = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Ensure at least the main/parent variation has an image
        if (!variations[0].imageWebp) {
            alert("Debes tomar o subir una foto para el producto padre (Primera Variación).");
            return;
        }
        if (scope === 'MASTER' && !form.area) {
            alert("Como administrador central, debes seleccionar el Área de destino.");
            return;
        }

        const newDraft = {
            localId: editingLocalId || crypto.randomUUID(),
            ...form,
            costPrice: Number(form.costPrice),
            normalPrice: Number(form.normalPrice),
            wholesalePrice: Number(form.wholesalePrice),
            variations, // variations array contains images now
            status: 'draft',
            createdAt: new Date().toISOString()
        };

        await saveDraft(newDraft);
        await loadDrafts();

        setForm({
            name: '', brand: '', reference: '', description: '', provider: '',
            costPrice: '', normalPrice: '', wholesalePrice: '', area: scope === 'MASTER' ? '' : scope
        });
        setVariations([{ name: 'Estándar', stock: 0, imageWebp: null }]);
        setEditingLocalId(null);
        
        setActiveTab('ingreso');
    };

    const editProduct = (prod: any) => {
        setForm({
            name: prod.name || '', brand: prod.brand || '', reference: prod.reference || '', 
            description: prod.description || '', provider: prod.provider || '',
            costPrice: prod.costPrice || '', normalPrice: prod.normalPrice || '', 
            wholesalePrice: prod.wholesalePrice || '', area: prod.area || ''
        });
        
        // Migrate legacy single images to first variation if needed
        let loadedVars = prod.variations || [];
        if (loadedVars.length === 0) {
            loadedVars = [{ name: 'Estándar', stock: 0, imageWebp: prod.imageUrl || null }];
        } else if (prod.imageUrl && !loadedVars[0].imageWebp) {
            loadedVars[0].imageWebp = prod.imageUrl;
        }
        
        setVariations(loadedVars);
        setEditingLocalId(prod.id); 
        setActiveTab('ingreso');
        window.scrollTo(0, 0);
    };

    const removeDraft = async (localId: string) => {
        if (!confirm("¿Eliminar este borrador?")) return;
        await deleteDraft(localId);
        await loadDrafts();
    };

    const formatCurrency = (val: number) => `$${(val || 0).toLocaleString('es-CO')}`;

    const syncDraft = async (draft: any) => {
        try {
            const syncingDraft = { ...draft, status: 'syncing' };
            await saveDraft(syncingDraft);
            setDrafts(prev => prev.map(d => d.localId === draft.localId ? syncingDraft : d));

            // Upload variation images
            const uploadedVars = await Promise.all(draft.variations.map(async (v: any) => {
                let publicUrl = v.imageWebp;
                if (publicUrl && !publicUrl.startsWith('http')) {
                    publicUrl = await uploadProductImage(commerceId, publicUrl);
                }
                return { ...v, imageWebp: publicUrl };
            }));
            
            // The main image is the first variation's image
            const mainImageUrl = uploadedVars[0]?.imageWebp || null;

            const productPayload = {
                id: draft.localId,
                name: draft.name, brand: draft.brand, reference: draft.reference,
                description: draft.description, provider: draft.provider,
                costPrice: draft.costPrice, normalPrice: draft.normalPrice, wholesalePrice: draft.wholesalePrice,
                area: draft.area, variations: uploadedVars,
                imageUrl: mainImageUrl, status: 'active'
            };
            
            await saveProduct(commerceId, authToken, productPayload);
            
            const syncedDraft = { ...syncingDraft, variations: uploadedVars, status: 'synced' };
            await saveDraft(syncedDraft);
            setDrafts(prev => prev.map(d => d.localId === draft.localId ? syncedDraft : d));
        } catch (e) {
            console.error("Sync error for " + draft.name, e);
            const errorDraft = { ...draft, status: 'error' };
            await saveDraft(errorDraft);
            setDrafts(prev => prev.map(d => d.localId === draft.localId ? errorDraft : d));
        }
    };

    const syncSingleDraft = async (localId: string) => {
        const draft = drafts.find(d => d.localId === localId);
        if (!draft || syncing) return;
        setSyncing(true);
        setSyncProgress({ current: 0, total: 1 });
        await syncDraft(draft);
        setSyncing(false);
        scheduleCleanup();
    };

    const syncToDatabase = async () => {
        const pending = drafts.filter(d => d.status === 'draft' || d.status === 'error');
        if (pending.length === 0) return;
        
        setSyncing(true);
        setSyncProgress({ current: 0, total: pending.length });

        let completed = 0;
        // Limit concurrency to 3
        const concurrencyLimit = 3;
        for (let i = 0; i < pending.length; i += concurrencyLimit) {
            const chunk = pending.slice(i, i + concurrencyLimit);
            await Promise.all(chunk.map(async (draft) => {
                await syncDraft(draft);
                completed++;
                setSyncProgress({ current: completed, total: pending.length });
            }));
        }

        setSyncing(false);
        scheduleCleanup();
    };

    const scheduleCleanup = () => {
        setTimeout(async () => {
            const currentDrafts = await getDrafts();
            for (const d of currentDrafts) {
                if (d.status === 'synced') {
                    await deleteDraft(d.localId);
                }
            }
            await loadDrafts();
        }, 3000);
    };

    const filteredCatalog = catalogCache.filter(p => {
        if (scope !== 'MASTER' && p.area !== scope) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (p.name || '').toLowerCase().includes(q) || (p.reference || '').toLowerCase().includes(q);
        }
        return true;
    });

    const exportToCSV = () => {
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "NOMBRE,EXISTENCIA,P. COSTO,T. PRECIO COSTO,PROVEEDOR,MARCA,REFERENCIA,P. MAYORISTA,P. DETAL,AREA,ESTADO\n";
        
        filteredCatalog.forEach(p => {
            const existencia = p.variations ? p.variations.reduce((acc: number, v: any) => acc + (v.stock || 0), 0) : 0;
            const costo = p.costPrice || 0;
            const tCosto = existencia * costo;
            
            const row = [
                `"${p.name || ''}"`,
                existencia,
                costo,
                tCosto,
                `"${p.provider || ''}"`,
                `"${p.brand || ''}"`,
                `"${p.reference || ''}"`,
                p.wholesalePrice || 0,
                p.normalPrice || 0,
                `"${p.area || ''}"`,
                `"${p.status || ''}"`
            ];
            csvContent += row.join(",") + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `INVENTARIO_${scope}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="max-w-6xl mx-auto p-4 sm:p-6 pb-24">
            <datalist id="areasList">
                {areasList.map((a, i) => <option key={i} value={a} />)}
            </datalist>
            <datalist id="providersList">
                {providersList.map((p, i) => <option key={i} value={p} />)}
            </datalist>

            <div className="mb-6 flex flex-col sm:flex-row justify-between sm:items-end gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-1">Inventariado PIMS</h1>
                    <p className="text-white/50 text-sm">{businessName} • Acceso: {scope === 'MASTER' ? 'Central de Entradas' : `Área ${scope}`}</p>
                </div>
                <div className="flex bg-black/50 p-1 rounded-xl border border-white/10">
                    <button 
                        onClick={() => setActiveTab('ingreso')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'ingreso' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}
                    >
                        <Plus className="w-4 h-4" /> Ingreso
                    </button>
                    <button 
                        onClick={() => setActiveTab('inventario')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'inventario' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}
                    >
                        <List className="w-4 h-4" /> Activos ({filteredCatalog.length})
                    </button>
                </div>
            </div>

            {activeTab === 'ingreso' ? (
                <div className="grid lg:grid-cols-3 gap-6">
                    {/* FORM PANEL */}
                    <div className="lg:col-span-1 bg-[#111] border border-white/10 rounded-2xl p-5 h-fit">
                        <h2 className="text-white font-bold mb-4 flex items-center gap-2">
                            {editingLocalId ? <Edit3 className="w-5 h-5 text-blue-400" /> : <Plus className="w-5 h-5" style={{ color: themeHex }} />}
                            {editingLocalId ? 'Editando Producto' : 'Nuevo Producto'}
                        </h2>

                        <form onSubmit={saveToDrafts} className="flex flex-col gap-4">
                            
                            {scope === 'MASTER' && (
                                <div>
                                    <label className="text-xs text-white/50 mb-1 block">Área de Destino</label>
                                    <input required list="areasList" type="text" placeholder="Ej. Cova, Cacharros..." value={form.area} onChange={e => setForm({...form, area: e.target.value})} className="w-full bg-black border border-white/10 rounded-lg p-3 text-white text-sm focus:border-white/30 focus:outline-none" />
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
                                    <label className="text-xs text-white/50 mb-1 block">Referencia (Única Padre)</label>
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
                                <input required list="providersList" type="text" value={form.provider} onChange={e => setForm({...form, provider: e.target.value})} className="w-full bg-black border border-white/10 rounded-lg p-3 text-white text-sm focus:border-white/30 focus:outline-none" />
                            </div>

                            <div>
                                <label className="text-xs text-white/50 mb-1 block">Descripción</label>
                                <textarea required rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full bg-black border border-white/10 rounded-lg p-3 text-white text-sm focus:border-white/30 focus:outline-none resize-none"></textarea>
                            </div>

                            {/* Variaciones e Imágenes */}
                            <div className="bg-black/50 p-3 rounded-xl border border-white/5">
                                <div className="flex justify-between items-center mb-4">
                                    <label className="text-xs text-white/50 font-bold">Variaciones y Fotografías</label>
                                    <button type="button" onClick={addVariation} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white flex items-center gap-1"><Plus className="w-3 h-3"/> Añadir Variante</button>
                                </div>
                                
                                <div className="flex flex-col gap-3">
                                    {variations.map((v, idx) => (
                                        <div key={idx} className="flex gap-2 items-center bg-white/5 p-2 rounded-xl">
                                            {/* Photo Upload for Variation */}
                                            <div 
                                                className={`w-14 h-14 shrink-0 rounded-lg overflow-hidden relative flex flex-col items-center justify-center cursor-pointer transition-colors border ${v.imageWebp ? 'border-white/20' : 'border-dashed border-white/30 bg-black/50 hover:border-white/60'}`}
                                                onClick={() => {
                                                    const ref = variationFileInputRefs.current[idx];
                                                    if (ref) ref.click();
                                                }}
                                            >
                                                {v.imageWebp ? (
                                                    <img src={v.imageWebp} alt="Var" className="w-full h-full object-cover" />
                                                ) : (
                                                    <Camera className="w-5 h-5 text-white/30" />
                                                )}
                                                <input 
                                                    type="file" accept="image/*" capture="environment" 
                                                    ref={el => { variationFileInputRefs.current[idx] = el; }} 
                                                    className="hidden" onChange={(e) => handleVariationImageCapture(e, idx)}
                                                />
                                            </div>
                                            
                                            <div className="flex-1 flex flex-col gap-1">
                                                <input type="text" placeholder={idx === 0 ? "Ej. Modelo Estándar" : "Ej. Rojo"} value={v.name} onChange={e => updateVariation(idx, 'name', e.target.value)} className="w-full bg-black border border-white/10 rounded p-1.5 text-white text-xs focus:outline-none" required />
                                                <input type="number" placeholder="Cantidad" value={v.stock === 0 ? '' : v.stock} onChange={e => updateVariation(idx, 'stock', Number(e.target.value))} className="w-full bg-black border border-white/10 rounded p-1.5 text-white text-xs focus:outline-none" required />
                                            </div>

                                            {idx > 0 && (
                                                <button type="button" onClick={() => removeVariation(idx)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg shrink-0">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <button type="submit" className={`w-full py-3 rounded-xl hover:bg-white/20 text-white font-bold transition-colors mt-2 flex justify-center items-center gap-2 ${editingLocalId ? 'bg-blue-600/50 border border-blue-500/50' : 'bg-white/10'}`}>
                                <Save className="w-4 h-4" /> {editingLocalId ? 'Actualizar Producto en Borradores' : 'Guardar en Borradores'}
                            </button>
                            {editingLocalId && (
                                <button type="button" onClick={() => {setEditingLocalId(null); setForm({name:'',brand:'',reference:'',description:'',provider:'',costPrice:'',normalPrice:'',wholesalePrice:'',area:scope==='MASTER'?'':scope}); setVariations([{ name: 'Estándar', stock: 0, imageWebp: null }]);}} className="text-xs text-white/40 hover:text-white mt-1">
                                    Cancelar edición
                                </button>
                            )}
                        </form>
                    </div>

                    {/* DRAFTS PANEL */}
                    <div className="lg:col-span-2">
                        <div className="bg-[#111] border border-white/10 rounded-2xl p-5 min-h-[500px]">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-white font-bold flex items-center gap-2">
                                    Bandeja de Salida (Memoria Local)
                                </h2>
                                <div className="flex items-center gap-3">
                                    <span className="bg-white/10 text-white/60 text-xs px-3 py-1 rounded-full">{drafts.length} items</span>
                                    <button 
                                        onClick={syncToDatabase} 
                                        disabled={syncing || drafts.filter(d => d.status === 'draft' || d.status === 'error').length === 0}
                                        className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-black font-bold text-sm disabled:opacity-50 transition-all"
                                        style={{ backgroundColor: themeHex }}
                                    >
                                        {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
                                        {syncing ? 'Sincronizando...' : 'Sincronizar Todo'}
                                    </button>
                                </div>
                            </div>

                            {drafts.length === 0 ? (
                                <div className="h-64 flex flex-col items-center justify-center text-white/30 border-2 border-dashed border-white/5 rounded-xl">
                                    <Upload className="w-10 h-10 mb-2 opacity-50" />
                                    <p className="text-sm">Todo está sincronizado.</p>
                                    <p className="text-xs opacity-50">Los borradores aparecerán aquí.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {drafts.map(draft => {
                                        const mainImage = draft.variations?.[0]?.imageWebp || draft.imageWebp;
                                        return (
                                        <div key={draft.localId} className={`flex items-center gap-4 p-3 rounded-xl border ${draft.status === 'synced' ? 'bg-green-500/10 border-green-500/20' : draft.status === 'error' ? 'bg-red-500/10 border-red-500/20' : 'bg-black border-white/10'}`}>
                                            <img src={mainImage} alt="Draft" className="w-16 h-16 rounded-lg object-cover bg-white/5" />
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
                                                    <span className="text-[10px] text-white/30">{draft.variations?.length || 1} Variante(s)</span>
                                                </div>
                                            </div>
                                            {(draft.status === 'draft' || draft.status === 'error') && (
                                                <div className="flex gap-1">
                                                    {draft.status === 'error' && (
                                                        <button onClick={() => syncSingleDraft(draft.localId)} disabled={syncing} className="p-2 text-white/50 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors" title="Reintentar individualmente">
                                                            <CloudUpload className="w-5 h-5" />
                                                        </button>
                                                    )}
                                                    <button onClick={() => removeDraft(draft.localId)} disabled={syncing} className="p-2 text-white/30 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors" title="Eliminar borrador">
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )})}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                /* INVENTORY PANEL */
                <div className="bg-[#111] border border-white/10 rounded-2xl p-5">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
                        <div className="flex-1">
                            <input 
                                type="text" 
                                placeholder="Buscar por nombre o referencia..." 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full max-w-md bg-black border border-white/10 rounded-xl p-3 text-white text-sm focus:border-white/30 focus:outline-none"
                            />
                        </div>
                        <button 
                            onClick={exportToCSV}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600/20 text-green-400 border border-green-500/20 font-bold text-sm hover:bg-green-600/30 transition-colors"
                        >
                            <FileSpreadsheet className="w-4 h-4" /> Exportar Inventario CSV
                        </button>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-white/5">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-black/50 border-b border-white/5 text-white/50 text-xs">
                                    <th className="p-3 font-medium">Producto</th>
                                    <th className="p-3 font-medium">Ref / Marca</th>
                                    <th className="p-3 font-medium text-right">Existencia</th>
                                    <th className="p-3 font-medium text-right">Costo / Detal</th>
                                    <th className="p-3 font-medium text-center">Estado</th>
                                    <th className="p-3 font-medium text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCatalog.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-white/30 text-sm">
                                            No hay productos que coincidan con la búsqueda.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredCatalog.map(p => {
                                        const stock = p.variations ? p.variations.reduce((a:number, v:any) => a + (v.stock||0), 0) : 0;
                                        // Highlight low stock
                                        const isLowStock = stock <= 3 && stock > 0;
                                        const isOutOfStock = stock === 0;

                                        return (
                                            <tr key={p.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                                <td className="p-3">
                                                    <div className="flex items-center gap-3">
                                                        {p.imageUrl && <img src={p.imageUrl} alt="" className="w-10 h-10 rounded bg-white/5 object-cover" />}
                                                        <div>
                                                            <div className="font-bold text-sm text-white/90">{p.name}</div>
                                                            <div className="text-[10px] text-white/40">{p.area} • {p.variations?.length || 1} V.</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-3">
                                                    <div className="text-xs text-white/80">{p.reference || '-'}</div>
                                                    <div className="text-[10px] text-white/40">{p.brand}</div>
                                                </td>
                                                <td className="p-3 text-right">
                                                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${isOutOfStock ? 'bg-red-500/20 text-red-400' : isLowStock ? 'bg-orange-500/20 text-orange-400' : 'bg-white/10 text-white/90'}`}>
                                                        {stock}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-right">
                                                    <div className="text-xs text-white/50">{formatCurrency(p.costPrice)}</div>
                                                    <div className="text-sm font-bold text-[var(--theme)]" style={{ color: themeHex }}>{formatCurrency(p.normalPrice)}</div>
                                                </td>
                                                <td className="p-3 text-center">
                                                    <span className={`text-[10px] px-2 py-0.5 rounded ${p.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-zinc-800 text-zinc-400'}`}>
                                                        {p.status === 'active' ? 'Activo' : 'Inactivo'}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-center">
                                                    <button onClick={() => editProduct(p)} className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded transition-colors" title="Editar">
                                                        <Edit3 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
