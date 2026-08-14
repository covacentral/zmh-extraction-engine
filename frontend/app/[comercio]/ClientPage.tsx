'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

const ChevronDownIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
);

const MessageCircleIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-white/40"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
);

const VerifiedIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" className="fill-green-400 shrink-0"><path d="M23 12l-2.44-2.79.34-3.69-3.61-.82-1.89-3.2L12 2.96 8.6 1.5 6.71 4.7l-3.61.81.34 3.7L1 12l2.44 2.79-.34 3.7 3.61.82 1.89 3.2 3.4-1.47 3.4 1.46 1.89-3.19 3.61-.82-.34-3.69L23 12zm-12.91 4.72l-3.8-3.81 1.48-1.48 2.32 2.33 5.85-5.87 1.48 1.48-7.33 7.35z"/></svg>
);

// URL Sanitizer: Ensures links like 'wa.me/57...' have https:// prepended
const formatUrl = (rawUrl: string, phone?: string) => {
  if (!rawUrl && phone) return `https://wa.me/${phone.replace(/\D/g, '')}`;
  if (!rawUrl) return '#';
  let url = rawUrl.trim();
  if (!url) return '#';
  if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url) && !/^tel:/i.test(url)) {
    url = `https://${url}`;
  }
  return url;
};

export default function ClientPage({ commerceId, data, themeHex, RENDER_API }: any) {
  let { businessName, avatarJid, promoJid, buttons = [], promos = [] } = data;

  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  if (promoJid && (!Array.isArray(promos) || promos.length === 0)) {
     promos = [promoJid];
  }

  // Catalog presence & visibility logic
  const hasCatalogProducts = Boolean(
    (data?.whatsappCatalog && data.whatsappCatalog.length > 0) ||
    (data?.compiledCatalog && data.compiledCatalog.length > 0) ||
    (data?.catalogs && data.catalogs.length > 0) ||
    data?.catalogJid
  );
  const hasCustomCatalogConfig = Boolean(data?.catalogButtonUrl || data?.catalogButtonText);
  const isCatalogExplicitlyHidden = data?.hideCatalogButton === true || data?.showCatalogButton === false;
  const shouldShowCatalogButton = !isCatalogExplicitlyHidden && (hasCatalogProducts || hasCustomCatalogConfig);

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getNetworkSpecs = (btn: any) => {
     const networkType = (btn.type || '').toLowerCase();
     const rawUrl = btn.url || '';
     const isChannel = rawUrl.includes('channel/') || networkType === 'channel';

     let Icon = GlobeIcon;
     let linkIntent: 'channel' | 'wa_chat' | 'social' | 'web' = 'web';

     if (isChannel || (networkType === 'whatsapp' && rawUrl.includes('channel/'))) {
        Icon = WhatsappIcon;
        linkIntent = 'channel';
     } else if (networkType === 'whatsapp' || rawUrl.includes('wa.me') || rawUrl.includes('api.whatsapp.com') || btn.phone) {
        Icon = WhatsappIcon;
        linkIntent = 'wa_chat';
     } else if (networkType === 'instagram') { Icon = InstagramIcon; linkIntent = 'social'; }
     else if (networkType === 'tiktok') { Icon = TiktokIcon; linkIntent = 'social'; }
     else if (networkType === 'facebook') { Icon = FacebookIcon; linkIntent = 'social'; }
     else if (networkType === 'pinterest') { Icon = PinterestIcon; linkIntent = 'social'; }
     else if (networkType === 'youtube') { Icon = YoutubeIcon; linkIntent = 'social'; }
     else if (networkType === 'twitter' || networkType === 'x') { Icon = TwitterIcon; linkIntent = 'social'; }

     let avatarUrl = btn.scrapedImage || '';
     let hasWAAvatar = false;

     if (linkIntent === 'channel' || linkIntent === 'wa_chat') {
       let waId = btn.phone || '';
       if (!waId && rawUrl) {
           const url = rawUrl.trim();
           if (url.includes('channel/')) {
               waId = url.split('channel/')[1].split('/')[0].split('?')[0];
           } else if (url.includes('wa.me/')) {
               waId = url.split('wa.me/')[1].split('/')[0].split('?')[0];
           } else if (url.includes('api.whatsapp.com/send') || url.includes('web.whatsapp.com/send') || url.includes('whatsapp.com/send')) {
               try {
                   const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
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

     return { Icon, avatarUrl, hasWAAvatar, linkIntent, networkType };
  };

  // Filter buttons by search query if user typed
  const filteredButtons = buttons.filter((btn: any) => {
     if (!searchQuery.trim()) return true;
     const q = searchQuery.toLowerCase().trim();
     return (btn.name || '').toLowerCase().includes(q) || 
            (btn.role || '').toLowerCase().includes(q) || 
            (btn.type || '').toLowerCase().includes(q);
  });

  // Group buttons logically into Bento Box modules
  const channelButtons = filteredButtons.filter((b: any) => getNetworkSpecs(b).linkIntent === 'channel');
  const waChatButtons = filteredButtons.filter((b: any) => getNetworkSpecs(b).linkIntent === 'wa_chat');
  const socialButtons = filteredButtons.filter((b: any) => getNetworkSpecs(b).linkIntent === 'social');
  const webButtons = filteredButtons.filter((b: any) => getNetworkSpecs(b).linkIntent === 'web');

  return (
    <main 
      className="flex flex-col items-center px-3.5 py-6 sm:px-8 sm:py-12 min-h-screen w-full relative bg-black font-sans pb-28 overflow-x-hidden"
      style={{ '--theme': themeHex } as any}
    >
      {/* Ambient Glow Aura */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 w-[120%] h-80 opacity-30 blur-[100px] pointer-events-none transition-colors duration-1000 z-0" style={{ backgroundColor: 'var(--theme)' }} />

      <div className="w-full max-w-md flex-col items-center flex gap-5 z-10">
        
        {/* HERO HEADER */}
        <div className="w-full flex flex-col items-center text-center mt-2 sm:mt-4 gap-2.5">
          <div className="relative">
             <div className="absolute inset-0 rounded-full blur-xl opacity-50 pointer-events-none" style={{ backgroundColor: 'var(--theme)' }} />
             <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden shrink-0 shadow-2xl border-2 border-white/20 relative z-10 bg-zinc-950">
               <img 
                 src={`${RENDER_API}/api/avatar/${avatarJid}`} 
                 alt={businessName} 
                 className="w-full h-full object-cover" 
                 onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(businessName)}&background=000&color=fff`)} 
               />
             </div>
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-white leading-tight drop-shadow-md tracking-tight px-2">
            {businessName}
          </h1>
        </div>

        {/* SEARCH BAR INPUT */}
        <div className="w-full relative">
           <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
              <SearchIcon />
           </div>
           <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar canal, servicio o enlace..."
              className="w-full bg-white/[0.06] hover:bg-white/[0.09] focus:bg-white/[0.1] border border-white/10 focus:border-[var(--theme)] rounded-2xl py-3 pl-10 pr-9 text-xs sm:text-sm text-white placeholder-white/40 outline-none transition-all shadow-inner"
           />
           {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-3 flex items-center text-white/40 hover:text-white text-xs font-bold transition-colors"
              >
                ✕
              </button>
           )}
        </div>

        {/* PRIMARY CTA CATALOG BUTTON (CONDITIONAL) */}
        {shouldShowCatalogButton && (() => {
           const buttonUrl = formatUrl(data?.catalogButtonUrl || `/${commerceId}/catalogo`);
           const isExternal = buttonUrl.startsWith('http://') || buttonUrl.startsWith('https://');
           const defaultText = data?.businessType === 'restaurante' ? 'Menu & Pedidos' : 'Catalogo & Agendamiento';
           const buttonText = data?.catalogButtonText || defaultText;
           const contrastColor = getContrastYIQ(themeHex);

           const buttonContent = (
              <div 
                 className="w-full p-4 rounded-2xl font-black text-center shadow-[0_8px_30px_rgba(0,0,0,0.6)] border border-white/20 hover:scale-[1.01] active:scale-[0.99] transition-all flex justify-between items-center group cursor-pointer"
                 style={{ backgroundColor: 'var(--theme)', color: contrastColor }}
              >
                 <div className="flex items-center gap-2.5 min-w-0" style={{ color: contrastColor }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    <span className="text-sm sm:text-base tracking-tight truncate" style={{ color: contrastColor }}>{buttonText}</span>
                 </div>
                 <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors" style={{ backgroundColor: contrastColor === 'black' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)', color: contrastColor }}>
                    <ChevronRightIcon />
                 </div>
              </div>
           );

           return (
              <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="w-full">
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

        {/* BENTO BOX SYSTEM & ACCORDION MODULES */}

        {/* BENTO MODULE 1: WHATSAPP CHANNELS SHOWCASE */}
        {channelButtons.length > 0 && (() => {
           const sectionKey = 'channels';
           const isCollapsed = Boolean(collapsedSections[sectionKey]) && !searchQuery;
           const shouldShowAccordionToggle = channelButtons.length > 2 && !searchQuery;
           const visibleItems = isCollapsed ? channelButtons.slice(0, 2) : channelButtons;

           return (
              <div className="w-full flex flex-col gap-2.5">
                 <div className="w-full flex items-center justify-between px-1">
                    <h2 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                       Canales de Novedades
                    </h2>
                    {shouldShowAccordionToggle && (
                       <button 
                         onClick={() => toggleSection(sectionKey)}
                         className="text-[10px] font-bold text-white/50 hover:text-white flex items-center gap-1 transition-colors"
                       >
                          <span>{isCollapsed ? `Ver todos (${channelButtons.length})` : 'Colapsar'}</span>
                          <div className={`transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`}>
                             <ChevronDownIcon />
                          </div>
                       </button>
                    )}
                 </div>

                 <div className="w-full flex flex-col gap-3">
                    {visibleItems.map((btn: any, index: number) => {
                       const { avatarUrl, hasWAAvatar } = getNetworkSpecs(btn);
                       const href = formatUrl(btn.url, btn.phone);
                       return (
                          <motion.a
                             key={index}
                             initial={{ opacity: 0, y: 12 }}
                             animate={{ opacity: 1, y: 0 }}
                             transition={{ delay: index * 0.04 + 0.15 }}
                             href={href}
                             target="_blank"
                             rel="noopener noreferrer"
                             className="w-full flex items-center justify-between p-3.5 sm:p-4 rounded-2xl backdrop-blur-xl bg-gradient-to-r from-green-950/60 via-zinc-900/90 to-zinc-950 border border-green-500/30 transition-all shadow-[0_4px_25px_rgba(0,0,0,0.6)] hover:border-green-500/60 hover:shadow-[0_0_25px_rgba(34,197,94,0.3)] group hover:scale-[1.01] active:scale-[0.99] gap-3.5"
                          >
                             {hasWAAvatar && avatarUrl ? (
                                <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl overflow-hidden shrink-0 bg-zinc-900 border-2 border-green-500/40 shadow-[0_0_15px_rgba(34,197,94,0.25)] relative">
                                   <img src={avatarUrl} alt={btn.name} className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                                   <div className="absolute bottom-0 right-0 p-0.5 bg-black/90 rounded-tl-md">
                                      <WhatsappIcon />
                                   </div>
                                </div>
                             ) : (
                                <div className="w-13 h-13 rounded-2xl bg-green-500/20 border border-green-500/30 flex items-center justify-center shrink-0">
                                   <WhatsappIcon />
                                </div>
                             )}

                             <div className="flex flex-col min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                   <span className="text-sm sm:text-base font-bold text-white group-hover:text-green-400 transition-colors truncate leading-snug">
                                      {btn.name}
                                   </span>
                                   <VerifiedIcon />
                                </div>
                                {btn.role ? (
                                   <span className="text-xs font-medium text-white/60 truncate mt-1">
                                      {btn.role}
                                   </span>
                                ) : (
                                   <span className="text-[11px] font-medium text-green-400/80 truncate mt-0.5">
                                      Canal Oficial de WhatsApp
                                   </span>
                                )}
                             </div>

                             <div className="flex flex-col items-end gap-1 shrink-0">
                                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/40">
                                   Canal
                                </span>
                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white/40 group-hover:text-white transition-all">
                                   <ChevronRightIcon />
                                </div>
                             </div>
                          </motion.a>
                       );
                    })}
                 </div>
              </div>
           );
        })()}

        {/* BENTO MODULE 2: DIRECT WHATSAPP CONTACTS (2-COLUMN GRID / CARDS WITH ONLINE DOT) */}
        {waChatButtons.length > 0 && (() => {
           const sectionKey = 'wa_chats';
           const isCollapsed = Boolean(collapsedSections[sectionKey]) && !searchQuery;
           const shouldShowAccordionToggle = waChatButtons.length > 4 && !searchQuery;
           const visibleItems = isCollapsed ? waChatButtons.slice(0, 4) : waChatButtons;

           return (
              <div className="w-full flex flex-col gap-2.5">
                 <div className="w-full flex items-center justify-between px-1">
                    <h2 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                       Atencion Directa & Asesores
                    </h2>
                    {shouldShowAccordionToggle && (
                       <button 
                         onClick={() => toggleSection(sectionKey)}
                         className="text-[10px] font-bold text-white/50 hover:text-white flex items-center gap-1 transition-colors"
                       >
                          <span>{isCollapsed ? `Ver todos (${waChatButtons.length})` : 'Colapsar'}</span>
                          <div className={`transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`}>
                             <ChevronDownIcon />
                          </div>
                       </button>
                    )}
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                    {visibleItems.map((btn: any, index: number) => {
                       const { avatarUrl, hasWAAvatar } = getNetworkSpecs(btn);
                       const href = formatUrl(btn.url, btn.phone);
                       return (
                          <motion.a
                             key={index}
                             initial={{ opacity: 0, y: 12 }}
                             animate={{ opacity: 1, y: 0 }}
                             transition={{ delay: index * 0.04 + 0.2 }}
                             href={href}
                             target="_blank"
                             rel="noopener noreferrer"
                             className="w-full flex items-center justify-between p-3.5 rounded-2xl backdrop-blur-xl bg-gradient-to-r from-zinc-900/90 via-zinc-900/60 to-zinc-950 border border-green-500/25 hover:border-green-500/50 transition-all shadow-md group hover:scale-[1.01] active:scale-[0.99] gap-3"
                          >
                             <div className="flex items-center gap-3 min-w-0 flex-1">
                                {hasWAAvatar && avatarUrl ? (
                                   <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full overflow-hidden shrink-0 bg-zinc-900 border-2 border-green-500/30 relative shadow-md">
                                      <img src={avatarUrl} alt={btn.name} className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                                      <div className="w-3 h-3 bg-green-500 rounded-full border-2 border-black absolute bottom-0 right-0 z-10" />
                                   </div>
                                ) : (
                                   <div className="w-11 h-11 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center shrink-0 relative">
                                      <WhatsappIcon />
                                      <div className="w-3 h-3 bg-green-500 rounded-full border-2 border-black absolute bottom-0 right-0 z-10" />
                                   </div>
                                )}

                                <div className="flex flex-col min-w-0 flex-1">
                                   <span className="text-xs sm:text-sm font-bold text-white group-hover:text-green-400 transition-colors truncate leading-snug">
                                      {btn.name}
                                   </span>
                                   {btn.role ? (
                                      <span className="text-[11px] font-medium text-white/50 truncate mt-0.5">
                                         {btn.role}
                                      </span>
                                   ) : (
                                      <span className="text-[10px] font-medium text-green-400/70 truncate mt-0.5">
                                         Chat Directo
                                      </span>
                                   )}
                                </div>
                             </div>

                             <div className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/40 shrink-0 group-hover:bg-green-500 group-hover:text-black transition-colors shadow-sm">
                                <MessageCircleIcon />
                                <span>Escribir</span>
                             </div>
                          </motion.a>
                       );
                    })}
                 </div>
              </div>
           );
        })()}

        {/* BENTO MODULE 3: SOCIAL MEDIA (ULTRA-COMPACT 4-COLUMN BRAND GRID) */}
        {socialButtons.length > 0 && (() => {
           const sectionKey = 'socials';
           const isCollapsed = Boolean(collapsedSections[sectionKey]) && !searchQuery;
           const shouldShowAccordionToggle = socialButtons.length > 8 && !searchQuery;
           const visibleItems = isCollapsed ? socialButtons.slice(0, 8) : socialButtons;

           return (
              <div className="w-full flex flex-col gap-2.5">
                 <div className="w-full flex items-center justify-between px-1">
                    <h2 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                       Redes Sociales
                    </h2>
                    {shouldShowAccordionToggle && (
                       <button 
                         onClick={() => toggleSection(sectionKey)}
                         className="text-[10px] font-bold text-white/50 hover:text-white flex items-center gap-1 transition-colors"
                       >
                          <span>{isCollapsed ? `Ver todas (${socialButtons.length})` : 'Colapsar'}</span>
                          <div className={`transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`}>
                             <ChevronDownIcon />
                          </div>
                       </button>
                    )}
                 </div>

                 <div className="grid grid-cols-4 gap-2 w-full">
                    {visibleItems.map((btn: any, index: number) => {
                       const { Icon, networkType } = getNetworkSpecs(btn);
                       const href = formatUrl(btn.url, btn.phone);

                       let brandBorder = 'border-white/10 hover:border-white/20 bg-white/[0.04]';
                       if (networkType === 'instagram') brandBorder = 'border-pink-500/30 hover:border-pink-500/60 bg-gradient-to-br from-purple-950/20 via-pink-950/20 to-transparent';
                       else if (networkType === 'tiktok') brandBorder = 'border-zinc-700/50 hover:border-zinc-400/50 bg-white/[0.03]';
                       else if (networkType === 'facebook') brandBorder = 'border-blue-500/30 hover:border-blue-500/60 bg-blue-950/20';
                       else if (networkType === 'youtube') brandBorder = 'border-red-500/30 hover:border-red-500/60 bg-red-950/20';
                       else if (networkType === 'twitter' || networkType === 'x') brandBorder = 'border-sky-500/30 hover:border-sky-500/60 bg-sky-950/20';
                       else if (networkType === 'pinterest') brandBorder = 'border-red-600/30 hover:border-red-600/60 bg-red-950/20';

                       return (
                          <motion.a
                             key={index}
                             initial={{ opacity: 0, scale: 0.9 }}
                             animate={{ opacity: 1, scale: 1 }}
                             transition={{ delay: index * 0.03 + 0.2 }}
                             href={href}
                             target="_blank"
                             rel="noopener noreferrer"
                             className={`w-full flex flex-col items-center justify-center p-2.5 rounded-2xl backdrop-blur-xl transition-all shadow-sm group hover:scale-[1.03] active:scale-[0.97] min-w-0 text-center ${brandBorder}`}
                          >
                             <div className="bg-white/10 border border-white/15 rounded-xl flex items-center justify-center w-8 h-8 shadow-sm group-hover:scale-110 transition-transform mb-1">
                                <Icon />
                             </div>
                             <span className="text-[11px] font-bold text-white/90 group-hover:text-white transition-colors truncate w-full">
                                {btn.name}
                             </span>
                          </motion.a>
                       );
                    })}
                 </div>
              </div>
           );
        })()}

        {/* BENTO MODULE 4: WEB PLATFORMS & OTHER LINKS (2-COLUMN BOOKMARKS) */}
        {webButtons.length > 0 && (() => {
           const sectionKey = 'web_links';
           const isCollapsed = Boolean(collapsedSections[sectionKey]) && !searchQuery;
           const shouldShowAccordionToggle = webButtons.length > 4 && !searchQuery;
           const visibleItems = isCollapsed ? webButtons.slice(0, 4) : webButtons;

           return (
              <div className="w-full flex flex-col gap-2.5">
                 <div className="w-full flex items-center justify-between px-1">
                    <h2 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                       Sitios & Navegacion Web
                    </h2>
                    {shouldShowAccordionToggle && (
                       <button 
                         onClick={() => toggleSection(sectionKey)}
                         className="text-[10px] font-bold text-white/50 hover:text-white flex items-center gap-1 transition-colors"
                       >
                          <span>{isCollapsed ? `Ver todos (${webButtons.length})` : 'Colapsar'}</span>
                          <div className={`transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`}>
                             <ChevronDownIcon />
                          </div>
                       </button>
                    )}
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                    {visibleItems.map((btn: any, index: number) => {
                       const href = formatUrl(btn.url, btn.phone);
                       return (
                          <motion.a
                             key={index}
                             initial={{ opacity: 0, y: 12 }}
                             animate={{ opacity: 1, y: 0 }}
                             transition={{ delay: index * 0.04 + 0.25 }}
                             href={href}
                             target="_blank"
                             rel="noopener noreferrer"
                             className="w-full flex items-center justify-between p-3.5 sm:p-4 rounded-2xl backdrop-blur-xl bg-zinc-900/80 border border-indigo-500/25 hover:border-indigo-500/50 transition-all shadow-sm group hover:scale-[1.01] active:scale-[0.99] gap-3"
                          >
                             <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className="shrink-0 bg-indigo-500/15 border border-indigo-500/25 rounded-xl flex items-center justify-center w-10 h-10 shadow-sm group-hover:scale-105 transition-all">
                                   <GlobeIcon />
                                </div>
                                <div className="flex flex-col min-w-0 flex-1">
                                   <span className="text-xs sm:text-sm font-bold text-white group-hover:text-indigo-300 transition-colors truncate leading-snug">
                                      {btn.name}
                                   </span>
                                   {btn.role ? (
                                      <span className="text-[11px] font-medium text-white/50 truncate mt-0.5">
                                         {btn.role}
                                      </span>
                                   ) : (
                                      <span className="text-[10px] font-medium text-indigo-400/70 truncate mt-0.5">
                                         Pagina Web Externa
                                      </span>
                                   )}
                                </div>
                             </div>

                             <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hidden sm:inline-block">
                                   Web
                                </span>
                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white/30 group-hover:text-white transition-all">
                                   <ChevronRightIcon />
                                </div>
                             </div>
                          </motion.a>
                       );
                    })}
                 </div>
              </div>
           );
        })()}

        {/* PROMOS */}
        {promos.length > 0 && (
           <div className="w-full flex flex-col gap-3 mt-1">
             {promos.map((promoId: string, idx: number) => (
               <motion.div key={idx} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 + (idx * 0.1) }} className="w-full aspect-square rounded-3xl overflow-hidden relative shadow-2xl ring-1 ring-white/10">
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
