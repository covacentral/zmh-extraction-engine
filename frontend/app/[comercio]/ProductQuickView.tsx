'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { formatCop } from '../../lib/ecometri/normalize';
import type { ProductDetailDTO, ProductDTO } from '../../lib/ecometri/types';

interface ProductQuickViewProps {
  commerceId: string;
  product: ProductDTO | null;
  onClose: () => void;
}

const detailSessionCache = new Map<string, ProductDetailDTO>();

const CloseIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="17"
    height="17"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const CopyIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="13"
    height="13"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="shrink-0"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="13"
    height="13"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="shrink-0"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="15"
    height="15"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
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
    width="34"
    height="34"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-white/25"
  >
    <path d="M16.5 9.4 7.55 4.24" />
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.29 7 12 12 20.71 7" />
    <line x1="12" y1="22" x2="12" y2="12" />
  </svg>
);

export default function ProductQuickView({
  commerceId,
  product,
  onClose,
}: ProductQuickViewProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const skuTextRef = useRef<HTMLSpanElement | null>(null);
  const titleId = useId();
  const [imgFailed, setImgFailed] = useState(false);
  const [detail, setDetail] = useState<ProductDetailDTO | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setImgFailed(false);
    setCopied(false);
  }, [product?.id]);

  // Open/close native modal dialog
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

  // Fetch SKU / availability / description lazily only when modal is open
  useEffect(() => {
    if (!product || !product.slug || !commerceId) {
      setDetail(null);
      setLoadingDetail(false);
      return;
    }

    const cacheKey = `${commerceId}:${product.slug}`;
    const cached = detailSessionCache.get(cacheKey);
    if (cached) {
      setDetail(cached);
      setLoadingDetail(false);
      return;
    }

    const controller = new AbortController();
    setDetail(null);
    setLoadingDetail(true);

    const url = `/api/ecometri-product?c=${encodeURIComponent(
      commerceId
    )}&slug=${encodeURIComponent(product.slug)}`;

    fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data: ProductDetailDTO | null) => {
        if (controller.signal.aborted) return;
        if (data && typeof data === 'object') {
          const normalized: ProductDetailDTO = {
            sku: typeof data.sku === 'string' ? data.sku : null,
            inStock: typeof data.inStock === 'boolean' ? data.inStock : null,
            description: typeof data.description === 'string' ? data.description : null,
          };
          detailSessionCache.set(cacheKey, normalized);
          setDetail(normalized);
        }
      })
      .catch(() => {
        // Graceful degradation: keep search data visible without SKU
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingDetail(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [commerceId, product]);

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

  const resolvedSku = detail?.sku ?? product?.sku ?? null;
  const resolvedInStock =
    detail?.inStock !== null && detail?.inStock !== undefined
      ? detail.inStock
      : product?.inStock ?? true;
  const resolvedDescription = detail?.description ?? product?.description ?? null;

  const handleCopySku = async () => {
    if (!resolvedSku) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(resolvedSku);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
        return;
      }
    } catch {
      // Fall through to manual text selection fallback
    }

    if (skuTextRef.current && typeof window !== 'undefined') {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(skuTextRef.current);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  };

  const dialogAttrs: Record<string, string> = { closedby: 'any' };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={handleCloseEvent}
      {...dialogAttrs}
      className="product-quickview m-auto w-[calc(100%-1.5rem)] max-w-md rounded-3xl border border-white/12 bg-zinc-950 p-0 text-white shadow-2xl"
    >
      {product && (
        <div className="flex max-h-[86vh] w-full flex-col overflow-hidden">
          {/* Media frame */}
          <div className="relative flex aspect-square max-h-[290px] w-full items-center justify-center overflow-hidden border-b border-white/10 bg-zinc-900">
            {product.imageUrl && !imgFailed ? (
              <img
                src={product.imageUrl}
                alt={product.title}
                className="h-full w-full object-contain bg-zinc-950"
                onError={() => setImgFailed(true)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2">
                <PackageIcon />
                <span className="text-[11px] font-medium text-white/40">
                  Sin imagen
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Cerrar detalle de producto"
              autoFocus
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/80 text-white/80 transition-colors duration-150 hover:border-white/30 hover:text-white"
            >
              <CloseIcon />
            </button>
          </div>

          {/* Content */}
          <div className="flex flex-col gap-3.5 overflow-y-auto p-5">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-[11px] font-semibold">
                <span
                  className={`h-2 w-2 rounded-full ${
                    resolvedInStock ? 'bg-green-500' : 'bg-zinc-500'
                  }`}
                />
                <span className={resolvedInStock ? 'text-green-400' : 'text-zinc-400'}>
                  {resolvedInStock ? 'Disponible' : 'Agotado'}
                </span>
              </div>

              <h1
                id={titleId}
                className="text-lg font-bold leading-snug text-white break-words"
              >
                {product.title}
              </h1>

              <div className="flex items-baseline gap-1.5 pt-0.5">
                <span className="text-2xl font-black tracking-tight text-white">
                  {formatCop(product.priceCop)}
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
                  COP
                </span>
              </div>
            </div>

            {/* Codigo / Referencia (SKU) */}
            {(resolvedSku || loadingDetail) && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-zinc-900/90 px-3.5 py-2.5">
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                    Codigo / Referencia
                  </span>
                  {resolvedSku ? (
                    <span
                      ref={skuTextRef}
                      className="font-mono text-sm font-bold tracking-wider text-white select-all"
                    >
                      {resolvedSku}
                    </span>
                  ) : (
                    <span className="text-xs text-white/40">Consultando...</span>
                  )}
                </div>

                {resolvedSku && (
                  <button
                    type="button"
                    onClick={handleCopySku}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-bold text-white/85 transition-colors duration-150 hover:border-white/30 hover:bg-white/12 hover:text-white"
                  >
                    {copied ? <CheckIcon /> : <CopyIcon />}
                    <span>{copied ? 'Copiado' : 'Copiar'}</span>
                  </button>
                )}
              </div>
            )}

            <span className="sr-only" aria-live="polite">
              {copied && resolvedSku ? `Codigo ${resolvedSku} copiado` : ''}
            </span>

            {resolvedDescription && (
              <div className="rounded-xl border border-white/[0.08] bg-zinc-900/60 p-3.5">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/45">
                  Detalles
                </span>
                <p className="text-xs leading-relaxed text-white/75 break-words">
                  {resolvedDescription}
                </p>
              </div>
            )}

            {/* Actions: sharp, restrained hierarchy (never competing with main catalog CTA) */}
            <div className="mt-1 flex flex-col gap-2">
              <a
                href={product.productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black transition-colors duration-150 hover:bg-zinc-200 active:scale-[0.99]"
              >
                <span>Ver en Catalogo</span>
                <ExternalLinkIcon />
              </a>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 py-2.5 text-xs font-bold text-white/70 transition-colors duration-150 hover:border-white/20 hover:text-white"
              >
                Volver al panel
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
