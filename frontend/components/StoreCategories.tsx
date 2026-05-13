import React from 'react';

export default function StoreCategories({ categories, selectedCategory, onSelectCategory }: any) {
    if (!categories || categories.length === 0) return null;

    return (
        <div className="flex overflow-x-auto gap-2 mt-2 pb-2 scrollbar-hide -mx-4 px-4 bg-transparent pt-2">
            <button 
                onClick={() => onSelectCategory(null)} 
                className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${!selectedCategory ? 'bg-[var(--theme)] border-[var(--theme)] text-[var(--text-contrast)] shadow-[0_0_10px_var(--theme)]' : 'bg-black/40 border-white/10 text-white/50 hover:text-white'}`}
            >
                Todos
            </button>
            {categories.map((cat: string, idx: number) => (
                <button 
                    key={idx} 
                    onClick={() => onSelectCategory(cat)} 
                    className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${selectedCategory === cat ? 'bg-[var(--theme)] border-[var(--theme)] text-[var(--text-contrast)] shadow-[0_0_10px_var(--theme)]' : 'bg-black/40 border-white/10 text-white/50 hover:text-white'}`}
                >
                    {cat}
                </button>
            ))}
        </div>
    );
}
