import React from 'react';
import { getContrastYIQ } from '../utils/color';

export default function StoreHeader({ cartTotal, cartLength, onCheckoutClick, themeHex }: any) {
    const textColor = getContrastYIQ(themeHex);
    
    return (
        <div className="w-full z-40 flex justify-center mb-4 mt-2 sticky top-4">
           <button 
             onClick={onCheckoutClick}
             className="w-full p-4 rounded-3xl font-black shadow-[0_10px_30px_rgba(0,0,0,0.6)] border border-white/20 hover:scale-[1.02] active:scale-95 transition-transform flex justify-between items-center"
             style={{ backgroundColor: 'var(--theme)', color: textColor }}
           >
              <div className="flex items-center gap-2">
                 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                 <span>Generar Ticket</span>
              </div>
              {cartLength > 0 && (
                <span className="px-3 py-1 rounded-full text-xs font-black shadow-inner shadow-black/20" style={{ backgroundColor: textColor === 'black' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)' }}>
                    ${cartTotal.toLocaleString('es-CO')}
                </span>
              )}
           </button>
        </div>
    );
}
