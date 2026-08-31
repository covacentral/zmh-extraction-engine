'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

export default function ProductClient({ commerceId, productId, data, themeHex, RENDER_API }: any) {
  const router = useRouter();
  const isRestaurant = data?.businessType === 'restaurante';
  let { whatsappCatalog = [], compiledCatalog = [] } = data;

  const unifiedCatalog = useMemo(() => {
     let mappedCompiled: any[] = [];
     if (compiledCatalog && compiledCatalog.length > 0) {
         mappedCompiled = compiledCatalog
             .filter((p: any) => p.status === 'active')
             .map((p: any) => ({
             id: p.id,
             name: p.name,
             price: p.normalPrice * 1000,
             priceAmount1000: p.normalPrice * 1000,
             description: `${p.description || ''}\nReferencia: ${p.reference || ''}\nMarca: ${p.brand || ''}\nMayorista: $${p.wholesalePrice || p.normalPrice}`,
             imageUrls: p.imageUrl,
             sectionName: p.area || 'Catálogo',
             variations: p.variations
         }));
     }
     return [...whatsappCatalog, ...mappedCompiled];
  }, [whatsappCatalog, compiledCatalog]);

  const product = unifiedCatalog.find((p: any) => p.id === productId);
  
  const [cart, setCart] = useState<any[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [selectedVariationIdx, setSelectedVariationIdx] = useState(0);
  
  useEffect(() => {
     setIsMounted(true);
     const savedCart = localStorage.getItem(`cart_${commerceId}`);
     if (savedCart) {
        try { setCart(JSON.parse(savedCart)); } catch(e){}
     }
  }, [commerceId]);

  useEffect(() => {
     if (isMounted) {
        localStorage.setItem(`cart_${commerceId}`, JSON.stringify(cart));
     }
  }, [cart, commerceId, isMounted]);

  if (!product) {
      return <div className="h-screen w-full flex items-center justify-center bg-black text-white">Producto no encontrado</div>;
  }

  const getProductPrice = (prod: any) => {
      let rawPrice = prod.priceAmount1000 !== undefined ? prod.priceAmount1000 : prod.price;
      return (rawPrice || 0) / 1000;
  };

  const reliableTestImages = [
    'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80', // Nike Red
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80', // Watch
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80', // Headphones
    'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=600&q=80', // Tech
    'https://images.unsplash.com/photo-1560343090-f0409e92791a?auto=format&fit=crop&w=600&q=80', // Shoes
    'https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=600&q=80', // Sunglasses
    'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=600&q=80', // Camera
    'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=600&q=80', // Smartwatch
    'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?auto=format&fit=crop&w=600&q=80', // Perfume
    'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80', // Smartphone
    'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=600&q=80', // Shirt
    'https://images.unsplash.com/photo-1578932750294-f5075e85f44a?auto=format&fit=crop&w=600&q=80', // Backpack
    'https://images.unsplash.com/photo-1608231387042-66d1773070a5?auto=format&fit=crop&w=600&q=80', // Puma
    'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=600&q=80', // Handbag
    'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=600&q=80', // Mouse
    'https://images.unsplash.com/photo-1507764923504-cd90bf7da772?auto=format&fit=crop&w=600&q=80', // Laptop
  ];

  const getHighResImageUrl = (prod: any) => {
    if (!prod) return '';
    const raw = prod.imageUrls || prod.imageUrl || prod.image || prod.imageWebp || (prod.variations && prod.variations[0]?.imageWebp);
    if (!raw) return '';
    let url = '';
    if (typeof raw === 'string') url = raw;
    else if (raw.original) url = raw.original;
    else if (raw.requested) url = raw.requested;
    else if (Array.isArray(raw)) url = raw[0] || '';

    if (url.includes('picsum.photos')) {
      const hash = (prod.id || prod.name || '').split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
      return reliableTestImages[hash % reliableTestImages.length];
    }
    return url;
  };

  const price = getProductPrice(product);
  const selectedVar = product.variations?.[selectedVariationIdx];
  const selectedVarImg = selectedVar?.imageWebp;
  const imageUrl = (selectedVarImg && !selectedVarImg.includes('picsum.photos')) ? selectedVarImg : getHighResImageUrl(product);
  const isOut = product.isHidden === true || (selectedVar && selectedVar.stock === 0);
  const cartId = product.variations ? `${product.id}_${selectedVariationIdx}` : product.id;
  const inCart = cart.find(i => i.id === cartId);

  const setQty = (id: string, newQty: any) => {
     if (newQty === '') {
         setCart(prev => prev.map(i => i.id === id ? { ...i, qty: '' } : i));
         return;
     }
     const val = Number(newQty);
     if (isNaN(val) || val < 1) {
         setCart(prev => prev.filter(i => i.id !== id));
         return;
     }
     setCart(prev => prev.map(i => i.id === id ? { ...i, qty: val } : i));
  };

  const addToCart = () => {
      setCart(prev => {
          const existing = prev.find(i => i.id === cartId);
          if (existing) {
              return prev.map(i => i === existing ? { ...i, qty: Number(i.qty) + 1 } : i);
          }
          return [...prev, { 
              ...product, 
              id: cartId, 
              baseId: product.id, 
              variationName: selectedVar?.name, 
              price, 
              qty: 1 
          }];
      });
  };

  return (
    <main className="flex flex-col min-h-screen w-full relative bg-zinc-950 font-sans pb-32" style={{ '--theme': themeHex } as any}>
       <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120%] h-64 opacity-20 blur-[100px] pointer-events-none z-0" style={{ backgroundColor: 'var(--theme)' }} />

       <div className="w-full max-w-2xl mx-auto z-10 flex flex-col gap-4 pt-4 sm:pt-10">
          
          <div className="px-4 flex items-center gap-3">
             <button onClick={() => router.push(`/${commerceId}/catalogo?modo=tienda`)} className="w-10 h-10 flex shrink-0 items-center justify-center bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
             </button>
             <span className="text-white/70 font-bold text-sm tracking-widest uppercase">Volver al Catálogo</span>
          </div>

          <div className="flex flex-col md:flex-row gap-8 px-4 mt-4">
              <div className="w-full md:w-1/2 relative bg-black rounded-[2.5rem] overflow-hidden border border-white/5 flex items-center justify-center min-h-[40vh] md:min-h-[60vh] shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                 {imageUrl ? (
                     <img 
                        src={imageUrl} 
                        alt={product.name} 
                        decoding="async"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        className={`w-full h-auto object-contain max-h-[70vh] transition-transform duration-700 hover:scale-105 relative z-10 ${isOut ? 'grayscale opacity-75' : ''}`} 
                     />
                 ) : null}
                 <div className="absolute inset-0 w-full h-full flex items-center justify-center text-white/20 z-0">
                     <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                 </div>
                 {isOut && (
                     <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm pointer-events-none">
                         <span className="text-white text-3xl font-black tracking-widest uppercase bg-red-600/90 px-6 py-2 rounded-xl border-4 border-red-500 shadow-2xl rotate-[-15deg]">Agotado</span>
                     </div>
                 )}
              </div>

              <div className="w-full md:w-1/2 flex flex-col justify-center">
                  <h1 className="text-3xl md:text-4xl font-black text-white leading-tight mb-4">{product.name}</h1>
                  <span className={`${isOut ? 'text-white/40' : 'text-[var(--theme)]'} font-black text-4xl block mb-6 drop-shadow-md`}>${price.toLocaleString('es-CO')}</span>

                  {product.variations && product.variations.length > 1 && (
                      <div className="mb-8">
                          <label className="text-xs font-bold text-[var(--theme)] uppercase tracking-widest mb-3 block">Selecciona una Variación</label>
                          <div className="flex flex-wrap gap-3">
                              {product.variations.map((v: any, idx: number) => {
                                  const isSelected = selectedVariationIdx === idx;
                                  return (
                                      <button 
                                          key={idx} 
                                          onClick={() => setSelectedVariationIdx(idx)}
                                          className={`text-sm px-5 py-2.5 rounded-xl border transition-all ${isSelected ? 'bg-[var(--theme)] text-black border-[var(--theme)] font-bold shadow-[0_0_15px_var(--theme)] scale-105' : 'bg-white/5 text-white/70 border-white/10 hover:text-white hover:bg-white/10'}`}
                                      >
                                          {v.name}
                                      </button>
                                  );
                              })}
                          </div>
                      </div>
                  )}

                  {product.description && (
                      <div className="bg-white/5 rounded-3xl p-6 border border-white/5 mb-8">
                          <h4 className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-4">Descripción del Producto</h4>
                          <p className="text-white/80 text-sm md:text-base whitespace-pre-wrap leading-relaxed">{product.description}</p>
                      </div>
                  )}

                  <div className="mt-auto">
                      {isOut ? (
                          <div className="w-full bg-black/40 text-red-500 p-5 rounded-2xl border border-red-500/20 flex justify-center items-center gap-3 font-bold text-lg">
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                              Producto Agotado
                          </div>
                      ) : isMounted && inCart ? (
                          <div className="flex items-center justify-between bg-white/5 rounded-2xl overflow-hidden border border-[var(--theme)]/30 p-2 shadow-lg">
                              <button onClick={() => setQty(cartId, (Number(inCart.qty) || 0) - 1)} className="w-16 h-14 flex items-center justify-center text-white/70 hover:text-white hover:bg-[var(--theme)]/20 transition-colors rounded-xl text-2xl font-medium">-</button>
                              <input type="text" inputMode="numeric" pattern="[0-9]*" value={inCart.qty} onChange={(e) => setQty(cartId, e.target.value)} onBlur={() => { if (!inCart.qty || Number(inCart.qty) < 1) setQty(cartId, 1); }} className="w-20 text-center bg-transparent font-black text-2xl outline-none text-[var(--theme)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                              <button onClick={() => setQty(cartId, (Number(inCart.qty) || 0) + 1)} className="w-16 h-14 flex items-center justify-center text-white/70 hover:text-white hover:bg-[var(--theme)]/20 transition-colors rounded-xl text-2xl font-medium">+</button>
                          </div>
                      ) : (
                          <button onClick={addToCart} className="w-full bg-[var(--theme)] text-black hover:scale-[1.02] active:scale-95 p-5 rounded-2xl border border-transparent transition-transform flex justify-center items-center gap-3 font-black text-lg shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                              Agregar al Carrito
                          </button>
                      )}
                  </div>
              </div>
          </div>
       </div>
       
       {isMounted && cart.length > 0 && (
         <motion.div initial={{ y: 100, x: "-50%" }} animate={{ y: 0, x: "-50%" }} className="fixed bottom-6 left-1/2 z-40 w-[90%] max-w-[400px] flex justify-center">
            <button 
              onClick={() => router.push(`/${commerceId}/catalogo?modo=tienda&checkout=true`)}
              className="w-full bg-white text-black p-4 rounded-2xl font-black shadow-[0_10px_40px_rgba(0,0,0,0.8)] border border-white/20 hover:scale-[1.02] active:scale-95 transition-transform flex justify-between items-center"
            >
               <div className="flex items-center gap-3">
                  <span className="bg-black text-white w-8 h-8 rounded-full flex items-center justify-center text-xs">{cart.reduce((a,c) => a + Number(c.qty), 0)}</span>
                  <span>Ir al Checkout</span>
               </div>
               <span className="text-[var(--theme)] text-lg px-2 py-1 rounded-xl shadow-inner bg-black/5">
                   ${cart.reduce((acc, item) => acc + (item.price * (Number(item.qty) || 0)), 0).toLocaleString('es-CO')}
               </span>
            </button>
         </motion.div>
       )}
    </main>
  );
}
