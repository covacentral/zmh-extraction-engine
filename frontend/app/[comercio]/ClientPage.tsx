'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const WhatsappIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" className="fill-green-500"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.662-2.062-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.82 9.82 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
);

const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-pink-500"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
);

const TiktokIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-zinc-800"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"></path></svg>
);

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-blue-600"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
);

const PinterestIcon = () => (
    <svg viewBox="0 0 24 24" width="18" height="18" className="fill-red-600"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.951-7.252 4.195 0 7.453 2.99 7.453 6.98 0 4.175-2.631 7.533-6.284 7.533-1.228 0-2.384-.638-2.778-1.39l-.759 2.894c-.274 1.045-1.018 2.348-1.519 3.143 1.196.368 2.457.567 3.764.567 6.621 0 11.988-5.368 11.988-11.988C24 5.367 18.638 0 12.017 0z"/></svg>
);

export default function ClientPage({ commerceId, data, themeHex, RENDER_API }: any) {
  let { businessName, avatarJid, promoJid, buttons = [], promos = [], whatsappCatalog = [] } = data;

  if (promoJid && (!Array.isArray(promos) || promos.length === 0)) {
     promos = [promoJid];
  }

  // --- CART & APPOINTMENT STATE ---
  const [isWholesale, setIsWholesale] = useState(false);
  const [cart, setCart] = useState<any[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '', datetime: '' });

  const getProductPrice = (product: any, wholesale: boolean) => {
      let regularPrice = (product.priceAmount1000 || 0) / 1000;
      if (!wholesale) return regularPrice;
      
      const desc = (product.description || '').toLowerCase();
      const match = desc.match(/mayorista:\s*\$?(\d+(\.\d+)?)/);
      if (match && match[1]) return parseFloat(match[1]);
      return regularPrice;
  };

  const addToCart = (product: any, price: number) => {
     setCart(prev => {
        const existing = prev.find(i => i.id === product.id);
        if (existing) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
        return [...prev, { id: product.id, name: product.name, price, qty: 1 }];
     });
  };

  const updateQty = (id: string, delta: number) => {
     setCart(prev => prev.map(i => i.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i).filter(i => i.qty > 0));
  };

  const cartTotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);

  const handleCheckout = async (e: any) => {
      e.preventDefault();
      setIsSubmitting(true);
      try {
          const res = await fetch(`${RENDER_API}/api/dispatch`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ commerceId, ...formData, phone: `57${formData.phone}`, cart, total: cartTotal, isWholesale })
          });
          
          if (!res.ok) {
             const isJson = res.headers.get('content-type')?.includes('application/json');
             const data = isJson ? await res.json() : null;
             alert((data && data.error) ? data.error : 'El servidor de despachos se está reiniciando. Por favor, intenta enviar de nuevo en 1 minuto.');
             setIsSubmitting(false);
             return;
          }

          const result = await res.json();
          if (result.ok) {
              setSuccess(true);
              setCart([]);
          } else {
              alert(result.error || 'Error enviando solicitud');
          }
      } catch (err) {
          alert('Error de conexión con el servidor. Revisa tu internet.');
      }
      setIsSubmitting(false);
  };
  // --------------------------------

  const getNetworkSpecs = (btn: any) => {
     const networkType = (btn.type || 'whatsapp').toLowerCase();
     let Icon = WhatsappIcon;
     if (networkType === 'instagram') Icon = InstagramIcon;
     if (networkType === 'tiktok') Icon = TiktokIcon;
     if (networkType === 'facebook') Icon = FacebookIcon;
     if (networkType === 'pinterest') Icon = PinterestIcon;

     let avatarUrl = btn.scrapedImage || '';
     const fallback = `https://ui-avatars.com/api/?name=${btn.name}&background=18181b&color=fff`;

     if (!avatarUrl && networkType === 'whatsapp') {
       let waId = btn.phone || '';
       if (!waId && btn.url) {
           if (btn.url.includes('channel/')) waId = btn.url.split('channel/')[1].split('/')[0].split('?')[0];
           else if (btn.url.includes('wa.me/')) waId = btn.url.split('wa.me/')[1].split('/')[0].split('?')[0];
       }
       avatarUrl = waId ? `${RENDER_API}/api/avatar/${waId}` : fallback;
     } 
     else if (!avatarUrl && btn.url) {
       try {
           const urlObj = new URL(btn.url);
           let path = urlObj.pathname.replace(/^\/|\/$/g, '');
           let username = path.split('/')[0];
           if (username && username.startsWith('@')) username = username.substring(1);
           if (username) avatarUrl = `https://unavatar.io/${networkType}/${username}?fallback=${encodeURIComponent(fallback)}`;
       } catch (e) { avatarUrl = fallback; }
     }
     return { Icon, avatarUrl: avatarUrl || fallback };
  }

  return (
    <main 
      className="flex flex-col items-center p-4 sm:p-12 min-h-[120vh] w-full relative bg-black font-sans pb-32"
      style={{ '--theme': themeHex } as any}
    >
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[120%] h-96 opacity-40 blur-[100px] pointer-events-none transition-colors duration-1000 z-0" style={{ backgroundColor: 'var(--theme)' }} />

      <div className="w-full max-w-sm flex-col items-center flex gap-6 z-10">
        <div className="w-full flex flex-row items-center justify-between gap-4 mt-4">
          <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-full overflow-hidden shrink-0 shadow-xl border border-white/10 relative">
            <img src={`${RENDER_API}/api/avatar/${avatarJid}`} alt={businessName} className="w-full h-full object-cover" onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${businessName}&background=000&color=fff`)} />
          </div>
          <h1 className="text-[1.35rem] sm:text-2xl font-semibold text-white text-right leading-tight max-w-[65%] drop-shadow-md">
            {businessName}
          </h1>
        </div>

        <div className="w-full grid grid-cols-2 gap-3 mt-4">
          {buttons.map((btn: any, i: number) => {
             const { Icon, avatarUrl } = getNetworkSpecs(btn);
             return (
              <motion.a key={i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 + 0.1 }} href={btn.url ? btn.url : (btn.phone ? `https://wa.me/${btn.phone}` : '#')} target="_blank" rel="noopener noreferrer" className="flex flex-row items-center justify-start p-1.5 pr-3 rounded-full backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/10 transition-all shadow-[0_0_15px_rgba(0,0,0,0.5)] gap-2 hover:shadow-[0_0_20px_var(--theme)] group">
                <div className="shrink-0 bg-white rounded-full flex items-center justify-center w-7 h-7 shadow-sm transform group-hover:scale-110 transition-transform">
                   <Icon />
                </div>
                <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 bg-white/10 border border-white/20">
                  <img src={avatarUrl} alt={btn.name} className="w-full h-full object-cover" onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${btn.name}&background=18181b&color=fff`)} />
                </div>
                <span className="text-xs sm:text-sm font-medium text-white/90 truncate leading-none pt-0.5 group-hover:text-white transition-colors">{btn.name}</span>
              </motion.a>
            )
          })}
        </div>

        {/* PROMOS */}
        {promos.map((promoId: string, idx: number) => (
          <motion.div key={idx} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + (idx * 0.1) }} className="w-full aspect-square mt-2 rounded-[2rem] overflow-hidden relative shadow-2xl ring-1 ring-white/10">
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none z-10" />
            <img src={`${RENDER_API}/api/avatar/${promoId}?timestamp=${new Date().getTime()}`} alt={`Promo del día ${idx + 1}`} className="w-full h-full object-cover z-0" onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=PROMO&background=18181b&color=fff&size=500`)} />
          </motion.div>
        ))}

        {/* CATALOG */}
        {whatsappCatalog.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full mt-4 bg-white/5 border border-white/10 rounded-[2rem] p-4 backdrop-blur-md">
             <div className="flex justify-between items-center mb-4">
                <h2 className="text-white text-lg font-bold">Catálogo Express</h2>
                <div className="flex items-center gap-1 bg-black/40 p-1 rounded-full border border-white/10">
                   <button onClick={() => setIsWholesale(false)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${!isWholesale ? 'bg-white text-black shadow-md' : 'text-white/50 hover:text-white'}`}>Normal</button>
                   <button onClick={() => setIsWholesale(true)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${isWholesale ? 'bg-[var(--theme)] text-white shadow-[0_0_10px_var(--theme)]' : 'text-white/50 hover:text-white'}`}>Mayorista</button>
                </div>
             </div>
             
             <div className="grid grid-cols-2 gap-3">
                {whatsappCatalog.map((prod: any) => {
                   const price = getProductPrice(prod, isWholesale);
                   const imageUrl = prod.imageUrls && prod.imageUrls[0] ? prod.imageUrls[0] : '';
                   const inCart = cart.find(i => i.id === prod.id);

                   return (
                     <div key={prod.id} className="bg-black/60 rounded-2xl p-2 border border-white/5 flex flex-col relative overflow-hidden group hover:border-[var(--theme)] transition-colors">
                        <div className="w-full aspect-square rounded-xl overflow-hidden mb-2 relative bg-zinc-900">
                           {imageUrl && <img src={imageUrl} alt={prod.name} className="w-full h-full object-cover" />}
                           {inCart && (
                              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-1 right-1 bg-[var(--theme)] text-white text-[11px] w-6 h-6 flex items-center justify-center rounded-full font-bold shadow-md ring-2 ring-black">
                                 {inCart.qty}
                              </motion.div>
                           )}
                        </div>
                        <h3 className="text-white/90 text-sm font-medium leading-tight line-clamp-2 mb-1">{prod.name}</h3>
                        <div className="mt-auto flex justify-between items-center">
                           <span className="text-[var(--theme)] font-bold text-sm drop-shadow-md">${price.toLocaleString('es-CO')}</span>
                           <button onClick={() => addToCart(prod, price)} className="bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-full w-8 h-8 flex items-center justify-center transition-all">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                           </button>
                        </div>
                     </div>
                   );
                })}
             </div>
          </motion.div>
        )}
      </div>

      {/* FLOATING ACTION BUTTON */}
      <AnimatePresence>
        <motion.div initial={{ y: 100 }} animate={{ y: 0 }} className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-sm">
           <button 
             onClick={() => setShowCheckout(true)}
             className="w-full bg-[var(--theme)] text-white p-4 rounded-full font-bold shadow-[0_10px_30px_rgba(0,0,0,0.6)] border border-white/20 hover:scale-[1.02] active:scale-95 transition-transform flex justify-between items-center"
           >
              <div className="flex items-center gap-2">
                 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                 <span>Agendar Cita {cart.length > 0 && '/ Pedir'}</span>
              </div>
              {cart.length > 0 && <span className="bg-white text-black px-3 py-1 rounded-full text-xs font-black shadow-inner shadow-black/20">${cartTotal.toLocaleString('es-CO')}</span>}
           </button>
        </motion.div>
      </AnimatePresence>

      {/* CHECKOUT MODAL */}
      <AnimatePresence>
         {showCheckout && (
           <motion.div 
             initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
             className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center"
           >
              <motion.div 
                initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="bg-zinc-950 w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-3xl p-6 sm:p-8 border-t sm:border border-white/10 max-h-[90vh] overflow-y-auto shadow-[0_-20px_50px_rgba(0,0,0,0.8)] relative"
                style={{ '--theme': themeHex } as any}
              >
                 {success ? (
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-10">
                       <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(34,197,94,0.4)]">
                         <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                       </div>
                       <h2 className="text-2xl font-black text-white mb-2">¡Ticket Generado!</h2>
                       <p className="text-white/70 mb-8 leading-relaxed">El comercio ha recibido tu orden internamente. Un asesor validará tu agendamiento y te escribirá a WhatsApp.</p>
                       <button onClick={() => { setSuccess(false); setShowCheckout(false); }} className="w-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white p-4 rounded-2xl font-bold">Volver al Menú</button>
                    </motion.div>
                 ) : (
                    <form onSubmit={handleCheckout} className="flex flex-col gap-5">
                       <div className="flex justify-between items-center mb-2">
                         <h2 className="text-xl font-bold text-white tracking-tight">Completar Agendamiento</h2>
                         <button type="button" onClick={() => setShowCheckout(false)} className="w-8 h-8 flex items-center justify-center bg-white/10 rounded-full text-white/70 hover:text-white transition-colors">✕</button>
                       </div>
                       
                       {cart.length > 0 && (
                          <div className="bg-black/40 rounded-2xl p-4 max-h-40 overflow-y-auto border border-white/5 shadow-inner">
                             {cart.map(item => (
                                <div key={item.id} className="flex justify-between items-center text-sm text-white/90 mb-3 last:mb-0">
                                   <span className="truncate pr-4 font-medium">{item.name}</span>
                                   <div className="flex items-center gap-3 shrink-0 bg-white/5 rounded-full p-1 border border-white/5">
                                      <button type="button" onClick={() => updateQty(item.id, -1)} className="w-6 h-6 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors">-</button>
                                      <span className="w-3 text-center font-bold text-xs">{item.qty}</span>
                                      <button type="button" onClick={() => updateQty(item.id, 1)} className="w-6 h-6 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors">+</button>
                                   </div>
                                </div>
                             ))}
                             <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/10">
                                <span className="text-white/50 text-xs uppercase font-bold">Total Estimado</span>
                                <span className="text-[var(--theme)] font-black text-lg">${cartTotal.toLocaleString('es-CO')}</span>
                             </div>
                          </div>
                       )}

                       <div>
                          <label className="text-[11px] font-bold text-white/50 uppercase tracking-widest mb-1.5 block ml-1">Tu Nombre</label>
                          <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-white placeholder-white/20 focus:border-[var(--theme)] focus:ring-1 focus:ring-[var(--theme)] outline-none transition-all font-medium" placeholder="¿Cómo te llamas?" />
                       </div>
                       
                       <div>
                          <label className="text-[11px] font-bold text-white/50 uppercase tracking-widest mb-1.5 block ml-1">Tu WhatsApp</label>
                          <div className="flex bg-black/40 border border-white/10 rounded-2xl overflow-hidden focus-within:border-[var(--theme)] focus-within:ring-1 focus-within:ring-[var(--theme)] transition-all">
                             <div className="bg-black/60 px-4 flex items-center justify-center text-white/70 font-bold border-r border-white/10">
                                +57
                             </div>
                             <input required type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10)})} className="w-full bg-transparent p-4 text-white placeholder-white/20 outline-none font-medium" placeholder="300 000 0000" />
                          </div>
                       </div>

                       <div>
                          <label className="text-[11px] font-bold text-white/50 uppercase tracking-widest mb-1.5 block ml-1">Fecha / Hora de Cita</label>
                          <input required type="datetime-local" value={formData.datetime} onChange={e => setFormData({...formData, datetime: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-white focus:border-[var(--theme)] focus:ring-1 focus:ring-[var(--theme)] outline-none transition-all font-medium [color-scheme:dark]" />
                       </div>

                       <button disabled={isSubmitting} type="submit" className="w-full bg-[var(--theme)] text-white p-4 rounded-2xl font-black text-lg mt-2 shadow-[0_10px_25px_rgba(0,0,0,0.5)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex justify-center items-center gap-2">
                          {isSubmitting ? (
                             <><svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> <span>Procesando...</span></>
                          ) : 'Confirmar Operación'}
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
