'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { getContrastYIQ } from '../../utils/color';

/* ─── Icons ──────────────────────────────────────────────────────────── */
const WhatsappIcon = ({ size = 20 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className="fill-green-500 shrink-0">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.662-2.062-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.82 9.82 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
  </svg>
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
const GlobeIcon = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stroke-indigo-400"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
);
const ChevronRightIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
);
const ChevronDownIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
);
const MessageCircleIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
);
const SearchIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-white/40"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
);
const VerifiedIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" className="fill-green-400 shrink-0"><path d="M23 12l-2.44-2.79.34-3.69-3.61-.82-1.89-3.2L12 2.96 8.6 1.5 6.71 4.7l-3.61.81.34 3.7L1 12l2.44 2.79-.34 3.7 3.61.82 1.89 3.2 3.4-1.47 3.4 1.46 1.89-3.19 3.61-.82-.34-3.69L23 12zm-12.91 4.72l-3.8-3.81 1.48-1.48 2.32 2.33 5.85-5.87 1.48 1.48-7.33 7.35z"/></svg>
);

/* ─── URL Sanitizer ──────────────────────────────────────────────────── */
const formatUrl = (rawUrl: string, phone?: string): string => {
  if (!rawUrl && phone) return `https://wa.me/${phone.replace(/\D/g, '')}`;
  if (!rawUrl) return '#';
  const url = rawUrl.trim();
  if (!url) return '#';
  if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url) || /^tel:/i.test(url)) return url;
  return `https://${url}`;
};

