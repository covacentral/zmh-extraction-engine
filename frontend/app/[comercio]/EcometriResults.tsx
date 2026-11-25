'use client';

import { useEffect, useRef, useState } from 'react';
import { formatCop } from '../../lib/ecometri/normalize';
import type { ProductDTO } from '../../lib/ecometri/types';
import { useEcometriSearch } from '../../lib/ecometri/useEcometriSearch';
import ProductQuickView from './ProductQuickView';

interface EcometriResultsProps {
  commerceId: string;
  searchQuery: string;
}

const ChevronRightSmall = () => (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="shrink-0"
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const ImagePlaceholder = () => (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-white/30"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

export default function EcometriResults({ commerceId, searchQuery }: EcometriResultsProps) {
  const trimmed = searchQuery.trim();
  const { items, total, hasMore, status, isLoadingMore, error, loadMore } =
    useEcometriSearch(commerceId, trimmed, true);

  const [selectedProduct, setSelectedProduct] = useState<ProductDTO | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollContainerRef.current;
    if (!sentinel || !root || !hasMore || status !== 'ok') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      {
        root,
        rootMargin: '80px',
        threshold: 0.1,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, status, loadMore, items.length]);

  if (trimmed.length < 2) {
    return null;
  }

  return (
    <section
      aria-label="Productos en catalogo"
      className="w-full flex flex-col gap-2"
    >
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-white/45">
          Productos en Catalogo
        </h2>
        {status === 'ok' && (
          <span className="text-[10px] font-semibold text-white/40">
            {total === 1 ? '1 coincidencia' : `${total} coincidencias`}
          </span>
        )}
        {status === 'loading' && (
          <span className="text-[10px] font-medium text-white/40">Buscando...</span>
        )}
      </div>

      <div className="w-full rounded-2xl border border-white/10 bg-zinc-950/85 p-2 shadow-[0_8px_32px_rgba(0,0,0,0.55)] backdrop-blur-xl">
        {status === 'loading' && (
          <div className="flex flex-col gap-2 p-1">
            {[0, 1, 2].map((idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5 animate-pulse"
              >
                <div className="h-14 w-14 shrink-0 rounded-xl bg-white/10" />
                <div className="flex flex-1 flex-col gap-2">
                  <div className="h-3.5 w-3/4 rounded bg-white/10" />
                  <div className="h-3 w-1/3 rounded bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        )}

        {status === 'error' && (
          <div className="px-3 py-4 text-center">
            <p className="text-xs font-medium text-white/60">
              {error || 'Resultados en vivo no disponibles temporalmente.'}
            </p>
          </div>
        )}

        {status === 'ok' && items.length === 0 && (
          <div className="px-3 py-4 text-center">
            <p className="text-xs font-medium text-white/55">
              No encontramos productos para &quot;{trimmed}&quot; en el catalogo.
            </p>
          </div>
        )}

        {status === 'ok' && items.length > 0 && (
          <div
            ref={scrollContainerRef}
            className="flex max-h-[340px] flex-col gap-2 overflow-y-auto pr-0.5"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as any}
          >
            {items.map((item) => {
              const showImg = Boolean(item.imageUrl && !failedImages[item.id]);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedProduct(item)}
                  className={`group flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all hover:scale-[1.008] active:scale-[0.99] ${
                    item.inStock
                      ? 'border-white/10 bg-zinc-900/85 hover:border-white/25 hover:bg-zinc-900'
                      : 'border-white/[0.06] bg-zinc-900/45 opacity-65 hover:opacity-85'
                  }`}
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-zinc-950">
                    {showImg ? (
                      <img
                        src={item.imageUrl as string}
                        alt={item.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                        onError={() =>
                          setFailedImages((prev) => ({ ...prev, [item.id]: true }))
                        }
                      />
                    ) : (
                      <ImagePlaceholder />
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="line-clamp-2 text-xs font-bold leading-snug text-white group-hover:text-white">
                      {item.title}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold tracking-tight text-white">
                        {formatCop(item.priceCop)}
                      </span>
                      {item.inStock ? (
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                          Disponible
                        </span>
                      ) : (
                        <span className="rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/55">
                          Agotado
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/60 transition-all group-hover:border-white/25 group-hover:bg-white/15 group-hover:text-white">
                    <ChevronRightSmall />
                  </div>
                </button>
              );
            })}

            {hasMore && (
              <div
                ref={sentinelRef}
                className="flex items-center justify-center py-2 text-[11px] font-semibold text-white/45"
              >
                {isLoadingMore ? 'Cargando mas productos...' : 'Desplaza para ver mas'}
              </div>
            )}
          </div>
        )}
      </div>

      <ProductQuickView
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
    </section>
  );
}
