'use client';
import { motion } from 'framer-motion';

export default function Home() {
  // En el futuro estos datos pueden venir de Firebase o un panel, 
  // pero el "Zero-Management" real es que sus fotos se cambian en Whatsapp.
  const phoneLinks = [
    { name: 'Ventas y Catálogo', phone: '5215555555555', role: 'Catálogo de productos' },
    { name: 'Soporte Técnico', phone: '5215555555556', role: 'Ayuda técnica' },
    { name: 'Facturación', phone: '5215555555557', role: 'Problemas de pago' }
  ];

  // La URL maestra de tu motor de extracción en Render
  const RENDER_API = 'https://zmh-extraction-engine.onrender.com';
  // El número de la empresa matriz (cambiar por el real luego)
  const masterPhone = '5215555555555'; 

  return (
    <main className="flex flex-col items-center p-6 sm:p-24 min-h-screen max-w-2xl mx-auto w-full relative overflow-hidden">
      
      {/* Background Glow effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-zinc-600/30 blur-[120px] rounded-full pointer-events-none -z-10" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full flex-col items-center flex gap-8 z-10"
      >
        {/* Profile Avatar del Negocio extraído en vivo */}
        <div className="group relative w-36 h-36 rounded-full overflow-hidden border-4 border-zinc-800 shadow-2xl transition-all duration-300 hover:scale-105 hover:border-zinc-500 hover:shadow-zinc-700/50">
          <img 
            src={`${RENDER_API}/api/avatar/${masterPhone}`}
            alt="Business Logo"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://ui-avatars.com/api/?name=Empresa&background=random';
            }}
          />
        </div>

        <div className="text-center space-y-3">
          <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-zinc-500">
            Empresa ZMH
          </h1>
          <p className="text-zinc-400 font-medium">Conectados contigo en un solo clic.</p>
        </div>

        <div className="w-full flex flex-col gap-4 mt-8">
          {phoneLinks.map((link, i) => (
            <motion.a
              key={link.phone}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.15 + 0.3 }}
              href={`https://wa.me/${link.phone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-5 w-full p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-xl transition-all duration-300 hover:bg-zinc-800 hover:border-zinc-600 hover:-translate-y-1 hover:shadow-xl hover:shadow-zinc-900/50"
            >
              {/* Icono Extraido en Vivo por el Motor */}
              <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0 border-2 border-zinc-700 bg-zinc-800 shadow-inner">
                <img 
                  src={`${RENDER_API}/api/avatar/${link.phone}`}
                  alt={link.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${link.name}&background=18181b&color=fff`;
                  }}
                />
              </div>
              <div className="flex flex-col flex-1">
                <span className="text-lg font-bold text-zinc-100">{link.name}</span>
                <span className="text-sm font-medium text-zinc-500">{link.role}</span>
              </div>
              {/* Mini flecha */}
              <div className="text-zinc-600 group-hover:text-zinc-300 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </div>
            </motion.a>
          ))}
        </div>
      </motion.div>
    </main>
  );
}