/* ─── Section Label ──────────────────────────────────────────────────── */
const SectionLabel = ({
  label,
  showToggle,
  expanded,
  count,
  onToggle,
}: {
  label: string;
  showToggle: boolean;
  expanded: boolean;
  count: number;
  onToggle: () => void;
}) => (
  <div className="w-full flex items-center justify-between px-1 mb-2">
    <h2 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{label}</h2>
    {showToggle && (
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-[10px] font-bold text-white/50 hover:text-white transition-colors"
      >
        <span>{expanded ? 'Colapsar' : `Ver todos (${count})`}</span>
        <div className={`transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}>
          <ChevronDownIcon />
        </div>
      </button>
    )}
  </div>
);

/* ─── Main Component ─────────────────────────────────────────────────── */
export default function ClientPage({ commerceId, data, themeHex, RENDER_API }: any) {
  let { businessName, avatarJid, promoJid, buttons = [], promos = [] } = data;

  const [searchQuery, setSearchQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (promoJid && (!Array.isArray(promos) || promos.length === 0)) {
    promos = [promoJid];
  }

  /* Catalog CTA visibility */
  const hasCatalogProducts = Boolean(
    (data?.whatsappCatalog?.length) || (data?.compiledCatalog?.length) ||
    (data?.catalogs?.length) || data?.catalogJid
  );
  const hasCustomCatalogConfig = Boolean(data?.catalogButtonUrl || data?.catalogButtonText);
  const isCatalogHidden = data?.hideCatalogButton === true || data?.showCatalogButton === false;
  const showCatalogButton = !isCatalogHidden && (hasCatalogProducts || hasCustomCatalogConfig);

  /* Network spec resolver */
  const getSpecs = (btn: any) => {
    const type = (btn.type || '').toLowerCase();
    const url = btn.url || '';
    const isChannel = url.includes('channel/') || type === 'channel';

    let linkIntent: 'channel' | 'wa_chat' | 'social' | 'web' = 'web';
    let Icon: () => JSX.Element = () => <GlobeIcon />;
    let networkType = type;

    if (isChannel) { linkIntent = 'channel'; Icon = () => <WhatsappIcon />; }
    else if (type === 'whatsapp' || url.includes('wa.me') || url.includes('api.whatsapp.com') || btn.phone) {
      linkIntent = 'wa_chat'; Icon = () => <WhatsappIcon />;
    }
    else if (type === 'instagram') { linkIntent = 'social'; Icon = InstagramIcon; }
    else if (type === 'tiktok') { linkIntent = 'social'; Icon = TiktokIcon; }
    else if (type === 'facebook') { linkIntent = 'social'; Icon = FacebookIcon; }
    else if (type === 'pinterest') { linkIntent = 'social'; Icon = PinterestIcon; }
    else if (type === 'youtube') { linkIntent = 'social'; Icon = YoutubeIcon; }
    else if (type === 'twitter' || type === 'x') { linkIntent = 'social'; Icon = TwitterIcon; }

    /* Resolve WhatsApp avatar */
    let avatarUrl = btn.scrapedImage || '';
    let hasAvatar = false;
    if (linkIntent === 'channel' || linkIntent === 'wa_chat') {
      let waId = btn.phone || '';
      if (!waId) {
        if (url.includes('channel/')) waId = url.split('channel/')[1]?.split('/')[0]?.split('?')[0] || '';
        else if (url.includes('wa.me/')) waId = url.split('wa.me/')[1]?.split('/')[0]?.split('?')[0] || '';
        else {
          try {
            const u = new URL(url.startsWith('http') ? url : `https://${url}`);
            waId = u.searchParams.get('phone') || '';
          } catch { const m = url.match(/[?&]phone=([^&#\s]+)/); if (m) waId = m[1]; }
        }
      }
      waId = waId.replace(/[+\s\-()]/g, '');
      avatarUrl = btn.scrapedImage || (waId ? `${RENDER_API}/api/avatar/${waId}` : '');
      hasAvatar = Boolean(avatarUrl);
    }

    return { Icon, avatarUrl, hasAvatar, linkIntent, networkType };
  };

  /* Filter by search */
  const filtered = buttons.filter((b: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (b.name || '').toLowerCase().includes(q) || (b.role || '').toLowerCase().includes(q);
  });

  const channels  = filtered.filter((b: any) => getSpecs(b).linkIntent === 'channel');
  const waChats   = filtered.filter((b: any) => getSpecs(b).linkIntent === 'wa_chat');
  const socials   = filtered.filter((b: any) => getSpecs(b).linkIntent === 'social');
  const webLinks  = filtered.filter((b: any) => getSpecs(b).linkIntent === 'web');

  const toggle = (key: string) => setExpanded(p => ({ ...p, [key]: !p[key] }));

  /* Contact rows accordion thresholds */
  const WA_SHOW = 4;
  const WEB_SHOW = 4;

  return (
    <main
      className="flex flex-col items-center px-3.5 py-6 min-h-screen w-full relative bg-black font-sans pb-28 overflow-x-hidden"
      style={{ '--theme': themeHex } as any}
    >
      {/* Ambient glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[140%] h-72 opacity-25 blur-[120px] pointer-events-none z-0"
        style={{ backgroundColor: 'var(--theme)' }}
      />

      <div className="w-full max-w-md flex flex-col items-center gap-5 z-10">

        {/* ── HEADER ── */}
        <div className="flex flex-col items-center text-center gap-2.5 mt-2 w-full">
          <div className="relative">
            <div className="absolute inset-0 rounded-full blur-2xl opacity-40 pointer-events-none" style={{ backgroundColor: 'var(--theme)' }} />
            <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white/20 shadow-2xl relative z-10 bg-zinc-950">
              <img
                src={`${RENDER_API}/api/avatar/${avatarJid}`}
                alt={businessName}
                className="w-full h-full object-cover"
                onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(businessName)}&background=000&color=fff`; }}
              />
            </div>
          </div>
          <h1 className="text-xl font-black text-white tracking-tight leading-tight px-2">{businessName}</h1>
        </div>

        {/* ── SEARCH BAR ── */}
        <div className="w-full relative">
          <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none"><SearchIcon /></div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar canal, asesor o enlace..."
            className="w-full bg-white/[0.06] border border-white/10 focus:border-[var(--theme)] rounded-2xl py-3 pl-10 pr-9 text-sm text-white placeholder-white/40 outline-none transition-all"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-3.5 flex items-center text-white/40 hover:text-white text-sm transition-colors">
              ✕
            </button>
          )}
        </div>

        {/* ── CATALOG CTA ── */}
        {showCatalogButton && (() => {
          const btnUrl = formatUrl(data?.catalogButtonUrl || `/${commerceId}/catalogo`);
          const isExt = /^https?:\/\//i.test(btnUrl);
          const label = data?.catalogButtonText || (data?.businessType === 'restaurante' ? 'Menu & Pedidos' : 'Catalogo & Agendamiento');
          const fg = getContrastYIQ(themeHex);
          const inner = (
            <div
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition-transform shadow-[0_8px_30px_rgba(0,0,0,0.5)] border border-white/20"
              style={{ backgroundColor: 'var(--theme)', color: fg }}
            >
              <div className="flex items-center gap-2.5" style={{ color: fg }}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span className="text-sm font-bold" style={{ color: fg }}>{label}</span>
              </div>
              <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: fg === 'black' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.2)', color: fg }}>
                <ChevronRightIcon />
              </div>
            </div>
          );
          return (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="w-full">
              {isExt ? <a href={btnUrl} target="_blank" rel="noopener noreferrer">{inner}</a> : <Link href={btnUrl}>{inner}</Link>}
            </motion.div>
          );
        })()}

        {/* ══════════════════════════════════════════════════════════════════
            MODULE 1 — CHANNELS: HORIZONTAL STORY CAROUSEL (no vertical list)
        ══════════════════════════════════════════════════════════════════ */}
        {channels.length > 0 && (
          <div className="w-full flex flex-col">
            <div className="flex items-center justify-between px-1 mb-2">
              <h2 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Canales de Novedades</h2>
              <span className="text-[10px] text-white/30 font-medium">Desliza para ver mas</span>
            </div>

            {/* Horizontal scroll rail — behaves like Instagram Stories */}
            <div className="w-full overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <div className="flex gap-3 px-1 pb-1" style={{ width: 'max-content' }}>
                {channels.map((btn: any, i: number) => {
                  const { avatarUrl, hasAvatar } = getSpecs(btn);
                  const href = formatUrl(btn.url, btn.phone);
                  return (
                    <motion.a
                      key={i}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center gap-2 w-20 shrink-0 group"
                    >
                      {/* Avatar ring */}
                      <div className="relative">
                        <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-br from-green-400 to-green-600 opacity-80 group-hover:opacity-100 transition-opacity" />
                        <div className="relative w-16 h-16 rounded-2xl overflow-hidden bg-zinc-900 border-2 border-black">
                          {hasAvatar ? (
                            <img
                              src={avatarUrl}
                              alt={btn.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-green-950">
                              <WhatsappIcon size={26} />
                            </div>
                          )}
                        </div>
                        {/* Verified dot */}
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-black flex items-center justify-center">
                          <svg viewBox="0 0 24 24" width="10" height="10" className="fill-black"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
                        </div>
                      </div>

                      {/* Name */}
                      <div className="flex flex-col items-center gap-0.5 w-full text-center">
                        <span className="text-[11px] font-semibold text-white leading-tight line-clamp-2 w-full">{btn.name}</span>
                        <span className="text-[9px] uppercase tracking-wider font-bold text-green-400">Canal</span>
                      </div>
                    </motion.a>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            MODULE 2 — DIRECT CONTACTS: FULL-WIDTH ROWS (name + role always visible)
        ══════════════════════════════════════════════════════════════════ */}
        {waChats.length > 0 && (() => {
          const isExpanded = Boolean(expanded['wa']) || Boolean(searchQuery);
          const show = isExpanded ? waChats : waChats.slice(0, WA_SHOW);
          const needToggle = waChats.length > WA_SHOW;
          return (
            <div className="w-full flex flex-col">
              <SectionLabel label="Atencion Directa & Asesores" showToggle={needToggle && !searchQuery} expanded={isExpanded} count={waChats.length} onToggle={() => toggle('wa')} />
              <div className="flex flex-col gap-2.5 w-full">
                {show.map((btn: any, i: number) => {
                  const { avatarUrl, hasAvatar } = getSpecs(btn);
                  const href = formatUrl(btn.url, btn.phone);
                  return (
                    <motion.a
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-zinc-900/80 backdrop-blur border border-green-500/20 hover:border-green-500/50 transition-all group hover:scale-[1.01] active:scale-[0.99]"
                    >
                      {/* Avatar — always 48px, no flex shrinking */}
                      <div className="relative shrink-0">
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-zinc-800 border-2 border-green-500/30">
                          {hasAvatar ? (
                            <img src={avatarUrl} alt={btn.name} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-green-950">
                              <WhatsappIcon size={20} />
                            </div>
                          )}
                        </div>
                        {/* Online indicator */}
                        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-black" />
                      </div>

                      {/* Text — grows to fill remaining space, NO truncate so name/role is always readable */}
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-sm font-bold text-white group-hover:text-green-300 transition-colors leading-snug break-words">
                          {btn.name}
                        </span>
                        <span className="text-xs text-white/55 mt-0.5 leading-snug break-words">
                          {btn.role || 'Chat Directo de WhatsApp'}
                        </span>
                      </div>

                      {/* Action button */}
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full bg-green-500/20 hover:bg-green-500 text-green-400 hover:text-black border border-green-500/40 text-[11px] font-bold uppercase tracking-wide transition-all"
                      >
                        <MessageCircleIcon />
                        <span>Escribir</span>
                      </a>
                    </motion.a>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ══════════════════════════════════════════════════════════════════
            MODULE 3 — SOCIAL MEDIA: 4-COLUMN BRAND GRID
        ══════════════════════════════════════════════════════════════════ */}
        {socials.length > 0 && (
          <div className="w-full flex flex-col">
            <SectionLabel label="Redes Sociales" showToggle={false} expanded={true} count={0} onToggle={() => {}} />
            <div className="grid grid-cols-4 gap-2 w-full">
              {socials.map((btn: any, i: number) => {
                const { Icon, networkType } = getSpecs(btn);
                const href = formatUrl(btn.url, btn.phone);
                let border = 'border-white/10 hover:border-white/20 bg-white/[0.04]';
                if (networkType === 'instagram') border = 'border-pink-500/30 hover:border-pink-500/60 bg-gradient-to-br from-purple-950/30 via-pink-950/20 to-transparent';
                else if (networkType === 'tiktok') border = 'border-zinc-600/50 hover:border-zinc-400/50 bg-white/[0.03]';
                else if (networkType === 'facebook') border = 'border-blue-500/30 hover:border-blue-500/60 bg-blue-950/20';
                else if (networkType === 'youtube') border = 'border-red-500/30 hover:border-red-500/60 bg-red-950/20';
                else if (networkType === 'twitter' || networkType === 'x') border = 'border-sky-500/30 hover:border-sky-500/60 bg-sky-950/20';
                else if (networkType === 'pinterest') border = 'border-red-600/30 hover:border-red-600/60 bg-red-950/20';
                return (
                  <motion.a
                    key={i}
                    initial={{ opacity: 0, scale: 0.88 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.03 }}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex flex-col items-center justify-center gap-1.5 py-3 px-1 rounded-2xl backdrop-blur border transition-all group hover:scale-[1.04] active:scale-[0.96] text-center ${border}`}
                  >
                    <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Icon />
                    </div>
                    <span className="text-[10px] font-bold text-white/80 group-hover:text-white transition-colors leading-tight line-clamp-1 w-full px-0.5">
                      {btn.name}
                    </span>
                  </motion.a>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            MODULE 4 — WEB LINKS: 2-COLUMN GRID WITH FULL TEXT
        ══════════════════════════════════════════════════════════════════ */}
        {webLinks.length > 0 && (() => {
          const isExpanded = Boolean(expanded['web']) || Boolean(searchQuery);
          const show = isExpanded ? webLinks : webLinks.slice(0, WEB_SHOW);
          const needToggle = webLinks.length > WEB_SHOW;
          return (
            <div className="w-full flex flex-col">
              <SectionLabel label="Sitios & Navegacion Web" showToggle={needToggle && !searchQuery} expanded={isExpanded} count={webLinks.length} onToggle={() => toggle('web')} />
              <div className="grid grid-cols-2 gap-2.5 w-full">
                {show.map((btn: any, i: number) => {
                  const href = formatUrl(btn.url, btn.phone);
                  return (
                    <motion.a
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col gap-2 p-3.5 rounded-2xl bg-zinc-900/80 backdrop-blur border border-indigo-500/20 hover:border-indigo-500/50 transition-all group hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center group-hover:scale-105 transition-transform">
                          <GlobeIcon size={17} />
                        </div>
                        <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          Web
                        </span>
                      </div>
                      {/* Name and role — NOT truncated; wraps naturally */}
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-bold text-white group-hover:text-indigo-200 transition-colors leading-snug break-words">
                          {btn.name}
                        </span>
                        <span className="text-[11px] text-white/50 leading-snug break-words">
                          {btn.role || 'Pagina Web Externa'}
                        </span>
                      </div>
                    </motion.a>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── PROMOS ── */}
        {promos.length > 0 && (
          <div className="w-full flex flex-col gap-3 mt-1">
            {promos.map((promoId: string, idx: number) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + idx * 0.1 }}
                className="w-full aspect-square rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10"
              >
                <img
                  src={`${RENDER_API}/api/avatar/${promoId}?t=${Date.now()}`}
                  alt={`Promo ${idx + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.src = 'https://ui-avatars.com/api/?name=PROMO&background=18181b&color=fff&size=500'; }}
                />
              </motion.div>
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
