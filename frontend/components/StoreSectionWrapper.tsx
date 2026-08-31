import React, { useMemo, useState, useEffect } from 'react';
import StoreSection from './StoreSection';

export default function StoreSectionWrapper({ categories, filteredProducts, renderProductCard, isStoreMode, themeHex }: any) {
    const [listCount, setListCount] = useState(16);

    // Reset pagination on filter or search changes
    useEffect(() => {
        setListCount(16);
    }, [filteredProducts]);

    // Agrupa productos por categoría para el modo tienda
    const productsByCategory = useMemo(() => {
        if (!isStoreMode) return null;
        
        const grouped: { [key: string]: any[] } = {};
        
        if (!categories || categories.length === 0) {
            return { 'Catálogo': filteredProducts };
        }

        categories.forEach((cat: any) => {
            grouped[cat.name] = [];
        });
        grouped['Otros'] = [];

        filteredProducts.forEach((prod: any) => {
            const desc = (prod.description || '').toLowerCase();
            const prodCat = prod.category;
            let matched = false;
            categories.forEach((cat: any) => {
                if (prodCat === cat.name || desc.includes(cat.name.toLowerCase())) {
                    grouped[cat.name].push(prod);
                    matched = true;
                }
            });
            if (!matched) grouped['Otros'].push(prod);
        });

        // Eliminar categorías vacías
        Object.keys(grouped).forEach(k => {
            if (grouped[k].length === 0) delete grouped[k];
        });

        return grouped;
    }, [filteredProducts, categories, isStoreMode]);

    if (!isStoreMode) {
        const visibleList = filteredProducts.slice(0, listCount);
        const hasMoreList = listCount < filteredProducts.length;

        return (
            <div className="flex flex-col gap-3 mt-2">
                {visibleList.map((prod: any, idx: number) => (
                    <div key={prod.id}>{renderProductCard(prod, true, idx < 6)}</div>
                ))}

                {hasMoreList && (
                    <div className="flex justify-center mt-6 mb-8">
                        <button 
                            onClick={() => setListCount(prev => prev + 16)}
                            className="px-6 py-3 rounded-full text-xs font-bold uppercase tracking-wider bg-white/10 hover:bg-white/20 text-white transition-all border border-white/10 flex items-center gap-2 shadow-xl hover:scale-105 active:scale-95"
                        >
                            <span>Cargar más productos</span>
                            <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-mono">
                                {filteredProducts.length - listCount} más
                            </span>
                        </button>
                    </div>
                )}

                {filteredProducts.length === 0 && (
                    <div className="text-center py-16 text-white/40">
                        <p className="text-sm">No se encontraron productos con los filtros seleccionados.</p>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full">
            {Object.entries(productsByCategory || {}).map(([cat, prods]) => (
                <StoreSection 
                    key={cat} 
                    title={cat} 
                    products={prods} 
                    renderProductCard={renderProductCard} 
                    themeHex={themeHex} 
                />
            ))}

            {filteredProducts.length === 0 && (
                <div className="text-center py-16 text-white/40">
                    <p className="text-sm">No se encontraron productos con los filtros seleccionados.</p>
                </div>
            )}
        </div>
    );
}
