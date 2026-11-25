'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { formatCop } from '../../lib/ecometri/normalize';
import type { ProductDTO } from '../../lib/ecometri/types';

interface ProductQuickViewProps {
  product: ProductDTO | null;
  onClose: () => void;
}

const CloseIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
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

const ExternalLinkIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="shrink-0"
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const PackageIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="36"
    height="36"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-white/30"
  >
    <path d="M16.5 9.4 7.55 4.24" />
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.29 7 12 12 20.71 7" />
    <line x1="12" y1="22" x2="12" y2="12" />
  </svg>
);

export default function ProductQuickView({ product, onClose }: ProductQuickViewProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [product?.id]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (product) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [product]);

  // Fallback for browsers without native closedby="any" (e.g., Safari)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || typeof window === 'undefined') return;
    if ('closedBy' in HTMLDialogElement.prototype) return;

    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };

    const handlePointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const handlePointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e) && dialog.open) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', handlePointerDown);
    dialog.addEventListener('pointerup', handlePointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', handlePointerDown);
      dialog.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const handleCloseEvent = () => {
    const dialog = dialogRef.current;
    if (dialog) {
      dialog.returnValue = '';
    }
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={handleCloseEvent}
      {...({ closedby: 'any' } as any)}
      className="product-quickview m-auto w-[calc(100%-1.5rem)] max-w-md rounded-3xl border border-white/15 bg-zinc-950/95 p-0 text-white shadow-[0_24px_80px_rgba(0,0,0,0.85)] backdrop-blur-2xl"
    >
      {product && (
        <div className="flex max-h-[85vh] w-full flex-col overflow-hidden">
          {/* Top media area */}
          <div className="relative flex aspect-square max-h-[300px] w-full items-center justify-center overflow-hidden bg-zinc-900/90 border-b border-white/10">
            {product.imageUrl && !imgFailed ? (
              <img
                src={product.imageUrl}
                alt={product.title}
                className="h-full w-full object-contain bg-zinc-950/60"
                onError={() => setImgFailed(true)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2">
                <PackageIcon />
                <span className="text-[11px] font-medium text-white/40">
                  Imagen no disponible
                </span>
              </div>
            )}

            {/* Status pill */}
            <div className="absolute left-3.5 top-3.5">
              {product.inStock ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/35 bg-black/75 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300 backdrop-blur-md">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Disponible
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/30 bg-black/75 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-red-300 backdrop-blur-md">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                  Agotado
                </span>
              )}
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Cerrar vista rapida"
              autoFocus
              className="absolute right-3.5 top-3.5 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/75 text-white/80 backdrop-blur-md transition-colors hover:border-white/30 hover:text-white"
            >
              <CloseIcon />
            </button>
          </div>

          {/* Product details */}
          <div className="flex flex-col gap-3.5 overflow-y-auto p-5">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                  Vista rapida de catalogo
                </span>
                {product.sku && (
                  <span className="rounded-md border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white/70">
                    SKU: {product.sku}
                  </span>
                )}
              </div>

              <h1
                id={titleId}
                className="text-lg font-extrabold leading-snug text-white break-words"
              >
                {product.title}
              </h1>

              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-black tracking-tight text-white">
                  {formatCop(product.priceCop)}
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
                  COP
                </span>
              </div>
            </div>

            {product.description && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
                <span className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">
                  Detalles
                </span>
                <p className="text-xs leading-relaxed text-white/80 break-words">
                  {product.description}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="mt-1 flex flex-col gap-2">
              <a
                href={product.productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="catalog-cta-btn group flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-extrabold tracking-wide text-white transition-all duration-200 hover:scale-[1.01] active:scale-[0.985]"
              >
                <span className="relative z-10">Ver en Catalogo</span>
                <span className="relative z-10">
                  <ExternalLinkIcon />
                </span>
              </a>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                Seguir viendo
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
