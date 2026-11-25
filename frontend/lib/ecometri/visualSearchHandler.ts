import type { ResolvedCommerce } from '../commerceResolver';
import {
  createCatalogIndexStore,
  rankSimilar,
  type CatalogIndexStore,
} from './catalogIndex';
import {
  GeminiInvalidOutputError,
  GeminiQuotaError,
  type GeminiClient,
  type RerankCandidateImage,
} from './geminiClient';
import { normalizeEcometriProduct } from './normalize';
import { fetchUpstreamPage } from './searchHandler';
import type {
  EcometriConfig,
  ProductDTO,
  VisualAnalysis,
  VisualSearchQuota,
  VisualSearchResponse,
} from './types';
import {
  buildDetectedChips,
  createCircuitBreaker,
  createVisualRateLimiter,
  MAX_BODY_BYTES,
  MAX_RESULT_ITEMS,
  mergeCandidates,
  planQueries,
  prioritizeCandidatesForRerank,
  resolveFinalVisualItems,
  validateJpegBase64,
  type CircuitBreaker,
  type VisualRateLimiter,
} from './visualSearch';

// Strict 9.2s internal budget per binding ADR (safe inside serverless limits)
export const TOTAL_BUDGET_MS = 9200;
export const STAGE1_TIMEOUT_MS = 6800;
export const CATALOG_INDEX_TIMEOUT_MS = 2400;
export const ECOMETRI_QUERY_TIMEOUT_MS = 2200;
export const THUMBNAIL_TIMEOUT_MS = 1500;
export const STAGE2_TIMEOUT_MS = 3800;
export const MAX_RERANK_CANDIDATES = 10;
export const MAX_THUMBNAIL_BYTES = 200 * 1024;

export interface VisualSearchHandlerInput {
  contentLengthHeader?: string | null;
  rawBody: unknown;
  clientIp?: string;
  deviceId?: string | null;
}

export interface VisualSearchHandlerResult {
  status: number;
  body: VisualSearchResponse | { error: string; quota: VisualSearchQuota };
  headers?: Record<string, string>;
}

export interface VisualSearchHandlerDeps {
  resolveCommerceFn: (slugOrAlias: string) => Promise<ResolvedCommerce | null>;
  geminiClient: GeminiClient | null;
  fetchFn?: typeof fetch;
  catalogIndexStore?: CatalogIndexStore;
  rateLimiter?: VisualRateLimiter;
  circuitBreaker?: CircuitBreaker;
  nowFn?: () => number;
  totalBudgetMs?: number;
}

function createScopedSignal(parent: AbortSignal, timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  if (parent.aborted) {
    controller.abort();
  } else {
    parent.addEventListener('abort', onParentAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), Math.max(10, timeoutMs));
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      parent.removeEventListener('abort', onParentAbort);
    },
  };
}

function toSmallThumbnailUrl(imageUrl: string, allowedHost: string): string | null {
  try {
    const parsed = new URL(imageUrl);
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname.toLowerCase() !== allowedHost.trim().toLowerCase()
    ) {
      return null;
    }
    const shrunk = parsed.pathname.replace(/\/fit-in\/\d+x\d+\//, '/fit-in/160x160/');
    return `${parsed.origin}${shrunk}`;
  } catch {
    return null;
  }
}

async function fetchCandidateThumbnails(
  candidates: ProductDTO[],
  allowedHost: string,
  parentSignal: AbortSignal,
  fetchFn: typeof fetch
): Promise<RerankCandidateImage[]> {
  const top = candidates.slice(0, MAX_RERANK_CANDIDATES);
  const thumbScope = createScopedSignal(parentSignal, THUMBNAIL_TIMEOUT_MS);

  try {
    return await Promise.all(
      top.map(async (item): Promise<RerankCandidateImage> => {
        const base: RerankCandidateImage = { id: item.id, title: item.title };
        if (!item.imageUrl) return base;
        const url = toSmallThumbnailUrl(item.imageUrl, allowedHost);
        if (!url) return base;
        try {
          const resp = await fetchFn(url, {
            method: 'GET',
            signal: thumbScope.signal,
            redirect: 'error',
          });
          if (!resp.ok) return base;
          const cl = Number(resp.headers.get('content-length') || '0');
          if (Number.isFinite(cl) && cl > MAX_THUMBNAIL_BYTES) return base;

          const arrayBuf = await resp.arrayBuffer();
          if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > MAX_THUMBNAIL_BYTES) {
            return base;
          }
          const mimeType = (resp.headers.get('content-type') || 'image/jpeg')
            .split(';')[0]
            .trim();
          if (!mimeType.startsWith('image/')) return base;

          return {
            ...base,
            imageBase64: Buffer.from(arrayBuf).toString('base64'),
            mimeType,
          };
        } catch {
          return base;
        }
      })
    );
  } finally {
    thumbScope.cleanup();
  }
}

