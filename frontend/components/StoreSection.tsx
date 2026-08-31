import React, { useState } from 'react';

export default function StoreSection({ title, products, renderProductCard, themeHex }: any) {
    const [expanded, setExpanded] = useState(false);
    const [pageCount, setPageCount] = useState(12);
    
    if (!products || products.length === 0) return null;

    const previewCount = 8;
    const visibleProducts = expanded ? products.slice(0, pageCount) : products.slice(0, previewCount);
    const hasMore = expanded && pageCount < products.length;

    return (
        <div className="w-full mt-6 flex flex-col relative z-0">
            <div className="flex justify-between items-center mb-3 px-2">
                <div className="flex items-center gap-2">
                    <h3 className="text-white text-lg font-black tracking-wide">{title}</h3>
                    <span className="text-white/40 text-xs font-mono font-bold bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                        {products.length}
                    </span>
                </div>
                {products.length > previewCount && (
                    <button 
                        onClick={() => {
                            if (expanded) {
                                setExpanded(false);
                                setPageCount(12);
                            } else {
                                setExpanded(true);
                            }
                        }} 
                        className="text-xs font-bold uppercase tracking-wider hover:opacity-80 px-3 py-1 rounded-full border transition-all"
                        style={{ 
                            borderColor: 'var(--theme)', 
                            backgroundColor: expanded ? 'var(--theme)' : 'rgba(255,255,255,0.05)',
                            color: expanded ? '#000000' : 'var(--theme)'
                        }}
                    >
                        {expanded ? 'Ver menos' : `Ver todos (${products.length})`}
                    </button>
                )}
            </div>
            
            <div className={expanded 
                ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 px-2" 
                : "flex overflow-x-auto gap-3 pb-3 px-2 snap-x snap-mandatory scrollbar-hide"
            }>
                {visibleProducts.map((prod: any, idx: number) => (
                    <div 
                        key={prod.id} 
                        className={expanded ? "w-full" : "w-36 sm:w-44 md:w-48 shrink-0 snap-start"}
                    >
                        {renderProductCard(prod, false, idx < 4)}
                    </div>
                ))}
            </div>

            {hasMore && (
                <div className="flex justify-center mt-4 mb-2">
                    <button 
                        onClick={() => setPageCount(prev => prev + 12)}
                        className="px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider bg-white/10 hover:bg-white/20 text-white transition-colors border border-white/10 flex items-center gap-1.5 shadow-lg"
                    >
                        Cargar más ({products.length - pageCount} restantes)
                    </button>
                </div>
            )}
        </div>
    );
}
