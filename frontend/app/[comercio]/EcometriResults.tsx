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
    strokeWidth="2.4"
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
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-white/25"
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
      aria-label="Coincidencias en catalogo"
      className="w-full flex flex-col gap-2"
    >
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-white/40">
          Coincidencias en Catalogo
        </h2>
        {status === 'ok' && (
          <span className="text-[10px] font-medium text-white/35">
            {total === 1 ? '1 resultado' : `${total} resultados`}
          </span>
        )}
        {status === 'loading' && (
          <span className="text-[10px] font-medium text-white/35">Buscando...</span>
        )}
      </div>

      <div className="w-full rounded-2xl border border-white/[0.08] bg-zinc-900/75 p-2">
        {status === 'loading' && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-zinc-950/60 p-2.5 animate-pulse"
              >
                <div className="h-14 w-14 shrink-0 rounded-xl bg-white/[0.07]" />
                <div className="flex flex-1 flex-col gap-2">
                  <div className="h-3.5 w-3/4 rounded bg-white/[0.07]" />
                  <div className="h-3 w-1/3 rounded bg-white/[0.07]" />
                </div>
              </div>
            ))}
          </div>
        )}

        {status === 'error' && (
          <div className="px-3 py-4 text-center">
            <p className="text-xs text-white/55">
              {error || 'Resultados en vivo no disponibles temporalmente.'}
            </p>
          </div>
        )}

        {status === 'ok' && items.length === 0 && (
          <div className="px-3 py-4 text-center">
            <p className="text-xs text-white/50">
              Sin coincidencias para &quot;{trimmed}&quot; en el catalogo.
            </p>
          </div>
        )}

        {status === 'ok' && items.length > 0 && (
          <div
            ref={scrollContainerRef}
            className="flex max-h-[340px] flex-col gap-1.5 overflow-y-auto"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as any}
          >
            {items.map((item) => {
              const showImg = Boolean(item.imageUrl && !failedImages[item.id]);
              const visibleTitle = item.displayTitle || item.title;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedProduct(item)}
                  className={`group flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors duration-150 ${
                    item.inStock
                      ? 'border-white/[0.07] bg-zinc-950/70 hover:border-white/20 hover:bg-zinc-950'
                      : 'border-white/[0.04] bg-zinc-950/40 opacity-60 hover:opacity-80'
                  }`}
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-zinc-900">
                    {showImg ? (
                      <img
                        src={item.imageUrl as string}
                        alt={visibleTitle}
                        loading="lazy"
                        className="h-full w-full object-cover"
                        onError={() =>
                          setFailedImages((prev) => ({ ...prev, [item.id]: true }))
                        }
                      />
                    ) : (
                      <ImagePlaceholder />
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-white">
                      {visibleTitle}
                    </span>
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-bold tracking-tight text-white">
                        {formatCop(item.priceCop)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-white/55">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            item.inStock ? 'bg-green-500' : 'bg-zinc-500'
                          }`}
                        />
                        {item.inStock ? 'Disponible' : 'Agotado'}
                      </span>
                    </div>
                  </div>

                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/40 transition-colors duration-150 group-hover:bg-white/10 group-hover:text-white">
                    <ChevronRightSmall />
                  </div>
                </button>
              );
            })}

            {hasMore && (
              <div
                ref={sentinelRef}
                className="flex items-center justify-center py-2 text-[11px] font-medium text-white/40"
              >
                {isLoadingMore ? 'Cargando mas...' : 'Desplaza para ver mas'}
              </div>
            )}

            {items.length > 3 && (
              <div className="sticky bottom-0 h-5 bg-gradient-to-t from-zinc-900/90 to-transparent pointer-events-none -mt-5" />
            )}
          </div>
        )}
      </div>

      <ProductQuickView
        commerceId={commerceId}
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
    </section>
  );
}
