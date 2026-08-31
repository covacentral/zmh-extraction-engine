'use client';

import React, { useState, useEffect } from 'react';
import {
  getCommerceFullConfig,
  saveCommerceConfig,
  createCommerce,
  deleteCommerce,
  saveCatalogProducts
} from '../../actions/superAdminActions';

interface SuperAdminProps {
  masterToken: string;
  initialComercios: any[];
}

export default function SuperAdminClient({ masterToken, initialComercios }: SuperAdminProps) {
  const [comercios, setComercios] = useState<any[]>(initialComercios);
  const [selectedCommerceId, setSelectedCommerceId] = useState<string>(
    initialComercios.length > 0 ? initialComercios[0].id : ''
  );
  const [activeTab, setActiveTab] = useState<'branding' | 'bot' | 'pos' | 'inventory' | 'metrics' | 'catalog' | 'links'>('branding');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Active commerce state
  const [commerceData, setCommerceData] = useState<any>(null);
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);

  // Modals
  const [showNewCommerceModal, setShowNewCommerceModal] = useState(false);
  const [newCommerce, setNewCommerce] = useState({
    businessName: '',
    slug: '',
    businessType: 'tienda',
    themeHex: '#e11d48'
  });

  // Catalog search / filter
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProductEdit, setSelectedProductEdit] = useState<any>(null);

  // Load commerce data when selectedCommerceId changes
  useEffect(() => {
    if (!selectedCommerceId) return;
    loadCommerceDetails(selectedCommerceId);
  }, [selectedCommerceId]);

  const loadCommerceDetails = async (id: string) => {
    setLoading(true);
    try {
      const res = await getCommerceFullConfig(masterToken, id);
      setCommerceData(res.commerce);
      setCatalogProducts(res.catalog || []);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!selectedCommerceId || !commerceData) return;
    setSaving(true);
    setMessage(null);
    try {
      await saveCommerceConfig(masterToken, selectedCommerceId, commerceData);
      setMessage({ type: 'success', text: '¡Configuración guardada exitosamente!' });
      // Update in local comercios list
      setComercios(prev => prev.map(c => c.id === selectedCommerceId ? { ...c, ...commerceData } : c));
    } catch (err: any) {
      setMessage({ type: 'error', text: `Error al guardar: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCommerce = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommerce.businessName) return;
    setSaving(true);
    try {
      const res = await createCommerce(masterToken, newCommerce);
      setMessage({ type: 'success', text: `Comercio "${res.id}" creado exitosamente.` });
      const newEntry = { id: res.id, ...newCommerce };
      setComercios(prev => [...prev, newEntry]);
      setSelectedCommerceId(res.id);
      setShowNewCommerceModal(false);
      setNewCommerce({ businessName: '', slug: '', businessType: 'tienda', themeHex: '#e11d48' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCommerce = async () => {
    if (!selectedCommerceId) return;
    if (!confirm(`¿Estás seguro de eliminar permanentemente el comercio "${selectedCommerceId}"? Esta acción no se puede deshacer.`)) return;

    setSaving(true);
    try {
      await deleteCommerce(masterToken, selectedCommerceId);
      const remaining = comercios.filter(c => c.id !== selectedCommerceId);
      setComercios(remaining);
      setSelectedCommerceId(remaining.length > 0 ? remaining[0].id : '');
      setMessage({ type: 'success', text: `Comercio "${selectedCommerceId}" eliminado.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleProductStatus = async (prodId: string) => {
    const updated = catalogProducts.map(p => {
      if (p.id === prodId) {
        const nextStatus = p.status === 'active' ? 'draft' : 'active';
        return { ...p, status: nextStatus, isHidden: nextStatus === 'draft' };
      }
      return p;
    });
    setCatalogProducts(updated);
    await saveCatalogProducts(masterToken, selectedCommerceId, updated);
  };

  const handleSaveProductEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductEdit) return;

    const updated = catalogProducts.map(p => p.id === selectedProductEdit.id ? selectedProductEdit : p);
    setCatalogProducts(updated);
    setSelectedProductEdit(null);
    await saveCatalogProducts(masterToken, selectedCommerceId, updated);
    setMessage({ type: 'success', text: 'Producto actualizado en el catálogo.' });
  };

  const filteredProducts = catalogProducts.filter(p => {
    const term = searchTerm.toLowerCase();
    return (
      (p.name && p.name.toLowerCase().includes(term)) ||
      (p.reference && p.reference.toLowerCase().includes(term)) ||
      (p.brand && p.brand.toLowerCase().includes(term)) ||
      (p.category && p.category.toLowerCase().includes(term))
    );
  });

  const themeHex = commerceData?.themeHex || '#e11d48';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col selection:bg-rose-500 selection:text-white">
      {/* ── Topbar ───────────────────────────────────────────────────────────── */}
      <header className="bg-zinc-900/80 border-b border-white/10 backdrop-blur-xl sticky top-0 z-50 px-4 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-600/30">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-black text-lg text-white tracking-tight">ZMH SUPER ADMIN</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Master Active</span>
            </div>
            <p className="text-xs text-zinc-400">Consola Central de Configuración y Extracción Multi-Comercio</p>
          </div>
        </div>

        {/* Commerce Switcher & Actions */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-black/60 border border-white/10 rounded-xl px-3 py-1.5">
            <span className="text-xs text-zinc-400 font-bold uppercase">Comercio:</span>
            <select
              value={selectedCommerceId}
              onChange={(e) => setSelectedCommerceId(e.target.value)}
              className="bg-transparent text-white font-bold text-sm outline-none cursor-pointer"
            >
              {comercios.map((c) => (
                <option key={c.id} value={c.id} className="bg-zinc-900 text-white">
                  {c.businessName || c.id} ({c.id})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowNewCommerceModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors border border-white/10"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nuevo Comercio
          </button>

          {selectedCommerceId && (
            <div className="flex items-center gap-2">
              <a
                href={`/${selectedCommerceId}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition-colors border border-white/5 flex items-center gap-1"
                title="Abrir Concentrador Link Hub"
              >
                🌐 Hub
              </a>
              <a
                href={`/${selectedCommerceId}/catalogo`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-colors shadow-lg shadow-rose-600/20 flex items-center gap-1"
                title="Abrir Catálogo Web"
              >
                🛍️ Catálogo
              </a>
            </div>
          )}
        </div>
      </header>

      {/* ── Notification Banner ──────────────────────────────────────────────── */}
      {message && (
        <div className={`px-6 py-3 flex items-center justify-between text-sm font-bold ${
          message.type === 'success' ? 'bg-emerald-600/90 text-white' :
          message.type === 'error' ? 'bg-rose-600/90 text-white' : 'bg-blue-600/90 text-white'
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-white/80 hover:text-white text-xs font-mono uppercase">✕ Cerrar</button>
        </div>
      )}

      {/* ── Main Layout ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col md:flex-row max-w-7xl w-full mx-auto p-4 md:p-6 gap-6">
        {/* Sidebar Navigation */}
        <aside className="w-full md:w-64 shrink-0 flex md:flex-col gap-2 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0">
          {[
            { id: 'branding', label: 'General & Branding', icon: '🏢' },
            { id: 'bot', label: 'Bot WhatsApp & Despacho', icon: '🤖' },
            { id: 'catalog', label: 'Editor de Catálogo', icon: '🏷️' },
            { id: 'pos', label: 'Caja & POS', icon: '🧾' },
            { id: 'inventory', label: 'Inventario PIMS', icon: '📦' },
            { id: 'metrics', label: 'Métricas & Finanzas', icon: '📊' },
            { id: 'links', label: 'Enlaces Link Hub', icon: '🔗' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold transition-all text-left whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                  : 'bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/5'
              }`}
            >
              <span className="text-base">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}

          <div className="hidden md:block mt-auto pt-6">
            <button
              onClick={handleDeleteCommerce}
              className="w-full px-4 py-3 bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-800/40 rounded-2xl text-xs font-bold transition-colors text-left flex items-center gap-2"
            >
              🗑️ Eliminar Comercio
            </button>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 bg-zinc-900/50 border border-white/10 rounded-3xl p-5 md:p-8 backdrop-blur-md flex flex-col">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-400">
              <div className="w-8 h-8 border-3 border-rose-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-bold">Cargando configuración de {selectedCommerceId}...</p>
            </div>
          ) : commerceData ? (
            <div className="flex flex-col gap-6">

              {/* ── TAB 1: BRANDING & GENERAL ──────────────────────────────────── */}
              {activeTab === 'branding' && (
                <div className="flex flex-col gap-5">
                  <div className="border-b border-white/10 pb-4">
                    <h2 className="text-xl font-black text-white">General & Identidad de Marca</h2>
                    <p className="text-xs text-zinc-400">Datos principales, logo, color corporativo y tipo de negocio.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">Nombre Comercial</label>
                      <input
                        type="text"
                        value={commerceData.businessName || ''}
                        onChange={(e) => setCommerceData({ ...commerceData, businessName: e.target.value })}
                        className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-white outline-none focus:border-rose-500"
                        placeholder="Ej. Bodega Mayorista Montería"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">Tipo de Negocio</label>
                      <select
                        value={commerceData.businessType || 'tienda'}
                        onChange={(e) => setCommerceData({ ...commerceData, businessType: e.target.value })}
                        className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-white outline-none focus:border-rose-500 cursor-pointer"
                      >
                        <option value="tienda">Tienda Retail / Mayorista (Modo Tienda)</option>
                        <option value="restaurante">Restaurante / Bar (Mesas y Meseros)</option>
                        <option value="servicios">Servicios Profesionales</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">Color de Tema (Hex)</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={commerceData.themeHex || '#e11d48'}
                          onChange={(e) => setCommerceData({ ...commerceData, themeHex: e.target.value })}
                          className="w-10 h-10 rounded-xl bg-transparent border border-white/10 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={commerceData.themeHex || '#e11d48'}
                          onChange={(e) => setCommerceData({ ...commerceData, themeHex: e.target.value })}
                          className="flex-1 bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono text-white outline-none focus:border-rose-500 uppercase"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">Logo / Avatar WhatsApp (JID o Teléfono)</label>
                      <input
                        type="text"
                        value={commerceData.avatarJid || ''}
                        onChange={(e) => setCommerceData({ ...commerceData, avatarJid: e.target.value })}
                        className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-rose-500 font-mono"
                        placeholder="Ej. 573226460199 o https://chat.whatsapp.com/..."
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">Teléfono Principal de Contacto</label>
                      <input
                        type="text"
                        value={commerceData.contactPhone || ''}
                        onChange={(e) => setCommerceData({ ...commerceData, contactPhone: e.target.value })}
                        className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-rose-500"
                        placeholder="Ej. +57 322 646 0199"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">Dirección / Sede Principal</label>
                      <input
                        type="text"
                        value={commerceData.address || ''}
                        onChange={(e) => setCommerceData({ ...commerceData, address: e.target.value })}
                        className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-rose-500"
                        placeholder="Ej. Calle 35 # 2-15, Montería"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-400 block mb-1">Descripción / Slogan</label>
                    <textarea
                      rows={3}
                      value={commerceData.description || ''}
                      onChange={(e) => setCommerceData({ ...commerceData, description: e.target.value })}
                      className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-rose-500"
                      placeholder="Breve presentación del comercio para el enlace de inicio..."
                    />
                  </div>
                </div>
              )}

              {/* ── TAB 3: WHATSAPP BOT & DISPATCH ─────────────────────────────── */}
              {activeTab === 'bot' && (
                <div className="flex flex-col gap-5">
                  <div className="border-b border-white/10 pb-4">
                    <h2 className="text-xl font-black text-white">Bot de WhatsApp & Despacho de Pedidos</h2>
                    <p className="text-xs text-zinc-400">Configura a qué grupos de WhatsApp o números se despachan los tickets y facturas en PDF.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">Grupo / JID Principal de Despacho</label>
                      <input
                        type="text"
                        value={commerceData.dispatchJid || ''}
                        onChange={(e) => setCommerceData({ ...commerceData, dispatchJid: e.target.value })}
                        className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-rose-500 font-mono"
                        placeholder="https://chat.whatsapp.com/... o 120363...@g.us"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">Grupo Ventas Mayoristas (Opcional)</label>
                      <input
                        type="text"
                        value={commerceData.wholesaleJid || ''}
                        onChange={(e) => setCommerceData({ ...commerceData, wholesaleJid: e.target.value })}
                        className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-rose-500 font-mono"
                        placeholder="https://chat.whatsapp.com/..."
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">Grupo Ventas Minoristas / Detal (Opcional)</label>
                      <input
                        type="text"
                        value={commerceData.retailJid || ''}
                        onChange={(e) => setCommerceData({ ...commerceData, retailJid: e.target.value })}
                        className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-rose-500 font-mono"
                        placeholder="https://chat.whatsapp.com/..."
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">Grupo Mostrador / POS (Opcional)</label>
                      <input
                        type="text"
                        value={commerceData.posJid || ''}
                        onChange={(e) => setCommerceData({ ...commerceData, posJid: e.target.value })}
                        className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-rose-500 font-mono"
                        placeholder="https://chat.whatsapp.com/..."
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB 4: CATALOG & PRODUCTS EDITOR ───────────────────────────── */}
              {activeTab === 'catalog' && (
                <div className="flex flex-col gap-5">
                  <div className="border-b border-white/10 pb-4 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-black text-white">Catálogo & Productos ({catalogProducts.length})</h2>
                      <p className="text-xs text-zinc-400">Edición rápida de precios, fotos, referencias y estado.</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        placeholder="🔍 Buscar por nombre, ref, marca..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="bg-black/60 border border-white/10 rounded-xl px-4 py-2 text-xs text-white outline-none w-64 focus:border-rose-500"
                      />
                    </div>
                  </div>

                  {/* Products Table */}
                  <div className="overflow-x-auto border border-white/10 rounded-2xl bg-black/40">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-white/5 text-zinc-400 uppercase font-mono tracking-wider border-b border-white/10">
                        <tr>
                          <th className="p-3">Foto</th>
                          <th className="p-3">Producto</th>
                          <th className="p-3">Ref / Marca</th>
                          <th className="p-3">P. Detal</th>
                          <th className="p-3">P. Mayorista</th>
                          <th className="p-3">Estado</th>
                          <th className="p-3 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {filteredProducts.slice(0, 50).map((prod) => (
                          <tr key={prod.id} className="hover:bg-white/5 transition-colors">
                            <td className="p-3">
                              <div className="w-10 h-10 rounded-lg bg-zinc-800 overflow-hidden border border-white/10 flex items-center justify-center">
                                {prod.imageUrl ? (
                                  <img src={prod.imageUrl} alt={prod.name} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-zinc-600 text-[10px]">Sin foto</span>
                                )}
                              </div>
                            </td>
                            <td className="p-3">
                              <span className="font-bold text-white block line-clamp-1">{prod.name}</span>
                              <span className="text-[10px] text-zinc-500">{prod.category || 'Sin categoría'}</span>
                            </td>
                            <td className="p-3 font-mono">
                              <span className="text-zinc-300 block">{prod.reference || 'N/A'}</span>
                              <span className="text-[10px] text-zinc-500">{prod.brand || 'N/A'}</span>
                            </td>
                            <td className="p-3 font-bold text-emerald-400">
                              ${(prod.normalPrice ? prod.normalPrice * 1000 : (prod.priceAmount1000 || prod.price || 0)).toLocaleString('es-CO')}
                            </td>
                            <td className="p-3 font-bold text-rose-400">
                              ${(prod.wholesalePrice ? prod.wholesalePrice * 1000 : (prod.normalPrice ? prod.normalPrice * 1000 : 0)).toLocaleString('es-CO')}
                            </td>
                            <td className="p-3">
                              <button
                                onClick={() => handleToggleProductStatus(prod.id)}
                                className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase transition-colors ${
                                  prod.status === 'active' || !prod.status
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-zinc-800 text-zinc-400 border border-white/10'
                                }`}
                              >
                                {prod.status === 'active' || !prod.status ? 'Activo' : 'Oculto'}
                              </button>
                            </td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => setSelectedProductEdit(prod)}
                                className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[10px] font-bold"
                              >
                                Editar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── TAB 5: POS & CAJA ───────────────────────────────────────────── */}
              {activeTab === 'pos' && (
                <div className="flex flex-col gap-5">
                  <div className="border-b border-white/10 pb-4">
                    <h2 className="text-xl font-black text-white">Módulo de Caja & POS Mostrador</h2>
                    <p className="text-xs text-zinc-400">Tokens de caja, sedes, meseros y puntos de atención.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">Token de Acceso a Caja</label>
                      <input
                        type="text"
                        value={commerceData.cajaToken || ''}
                        onChange={(e) => setCommerceData({ ...commerceData, cajaToken: e.target.value })}
                        className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-rose-500 font-mono"
                        placeholder="Ej. caja_secreta_2026"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB 6: INVENTORY PIMS ──────────────────────────────────────── */}
              {activeTab === 'inventory' && (
                <div className="flex flex-col gap-5">
                  <div className="border-b border-white/10 pb-4">
                    <h2 className="text-xl font-black text-white">Inventario PIMS</h2>
                    <p className="text-xs text-zinc-400">Tokens de gestión y parámetros de inventario.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">Token de Acceso a Inventario</label>
                      <input
                        type="text"
                        value={commerceData.inventoryToken || ''}
                        onChange={(e) => setCommerceData({ ...commerceData, inventoryToken: e.target.value })}
                        className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-rose-500 font-mono"
                        placeholder="Ej. inv_secreto_2026"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB 7: METRICS & FINANCE ───────────────────────────────────── */}
              {activeTab === 'metrics' && (
                <div className="flex flex-col gap-5">
                  <div className="border-b border-white/10 pb-4">
                    <h2 className="text-xl font-black text-white">Métricas & Reportes Financieros</h2>
                    <p className="text-xs text-zinc-400">Analíticas de ventas, cierres de caja y reportes diarios automáticos en Excel.</p>
                  </div>

                  <div className="flex items-center gap-3 bg-black/40 border border-white/10 rounded-2xl p-4">
                    <input
                      type="checkbox"
                      id="premiumMetrics"
                      checked={commerceData.premiumMetrics === true}
                      onChange={(e) => setCommerceData({ ...commerceData, premiumMetrics: e.target.checked })}
                      className="w-5 h-5 rounded accent-rose-600 cursor-pointer"
                    />
                    <div>
                      <label htmlFor="premiumMetrics" className="text-sm font-bold text-white cursor-pointer">
                        Activar Módulo Premium de Métricas & Reportes Diarios Automáticos
                      </label>
                      <p className="text-xs text-zinc-400">Genera archivo CSV de ventas diarias y lo despacha al grupo de WhatsApp a las 11:59 PM.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">Token de Analíticas</label>
                      <input
                        type="text"
                        value={commerceData.metricsToken || ''}
                        onChange={(e) => setCommerceData({ ...commerceData, metricsToken: e.target.value })}
                        className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-rose-500 font-mono"
                        placeholder="Ej. metricas_token_2026"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB 8: LINK HUB LINKS ──────────────────────────────────────── */}
              {activeTab === 'links' && (
                <div className="flex flex-col gap-5">
                  <div className="border-b border-white/10 pb-4">
                    <h2 className="text-xl font-black text-white">Enlaces & Botones del Link Hub</h2>
                    <p className="text-xs text-zinc-400">Configura botones de redes sociales, asesores con foto y accesos rápidos.</p>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-400 block mb-1">Instagram (@usuario)</label>
                    <input
                      type="text"
                      value={commerceData.instagram || ''}
                      onChange={(e) => setCommerceData({ ...commerceData, instagram: e.target.value })}
                      className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-rose-500"
                      placeholder="Ej. @bodegamayorista"
                    />
                  </div>
                </div>
              )}

              {/* ── Action Footer ────────────────────────────────────────────── */}
              <div className="border-t border-white/10 pt-5 mt-auto flex items-center justify-between">
                <div className="text-xs text-zinc-500">
                  Comercio activo: <span className="font-mono text-zinc-300 font-bold">{selectedCommerceId}</span>
                </div>

                <button
                  onClick={handleSaveConfig}
                  disabled={saving}
                  className="px-8 py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-xl shadow-rose-600/30 flex items-center gap-2 disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Guardando cambios...
                    </>
                  ) : (
                    <>
                      💾 Guardar Configuración de Comercio
                    </>
                  )}
                </button>
              </div>

            </div>
          ) : (
            <div className="py-20 text-center text-zinc-500 text-sm">
              No hay comercio seleccionado. Por favor crea o selecciona uno.
            </div>
          )}
        </main>
      </div>

      {/* ── Modal: Crear Nuevo Comercio ──────────────────────────────────────── */}
      {showNewCommerceModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4">
            <h3 className="text-lg font-black text-white">➕ Crear Nuevo Comercio</h3>

            <form onSubmit={handleCreateCommerce} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-zinc-400 block mb-1">Nombre Comercial</label>
                <input
                  type="text"
                  required
                  value={newCommerce.businessName}
                  onChange={(e) => setNewCommerce({ ...newCommerce, businessName: e.target.value })}
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-rose-500"
                  placeholder="Ej. Distribuidora Central"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-400 block mb-1">Identificador URL (Slug)</label>
                <input
                  type="text"
                  value={newCommerce.slug}
                  onChange={(e) => setNewCommerce({ ...newCommerce, slug: e.target.value })}
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-rose-500 font-mono"
                  placeholder="Ej. distribuidora-central"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-400 block mb-1">Tipo de Negocio</label>
                <select
                  value={newCommerce.businessType}
                  onChange={(e) => setNewCommerce({ ...newCommerce, businessType: e.target.value })}
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-rose-500"
                >
                  <option value="tienda">Tienda Retail / Mayorista</option>
                  <option value="restaurante">Restaurante / Bar</option>
                  <option value="servicios">Servicios</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNewCommerceModal(false)}
                  className="px-4 py-2.5 text-xs font-bold text-zinc-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black rounded-xl uppercase"
                >
                  Crear Comercio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Editar Producto ───────────────────────────────────────────── */}
      {selectedProductEdit && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/10 rounded-3xl p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4">
            <h3 className="text-lg font-black text-white">✏️ Editar Producto</h3>

            <form onSubmit={handleSaveProductEdit} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-zinc-400 block mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  value={selectedProductEdit.name || ''}
                  onChange={(e) => setSelectedProductEdit({ ...selectedProductEdit, name: e.target.value })}
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-zinc-400 block mb-1">Precio Detal (en Miles)</label>
                  <input
                    type="number"
                    step="any"
                    value={selectedProductEdit.normalPrice ?? 0}
                    onChange={(e) => setSelectedProductEdit({ ...selectedProductEdit, normalPrice: Number(e.target.value), price: Number(e.target.value) * 1000, priceAmount1000: Number(e.target.value) * 1000 })}
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-rose-500"
                  />
                  <span className="text-[10px] text-zinc-500 font-mono">Total: ${(Number(selectedProductEdit.normalPrice || 0) * 1000).toLocaleString('es-CO')}</span>
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-400 block mb-1">Precio Mayorista (en Miles)</label>
                  <input
                    type="number"
                    step="any"
                    value={selectedProductEdit.wholesalePrice ?? 0}
                    onChange={(e) => setSelectedProductEdit({ ...selectedProductEdit, wholesalePrice: Number(e.target.value) })}
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-rose-500"
                  />
                  <span className="text-[10px] text-zinc-500 font-mono">Total: ${(Number(selectedProductEdit.wholesalePrice || 0) * 1000).toLocaleString('es-CO')}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-zinc-400 block mb-1">Referencia</label>
                  <input
                    type="text"
                    value={selectedProductEdit.reference || ''}
                    onChange={(e) => setSelectedProductEdit({ ...selectedProductEdit, reference: e.target.value })}
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-rose-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-400 block mb-1">Marca</label>
                  <input
                    type="text"
                    value={selectedProductEdit.brand || ''}
                    onChange={(e) => setSelectedProductEdit({ ...selectedProductEdit, brand: e.target.value })}
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-400 block mb-1">URL de Imagen</label>
                <input
                  type="text"
                  value={selectedProductEdit.imageUrl || ''}
                  onChange={(e) => setSelectedProductEdit({ ...selectedProductEdit, imageUrl: e.target.value, imageUrls: e.target.value })}
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setSelectedProductEdit(null)}
                  className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black rounded-xl uppercase"
                >
                  Guardar Producto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
