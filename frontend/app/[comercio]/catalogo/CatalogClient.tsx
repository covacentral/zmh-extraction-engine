'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import { getVipClient, getAsesor } from '../../actions/getUserData';

export default function CatalogClient({ commerceId, data, themeHex, RENDER_API }: any) {
  let { businessName, whatsappCatalog = [] } = data;

  const searchParams = useSearchParams();
  const [vipClient, setVipClient] = useState<any>(null);
  const [asesorData, setAsesorData] = useState<any>(null);

  const [isWholesale, setIsWholesale] = useState(false);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(10);
  
  const [cart, setCart] = useState<any[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '', datetime: '' });
  const [isASAP, setIsASAP] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
     const vipId = searchParams.get('vip');
     const asesorId = searchParams.get('asesor');

     if (vipId) {
         getVipClient(commerceId, vipId).then(client => {
             if (client) {
                 setVipClient(client);
                 setIsWholesale(true);
                 setFormData(prev => ({ ...prev, name: client.name || '', phone: client.phone || '' }));
             }
         });
     }

     if (asesorId) {
         getAsesor(commerceId, asesorId).then(asesor => {
             if (asesor) {
                 setAsesorData(asesor);
                 setIsWholesale(true); // Asesor can switch, default to wholesale
             }
         });
     }
  }, [searchParams, commerceId]);

  const getProductPrice = (product: any, wholesale: boolean) => {
      let rawPrice = product.priceAmount1000 !== undefined ? product.priceAmount1000 : product.price;
      let regularPrice = (rawPrice || 0) / 1000;
      if (!wholesale) return regularPrice;
      const desc = product.description || '';
      const match = desc.match(/mayorista:\s*\$?(\d+(\.\d+)?)/i);
      if (match && match[1]) return parseFloat(match[1]);
      return regularPrice;
  };

  const getProductRef = (product: any) => {
      const desc = product.description || '';
      const match = desc.match(/(?:referencia|ref):\s*([a-zA-Z0-9_-]+)/i);
      if (match && match[1]) return match[1];
      return null;
  };

  // Fallback for image URLs based on standard Baileys Product structure
  const getImageUrl = (prod: any) => {
    if (!prod.imageUrls) return '';
    if (typeof prod.imageUrls === 'string') return prod.imageUrls;
    if (prod.imageUrls.requested) return prod.imageUrls.requested;
    if (prod.imageUrls.original) return prod.imageUrls.original;
    if (Array.isArray(prod.imageUrls)) return prod.imageUrls[0] || '';
    return '';
  };

  // Extract categories (hashtags)
  const categories = useMemo(() => {
     const tags = new Set<string>();
     whatsappCatalog.forEach((prod: any) => {
        const desc = prod.description || '';
        const matches = desc.match(/#[a-zA-Z0-9_áéíóúñÁÉÍÓÚÑ]+/g);
        if (matches) {
           matches.forEach((m: string) => tags.add(m));
        }
     });
     return Array.from(tags);
  }, [whatsappCatalog]);

  // Filtered and paginated products
  const filteredProducts = useMemo(() => {
     let filtered = whatsappCatalog;
     
     if (selectedCategory) {
         filtered = filtered.filter((prod: any) => 
            (prod.description || '').toLowerCase().includes(selectedCategory.toLowerCase())
         );
     }
     
     if (search) {
         filtered = filtered.filter((prod: any) => 
            prod.name?.toLowerCase().includes(search.toLowerCase()) || 
            prod.description?.toLowerCase().includes(search.toLowerCase())
         );
     }
     
     return filtered;
  }, [whatsappCatalog, search, selectedCategory]);

  const visibleProducts = filteredProducts.slice(0, visibleCount);

  // Cart operations
  const addToCart = (product: any, price: number) => {
     const refCode = getProductRef(product);
     setCart(prev => {
        const existing = prev.find(i => i.id === product.id);
        if (existing) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
        return [...prev, { id: product.id, name: product.name, refCode, price, qty: 1 }];
     });
  };

  const removeProduct = (id: string) => {
     setCart(prev => prev.filter(i => i.id !== id));
  };

  const setQty = (id: string, newQty: any) => {
     if (newQty === '') {
         setCart(prev => prev.map(i => i.id === id ? { ...i, qty: '' } : i));
         return;
     }
     const val = Number(newQty);
     if (isNaN(val) || val < 1) {
         removeProduct(id);
         return;
     }
     setCart(prev => prev.map(i => i.id === id ? { ...i, qty: val } : i));
  };

  useEffect(() => {
     setCart(prev => {
        let changed = false;
        const newCart = prev.map(item => {
            const catalogItem = whatsappCatalog.find((p: any) => p.id === item.id);
            if (catalogItem) {
                const newPrice = getProductPrice(catalogItem, isWholesale);
                if (newPrice !== item.price) {
                    changed = true;
                    return { ...item, price: newPrice };
                }
            }
            return item;
        });
        return changed ? newCart : prev;
     });
  }, [isWholesale, whatsappCatalog]);

  // Load cart from localStorage on mount
  useEffect(() => {
     setIsMounted(true);
     const savedCart = localStorage.getItem(`cart_${commerceId}`);
     if (savedCart) {
        try { setCart(JSON.parse(savedCart)); } catch(e){}
     }
  }, [commerceId]);

  // Save cart to localStorage on changes
  useEffect(() => {
     if (isMounted) {
        localStorage.setItem(`cart_${commerceId}`, JSON.stringify(cart));
     }
  }, [cart, commerceId, isMounted]);

  const cartTotal = cart.reduce((acc, item) => acc + (item.price * (Number(item.qty) || 0)), 0);

  // Time formatter
  const formatTimeTo12h = (isoString: string) => {
     if (!isoString) return '';
     const date = new Date(isoString);
     return date.toLocaleString('es-CO', { 
         hour: 'numeric', 
         minute: '2-digit', 
         hour12: true, 
         month: 'short', 
         day: 'numeric' 
     });
  };

  const handleCheckout = async (e: any) => {
      e.preventDefault();
      setIsSubmitting(true);
      
      const formattedTime = formatTimeTo12h(formData.datetime);
      const finalDatetime = asesorData ? 'En tienda' : (isASAP ? 'Lo antes posible' : (formattedTime || formData.datetime));
      
      try {
          const res = await fetch(`${RENDER_API}/api/dispatch`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                 commerceId, 
                 ...formData, 
                 phone: asesorData ? '' : `57${formData.phone}`,
                 datetime: finalDatetime,
                 cart, 
                 total: cartTotal, 
                 isWholesale,
                 isStoreSale: !!asesorData,
                 asesorName: asesorData?.name,
                 asesorSection: asesorData?.section
              })
          });
          
          if (!res.ok) {
             const isJson = res.headers.get('content-type')?.includes('application/json');
             const data = isJson ? await res.json() : null;
             alert((data && data.error) ? data.error : 'El servidor se está actualizando. Intenta en 1 minuto.');
             setIsSubmitting(false);
             return;
          }

          const result = await res.json();
          if (result.ok) {
              setSuccess(true);
              setCart([]);
              localStorage.removeItem(`cart_${commerceId}`);
          } else {
              alert(result.error || 'Error enviando solicitud');
          }
      } catch (err) {
          alert('Error de conexión con el servidor. Revisa tu internet.');
      }
      setIsSubmitting(false);
  };

  return (
    <main className="flex flex-col items-center p-4 min-h-screen w-full relative bg-black font-sans pb-32" style={{ '--theme': themeHex } as any}>
       <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120%] h-64 opacity-20 blur-[100px] pointer-events-none z-0" style={{ backgroundColor: 'var(--theme)' }} />

       <div className="w-full max-w-lg z-10 flex flex-col gap-4 pt-20">
          
          {/* TOP BAR: BACK BUTTON & SEARCH */}
          <div className="flex items-center gap-3 mt-2">
             <button onClick={() => window.history.back()} className="w-10 h-10 flex shrink-0 items-center justify-center bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
             </button>
             <div className="relative flex-1">
                <input 
                   type="text" 
                   value={search}
                   onChange={e => { setSearch(e.target.value); setVisibleCount(10); }}
                   placeholder="Buscar productos..."
                   className="w-full bg-white/10 border border-white/10 rounded-full py-3 px-5 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[var(--theme)] transition-colors"
                />
             </div>
          </div>

          <div className="flex justify-between items-center mt-2">
             <h2 className="text-white text-xl font-black tracking-tight">Catálogo</h2>
             {vipClient ? (
                 <div className="flex items-center gap-1 bg-[var(--theme)]/20 text-[var(--theme)] px-3 py-1.5 rounded-full border border-[var(--theme)]/30">
                    <span className="text-[11px] uppercase tracking-wider font-bold">🌟 VIP Activo</span>
                 </div>
             ) : (
                 <div className="flex items-center gap-1 bg-black/40 p-1 rounded-full border border-white/10">
                    <button onClick={() => setIsWholesale(false)} className={`px-4 py-1.5 rounded-full text-[11px] uppercase tracking-wider font-bold transition-all ${!isWholesale ? 'bg-white text-black shadow-md' : 'text-white/50 hover:text-white'}`}>Normal</button>
                    <button onClick={() => setIsWholesale(true)} className={`px-4 py-1.5 rounded-full text-[11px] uppercase tracking-wider font-bold transition-all ${isWholesale ? 'bg-[var(--theme)] text-white shadow-[0_0_10px_var(--theme)]' : 'text-white/50 hover:text-white'}`}>Mayorista</button>
                 </div>
             )}
          </div>
          {asesorData && (
             <div className="bg-white/10 p-3 mt-2 rounded-xl border border-[var(--theme)]/30 flex items-center justify-between">
                <div>
                   <span className="text-[10px] font-bold text-[var(--theme)] uppercase tracking-widest block mb-0.5">Venta en Tienda (POS)</span>
                   <span className="text-white text-sm font-bold block">{asesorData.name}</span>
                </div>
                <div className="text-right">
                   <span className="text-white/50 text-[10px] block uppercase font-bold tracking-wider">{asesorData.section}</span>
                </div>
             </div>
          )}

          {/* CATEGORY FILTERS */}
          {categories.length > 0 && (
             <div className="flex overflow-x-auto gap-2 mt-2 pb-2 scrollbar-hide -mx-4 px-4">
                <button onClick={() => { setSelectedCategory(null); setVisibleCount(10); }} className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${!selectedCategory ? 'bg-[var(--theme)] border-[var(--theme)] text-white shadow-[0_0_10px_var(--theme)]' : 'bg-black/40 border-white/10 text-white/50 hover:text-white'}`}>
                   Todos
                </button>
                {categories.map((cat, idx) => (
                   <button key={idx} onClick={() => { setSelectedCategory(cat); setVisibleCount(10); }} className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${selectedCategory === cat ? 'bg-[var(--theme)] border-[var(--theme)] text-white shadow-[0_0_10px_var(--theme)]' : 'bg-black/40 border-white/10 text-white/50 hover:text-white'}`}>
                      {cat}
                   </button>
                ))}
             </div>
          )}

          {/* LIST VIEW */}
          <div className="flex flex-col gap-3 mt-2">
             {visibleProducts.map((prod: any) => {
                const price = getProductPrice(prod, isWholesale);
                const refCode = getProductRef(prod);
                const imageUrl = getImageUrl(prod);
                const inCart = cart.find(i => i.id === prod.id);

                return (
                   <div key={prod.id} className="bg-white/5 hover:bg-white/10 rounded-3xl p-2.5 flex gap-4 items-center border border-white/5 transition-colors">
                      {/* Thumbnail */}
                      <div className="w-20 h-20 shrink-0 bg-zinc-900 rounded-2xl overflow-hidden relative border border-white/5">
                         {imageUrl ? <img src={imageUrl} alt={prod.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white/20"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>}
                      </div>
                      
                      {/* Info */}
                      <div className="flex-1 flex flex-col py-1">
                         <h3 className="text-white/90 text-[13px] font-bold leading-snug line-clamp-2">{prod.name}</h3>
                         {refCode && <span className="inline-block mt-1 w-max px-1.5 py-0.5 bg-white/10 text-white/60 text-[10px] font-mono rounded border border-white/5 uppercase tracking-wider">REF: {refCode}</span>}
                         <span className="text-[var(--theme)] font-black text-sm mt-1 block">${price.toLocaleString('es-CO')}</span>
                      </div>

                      {/* Add Button */}
                      <div className="shrink-0 pr-1">
                         {isMounted && inCart ? (
                            <div className="flex items-center bg-white/5 rounded-full overflow-hidden border border-[var(--theme)]/30">
                               <button onClick={() => setQty(prod.id, (Number(inCart.qty) || 0) - 1)} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors">-</button>
                               <input type="text" inputMode="numeric" pattern="[0-9]*" value={inCart.qty} onChange={(e) => setQty(prod.id, e.target.value)} onBlur={() => { if (!inCart.qty || Number(inCart.qty) < 1) setQty(prod.id, 1); }} className="w-10 text-center bg-transparent border-x border-white/5 font-bold text-sm outline-none text-[var(--theme)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                               <button onClick={() => setQty(prod.id, (Number(inCart.qty) || 0) + 1)} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors">+</button>
                            </div>
                         ) : (
                            <button onClick={() => addToCart(prod, price)} className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 text-white hover:bg-white/20 border border-white/10 transition-colors">
                               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            </button>
                         )}
                      </div>
                   </div>
                );
             })}
          </div>

          {/* LOAD MORE */}
          {visibleCount < filteredProducts.length && (
             <button onClick={() => setVisibleCount(v => v + 10)} className="w-full mt-4 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white py-4 rounded-3xl font-bold text-sm border border-white/5 transition-colors">
                Cargar más productos...
             </button>
          )}

          {filteredProducts.length === 0 && (
             <div className="text-center text-white/40 py-10 text-sm">
                No hay productos que coincidan con la búsqueda.
             </div>
          )}

       </div>

       {/* FIXED FLOATING BUTTON */}
       <AnimatePresence>
        <motion.div initial={{ y: -100, x: "-50%" }} animate={{ y: 0, x: "-50%" }} className="fixed top-4 left-1/2 z-40 w-[85%] max-w-[320px] flex justify-center">
           <button 
             onClick={() => setShowCheckout(true)}
             className="w-full bg-[var(--theme)] text-white p-4 rounded-full font-bold shadow-[0_10px_30px_rgba(0,0,0,0.6)] border border-white/20 hover:scale-[1.02] active:scale-95 transition-transform flex justify-between items-center"
           >
              <div className="flex items-center gap-2">
                 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                 <span>Generar Ticket</span>
              </div>
              {cart.length > 0 && <span className="bg-white text-black px-3 py-1 rounded-full text-xs font-black shadow-inner shadow-black/20">${cartTotal.toLocaleString('es-CO')}</span>}
           </button>
        </motion.div>
      </AnimatePresence>

       {/* CHECKOUT MODAL */}
      <AnimatePresence>
         {showCheckout && (
           <motion.div 
             initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
             className="fixed inset-0 bg-black/90 z-[100] flex items-end sm:items-center justify-center p-2"
           >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} transition={{ duration: 0.15, ease: "easeOut" }}
                className="bg-zinc-950 w-[95%] sm:w-full sm:max-w-md rounded-[2.5rem] p-6 sm:p-8 border sm:border border-white/10 max-h-[85vh] overflow-y-auto shadow-[0_-20px_50px_rgba(0,0,0,0.8)] relative mb-4 sm:mb-0"
                style={{ '--theme': themeHex } as any}
              >
                 {success ? (
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-10">
                       <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(34,197,94,0.4)]">
                         <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                       </div>
                       <h2 className="text-2xl font-black text-white mb-2">¡Ticket Generado!</h2>
                       <p className="text-white/70 mb-8 leading-relaxed">El comercio ha recibido tu orden internamente. Un asesor validará tu agendamiento y te escribirá a WhatsApp.</p>
                       <button onClick={() => { setSuccess(false); setShowCheckout(false); }} className="w-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white p-4 rounded-2xl font-bold">Cerrar</button>
                    </motion.div>
                 ) : (
                    <form onSubmit={handleCheckout} className="flex flex-col gap-5">
                       <div className="flex justify-between items-center mb-2">
                         <h2 className="text-xl font-bold text-white tracking-tight">Completar Agendamiento</h2>
                         <button type="button" onClick={() => setShowCheckout(false)} className="w-8 h-8 flex items-center justify-center bg-white/10 rounded-full text-white/70 hover:text-white transition-colors">✕</button>
                       </div>
                       
                       {cart.length > 0 && (
                          <div className="bg-black/40 rounded-2xl p-4 max-h-56 overflow-y-auto border border-white/5 shadow-inner">
                             {cart.map(item => (
                                <div key={item.id} className="flex justify-between items-center text-sm text-white/90 mb-4 last:mb-0">
                                   <div className="flex-1 pr-4">
                                       <span className="font-medium line-clamp-1">{item.name}</span>
                                       <span className="text-white/40 text-[10px] block">${item.price.toLocaleString('es-CO')} c/u</span>
                                   </div>
                                    <div className="flex items-center bg-white/5 rounded-xl overflow-hidden border border-white/5">
                                      <button type="button" onClick={() => setQty(item.id, (Number(item.qty) || 0) - 1)} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors">-</button>
                                      <input type="text" inputMode="numeric" pattern="[0-9]*" value={item.qty} onChange={(e) => setQty(item.id, e.target.value)} onBlur={() => { if (!item.qty || Number(item.qty) < 1) setQty(item.id, 1); }} className="w-10 text-center bg-transparent border-x border-white/5 font-bold text-sm outline-none text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                      <button type="button" onClick={() => setQty(item.id, (Number(item.qty) || 0) + 1)} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors">+</button>
                                   </div>
                                </div>
                             ))}
                             <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/10">
                                <span className="text-white/50 text-xs uppercase font-bold">{asesorData ? 'Total' : 'Total Estimado'}</span>
                                <span className="text-[var(--theme)] font-black text-lg">${cartTotal.toLocaleString('es-CO')}</span>
                             </div>
                          </div>
                       )}

                       {vipClient ? (
                          <div className="bg-white/10 p-4 rounded-2xl border border-[var(--theme)]/30 flex items-center justify-between">
                              <div>
                                  <span className="text-[11px] font-bold text-[var(--theme)] uppercase tracking-widest block mb-1">Facturando a VIP</span>
                                  <span className="text-white font-bold">{vipClient.name}</span>
                              </div>
                              <div className="text-right">
                                  <span className="text-white/50 text-xs block">+57 {vipClient.phone}</span>
                              </div>
                          </div>
                       ) : (
                          <>
                             <div>
                                <label className="text-[11px] font-bold text-white/50 uppercase tracking-widest mb-1.5 block ml-1">{asesorData ? 'Nombre del Cliente' : 'Tu Nombre'}</label>
                                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-white placeholder-white/20 focus:border-[var(--theme)] focus:ring-1 focus:ring-[var(--theme)] outline-none transition-all font-medium" placeholder="¿Cómo te llamas?" />
                             </div>
                             
                             {!asesorData && (
                                 <div>
                                    <label className="text-[11px] font-bold text-white/50 uppercase tracking-widest mb-1.5 block ml-1">Tu WhatsApp</label>
                                    <div className="flex bg-black/40 border border-white/10 rounded-2xl overflow-hidden focus-within:border-[var(--theme)] focus-within:ring-1 focus-within:ring-[var(--theme)] transition-all">
                                       <div className="bg-black/60 px-4 flex items-center justify-center text-white/70 font-bold border-r border-white/10">
                                          +57
                                       </div>
                                       <input required minLength={10} maxLength={10} pattern="[0-9]{10}" title="El número debe tener exactamente 10 dígitos" type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10)})} className="w-full bg-transparent p-4 text-white placeholder-white/20 outline-none font-medium" placeholder="300 000 0000" />
                                    </div>
                                 </div>
                             )}
                          </>
                       )}

                       {!asesorData && (
                           <div>
                              <div className="flex items-center justify-between mb-1.5 ml-1">
                                 <label className="text-[11px] font-bold text-white/50 uppercase tracking-widest block">¿Cuándo te contactamos?</label>
                              </div>
                              
                              <div className="flex gap-2 mb-2">
                                 <button type="button" onClick={() => setIsASAP(true)} className={`flex-1 py-3 rounded-xl text-sm font-bold border transition-colors ${isASAP ? 'bg-[var(--theme)] border-[var(--theme)] text-white shadow-[0_0_15px_var(--theme)]' : 'bg-black/40 border-white/10 text-white/50 hover:bg-white/5 hover:text-white'}`}>
                                    Lo antes posible
                                 </button>
                                 <button type="button" onClick={() => setIsASAP(false)} className={`flex-1 py-3 rounded-xl text-sm font-bold border transition-colors ${!isASAP ? 'bg-[var(--theme)] border-[var(--theme)] text-white shadow-[0_0_15px_var(--theme)]' : 'bg-black/40 border-white/10 text-white/50 hover:bg-white/5 hover:text-white'}`}>
                                    Elegir Fecha
                                 </button>
                              </div>

                              {!isASAP && (
                                  <input required={!isASAP} type="datetime-local" value={formData.datetime} onChange={e => setFormData({...formData, datetime: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-white focus:border-[var(--theme)] focus:ring-1 focus:ring-[var(--theme)] outline-none transition-all font-medium [color-scheme:dark]" />
                              )}
                           </div>
                       )}

                       <button disabled={isSubmitting} type="submit" className="w-full bg-[var(--theme)] text-white p-4 rounded-2xl font-black text-lg mt-2 shadow-[0_10px_25px_rgba(0,0,0,0.5)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex justify-center items-center gap-2">
                          {isSubmitting ? (
                             <><svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> <span>Procesando...</span></>
                          ) : (asesorData ? 'Generar Factura de Venta' : 'Enviar Ticket al Comercio')}
                       </button>
                    </form>
                 )}
              </motion.div>
           </motion.div>
         )}
      </AnimatePresence>
    </main>
  );
}
