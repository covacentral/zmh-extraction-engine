import type {
  EcometriClientConfig,
  EcometriConfig,
  EcometriSearchResponse,
  ProductDTO,
} from './types';

export const PAGE_SIZE = 5;
export const MAX_DESCRIPTION_LENGTH = 500;

const GENERIC_DESCRIPTION_PATTERNS: RegExp[] = [
  /^ver\s+detalles?\s+del\s+producto\b/i,
  /^sin\s+descripci[oó]n\.?$/i,
  /^no\s+disponible\.?$/i,
  /^n\/a\.?$/i,
  /^-+$/,
];

const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function formatCop(amount: number): string {
  if (!Number.isFinite(amount)) return '$ 0';
  return copFormatter.format(Math.round(amount));
}

export function toClientEcometriConfig(
  cfg?: EcometriConfig | null
): EcometriClientConfig | null {
  if (!cfg || cfg.enabled !== true) return null;
  return {
    enabled: true,
    cartEnabled: cfg.cartEnabled === true,
    advisorLines: Array.isArray(cfg.advisorLines) ? cfg.advisorLines : [],
  };
}

function stripHtmlAndNormalizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeDescription(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = stripHtmlAndNormalizeText(raw);
  if (!cleaned) return null;
  if (GENERIC_DESCRIPTION_PATTERNS.some((re) => re.test(cleaned))) {
    return null;
  }
  if (cleaned.length > MAX_DESCRIPTION_LENGTH) {
    return `${cleaned.slice(0, MAX_DESCRIPTION_LENGTH - 3).trimEnd()}...`;
  }
  return cleaned;
}

function resolveSafeImageUrl(raw: Record<string, unknown>, allowedHost: string): string | null {
  const host = (allowedHost || '').trim().toLowerCase();
  if (!host) return null;

  let candidate: string | null = null;
  if (typeof raw.picture_url === 'string' && raw.picture_url.trim()) {
    candidate = raw.picture_url.trim();
  } else if (typeof raw.imageUrl === 'string' && raw.imageUrl.trim()) {
    candidate = raw.imageUrl.trim();
  } else if (Array.isArray(raw.product_images) && raw.product_images.length > 0) {
    const first = raw.product_images[0] as Record<string, unknown> | null;
    if (first && typeof first.picture_url === 'string' && first.picture_url.trim()) {
      candidate = first.picture_url.trim();
    }
  }

  if (!candidate) return null;

  // Full URL: validate protocol and hostname strictly
  if (/^https?:\/\//i.test(candidate)) {
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== host) {
        return null;
      }
      return parsed.toString();
    } catch {
      return null;
    }
  }

  // Relative CloudFront filename (e.g. "63dcc1f1-ec9c-493f-9155-d4e8ea1896eb.jpg")
  const cleanFile = candidate.replace(/^\/+/, '');
  if (!cleanFile || cleanFile.includes('..') || /[\s<>"]/.test(cleanFile)) {
    return null;
  }
  return `https://${host}/fit-in/600x600/${encodeURI(cleanFile)}`;
}

function resolveProductUrl(raw: Record<string, unknown>, storeBaseUrl: string): string | null {
  const base = (storeBaseUrl || '').trim().replace(/\/+$/, '');
  if (!base || !/^https:\/\//i.test(base)) return null;

  const slugOrUrl =
    (typeof raw.url === 'string' && raw.url.trim()) ||
    (typeof raw.slug === 'string' && raw.slug.trim()) ||
    '';
  if (!slugOrUrl) return null;

  if (/^https:\/\//i.test(slugOrUrl)) {
    try {
      const target = new URL(slugOrUrl);
      const baseParsed = new URL(base);
      if (target.hostname.toLowerCase() !== baseParsed.hostname.toLowerCase()) {
        return null;
      }
      return target.toString();
    } catch {
      return null;
    }
  }

  const cleanSlug = slugOrUrl.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!cleanSlug || cleanSlug.includes('..')) return null;
  return `${base}/${encodeURI(cleanSlug)}/`;
}

