import type { ResolvedCommerce } from '../commerceResolver';
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
  VisualSearchResponse,
} from './types';
import {
  applyRerank,
  buildDetectedChips,
  createCircuitBreaker,
  createVisualRateLimiter,
  MAX_BODY_BYTES,
  MAX_RESULT_ITEMS,
  mergeCandidates,
  planQueries,
  prioritizeCandidatesForRerank,
  validateJpegBase64,
  type CircuitBreaker,
  type VisualRateLimiter,
} from './visualSearch';

export const TOTAL_BUDGET_MS = 13500;
export const STAGE1_TIMEOUT_MS = 5000;
export const ECOMETRI_QUERY_TIMEOUT_MS = 2500;
export const THUMBNAIL_TIMEOUT_MS = 2200;
export const STAGE2_TIMEOUT_MS = 5500;
export const MAX_RERANK_CANDIDATES = 12;
export const MAX_THUMBNAIL_BYTES = 200 * 1024;

export interface VisualSearchHandlerInput {
  contentLengthHeader?: string | null;
  rawBody: unknown;
  clientIp?: string;
  deviceId?: string | null;
}

export interface VisualSearchHandlerResult {
  status: number;
  body: VisualSearchResponse | { error: string; quota?: VisualSearchResponse['quota'] };
  headers?: Record<string, string>;
}

export interface VisualSearchHandlerDeps {
  resolveCommerceFn: (slugOrAlias: string) => Promise<ResolvedCommerce | null>;
  geminiClient: GeminiClient | null;
  fetchFn?: typeof fetch;
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

export function createVisualSearchHandler({
  resolveCommerceFn,
  geminiClient,
  fetchFn = fetch,
  rateLimiter = createVisualRateLimiter(),
  circuitBreaker = createCircuitBreaker(),
  nowFn = () => Date.now(),
  totalBudgetMs = TOTAL_BUDGET_MS,
}: VisualSearchHandlerDeps) {
  return async function executeVisualSearch(
    input: VisualSearchHandlerInput
  ): Promise<VisualSearchHandlerResult> {
    // 1. Fail-fast Content-Length check
    const declaredLen = Number(input.contentLengthHeader || '0');
    if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
      return {
        status: 413,
        body: { error: 'La solicitud supera el tamano maximo permitido.' },
      };
    }

    // 2. Validate body schema
    const body = input.rawBody;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { status: 400, body: { error: 'Cuerpo JSON invalido.' } };
    }
    const obj = body as Record<string, unknown>;
    const commerceId = typeof obj.commerceId === 'string' ? obj.commerceId.trim() : '';
    const mimeType = obj.mimeType;

    if (!commerceId || commerceId.length > 128) {
      return { status: 400, body: { error: 'Comercio invalido.' } };
    }
    if (mimeType !== 'image/jpeg') {
      return { status: 400, body: { error: 'Formato no soportado: usa image/jpeg.' } };
    }

    // 3. Validate base64, decoded size <= 350 KB, and JPEG magic bytes
    const imgCheck = validateJpegBase64(obj.imageBase64);
    if (!imgCheck.ok) {
      return {
        status: imgCheck.status || 400,
        body: { error: imgCheck.error || 'Imagen invalida.' },
      };
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
      return {
        status: 404,
        body: { error: 'Busqueda por foto no habilitada para este comercio.' },
      };
    }

    // 5. Circuit Breaker check FIRST (never burn device quota if Gemini is paused!)
    if (!geminiClient || circuitBreaker.isOpen()) {
      const retrySec = circuitBreaker.getRetryAfterSec();
      return {
        status: 503,
        body: {
          items: [],
          detected: { label: '', chips: [] },
          degraded: 'paused',
          error: 'Buscador por foto en pausa temporal por cuota de IA, usa la busqueda por texto.',
        },
        headers: retrySec > 0 ? { 'Retry-After': String(retrySec) } : undefined,
      };
    }

    // 6. Rate limit (per-device 10/5min + shared Wi-Fi ceiling 50/5min)
    const clientIp = input.clientIp || 'unknown';
    const limitCheck = rateLimiter.consume(clientIp, input.deviceId);
    const quota = {
      remaining: limitCheck.remaining,
      limit: limitCheck.limit,
      resetInSec: limitCheck.resetInSec,
      resetAt: limitCheck.resetAt,
    };

