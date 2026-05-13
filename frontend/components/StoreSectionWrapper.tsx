import React, { useMemo } from 'react';
import StoreSection from './StoreSection';

export default function StoreSectionWrapper({ categories, filteredProducts, renderProductCard, isStoreMode, themeHex }: any) {
    // Agrupa productos por categoría para el modo tienda
    const productsByCategory = useMemo(() => {
        if (!isStoreMode) return null;
        
        const grouped: { [key: string]: any[] } = {};
        
        // Si no hay categorías, los agrupamos bajo "Catálogo"
        if (!categories || categories.length === 0) {
            return { 'Catálogo': filteredProducts };
        }

        // Initialize empty arrays to maintain order
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
        return (
            <div className="flex flex-col gap-3 mt-2">
                {filteredProducts.slice(0, 50).map((prod: any) => (
                    <div key={prod.id}>{renderProductCard(prod)}</div>
                ))}
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
        </div>
    );
}
