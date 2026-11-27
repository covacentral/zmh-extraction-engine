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
    aria-hidden="true"
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
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-[#57534E]"
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
      <div className="flex items-center justify-between pt-1">
        <h2 className="hub-cream-muted text-[11px] font-bold">
          Coincidencias en catalogo
        </h2>
        {status === 'ok' && (
          <span className="hub-cream-muted text-[11px] font-medium">
            {total === 1 ? '1 resultado' : `${total} resultados`}
          </span>
        )}
        {status === 'loading' && (
          <span className="hub-cream-muted text-[11px] font-medium">Buscando...</span>
        )}
      </div>

      <div className="w-full">
        {status === 'loading' && (
          <div className="flex flex-col">
            {[0, 1, 2].map((idx) => (
              <div
                key={idx}
                className="hub-cream-row-active flex items-center gap-3 py-2.5 animate-pulse"
              >
                <div className="h-14 w-14 shrink-0 rounded-xl bg-stone-200/75" />
                <div className="flex flex-1 flex-col gap-2">
                  <div className="h-3.5 w-3/4 rounded bg-stone-200/75" />
                  <div className="h-3 w-1/3 rounded bg-stone-200/75" />
                </div>
              </div>
            ))}
          </div>
        )}

        {status === 'error' && (
          <div className="py-3 text-center">
            <p className="hub-cream-muted text-xs">
              {error || 'Resultados en vivo no disponibles temporalmente.'}
            </p>
          </div>
        )}

        {status === 'ok' && items.length === 0 && (
          <div className="py-3 text-center">
            <p className="hub-cream-muted text-xs">
              Sin coincidencias para &quot;{trimmed}&quot; en el catalogo.
            </p>
          </div>
        )}

        {status === 'ok' && items.length > 0 && (
          <div
            ref={scrollContainerRef}
            className="flex max-h-[320px] flex-col overflow-y-auto"
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
                  className={`group flex w-full min-h-[68px] items-center gap-3 px-1 py-2.5 rounded-lg text-left ${
                    item.inStock
                      ? 'hub-cream-row-active'
                      : 'hub-cream-row-muted opacity-70 hover:opacity-95 transition-opacity duration-150'
                  }`}
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#EFECE6]">
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
                    <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-[#1C1917]">
                      {visibleTitle}
                    </span>
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-bold tracking-tight text-[#1C1917]">
                        {formatCop(item.priceCop)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                          item.inStock ? 'hub-status-available' : 'hub-cream-muted'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${
                            item.inStock ? 'bg-[#047857]' : 'bg-[#57534E]'
                          }`}
                        />
                        {item.inStock ? 'Disponible' : 'Agotado'}
                      </span>
                    </div>
                  </div>

                  <div className="flex h-6 w-6 shrink-0 items-center justify-center text-[#57534E] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[#1C1917]">
                    <ChevronRightSmall />
                  </div>
                </button>
              );
            })}

            {hasMore && (
              <div
                ref={sentinelRef}
                className="hub-cream-muted flex items-center justify-center py-2 text-[11px] font-medium"
              >
                {isLoadingMore ? 'Cargando mas...' : 'Desplaza para ver mas'}
              </div>
            )}

            {items.length > 3 && (
              <div className="sticky bottom-0 h-4 bg-gradient-to-t from-[#FAF7F2] to-transparent pointer-events-none -mt-4" />
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