function resolvePriceCop(raw: Record<string, unknown>): number | null {
  const rawPrice = raw.price;
  if (typeof rawPrice !== 'number' || !Number.isFinite(rawPrice) || rawPrice <= 0) {
    return null;
  }

  const rawDiscount = raw.discount_price;
  if (
    typeof rawDiscount === 'number' &&
    Number.isFinite(rawDiscount) &&
    rawDiscount > 0 &&
    rawDiscount < rawPrice
  ) {
    return Math.round(rawDiscount);
  }

  return Math.round(rawPrice);
}

function resolveInStock(raw: Record<string, unknown>): boolean {
  if (typeof raw.quantity_available === 'number' && Number.isFinite(raw.quantity_available)) {
    return raw.quantity_available > 0;
  }
  if (typeof raw.stock === 'number' && Number.isFinite(raw.stock)) {
    return raw.stock > 0;
  }
  if (typeof raw.inStock === 'boolean') {
    return raw.inStock;
  }
  if (typeof raw.in_stock === 'boolean') {
    return raw.in_stock;
  }
  return true;
}

const SAFE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function extractSafeSlug(raw: Record<string, unknown>): string | null {
  const candidate =
    (typeof raw.url === 'string' && raw.url.trim()) ||
    (typeof raw.slug === 'string' && raw.slug.trim()) ||
    '';
  if (!candidate) return null;

  let slugPart = candidate;
  if (/^https?:\/\//i.test(candidate)) {
    try {
      const segments = new URL(candidate).pathname.split('/').filter(Boolean);
      slugPart = segments[segments.length - 1] || '';
    } catch {
      return null;
    }
  }

  const normalized = slugPart.replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
  if (!normalized || normalized.length > 120 || !SAFE_SLUG_RE.test(normalized)) {
    return null;
  }
  return normalized;
}

export function normalizeEcometriProduct(
  raw: unknown,
  cfg: EcometriConfig
): ProductDTO | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  const id = typeof obj.id === 'string' ? obj.id.trim() : typeof obj.id === 'number' ? String(obj.id) : '';
  if (!id) return null;

  const titleRaw = typeof obj.name === 'string' ? obj.name : typeof obj.title === 'string' ? obj.title : '';
  const title = stripHtmlAndNormalizeText(titleRaw);
  if (!title) return null;

  const priceCop = resolvePriceCop(obj);
  if (priceCop === null) return null;

  const productUrl = resolveProductUrl(obj, cfg.storeBaseUrl);
  if (!productUrl) return null;

  const skuRaw = typeof obj.sku === 'string' ? obj.sku.trim() : typeof obj.sku === 'number' ? String(obj.sku) : '';
  const sku = skuRaw ? skuRaw : null;

  const slug = extractSafeSlug(obj);
  const imageUrl = resolveSafeImageUrl(obj, cfg.allowedImageHost);
  const inStock = resolveInStock(obj);
  const description = sanitizeDescription(obj.description);

  return {
    id,
    slug,
    title,
    sku,
    priceCop,
    inStock,
    imageUrl,
    description,
    productUrl,
  };
}

/**
 * Ordenamiento global determinista: inStock === true primero, preservando
 * el orden original de relevancia del upstream como desempate estable.
 * Luego pagina en bloques de pageSize (por defecto 5).
 */
export function sortAndPaginateProducts(
  items: ProductDTO[],
  page: number,
  pageSize: number = PAGE_SIZE
): EcometriSearchResponse {
  const indexed = items.map((item, index) => ({ item, index }));
  indexed.sort((a, b) => {
    if (a.item.inStock !== b.item.inStock) {
      return a.item.inStock ? -1 : 1;
    }
    return a.index - b.index;
  });

  const sorted = indexed.map((entry) => entry.item);
  const total = sorted.length;
  const start = (page - 1) * pageSize;
  const pageItems = sorted.slice(start, start + pageSize);
  const hasMore = start + pageItems.length < total;

  return {
    items: pageItems,
    total,
    page,
    hasMore,
  };
}
