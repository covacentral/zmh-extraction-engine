import type { ResolvedCommerce } from '../commerceResolver';
import {
  normalizeEcometriProduct,
  PAGE_SIZE,
  sortAndPaginateProducts,
} from './normalize';
import type { EcometriConfig, EcometriSearchResponse, ProductDTO } from './types';

export const UPSTREAM_WINDOW_LIMIT = 50;
export const UPSTREAM_TIMEOUT_MS = 4000;
export const MAX_TERM_LENGTH = 64;
export const MIN_TERM_LENGTH = 2;
export const MAX_PAGE = 50;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 45;
const ipHits = new Map<string, { count: number; resetAt: number }>();

export const CACHE_CONTROL_HEADER = 'public, s-maxage=60, stale-while-revalidate=300';

function checkRateLimit(ip: string, now: number = Date.now()): boolean {
  const entry = ipHits.get(ip);
  if (!entry || entry.resetAt <= now) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  entry.count += 1;
  return true;
}

function parsePageParam(rawPage: string | null): number | null {
  if (rawPage === null || rawPage === '') return 1;
  if (!/^\d+$/.test(rawPage)) return null;
  const parsed = Number.parseInt(rawPage, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PAGE) {
    return null;
  }
  return parsed;
}

export async function fetchUpstreamPage(
  cfg: EcometriConfig,
  term: string,
  signal: AbortSignal,
  fetchFn: typeof fetch = fetch
): Promise<unknown[]> {
  const url = `https://apiv2.ecometri.shop/api/v1/stores/${encodeURIComponent(
    cfg.storeId
  )}/products/public-search?term=${encodeURIComponent(
    term
  )}&limit=${UPSTREAM_WINDOW_LIMIT}&page=1`;

  const response = await fetchFn(url, {
    method: 'GET',
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`UPSTREAM_HTTP_${response.status}`);
  }

  const payload = await response.json();
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object' && Array.isArray((payload as any).products)) {
    return (payload as any).products;
  }
  if (payload && typeof payload === 'object' && Array.isArray((payload as any).items)) {
    return (payload as any).items;
  }
  throw new Error('UPSTREAM_INVALID_SHAPE');
}

export interface SearchRequestInput {
  commerce: string | null;
  term: string | null;
  page: string | null;
  clientIp?: string;
}

export interface SearchHandlerResult {
  status: number;
  body: EcometriSearchResponse | { error: string };
  headers?: Record<string, string>;
}

export interface EcometriHandlerDeps {
  resolveCommerceFn: (slugOrAlias: string) => Promise<ResolvedCommerce | null>;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  bypassRateLimit?: boolean;
}

export function createEcometriSearchHandler({
  resolveCommerceFn,
  fetchFn = fetch,
  timeoutMs = UPSTREAM_TIMEOUT_MS,
  bypassRateLimit = false,
}: EcometriHandlerDeps) {
  return async function executeSearch(input: SearchRequestInput): Promise<SearchHandlerResult> {
    if (!bypassRateLimit) {
      const ip = (input.clientIp || 'unknown').trim() || 'unknown';
      if (!checkRateLimit(ip)) {
        return {
          status: 429,
          body: { error: 'Demasiadas solicitudes. Intenta nuevamente en unos segundos.' },
        };
      }
    }

    const commerceParam = (input.commerce || '').trim();
    const termParam = (input.term || '').trim();
    const page = parsePageParam(input.page);

    if (!commerceParam || commerceParam.length > 128) {
      return { status: 400, body: { error: 'Parametro de comercio invalido.' } };
    }

    if (termParam.length < MIN_TERM_LENGTH || termParam.length > MAX_TERM_LENGTH) {
      return {
        status: 400,
        body: { error: 'El termino de busqueda debe tener entre 2 y 64 caracteres.' },
      };
    }

    if (page === null) {
      return {
        status: 400,
        body: { error: 'El parametro page debe ser un entero entre 1 y 50.' },
      };
    }

    const resolved = await resolveCommerceFn(commerceParam);
    const cfg = resolved?.data?.ecometri;

    if (
      !resolved ||
      !cfg ||
      cfg.enabled !== true ||
      typeof cfg.storeId !== 'string' ||
      !cfg.storeId.trim() ||
      typeof cfg.storeBaseUrl !== 'string' ||
      !cfg.storeBaseUrl.trim()
    ) {
      return {
        status: 404,
        body: { error: 'Integracion de catalogo no habilitada para este comercio.' },
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const rawItems = await fetchUpstreamPage(cfg, termParam, controller.signal, fetchFn);
      clearTimeout(timeoutId);

      const seenIds = new Set<string>();
      const normalized: ProductDTO[] = [];
      for (const rawItem of rawItems) {
        const dto = normalizeEcometriProduct(rawItem, cfg);
        if (dto && !seenIds.has(dto.id)) {
          seenIds.add(dto.id);
          normalized.push(dto);
        }
      }

      const result = sortAndPaginateProducts(normalized, page, PAGE_SIZE);
      return {
        status: 200,
        body: result,
        headers: {
          'Cache-Control': CACHE_CONTROL_HEADER,
        },
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const isAbort =
        (err instanceof Error && err.name === 'AbortError') || controller.signal.aborted;
      if (isAbort) {
        return {
          status: 504,
          body: { error: 'Tiempo de espera agotado al consultar el catalogo.' },
        };
      }
      return {
        status: 502,
        body: { error: 'Resultados en vivo no disponibles temporalmente.' },
      };
    }
  };
}
