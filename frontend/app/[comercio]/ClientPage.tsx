'use client';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { getContrastYIQ } from '../../utils/color';

const WhatsappIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" className="fill-green-500"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.662-2.062-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.82 9.82 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
);

const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-pink-500"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
);

const TiktokIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-zinc-200"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"></path></svg>
);

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-blue-500"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
);

const PinterestIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" className="fill-red-500"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.951-7.252 4.195 0 7.453 2.99 7.453 6.98 0 4.175-2.631 7.533-6.284 7.533-1.228 0-2.384-.638-2.778-1.39l-.759 2.894c-.274 1.045-1.018 2.348-1.519 3.143 1.196.368 2.457.567 3.764.567 6.621 0 11.988-5.368 11.988-11.988C24 5.367 18.638 0 12.017 0z"/></svg>
);

const YoutubeIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-red-500"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon></svg>
);

const TwitterIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-sky-400"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"></path></svg>
);

const GlobeIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stroke-indigo-400"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
);

const ChevronRightIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
);

export default function ClientPage({ commerceId, data, themeHex, RENDER_API }: any) {
  let { businessName, avatarJid, promoJid, buttons = [], promos = [] } = data;

  if (promoJid && (!Array.isArray(promos) || promos.length === 0)) {
     promos = [promoJid];
  }

  const getNetworkSpecs = (btn: any) => {
     const networkType = (btn.type || '').toLowerCase();
     let Icon = GlobeIcon;
     if (networkType === 'whatsapp') Icon = WhatsappIcon;
     else if (networkType === 'instagram') Icon = InstagramIcon;
     else if (networkType === 'tiktok') Icon = TiktokIcon;
     else if (networkType === 'facebook') Icon = FacebookIcon;
     else if (networkType === 'pinterest') Icon = PinterestIcon;
     else if (networkType === 'youtube') Icon = YoutubeIcon;
     else if (networkType === 'twitter' || networkType === 'x') Icon = TwitterIcon;

     let avatarUrl = btn.scrapedImage || '';
     let hasWAAvatar = false;

     if (networkType === 'whatsapp') {
       let waId = btn.phone || '';
       if (!waId && btn.url) {
           const url = btn.url.trim();
           if (url.includes('channel/')) {
               waId = url.split('channel/')[1].split('/')[0].split('?')[0];
           } else if (url.includes('wa.me/')) {
               waId = url.split('wa.me/')[1].split('/')[0].split('?')[0];
           } else if (url.includes('api.whatsapp.com/send') || url.includes('web.whatsapp.com/send') || url.includes('whatsapp.com/send')) {
               try {
                   const urlObj = new URL(url);
                   waId = urlObj.searchParams.get('phone') || '';
               } catch (e) {
                   const match = url.match(/[?&]phone=([^&#\s]+)/);
                   if (match) waId = match[1];
               }
           } else if (url.includes('chat.whatsapp.com/')) {
               waId = url.split('chat.whatsapp.com/')[1].split('/')[0].split('?')[0];
           }
       }
       if (waId) waId = waId.replace(/[+\s\-()]/g, '');

       if (btn.scrapedImage) {
           avatarUrl = btn.scrapedImage;
           hasWAAvatar = true;
       } else if (waId) {
           avatarUrl = `${RENDER_API}/api/avatar/${waId}`;
           hasWAAvatar = true;
       }
     }

     return { Icon, avatarUrl, hasWAAvatar };
  };

  // Group buttons logically to handle many links cleanly
  const whatsappButtons = buttons.filter((b: any) => (b.type || '').toLowerCase() === 'whatsapp');
  const socialButtons = buttons.filter((b: any) => ['instagram', 'tiktok', 'facebook', 'pinterest', 'youtube', 'twitter', 'x'].includes((b.type || '').toLowerCase()));
  const webButtons = buttons.filter((b: any) => !['whatsapp', 'instagram', 'tiktok', 'facebook', 'pinterest', 'youtube', 'twitter', 'x'].includes((b.type || '').toLowerCase()));

  const sectionsList = [
    { title: 'Atención & Canales Directos', items: whatsappButtons },
    { title: 'Redes Sociales', items: socialButtons },
    { title: 'Sitios & Plataformas Web', items: webButtons },
  ].filter(s => s.items.length > 0);

  // Fallback if no specific categorization matches
  const hasSections = sectionsList.length > 1;

  const renderButtonCard = (btn: any, index: number) => {
     const { Icon, avatarUrl, hasWAAvatar } = getNetworkSpecs(btn);
     const href = btn.url ? btn.url : (btn.phone ? `https://wa.me/${btn.phone}` : '#');

     return (
        <motion.a 
           key={index} 
           initial={{ opacity: 0, y: 15 }} 
           animate={{ opacity: 1, y: 0 }} 
           transition={{ delay: index * 0.05 + 0.1 }} 
           href={href} 
           target="_blank" 
           rel="noopener noreferrer" 
           className="w-full flex items-center justify-between p-4 rounded-2xl backdrop-blur-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all shadow-[0_4px_20px_rgba(0,0,0,0.4)] hover:shadow-[0_0_25px_var(--theme)] group hover:scale-[1.01] active:scale-[0.99] gap-3"
        >
           <div className="flex items-center gap-3.5 min-w-0 flex-1">
              <div className="shrink-0 bg-white/10 border border-white/15 rounded-xl flex items-center justify-center w-10 h-10 shadow-sm group-hover:scale-105 group-hover:bg-white/20 transition-all">
                 <Icon />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                 <span className="text-sm sm:text-base font-bold text-white group-hover:text-[var(--theme)] transition-colors truncate leading-snug">
                    {btn.name}
                 </span>
                 {btn.role && (
                    <span className="text-xs font-medium text-white/50 truncate mt-0.5">
                       {btn.role}
                    </span>
                 )}
              </div>
           </div>

           <div className="flex items-center gap-2 shrink-0">
              {hasWAAvatar && avatarUrl && (
                 <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-zinc-900 border border-white/20 shadow-md">
                    <img src={avatarUrl} alt={btn.name} className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                 </div>
              )}
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white/30 group-hover:text-white group-hover:translate-x-0.5 transition-all">
                 <ChevronRightIcon />
              </div>
           </div>
        </motion.a>
     );
  };

  return (
    <main 
      className="flex flex-col items-center p-4 sm:p-12 min-h-screen w-full relative bg-black font-sans pb-32"
      style={{ '--theme': themeHex } as any}
    >
      {/* Glow aura background */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[120%] h-96 opacity-35 blur-[120px] pointer-events-none transition-colors duration-1000 z-0" style={{ backgroundColor: 'var(--theme)' }} />

      <div className="w-full max-w-md flex-col items-center flex gap-6 z-10">
        
        {/* HERO HEADER */}
        <div className="w-full flex flex-col items-center text-center mt-6 gap-3">
          <div className="relative">
             <div className="absolute inset-0 rounded-full blur-xl opacity-60 pointer-events-none" style={{ backgroundColor: 'var(--theme)' }} />
             <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden shrink-0 shadow-2xl border-2 border-white/20 relative z-10 bg-zinc-950">
               <img 
                 src={`${RENDER_API}/api/avatar/${avatarJid}`} 
                 alt={businessName} 
                 className="w-full h-full object-cover" 
                 onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(businessName)}&background=000&color=fff`)} 
               />
             </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight drop-shadow-md tracking-tight mt-1">
            {businessName}
          </h1>
        </div>

        {/* PRIMARY CTA CATALOG BUTTON */}
        {(() => {
           const buttonUrl = data?.catalogButtonUrl || `/${commerceId}/catalogo`;
           const isExternal = buttonUrl.startsWith('http://') || buttonUrl.startsWith('https://');
           const defaultText = data?.businessType === 'restaurante' ? 'Menú & Pedidos' : 'Catálogo & Agendamiento';
           const buttonText = data?.catalogButtonText || defaultText;
           const contrastColor = getContrastYIQ(themeHex);

           const buttonContent = (
              <div 
                 className="w-full p-4 sm:p-5 rounded-2xl font-black text-center shadow-[0_10px_35px_rgba(0,0,0,0.6)] border border-white/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex justify-between items-center group cursor-pointer"
                 style={{ backgroundColor: 'var(--theme)', color: contrastColor }}
              >
                 <div className="flex items-center gap-3" style={{ color: contrastColor }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    <span className="text-base sm:text-lg tracking-tight" style={{ color: contrastColor }}>{buttonText}</span>
                 </div>
                 <div className="w-8 h-8 rounded-full flex items-center justify-center transition-colors" style={{ backgroundColor: contrastColor === 'black' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)', color: contrastColor }}>
                    <ChevronRightIcon />
                 </div>
              </div>
           );

           return (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="w-full">
                 {isExternal ? (
                    <a href={buttonUrl} target="_blank" rel="noopener noreferrer">
                       {buttonContent}
                    </a>
                 ) : (
                    <Link href={buttonUrl}>
                       {buttonContent}
                    </Link>
                 )}
              </motion.div>
           );
        })()}

        {/* BUTTONS LIST / CATEGORIZED NAVIGATION */}
        <div className="w-full flex flex-col gap-6 mt-1">
           {hasSections ? (
              sectionsList.map((sec, secIdx) => (
                 <div key={secIdx} className="w-full flex flex-col gap-2.5">
                    <h2 className="text-[11px] font-bold text-white/40 uppercase tracking-widest px-1">
                       {sec.title}
                    </h2>
                    <div className="w-full flex flex-col gap-2.5">
                       {sec.items.map((btn: any, i: number) => renderButtonCard(btn, secIdx * 10 + i))}
                    </div>
                 </div>
              ))
           ) : (
              <div className="w-full flex flex-col gap-2.5">
                 {buttons.map((btn: any, i: number) => renderButtonCard(btn, i))}
              </div>
           )}
        </div>

        {/* PROMOS */}
        {promos.length > 0 && (
           <div className="w-full flex flex-col gap-4 mt-2">
             {promos.map((promoId: string, idx: number) => (
               <motion.div key={idx} initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 + (idx * 0.1) }} className="w-full aspect-square rounded-3xl overflow-hidden relative shadow-2xl ring-1 ring-white/10">
                 <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none z-10" />
                 <img 
                   src={`${RENDER_API}/api/avatar/${promoId}?timestamp=${new Date().getTime()}`} 
                   alt={`Promo ${idx + 1}`} 
                   className="w-full h-full object-cover z-0" 
                   onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=PROMO&background=18181b&color=fff&size=500`)} 
                 />
               </motion.div>
             ))}
           </div>
        )}

      </div>
    </main>
  );
}
