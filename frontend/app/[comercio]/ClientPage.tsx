'use client';
import { motion } from 'framer-motion';

const WhatsappIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" className="fill-green-500">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.662-2.062-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.82 9.82 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
  </svg>
);

const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-pink-500">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
  </svg>
);

const TiktokIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-zinc-800">
     <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"></path>
  </svg>
);

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-blue-600">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
  </svg>
);

const PinterestIcon = () => (
    <svg viewBox="0 0 24 24" width="18" height="18" className="fill-red-600">
        <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.951-7.252 4.195 0 7.453 2.99 7.453 6.98 0 4.175-2.631 7.533-6.284 7.533-1.228 0-2.384-.638-2.778-1.39l-.759 2.894c-.274 1.045-1.018 2.348-1.519 3.143 1.196.368 2.457.567 3.764.567 6.621 0 11.988-5.368 11.988-11.988C24 5.367 18.638 0 12.017 0z"/>
    </svg>
)

export default function ClientPage({ data, themeHex, RENDER_API }: any) {
  const { businessName, avatarJid, promoJid, buttons = [] } = data;

  const getNetworkSpecs = (btn: any) => {
     const networkType = (btn.type || 'whatsapp').toLowerCase();
     
     // 1. Determine Icon
     let Icon = WhatsappIcon;
     if (networkType === 'instagram') Icon = InstagramIcon;
     if (networkType === 'tiktok') Icon = TiktokIcon;
     if (networkType === 'facebook') Icon = FacebookIcon;
     if (networkType === 'pinterest') Icon = PinterestIcon;

     // 2. Extract Username / ID to fetch correct Avatar
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
       // Using unavatar.io proxy logic for non-whatsapp networks
       try {
           const urlObj = new URL(btn.url);
           let path = urlObj.pathname.replace(/^\/|\/$/g, '');
           let username = path.split('/')[0];
           if (username && username.startsWith('@')) username = username.substring(1);
           
           if (username) {
              avatarUrl = `https://unavatar.io/${networkType}/${username}?fallback=${encodeURIComponent(fallback)}`;
           }
       } catch (e) {
           avatarUrl = fallback; 
       }
     }

     return { Icon, avatarUrl: avatarUrl || fallback };
  }

  return (
    <main 
      className="flex flex-col items-center p-4 sm:p-12 min-h-screen w-full relative bg-black font-sans"
      style={{ '--theme': themeHex } as any}
    >
      {/* Dynamic Glow Blob */}
      <div 
        className="absolute top-10 left-1/2 -translate-x-1/2 w-[120%] h-96 opacity-40 blur-[100px] pointer-events-none transition-colors duration-1000 z-0"
        style={{ backgroundColor: 'var(--theme)' }}
      />

      <div className="w-full max-w-sm flex-col items-center flex gap-6 z-10">
        
        {/* Banner Horizontal (Transparente) */}
        <div className="w-full flex flex-row items-center justify-between gap-4 mt-4">
          <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-full overflow-hidden shrink-0 shadow-xl border border-white/10 relative">
            <img 
              src={`${RENDER_API}/api/avatar/${avatarJid}`}
              alt={businessName}
              className="w-full h-full object-cover"
              onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${businessName}&background=000&color=fff`)}
            />
          </div>
          <h1 className="text-[1.35rem] sm:text-2xl font-semibold text-white text-right leading-tight max-w-[65%] drop-shadow-md">
            {businessName}
          </h1>
        </div>

        {/* 2-Column Buttons Grid (Píldoras Glassmorphism) */}
        <div className="w-full grid grid-cols-2 gap-3 mt-4">
          {buttons.map((btn: any, i: number) => {
             const { Icon, avatarUrl } = getNetworkSpecs(btn);
             return (
              <motion.a
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 + 0.1 }}
                href={btn.url ? btn.url : (btn.phone ? `https://wa.me/${btn.phone}` : '#')}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-row items-center justify-start p-1.5 pr-3 rounded-full backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/10 transition-all shadow-[0_0_15px_rgba(0,0,0,0.5)] gap-2 hover:shadow-[0_0_20px_var(--theme)] group"
              >
                {/* Dynamic Network Icon */}
                <div className="shrink-0 bg-white rounded-full flex items-center justify-center w-7 h-7 shadow-sm transform group-hover:scale-110 transition-transform">
                   <Icon />
                </div>

                {/* Avatar Profile */}
                <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 bg-white/10 border border-white/20">
                  <img 
                    src={avatarUrl}
                    alt={btn.name}
                    className="w-full h-full object-cover"
                    onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${btn.name}&background=18181b&color=fff`)}
                  />
                </div>

                {/* Database-Driven Name */}
                <span className="text-xs sm:text-sm font-medium text-white/90 truncate leading-none pt-0.5 group-hover:text-white transition-colors">
                  {btn.name}
                </span>
              </motion.a>
            )
          })}
        </div>

        {/* Promo 1:1 Large Square Image (NO borders, high radius) */}
        {promoJid && (
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="w-full aspect-square mt-2 rounded-[2rem] overflow-hidden relative shadow-2xl ring-1 ring-white/10"
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none z-10" />
            <img 
              src={`${RENDER_API}/api/avatar/${promoJid}?timestamp=${new Date().getTime()}`} 
              alt="Promo del día"
              className="w-full h-full object-cover z-0"
              onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=PROMO&background=18181b&color=fff&size=500`)}
            />
          </motion.div>
        )}
      </div>
    </main>
  );
}
