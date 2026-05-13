import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getContrastYIQ } from '../utils/color';

export default function StoreSection({ title, products, renderProductCard, themeHex }: any) {
    const [expanded, setExpanded] = useState(false);
    
    if (!products || products.length === 0) return null;

    const visibleProducts = expanded ? products : products.slice(0, 10);

    return (
        <div className="w-full mt-6 flex flex-col relative z-0">
            <div className="flex justify-between items-center mb-3 px-2">
                <h3 className="text-white text-lg font-black tracking-wide">{title}</h3>
                {products.length > 10 && !expanded && (
                    <button 
                        onClick={() => setExpanded(true)} 
                        className="text-xs font-bold uppercase tracking-wider hover:underline px-3 py-1 rounded-full border border-[var(--theme)] bg-[var(--theme)]/10"
                        style={{ color: 'var(--theme)' }}
                    >
                        Ver más ({products.length})
                    </button>
                )}
            </div>
            
            <div className={expanded 
                ? "flex flex-col gap-3 px-2" 
                : "flex overflow-x-auto gap-4 pb-4 px-2 snap-x snap-mandatory scrollbar-hide"
            }>
                {visibleProducts.map((prod: any) => (
                    <div 
                        key={prod.id} 
                        className={expanded ? "" : "w-[45%] sm:w-[30%] md:w-[22%] shrink-0 snap-start"}
                    >
                        {renderProductCard(prod, expanded)}
                    </div>
                ))}
            </div>
        </div>
    );
}
