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
  validateJpegBase64,
  type CircuitBreaker,
  type VisualRateLimiter,
} from './visualSearch';

export const TOTAL_BUDGET_MS = 9000;
export const STAGE1_TIMEOUT_MS = 4000;
export const ECOMETRI_QUERY_TIMEOUT_MS = 3000;
export const STAGE2_TIMEOUT_MS = 3500;
export const MAX_RERANK_CANDIDATES = 6;
export const MAX_THUMBNAIL_BYTES = 200 * 1024;

export interface VisualSearchHandlerInput {
  contentLengthHeader?: string | null;
  rawBody: unknown;
  clientIp?: string;
}

export interface VisualSearchHandlerResult {
  status: number;
  body: VisualSearchResponse | { error: string };
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
    const shrunk = parsed.pathname.replace(/\/fit-in\/\d+x\d+\//, '/fit-in/256x256/');
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
  const top = candidates
    .filter((c) => Boolean(c.imageUrl))
    .slice(0, MAX_RERANK_CANDIDATES);

  const settled = await Promise.all(
    top.map(async (item): Promise<RerankCandidateImage | null> => {
      const url = toSmallThumbnailUrl(item.imageUrl as string, allowedHost);
      if (!url) return null;
      try {
        const resp = await fetchFn(url, {
          method: 'GET',
          signal: parentSignal,
          redirect: 'error',
        });
        if (!resp.ok) return null;
        const cl = Number(resp.headers.get('content-length') || '0');
        if (Number.isFinite(cl) && cl > MAX_THUMBNAIL_BYTES) return null;

        const arrayBuf = await resp.arrayBuffer();
        if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > MAX_THUMBNAIL_BYTES) {
          return null;
        }
        const mimeType = (resp.headers.get('content-type') || 'image/jpeg')
          .split(';')[0]
          .trim();
        if (!mimeType.startsWith('image/')) return null;

        return {
          id: item.id,
          title: item.title,
          imageBase64: Buffer.from(arrayBuf).toString('base64'),
          mimeType,
        };
      } catch {
        return null;
      }
    })
  );

  return settled.filter((x): x is RerankCandidateImage => x !== null);
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

    // 5. Rate limit + Circuit Breaker
    const limitCheck = rateLimiter.consume(input.clientIp || 'unknown');
    if (!limitCheck.allowed) {
      return {
        status: 429,
        body: {
          error: 'Has alcanzado el limite temporal de busquedas por foto. Intenta en unos minutos o busca por texto.',
        },
        headers: { 'Retry-After': String(limitCheck.retryAfterSec) },
      };
    }

    if (!geminiClient || circuitBreaker.isOpen()) {
      const retrySec = circuitBreaker.getRetryAfterSec();
      return {
        status: 503,
        body: {
          items: [],
          detected: { label: '', chips: [] },
          degraded: 'paused',
          error: 'Buscador por foto en pausa temporal, usa la busqueda por texto.',
        },
        headers: retrySec > 0 ? { 'Retry-After': String(retrySec) } : undefined,
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
            circuitBreaker.trip();
            return {
              status: 503,
              body: {
                items: [],
                detected: { label: '', chips: [] },
                degraded: 'paused',
                error: 'Buscador por foto en pausa temporal, usa la busqueda por texto.',
              },
              headers: { 'Retry-After': String(circuitBreaker.getRetryAfterSec()) },
            };
          }
          if (err instanceof GeminiInvalidOutputError && attempt === 0) {
            continue;
          }
          if (rootController.signal.aborted) {
            return {
              status: 504,
              body: { error: 'Tiempo de espera agotado al analizar la imagen.' },
            };
          }
          return {
            status: 503,
            body: {
              items: [],
              detected: { label: '', chips: [] },
              degraded: 'paused',
              error: 'Buscador por foto no disponible temporalmente, usa la busqueda por texto.',
            },
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

      // Recursive Ecometri Search (Round 1 -> optional Round 2 if < 4 candidates)
      const round1Queries = planQueries(analysis, 1);
      const round1Results = await runEcometriQueries(
        cfg,
        round1Queries,
        rootController.signal,
        fetchFn
      );
      let candidates = mergeCandidates(round1Results);

      if (candidates.length < 4 && !rootController.signal.aborted) {
        const round2Queries = planQueries(analysis, 2);
        if (round2Queries.length > 0) {
          const round2Results = await runEcometriQueries(
            cfg,
            round2Queries,
            rootController.signal,
            fetchFn
          );
          candidates = mergeCandidates([candidates, ...round2Results]);
        }
      }

      if (candidates.length === 0) {
        return {
          status: 200,
          body: {
            items: [],
            detected: { label: analysis.label, chips },
            degraded: 'none',
          },
        };
      }

      // Skip Stage 2 if <= 2 candidates (faster & saves 50% Gemini quota)
      if (candidates.length <= 2) {
        return {
          status: 200,
          body: {
            items: candidates.slice(0, MAX_RESULT_ITEMS),
            detected: { label: analysis.label, chips },
            degraded: 'none',
          },
        };
      }

      // Stage 2: Optional Multimodal Visual Reranking
      const remainingBeforeStage2 = totalBudgetMs - (nowFn() - startedAt);
      if (remainingBeforeStage2 < 1200 || rootController.signal.aborted) {
        return {
          status: 200,
          body: {
            items: candidates.slice(0, MAX_RESULT_ITEMS),
            detected: { label: analysis.label, chips },
            degraded: 'rerank_skipped',
          },
        };
      }

      const stage2Scoped = createScopedSignal(
        rootController.signal,
        Math.min(STAGE2_TIMEOUT_MS, remainingBeforeStage2)
      );
      try {
        const thumbs = await fetchCandidateThumbnails(
          candidates,
          cfg.allowedImageHost,
          stage2Scoped.signal,
          fetchFn
        );

        if (thumbs.length < 2) {
          return {
            status: 200,
            body: {
              items: candidates.slice(0, MAX_RESULT_ITEMS),
              detected: { label: analysis.label, chips },
              degraded: 'rerank_skipped',
            },
          };
        }

        const order = await geminiClient.rerank(
          imageBase64,
          thumbs,
          stage2Scoped.signal
        );

        if (!order) {
          return {
            status: 200,
            body: {
              items: candidates.slice(0, MAX_RESULT_ITEMS),
              detected: { label: analysis.label, chips },
              degraded: 'rerank_skipped',
            },
          };
        }

        return {
          status: 200,
          body: {
            items: applyRerank(candidates, order),
            detected: { label: analysis.label, chips },
            degraded: 'none',
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
