'use client';
import { motion } from 'framer-motion';
import { Instagram, MessageCircle } from 'lucide-react';

export default function ClientPage({ data, themeHex, RENDER_API }: any) {
  const { businessName, avatarJid, promoJid, buttons = [] } = data;

  return (
    <main 
      className="flex flex-col items-center p-6 sm:p-24 min-h-screen relative overflow-hidden"
      style={{ '--theme': themeHex } as any}
    >
      {/* Background Deep Glow colored with CSS var */}
      <div 
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] blur-[150px] rounded-full pointer-events-none -z-10 opacity-20" 
        style={{ backgroundColor: 'var(--theme)' }}
      />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg flex-col items-center flex gap-8 z-10"
      >
        {/* Banner Header */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div 
            className="w-24 h-24 rounded-full overflow-hidden border-2 shadow-2xl transition-all duration-300 hover:scale-105" 
            style={{ borderColor: 'var(--theme)' }}
          >
            <img 
              src={`${RENDER_API}/api/avatar/${avatarJid}`}
              alt={businessName}
              className="w-full h-full object-cover"
              onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${businessName}&background=000&color=fff`)}
            />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            {businessName}
          </h1>
        </div>

        {/* 2-Column Buttons Grid */}
        <div className="w-full grid grid-cols-2 gap-4 mt-2">
          {buttons.map((btn: any, i: number) => (
            <motion.a
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 + 0.1 }}
              href={btn.type === 'instagram' ? btn.url : `https://wa.me/${btn.phone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col items-center justify-center p-6 rounded-2xl border backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 shadow-lg hover:bg-[var(--theme)] border-zinc-800/80 bg-zinc-900/40"
              style={{
                boxShadow: `0 4px 20px -5px var(--theme)`,
              }}
            >
              <div className="mb-3 text-white transition-transform duration-300 group-hover:scale-110">
                {btn.type === 'instagram' ? <Instagram size={32} /> : <MessageCircle size={32} />}
              </div>
              <span className="text-sm font-bold text-zinc-100 transition-colors">{btn.name}</span>
            </motion.a>
          ))}
        </div>

        {/* Promo 1:1 Large Square Image */}
        {promoJid && (
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="w-full aspect-square mt-6 rounded-[2rem] overflow-hidden border-2 shadow-2xl relative group bg-zinc-900"
            style={{ borderColor: 'var(--theme)' }}
          >
           <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 flex items-center justify-center pointer-events-none">
             <span className="text-white font-bold text-lg px-6 py-3 rounded-full transition-transform duration-300 scale-95 group-hover:scale-100" style={{ backgroundColor: 'var(--theme)' }}>
               🌟 Promociones Exclusivas
             </span>
           </div>
            <img 
              src={`${RENDER_API}/api/avatar/${promoJid}?timestamp=${new Date().getTime()}`} 
              alt="Promo del día"
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=PROMO&background=18181b&color=fff&size=500`)}
            />
          </motion.div>
        )}
      </motion.div>
    </main>
  );
}
