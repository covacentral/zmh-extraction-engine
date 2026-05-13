import React from 'react';
import * as LucideIcons from 'lucide-react';

export default function StoreDualFilter({ 
    categories, 
    selectedCategory, 
    onSelectCategory,
    brands,
    selectedBrand,
    onSelectBrand
}: any) {
    if (!categories || categories.length === 0) return null;

    const renderIcon = (iconName: string) => {
        const Icon = (LucideIcons as any)[iconName || 'Box'] || LucideIcons.Box;
        return <Icon size={24} />;
    };

    return (
        <div className="flex flex-col gap-3 mt-4 mb-2">
            {/* Category Row */}
            <div className="flex overflow-x-auto gap-3 pb-2 scrollbar-hide -mx-4 px-4">
                <button 
                    onClick={() => { onSelectCategory(null); onSelectBrand(null); }}
                    className={`shrink-0 flex flex-col items-center justify-center gap-1.5 w-24 h-24 rounded-2xl border transition-all ${!selectedCategory ? 'bg-[var(--theme)] border-[var(--theme)] text-[var(--text-contrast)] shadow-[0_4px_20px_var(--theme)] opacity-100' : 'bg-black/30 border-white/5 text-white/50 hover:bg-white/5'}`}
                >
                    <LucideIcons.LayoutGrid size={24} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Todos</span>
                </button>
                {categories.map((cat: any, idx: number) => (
                    <button 
                        key={idx} 
                        onClick={() => { onSelectCategory(cat.name); onSelectBrand(null); }}
                        className={`shrink-0 flex flex-col items-center justify-center gap-1.5 w-24 h-24 rounded-2xl border transition-all ${selectedCategory === cat.name ? 'bg-[var(--theme)] border-[var(--theme)] text-[var(--text-contrast)] shadow-[0_4px_20px_var(--theme)] opacity-100' : 'bg-black/30 border-white/5 text-white/50 hover:bg-white/5'}`}
                    >
                        {renderIcon(cat.icon)}
                        <span className="text-[10px] font-bold uppercase tracking-wider text-center px-2 line-clamp-1">{cat.name}</span>
                    </button>
                ))}
            </div>

            {/* Brand Row */}
            {selectedCategory && brands && brands.length > 0 && (
                <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide -mx-4 px-4 items-center">
                    <span className="text-[10px] text-[var(--theme)] uppercase tracking-widest font-black shrink-0 mr-2 flex items-center gap-1"><LucideIcons.Tag size={12}/> Marcas</span>
                    <button 
                        onClick={() => onSelectBrand(null)} 
                        className={`shrink-0 px-4 py-1.5 rounded-full text-[10px] font-bold transition-all border uppercase tracking-wider ${!selectedBrand ? 'bg-white/20 border-white/30 text-white' : 'bg-black/40 border-white/10 text-white/50 hover:text-white hover:bg-white/5'}`}
                    >
                        Todas
                    </button>
                    {brands.map((brand: string, idx: number) => (
                        <button 
                            key={idx} 
                            onClick={() => onSelectBrand(brand)} 
                            className={`shrink-0 px-4 py-1.5 rounded-full text-[10px] font-bold transition-all border uppercase tracking-wider ${selectedBrand === brand ? 'bg-white/20 border-white/30 text-white' : 'bg-black/40 border-white/10 text-white/50 hover:text-white hover:bg-white/5'}`}
                        >
                            {brand}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
