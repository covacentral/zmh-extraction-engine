import React from 'react';

export default function StoreSectionFilter({ sections, selectedSection, onSelectSection }: any) {
    if (!sections || sections.length === 0) return null;

    return (
        <>
            <button 
                onClick={() => onSelectSection(null)} 
                className={`shrink-0 p-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border text-center ${!selectedSection ? 'bg-[var(--theme)] text-[var(--text-contrast)] border-[var(--theme)] shadow-[0_0_15px_var(--theme)]' : 'bg-black/40 border-white/10 text-white/50 hover:text-white hover:bg-white/5'}`}
            >
                Todo
            </button>
            {sections.map((sec: string, idx: number) => (
                <button 
                    key={idx} 
                    onClick={() => onSelectSection(sec)} 
                    className={`shrink-0 p-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border text-center ${selectedSection === sec ? 'bg-[var(--theme)] text-[var(--text-contrast)] border-[var(--theme)] shadow-[0_0_15px_var(--theme)]' : 'bg-black/40 border-white/10 text-white/50 hover:text-white hover:bg-white/5'}`}
                >
                    {sec}
                </button>
            ))}
        </>
    );
}