    if (!limitCheck.allowed) {
      const mins = Math.floor(limitCheck.retryAfterSec / 60);
      const secs = limitCheck.retryAfterSec % 60;
      const waitText = mins > 0 ? `${mins} min ${secs} s` : `${secs} s`;
      return {
        status: 429,
        body: {
          items: [],
          detected: { label: '', chips: [] },
          degraded: 'paused',
          quota,
          error:
            limitCheck.scope === 'device'
              ? `Limite de este dispositivo alcanzado (0 de ${limitCheck.limit}). Se restablece en ${waitText}.`
              : `Limite temporal de la red alcanzado. Se restablece en ${waitText}.`,
        },
        headers: {
          'Retry-After': String(limitCheck.retryAfterSec),
          'X-RateLimit-Limit': String(limitCheck.limit),
          'X-RateLimit-Remaining': '0',
        },
      };
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
        if (remaining < 500) break;

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
            rateLimiter.refund(clientIp, input.deviceId);
            circuitBreaker.trip();
            return {
              status: 503,
              body: {
                items: [],
                detected: { label: '', chips: [] },
                degraded: 'paused',
                error: 'Buscador por foto en pausa temporal por cuota de IA, usa la busqueda por texto.',
              },
              headers: { 'Retry-After': String(circuitBreaker.getRetryAfterSec()) },
            };
          }
          if (err instanceof GeminiInvalidOutputError && attempt === 0) {
            continue;
          }
          rateLimiter.refund(clientIp, input.deviceId);
          if (rootController.signal.aborted) {
            return {
              status: 504,
              body: { error: 'Tiempo de espera agotado al analizar la imagen.' },
              headers: { 'X-Visual-Reason': 'ROOT_TIMEOUT' },
            };
          }
          const safeReason =
            err instanceof Error && /^GEMINI_[A-Z0-9_.-]+$/i.test(err.message)
              ? err.message
              : err instanceof Error && err.name === 'AbortError'
                ? 'STAGE1_TIMEOUT'
                : 'STAGE1_UPSTREAM_ERROR';
          console.warn('[ecometri-visual] stage1_error', { reason: safeReason });
          return {
            status: 503,
            body: {
              items: [],
              detected: { label: '', chips: [] },
              degraded: 'paused',
              error: 'Buscador por foto no disponible temporalmente, usa la busqueda por texto.',
            },
            headers: { 'X-Visual-Reason': safeReason },
          };
        }
      }

      if (!analysis) {
        return {
          status: 503,
          body: {
            items: [],
            detected: { label: '', chips: [] },
            degraded: 'paused',
            error: 'No pudimos interpretar la imagen. Intenta con otra foto o busca por texto.',
          },
        };
      }

      const chips = buildDetectedChips(analysis);

      // Recursive Ecometri Search: run Round 1 + Round 2 (roots/stems) in parallel
      // so spelling mistakes or store typos (e.g. "Tensión metro") are always caught
      const round1Queries = planQueries(analysis, 1);
      const round2Queries = planQueries(analysis, 2);
      const allQueries = [...round1Queries, ...round2Queries].slice(0, 5);
      const queryResults = await runEcometriQueries(
        cfg,
        allQueries,
        rootController.signal,
        fetchFn
      );
      const candidates = mergeCandidates(queryResults);

      if (candidates.length === 0) {
        return {
          status: 200,
          body: {
            items: [],
            detected: { label: analysis.label, chips },
            degraded: 'none',
            quota,
          },
        };
      }

      // Stage 2: Mandatory Semantic + Visual Verification (runs for >= 1 candidates
      // so unrelated products like "Olla a presion" for a "Tensiometro" are strictly rejected)
      const remainingBeforeStage2 = totalBudgetMs - (nowFn() - startedAt);
      if (remainingBeforeStage2 < 1200 || rootController.signal.aborted) {
        return {
          status: 200,
          body: {
            items: candidates.slice(0, MAX_RESULT_ITEMS),
            detected: { label: analysis.label, chips },
            degraded: 'rerank_skipped',
            quota,
          },
        };
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

        const order = await geminiClient.rerank(
          imageBase64,
          enrichedCandidates,
          stage2Scoped.signal
        );

        if (order === null) {
          return {
            status: 200,
            body: {
              items: candidates.slice(0, MAX_RESULT_ITEMS),
              detected: { label: analysis.label, chips },
              degraded: 'rerank_skipped',
              quota,
            },
          };
        }

        return {
          status: 200,
          body: {
            items: applyRerank(candidates, order),
            detected: { label: analysis.label, chips },
            degraded: 'none',
            quota,
          },
        };
      } catch (err: unknown) {
        if (err instanceof GeminiQuotaError) {
          circuitBreaker.trip();
        }
        return {
          status: 200,
          body: {
            items: candidates.slice(0, MAX_RESULT_ITEMS),
            detected: { label: analysis.label, chips },
            degraded: 'rerank_skipped',
            quota,
          },
        };
      } finally {
        stage2Scoped.cleanup();
      }
    } finally {
      clearTimeout(rootTimer);
    }
  };
}
