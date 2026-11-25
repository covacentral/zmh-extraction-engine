import type { ResolvedCommerce } from '../commerceResolver';
import { sanitizeDescription } from './normalize';
import type { ProductDetailDTO } from './types';

export const PRODUCT_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SLUG_LENGTH = 120;
export const SKU_RE = /^\d{3,10}$/;
export const PRODUCT_TIMEOUT_MS = 3500;
export const MAX_HTML_BYTES = 1_500_000;
export const PRODUCT_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=600';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 45;
const productIpHits = new Map<string, { count: number; resetAt: number }>();

function checkProductRateLimit(ip: string, now: number = Date.now()): boolean {
  const entry = productIpHits.get(ip);
  if (!entry || entry.resetAt <= now) {
    productIpHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  entry.count += 1;
  return true;
}

function parseAvailability(raw: unknown): boolean | null {
  if (typeof raw !== 'string') return null;
  if (/InStock$/i.test(raw)) return true;
  if (/OutOfStock$/i.test(raw)) return false;
  return null;
}

function extractFromJsonLdNode(node: unknown): ProductDetailDTO | null {
  if (!node || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;

  if (Array.isArray(obj['@graph'])) {
    for (const child of obj['@graph']) {
      const found = extractFromJsonLdNode(child);
      if (found) return found;
    }
  }

  const nodeType = obj['@type'];
  const isProduct =
    nodeType === 'Product' ||
    (Array.isArray(nodeType) && nodeType.includes('Product'));

  if (!isProduct) return null;

  const rawSku =
    typeof obj.sku === 'string'
      ? obj.sku.trim()
      : typeof obj.sku === 'number'
        ? String(obj.sku)
        : '';
  const sku = SKU_RE.test(rawSku) ? rawSku : null;

  let inStock: boolean | null = null;
  const offers = obj.offers;
  if (offers && typeof offers === 'object' && !Array.isArray(offers)) {
    inStock = parseAvailability((offers as Record<string, unknown>).availability);
  } else if (Array.isArray(offers) && offers.length > 0) {
    const first = offers[0] as Record<string, unknown> | null;
    if (first && typeof first === 'object') {
      inStock = parseAvailability(first.availability);
    }
  }

  const description = sanitizeDescription(obj.description);

  return { sku, inStock, description };
}

/**
 * Pure parser for Ecometri SSR product HTML.
 * Prioritizes <script type="application/ld+json"> Product blocks via JSON.parse;
 * falls back to anchored RSC escaped JSON tokens only if sku/inStock is missing.
 */
export function normalizeProductDetail(html: string): ProductDetailDTO {
  const empty: ProductDetailDTO = { sku: null, inStock: null, description: null };
  if (typeof html !== 'string' || !html) return empty;

  let sku: string | null = null;
  let inStock: boolean | null = null;
  let description: string | null = null;

  // 1. Primary: JSON-LD script blocks
  const jsonLdScriptRe =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = jsonLdScriptRe.exec(html)) !== null) {
    const rawJson = match[1]?.trim();
    if (!rawJson) continue;
    try {
      const parsed = JSON.parse(rawJson);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const candidate of candidates) {
        const extracted = extractFromJsonLdNode(candidate);
        if (extracted) {
          if (sku === null && extracted.sku !== null) sku = extracted.sku;
          if (inStock === null && extracted.inStock !== null) inStock = extracted.inStock;
          if (description === null && extracted.description !== null) {
            description = extracted.description;
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  }

  // 2. Fallback: anchored RSC serialized JSON tokens
  if (sku === null) {
    const rscSkuMatch = html.match(/\\"sku\\":\\"(\d{3,10})\\"/i);
    if (rscSkuMatch && SKU_RE.test(rscSkuMatch[1])) {
      sku = rscSkuMatch[1];
    }
  }

  if (inStock === null) {
    const rscAvailMatch = html.match(
      /\\"availability\\":\\"https?:\/\/schema\.org\/(InStock|OutOfStock)\\"/i
    );
    if (rscAvailMatch) {
      inStock = rscAvailMatch[1].toLowerCase() === 'instock';
    }
  }

  return { sku, inStock, description };
}

export interface ProductDetailRequestInput {
  commerce: string | null;
  slug: string | null;
  clientIp?: string;
}

export interface ProductDetailHandlerResult {
  status: number;
  body: ProductDetailDTO | { error: string };
  headers?: Record<string, string>;
}

export interface EcometriProductHandlerDeps {
  resolveCommerceFn: (slugOrAlias: string) => Promise<ResolvedCommerce | null>;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  bypassRateLimit?: boolean;
  logger?: { warn: (msg: string, meta?: Record<string, unknown>) => void };
}

export function createEcometriProductHandler({
  resolveCommerceFn,
  fetchFn = fetch,
  timeoutMs = PRODUCT_TIMEOUT_MS,
  bypassRateLimit = false,
  logger = console,
}: EcometriProductHandlerDeps) {
  return async function executeProductDetail(
    input: ProductDetailRequestInput
  ): Promise<ProductDetailHandlerResult> {
    if (!bypassRateLimit) {
      const ip = (input.clientIp || 'unknown').trim() || 'unknown';
      if (!checkProductRateLimit(ip)) {
        return {
          status: 429,
          body: { error: 'Demasiadas solicitudes.' },
        };
      }
    }

    const commerceParam = (input.commerce || '').trim();
    const rawSlug = input.slug ?? '';

    if (!commerceParam || commerceParam.length > 128) {
      return { status: 400, body: { error: 'Parametro de comercio invalido.' } };
    }

    if (
      !rawSlug ||
      rawSlug.length > MAX_SLUG_LENGTH ||
      !PRODUCT_SLUG_RE.test(rawSlug)
    ) {
      return { status: 400, body: { error: 'Slug de producto invalido.' } };
    }

    const resolved = await resolveCommerceFn(commerceParam);
    const cfg = resolved?.data?.ecometri;

    if (
      !resolved ||
      !cfg ||
      cfg.enabled !== true ||
      typeof cfg.storeBaseUrl !== 'string' ||
      !/^https:\/\//i.test(cfg.storeBaseUrl.trim())
    ) {
      return {
        status: 404,
        body: { error: 'Integracion de catalogo no habilitada para este comercio.' },
      };
    }

    const baseUrl = cfg.storeBaseUrl.trim().replace(/\/+$/, '');
    const upstreamUrl = `${baseUrl}/${rawSlug}/`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetchFn(upstreamUrl, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'error',
        headers: { Accept: 'text/html' },
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        return {
          status: 502,
          body: { sku: null, inStock: null, description: null },
        };
      }

      const contentLength = Number(resp.headers.get('content-length') || '0');
      if (Number.isFinite(contentLength) && contentLength > MAX_HTML_BYTES) {
        return {
          status: 200,
          body: { sku: null, inStock: null, description: null },
          headers: { 'Cache-Control': PRODUCT_CACHE_CONTROL },
        };
      }

      const html = await resp.text();
      if (html.length > MAX_HTML_BYTES) {
        return {
          status: 200,
          body: { sku: null, inStock: null, description: null },
          headers: { 'Cache-Control': PRODUCT_CACHE_CONTROL },
        };
      }

      const detail = normalizeProductDetail(html);
      if (detail.sku === null) {
        logger.warn('[ecometri-product] parse_miss', {
          commerceId: resolved.commerceId,
          slug: rawSlug,
        });
      }

      return {
        status: 200,
        body: detail,
        headers: { 'Cache-Control': PRODUCT_CACHE_CONTROL },
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const isAbort =
        (err instanceof Error && err.name === 'AbortError') || controller.signal.aborted;
      if (isAbort) {
        return {
          status: 504,
          body: { sku: null, inStock: null, description: null },
        };
      }
      return {
        status: 502,
        body: { sku: null, inStock: null, description: null },
      };
    }
  };
}