async function runEcometriQueries(
  cfg: EcometriConfig,
  queries: string[],
  parentSignal: AbortSignal,
  fetchFn: typeof fetch
): Promise<ProductDTO[][]> {
  return Promise.all(
    queries.map(async (q): Promise<ProductDTO[]> => {
      const scoped = createScopedSignal(parentSignal, ECOMETRI_QUERY_TIMEOUT_MS);
      try {
        const rawItems = await fetchUpstreamPage(cfg, q, scoped.signal, fetchFn);
        const normalized: ProductDTO[] = [];
        for (const raw of rawItems) {
          const dto = normalizeEcometriProduct(raw, cfg);
          if (dto) normalized.push(dto);
        }
        return normalized;
      } catch {
        return [];
      } finally {
        scoped.cleanup();
      }
    })
  );
}

function toQuotaDto(q: {
  remaining: number;
  limit: number;
  resetInSec: number;
  resetAt: number;
}): VisualSearchQuota {
  return {
    remaining: q.remaining,
    limit: q.limit,
    resetInSec: q.resetInSec,
    resetAt: q.resetAt,
  };
}

export function createVisualSearchHandler({
  resolveCommerceFn,
  geminiClient,
  fetchFn = fetch,
  catalogIndexStore,
  rateLimiter = createVisualRateLimiter(),
  circuitBreaker = createCircuitBreaker(),
  nowFn = () => Date.now(),
  totalBudgetMs = TOTAL_BUDGET_MS,
}: VisualSearchHandlerDeps) {
  const indexStore =
    catalogIndexStore ?? createCatalogIndexStore({ fetchFn, nowFn });

  return async function executeVisualSearch(
    input: VisualSearchHandlerInput
  ): Promise<VisualSearchHandlerResult> {
    const clientIp = input.clientIp || 'unknown';
    const deviceId = input.deviceId;

    // Mandatory centralized response builder so `quota` is NEVER omitted on 200/429/503/504
    const withQuota = (
      status: number,
      payload: Omit<VisualSearchResponse, 'quota'> | { error: string },
      quotaOverride?: VisualSearchQuota,
      headers?: Record<string, string>
    ): VisualSearchHandlerResult => {
      const resolvedQuota =
        quotaOverride ?? toQuotaDto(rateLimiter.peek(clientIp, deviceId));
      return {
        status,
        body: {
          ...payload,
          quota: resolvedQuota,
        } as VisualSearchResponse | { error: string; quota: VisualSearchQuota },
        headers: {
          'X-RateLimit-Limit': String(resolvedQuota.limit),
          'X-RateLimit-Remaining': String(resolvedQuota.remaining),
          ...(headers || {}),
        },
      };
    };

    // 1. Fail-fast Content-Length check
    const declaredLen = Number(input.contentLengthHeader || '0');
    if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
      return withQuota(413, {
        error: 'La solicitud supera el tamano maximo permitido.',
      });
    }

    // 2. Validate body schema
    const body = input.rawBody;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return withQuota(400, { error: 'Cuerpo JSON invalido.' });
    }
    const obj = body as Record<string, unknown>;
    const commerceId = typeof obj.commerceId === 'string' ? obj.commerceId.trim() : '';
    const mimeType = obj.mimeType;

    if (!commerceId || commerceId.length > 128) {
      return withQuota(400, { error: 'Comercio invalido.' });
    }
    if (mimeType !== 'image/jpeg') {
      return withQuota(400, { error: 'Formato no soportado: usa image/jpeg.' });
    }

    // 3. Validate base64, decoded size <= 350 KB, and JPEG magic bytes
    const imgCheck = validateJpegBase64(obj.imageBase64);
    if (!imgCheck.ok) {
      return withQuota(imgCheck.status || 400, {
        error: imgCheck.error || 'Imagen invalida.',
      });
    }
    const imageBase64 = (obj.imageBase64 as string).trim();

    // 4. Resolve commerce opt-in BEFORE touching Gemini or Ecometri
    const resolved = await resolveCommerceFn(commerceId);
    const cfg = resolved?.data?.ecometri;
    if (
      !resolved ||
      !cfg ||
      cfg.enabled !== true ||
      cfg.visualSearchEnabled !== true ||
      typeof cfg.storeId !== 'string' ||
      !cfg.storeId.trim() ||
      typeof cfg.storeBaseUrl !== 'string' ||
      !cfg.storeBaseUrl.trim()
    ) {
      return withQuota(404, {
        error: 'Busqueda por foto no habilitada para este comercio.',
      });
    }

    // 5. Circuit Breaker check FIRST (never burn device quota if Gemini is paused!)
    if (!geminiClient || circuitBreaker.isOpen()) {
      const retrySec = circuitBreaker.getRetryAfterSec();
      return withQuota(
        503,
        {
          items: [],
          detected: { label: '', chips: [] },
          degraded: 'paused',
          error:
            retrySec > 0
              ? `Buscador por foto en pausa breve (${retrySec} s) por alta demanda, usa la busqueda por texto o intenta enseguida.`
              : 'Buscador por foto en pausa temporal, usa la busqueda por texto.',
        },
        undefined,
        retrySec > 0 ? { 'Retry-After': String(retrySec) } : undefined
      );
    }

    // 6. Rate limit (per-device 10/5min + shared Wi-Fi ceiling 50/5min)
    const limitCheck = rateLimiter.consume(clientIp, deviceId);
    const consumedQuota = toQuotaDto(limitCheck);

    if (!limitCheck.allowed) {
      const mins = Math.floor(limitCheck.retryAfterSec / 60);
      const secs = limitCheck.retryAfterSec % 60;
      const waitText = mins > 0 ? `${mins} min ${secs} s` : `${secs} s`;
      return withQuota(
        429,
        {
          items: [],
          detected: { label: '', chips: [] },
          degraded: 'paused',
          error:
            limitCheck.scope === 'device'
              ? `Limite de este dispositivo alcanzado (0 de ${limitCheck.limit}). Se restablece en ${waitText}.`
              : `Limite temporal de la red alcanzado. Se restablece en ${waitText}.`,
        },
        consumedQuota,
        { 'Retry-After': String(limitCheck.retryAfterSec) }
      );
    }

    const startedAt = nowFn();
    const rootController = new AbortController();
    const rootTimer = setTimeout(() => rootController.abort(), totalBudgetMs);

    try {
      // Stage 1: Gemini Visual Analysis (with 1 retry on malformed JSON if budget permits)
      let analysis: VisualAnalysis | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const elapsed = nowFn() - startedAt;
        const remaining = totalBudgetMs - elapsed;
        if (attempt > 0 && remaining < 500) break;
        if (remaining <= 0 || rootController.signal.aborted) break;

        const scoped = createScopedSignal(
          rootController.signal,
          Math.min(STAGE1_TIMEOUT_MS, remaining)
        );
        try {
          analysis = await geminiClient.analyze(imageBase64, scoped.signal);
          circuitBreaker.recordSuccess();
          scoped.cleanup();
          break;
        } catch (err: unknown) {
          scoped.cleanup();
          if (err instanceof GeminiQuotaError) {
            rateLimiter.refund(clientIp, deviceId);
            circuitBreaker.trip(err.retryAfterSec);
            const retrySec = circuitBreaker.getRetryAfterSec();
            return withQuota(
              503,
              {
                items: [],
                detected: { label: '', chips: [] },
                degraded: 'paused',
                error: `Buscador por foto en pausa breve (${retrySec} s) por alta demanda, intenta de nuevo enseguida.`,
              },
              undefined,
              { 'Retry-After': String(retrySec) }
            );
          }
          if (err instanceof GeminiInvalidOutputError && attempt === 0) {
            continue;
          }
          rateLimiter.refund(clientIp, deviceId);
          if (rootController.signal.aborted) {
            return withQuota(
              504,
              { error: 'Tiempo de espera agotado al analizar la imagen.' },
              undefined,
              { 'X-Visual-Reason': 'ROOT_TIMEOUT' }
            );
          }
          const safeReason =
            err instanceof Error && /^GEMINI_[A-Z0-9_.-]+$/i.test(err.message)
              ? err.message
              : err instanceof Error && err.name === 'AbortError'
                ? 'STAGE1_TIMEOUT'
                : 'STAGE1_UPSTREAM_ERROR';
          console.warn('[ecometri-visual] stage1_error', { reason: safeReason });
          return withQuota(
            503,
            {
              items: [],
              detected: { label: '', chips: [] },
              degraded: 'paused',
              error: 'Buscador por foto no disponible temporalmente, usa la busqueda por texto.',
            },
            undefined,
            { 'X-Visual-Reason': safeReason }
          );
        }
      }

      if (!analysis) {
        rateLimiter.refund(clientIp, deviceId);
        if (rootController.signal.aborted) {
          return withQuota(
            504,
            { error: 'Tiempo de espera agotado al analizar la imagen.' },
            undefined,
            { 'X-Visual-Reason': 'ROOT_TIMEOUT' }
          );
        }
        return withQuota(503, {
          items: [],
          detected: { label: '', chips: [] },
          degraded: 'paused',
          error: 'No pudimos interpretar la imagen. Intenta con otra foto o busca por texto.',
        });
      }

      const chips = buildDetectedChips(analysis);

      // Retrieve candidates via cached in-memory Catalog Index (5-min TTL, max 1500 items)
      // with automatic fallback to public-search if store index is unavailable.
      const indexScope = createScopedSignal(rootController.signal, CATALOG_INDEX_TIMEOUT_MS);
      let catalogItems: ProductDTO[] | null = null;
      try {
        catalogItems = await indexStore.getOrFetch(
          resolved.commerceId,
          cfg,
          indexScope.signal
        );
      } finally {
        indexScope.cleanup();
      }

      let candidates: ProductDTO[] = [];
      let fallbackRanked: ProductDTO[] = [];

      if (catalogItems && catalogItems.length > 0) {
        const ranked = rankSimilar(analysis, catalogItems, 24);
        const positiveMatches = ranked.filter((r) => r.score > 0).map((r) => r.item);
        fallbackRanked = ranked.map((r) => r.item);
        candidates = positiveMatches.length > 0 ? positiveMatches : fallbackRanked.slice(0, MAX_RERANK_CANDIDATES);
      } else {
        const round1Queries = planQueries(analysis, 1);
        const round2Queries = planQueries(analysis, 2);
        const allQueries = [...round1Queries, ...round2Queries].slice(0, 5);
        const queryResults = await runEcometriQueries(
          cfg,
          allQueries,
          rootController.signal,
          fetchFn
        );
        const merged = mergeCandidates(queryResults);
        fallbackRanked = rankSimilar(analysis, merged, MAX_RERANK_CANDIDATES).map((r) => r.item);
        candidates = fallbackRanked.length > 0 ? fallbackRanked : merged;
      }

      if (candidates.length === 0 && fallbackRanked.length === 0) {
        return withQuota(
          200,
          {
            items: [],
            hasExactMatch: false,
            detected: { label: analysis.label, chips },
            degraded: 'none',
          },
          consumedQuota
        );
      }

      // Stage 2: Visual + Semantic Classification ({ exactIds, similarIds })
      // If budget is tight (< 1400ms), degrade directly to deterministic lexical fallback
      const remainingBeforeStage2 = totalBudgetMs - (nowFn() - startedAt);
      if (remainingBeforeStage2 < 1400 || rootController.signal.aborted) {
        const resolvedFallback = resolveFinalVisualItems(
          candidates,
          null,
          fallbackRanked,
          MAX_RESULT_ITEMS
        );
        return withQuota(
          200,
          {
            items: resolvedFallback.items,
            hasExactMatch: false,
            detected: { label: analysis.label, chips },
            degraded: 'rerank_skipped',
          },
          consumedQuota
        );
      }

      const stage2Scoped = createScopedSignal(
        rootController.signal,
        Math.min(STAGE2_TIMEOUT_MS, remainingBeforeStage2)
      );
      try {
        const rerankWindow = prioritizeCandidatesForRerank(
          candidates,
          analysis.label,
          MAX_RERANK_CANDIDATES
        );
        const enrichedCandidates = await fetchCandidateThumbnails(
          rerankWindow,
          cfg.allowedImageHost,
          stage2Scoped.signal,
          fetchFn
        );

        const stage2Out = await geminiClient.rerank(
          imageBase64,
          enrichedCandidates,
          stage2Scoped.signal
        );

        if (stage2Out === null) {
          const resolvedFallback = resolveFinalVisualItems(
            rerankWindow,
            null,
            fallbackRanked,
            MAX_RESULT_ITEMS
          );
          return withQuota(
            200,
            {
              items: resolvedFallback.items,
              hasExactMatch: false,
              detected: { label: analysis.label, chips },
              degraded: 'rerank_skipped',
            },
            consumedQuota
          );
        }

        const finalSelection = resolveFinalVisualItems(
          rerankWindow,
          stage2Out,
          fallbackRanked,
          MAX_RESULT_ITEMS
        );

        return withQuota(
          200,
          {
            items: finalSelection.items,
            hasExactMatch: finalSelection.hasExactMatch,
            detected: { label: analysis.label, chips },
            degraded: 'none',
          },
          consumedQuota
        );
      } catch (err: unknown) {
        if (err instanceof GeminiQuotaError) {
          circuitBreaker.trip(err.retryAfterSec);
        }
        const resolvedFallback = resolveFinalVisualItems(
          candidates,
          null,
          fallbackRanked,
          MAX_RESULT_ITEMS
        );
        return withQuota(
          200,
          {
            items: resolvedFallback.items,
            hasExactMatch: false,
            detected: { label: analysis.label, chips },
            degraded: 'rerank_skipped',
          },
          consumedQuota
        );
      } finally {
        stage2Scoped.cleanup();
      }
    } finally {
      clearTimeout(rootTimer);
    }
  };
}
