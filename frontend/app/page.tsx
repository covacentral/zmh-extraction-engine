'use client';
import { motion } from 'framer-motion';

export default function Home() {
  // Demo state, the real one will fetch from Render backend via WhatsApp
  const phoneLinks = [
    { name: 'Ventas', phone: '5215555555555', role: 'Catálogo' },
    { name: 'Soporte', phone: '5215555555556', role: 'Ayuda técnica' },
  ];

  return (
    <main className="flex flex-col items-center justify-center p-6 sm:p-24 min-h-screen max-w-2xl mx-auto w-full">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full flex-col items-center flex gap-8"
      >
        {/* Profile Avatar / Group Promo */}
        <div className="relative group cursor-pointer w-32 h-32 rounded-full overflow-hidden border-4 border-zinc-800 shadow-2xl transition-all hover:scale-105 hover:border-zinc-700">
           {/* Fallback avatar */}
           <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-4xl">Z</div>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-white to-zinc-500">
            Empresa Demo
          </h1>
          <p className="text-zinc-400">Nuestro concentrador automático.</p>
        </div>

        <div className="w-full flex flex-col gap-4 mt-6">
          {phoneLinks.map((link, i) => (
            <motion.a
              key={link.phone}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 + 0.3 }}
              href={`https://wa.me/${link.phone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 w-full p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800 backdrop-blur-xl transition-all hover:bg-zinc-800/80 hover:border-zinc-600 hover:scale-[1.02]"
            >
              <div className="w-12 h-12 rounded-full bg-zinc-800 flex-shrink-0 animate-pulse" />
              <div className="flex flex-col flex-1">
                <span className="font-semibold text-zinc-200">{link.name}</span>
                <span className="text-sm text-zinc-500">{link.role}</span>
              </div>
            </motion.a>
          ))}
        </div>
      </motion.div>
    </main>
  );
}
