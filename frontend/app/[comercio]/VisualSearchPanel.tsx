'use client';

import { useEffect, useState } from 'react';
import { formatCop } from '../../lib/ecometri/normalize';
import type { ProductDTO } from '../../lib/ecometri/types';
import ProductQuickView from './ProductQuickView';
import type { VisualSearchUiState } from './VisualSearchTrigger';

export const VISUAL_RESULTS_HEADING = 'Resultados ordenados por similitud';

function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  if (mins > 0) return `${mins} min ${rem} s`;
  return `${rem} s`;
}

interface VisualSearchPanelProps {
  commerceId: string;
  state: VisualSearchUiState;
  onSelectChip: (term: string) => void;
  onClear: () => void;
}

const CloseSmallIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="13"
    height="13"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

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

export default function VisualSearchPanel({
  commerceId,
  state,
  onSelectChip,
  onClear,
}: VisualSearchPanelProps) {
  const [selectedProduct, setSelectedProduct] = useState<ProductDTO | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  useEffect(() => {
    const quota = state.quota;
    if (!quota || !quota.resetAt) {
      setSecondsLeft(0);
      return;
    }

    const compute = () => Math.max(0, Math.ceil((quota.resetAt - Date.now()) / 1000));
    setSecondsLeft(compute());

    const interval = setInterval(() => {
      const next = compute();
      setSecondsLeft(next);
      if (next <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [state.quota]);

  if (state.status === 'idle') return null;

  const isLoading = state.status === 'identifying' || state.status === 'comparing';

  return (
    <section
      aria-label={VISUAL_RESULTS_HEADING}
      className="w-full flex flex-col gap-2"
    >
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 min-w-0">
          {state.previewDataUrl && (
            <img
              src={state.previewDataUrl}
              alt="Foto consultada"
              className="h-6 w-6 rounded-md border border-white/15 object-cover shrink-0"
            />
          )}
          <h2 className="truncate text-[10px] font-bold uppercase tracking-widest text-white/40">
            {state.status === 'identifying' && 'Identificando producto...'}
            {state.status === 'comparing' && 'Comparando en el catalogo...'}
            {state.status === 'ok' && VISUAL_RESULTS_HEADING}
            {state.status === 'error' && 'Busqueda por foto'}
          </h2>
        </div>

        <button
          type="button"
          onClick={onClear}
          aria-label="Cerrar busqueda por foto"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-white/45 transition-colors duration-150 hover:bg-white/10 hover:text-white"
        >
          <span>Cerrar</span>
          <CloseSmallIcon />
        </button>
      </div>

      <div className="w-full rounded-2xl border border-white/[0.08] bg-zinc-900/75 p-2 flex flex-col gap-2">
        {isLoading && (
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

        {state.status === 'error' && (
          <div className="px-3 py-3 text-center">
            <p className="text-xs text-white/60">
              {state.error || 'Buscador por foto en pausa breve, intenta en unos segundos o busca por texto.'}
            </p>
          </div>
        )}

        {state.status === 'ok' && state.chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-0.5 pt-0.5">
            {state.chips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => onSelectChip(chip)}
                className="rounded-full border border-white/10 bg-zinc-950/75 px-2.5 py-1 text-[11px] font-medium text-white/70 transition-colors duration-150 hover:border-white/25 hover:text-white"
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {state.status === 'ok' && state.items.length === 0 && (
          <div className="px-3 py-3 text-center">
            <p className="text-xs text-white/55">
              El catalogo de este comercio no devolvio productos disponibles en este momento.
            </p>
          </div>
        )}

        {/* Strict server-provided similarity order (never reordered or filtered on client) */}
        {state.status === 'ok' && state.items.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {state.items.map((item) => {
              const showImg = Boolean(item.imageUrl && !failedImages[item.id]);
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
                        alt={item.title}
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
                      {item.title}
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
          </div>
        )}

        {state.quota && (
          <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2 px-1 text-[10px] font-medium text-white/45">
            <span>
              {secondsLeft > 0 && state.quota.remaining < state.quota.limit
                ? `Intentos disponibles: ${state.quota.remaining} de ${state.quota.limit}`
                : `Intentos disponibles: ${state.quota.limit} de ${state.quota.limit}`}
            </span>
            {secondsLeft > 0 && state.quota.remaining < state.quota.limit && (
              <span>Se restablece en {formatCountdown(secondsLeft)}</span>
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
