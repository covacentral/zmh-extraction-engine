import {
  GeminiQuotaError,
  type EnrichPromptCandidate,
  type GeminiClient,
} from '../geminiClient';
import {
  buildTextOnlySemanticItem,
  parseEnrichment,
} from './parseEnrichment';
import {
  CURRENT_PROMPT_VERSION,
  MAX_DISPLAY_TITLE_LEN,
  type SemanticItem,
} from './types';

export const DEFAULT_ENRICH_RPM = 12;
export const MAX_ENRICH_BATCH_SIZE = 6;
export const DEFAULT_CALL_TIMEOUT_MS = 20_000;
export const DEFAULT_THUMBNAIL_TIMEOUT_MS = 5_000;

export interface ImageInput {
  ecometriId: string;
  sku: string;
  rawTitle: string;
  imageKey: string | null;
  imageBase64?: string | null;
  mimeType?: string | null;
}

export interface EnrichResult {
  item: SemanticItem;
  retriedSingle: boolean;
  quotaRetries: number;
  errorReason?: 'quota' | 'timeout' | 'invalid_output' | 'http_error';
}

export interface RateLimiter {
  acquire(signal?: AbortSignal): Promise<void>;
}

export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('ABORTED'));
      return;
    }
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('ABORTED'));
    };
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/**
 * Deterministic token-spacing rate limiter (12 RPM -> 5000ms minimum spacing).
 */
export function createRateLimiter(
  rpm: number = DEFAULT_ENRICH_RPM,
  deps?: {
    now?: () => number;
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  }
): RateLimiter {
  const minIntervalMs = Math.ceil(60_000 / Math.max(1, rpm));
  const now = deps?.now ?? (() => Date.now());
  const sleep = deps?.sleep ?? defaultSleep;
  let nextAvailableAt = 0;

  return {
    async acquire(signal?: AbortSignal): Promise<void> {
      const current = now();
      const waitMs = Math.max(0, nextAvailableAt - current);
      nextAvailableAt = Math.max(current, nextAvailableAt) + minIntervalMs;
      if (waitMs > 0) {
        await sleep(waitMs, signal);
      }
    },
  };
}

export function buildFailedSemanticItem(
  input: ImageInput,
  promptVersion: string,
  nowIso: string
): SemanticItem {
  const cleanTitle =
    input.rawTitle
      .replace(/<[^>]*>/g, ' ')
      .replace(new RegExp('\\p{Extended_Pictographic}', 'gu'), '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_DISPLAY_TITLE_LEN) || 'Producto';

  return {
    ecometriId: input.ecometriId,
    sku: input.sku,
    imageKey: input.imageKey,
    displayTitle: cleanTitle,
    article: cleanTitle.toLowerCase().slice(0, 40) || 'producto',
    brand: null,
    modelRef: null,
    colors: [],
    keywords: [],
    visualSummary: '',
    source: input.imageKey ? 'vision' : 'text-only',
    status: 'failed',
    enrichedAt: nowIso,
    promptVersion,
  };
}

function extractRawItemsMap(payload: unknown): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  if (!payload || typeof payload !== 'object') return map;

  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as Record<string, unknown>).items)
      ? ((payload as Record<string, unknown>).items as unknown[])
      : [];

  for (const entry of list) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const obj = entry as Record<string, unknown>;
    const id =
      typeof obj.ecometriId === 'string'
        ? obj.ecometriId.trim()
        : typeof obj.id === 'string'
          ? obj.id.trim()
          : '';
    if (id && !map.has(id)) {
      map.set(id, obj);
    }
  }
  return map;
}

function isAbortOrTimeout(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; message?: string };
  return (
    e.name === 'AbortError' ||
    e.name === 'TimeoutError' ||
    /abort|timeout/i.test(e.message || '')
  );
}

export interface EnrichBatchOptions {
  promptVersion?: string;
  nowIso?: string;
  batchSize?: number;
  callTimeoutMs?: number;
  maxQuotaRetries?: number;
  baseBackoffMs?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
}

/**
 * Enriches a list of `ImageInput` items in batches of up to 8 `160x160` thumbnails.
 * - Never sends SKU to Gemini; SKU is anchored strictly from `ImageInput.sku`.
 * - Imageless items (`!imageKey` or `!imageBase64`) use `buildTextOnlySemanticItem` (0 AI calls).
 * - Invalid/missing items in a batch response are retried ONCE individually (`batch of 1`),
 *   then recorded as `status: 'failed'` with `imageKey` without blocking the rest of the batch.
 */
export async function enrichBatch(
  client: GeminiClient,
  batch: ImageInput[],
  limiter: RateLimiter,
  options?: EnrichBatchOptions
): Promise<EnrichResult[]> {
  if (batch.length === 0) return [];

  const promptVersion = options?.promptVersion ?? CURRENT_PROMPT_VERSION;
  const nowIso = options?.nowIso ?? new Date().toISOString();
  const batchSize = Math.min(
    MAX_ENRICH_BATCH_SIZE,
    Math.max(1, options?.batchSize ?? MAX_ENRICH_BATCH_SIZE)
  );
  const callTimeoutMs = options?.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
  const maxQuotaRetries = options?.maxQuotaRetries ?? 2;
  const baseBackoffMs = options?.baseBackoffMs ?? 2_000;
  const sleep = options?.sleep ?? defaultSleep;

  const resultsById = new Map<string, EnrichResult>();
  const visionQueue: ImageInput[] = [];

  for (const input of batch) {
    if (!input.imageKey || !input.imageBase64) {
      resultsById.set(input.ecometriId, {
        item: buildTextOnlySemanticItem(
          {
            ecometriId: input.ecometriId,
            sku: input.sku,
            title: input.rawTitle,
            imageKey: input.imageKey,
          },
          promptVersion,
          nowIso
        ),
        retriedSingle: false,
        quotaRetries: 0,
      });
    } else {
      visionQueue.push(input);
    }
  }

  const callWithRetry = async (
    candidates: EnrichPromptCandidate[]
  ): Promise<{
    rawMap: Map<string, Record<string, unknown>> | null;
    quotaRetries: number;
    errorReason?: 'quota' | 'timeout' | 'http_error';
  }> => {
    if (!client.enrichCatalogBatch) {
      return { rawMap: null, quotaRetries: 0, errorReason: 'http_error' };
    }

    let quotaRetries = 0;
    for (let attempt = 0; attempt <= maxQuotaRetries; attempt++) {
      if (options?.signal?.aborted) {
        return { rawMap: null, quotaRetries, errorReason: 'timeout' };
      }

      await limiter.acquire(options?.signal);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), callTimeoutMs);
      const onParentAbort = () => controller.abort();
      if (options?.signal) {
        options.signal.addEventListener('abort', onParentAbort, { once: true });
      }

      try {
        const rawPayload = await client.enrichCatalogBatch(
          candidates,
          controller.signal
        );
        return {
          rawMap: extractRawItemsMap(rawPayload),
          quotaRetries,
        };
      } catch (err) {
        if (err instanceof GeminiQuotaError) {
          if (attempt < maxQuotaRetries) {
            quotaRetries += 1;
            const retrySec = err.retryAfterSec;
            const delayMs =
              retrySec && retrySec > 0
                ? retrySec * 1000
                : baseBackoffMs * Math.pow(2, attempt);
            await sleep(delayMs, options?.signal);
            continue;
          }
          return { rawMap: null, quotaRetries, errorReason: 'quota' };
        }

        if (isAbortOrTimeout(err) || controller.signal.aborted) {
          return { rawMap: null, quotaRetries, errorReason: 'timeout' };
        }

        return { rawMap: null, quotaRetries, errorReason: 'http_error' };
      } finally {
        clearTimeout(timer);
        if (options?.signal) {
          options.signal.removeEventListener('abort', onParentAbort);
        }
      }
    }

    return { rawMap: null, quotaRetries, errorReason: 'quota' };
  };

  const processChunk = async (
    chunk: ImageInput[],
    allowBisect: boolean,
    isBisectedSingle: boolean = false
  ): Promise<void> => {
    const promptCandidates: EnrichPromptCandidate[] = chunk.map((c) => ({
      id: c.ecometriId,
      rawTitle: c.rawTitle,
      imageBase64: c.imageBase64 as string,
      mimeType: c.mimeType || 'image/jpeg',
    }));

    const batchOutcome = await callWithRetry(promptCandidates);

    if (!batchOutcome.rawMap) {
      if (
        allowBisect &&
        chunk.length > 1 &&
        batchOutcome.errorReason !== 'quota' &&
        !options?.signal?.aborted
      ) {
        const mid = Math.ceil(chunk.length / 2);
        const left = chunk.slice(0, mid);
        const right = chunk.slice(mid);
        const keepBisecting = batchOutcome.errorReason === 'http_error';
        await processChunk(
          left,
          keepBisecting,
          keepBisecting && left.length === 1
        );
        await processChunk(
          right,
          keepBisecting,
          keepBisecting && right.length === 1
        );
        return;
      }

      // Entire chunk failed due to quota exhaustion, timeout, or isolated bad image
      for (const item of chunk) {
        resultsById.set(item.ecometriId, {
          item: buildFailedSemanticItem(item, promptVersion, nowIso),
          retriedSingle: isBisectedSingle && chunk.length === 1,
          quotaRetries: batchOutcome.quotaRetries,
          errorReason: batchOutcome.errorReason || 'http_error',
        });
      }
      return;
    }

    for (const item of chunk) {
      const rawCandidate = batchOutcome.rawMap.get(item.ecometriId);
      const parsed = rawCandidate
        ? parseEnrichment(rawCandidate, {
            ecometriId: item.ecometriId,
            sku: item.sku,
            rawTitle: item.rawTitle,
            imageKey: item.imageKey,
            promptVersion,
            nowIso,
          })
        : null;

      if (parsed) {
        resultsById.set(item.ecometriId, {
          item: parsed,
          retriedSingle: isBisectedSingle,
          quotaRetries: batchOutcome.quotaRetries,
        });
        continue;
      }

      // Single-item retry (batch of 1) for malformed/hallucinated/missing item per D6
      const singleOutcome = await callWithRetry([
        {
          id: item.ecometriId,
          rawTitle: item.rawTitle,
          imageBase64: item.imageBase64 as string,
          mimeType: item.mimeType || 'image/jpeg',
        },
      ]);

      const retryRaw = singleOutcome.rawMap?.get(item.ecometriId);
      const retryParsed = retryRaw
        ? parseEnrichment(retryRaw, {
            ecometriId: item.ecometriId,
            sku: item.sku,
            rawTitle: item.rawTitle,
            imageKey: item.imageKey,
            promptVersion,
            nowIso,
          })
        : null;

      const totalQuotaRetries =
        batchOutcome.quotaRetries + singleOutcome.quotaRetries;

      if (retryParsed) {
        resultsById.set(item.ecometriId, {
          item: retryParsed,
          retriedSingle: true,
          quotaRetries: totalQuotaRetries,
        });
      } else {
        resultsById.set(item.ecometriId, {
          item: buildFailedSemanticItem(item, promptVersion, nowIso),
          retriedSingle: true,
          quotaRetries: totalQuotaRetries,
          errorReason: singleOutcome.errorReason || 'invalid_output',
        });
      }
    }
  };

  for (let offset = 0; offset < visionQueue.length; offset += batchSize) {
    const chunk = visionQueue.slice(offset, offset + batchSize);
    await processChunk(chunk, chunk.length > 1, false);
  }

  return batch.map((b) => resultsById.get(b.ecometriId)!);
}

/**
 * Builds a safe `600x600` CloudFront image URL restricted strictly to `allowedImageHost`
 * so printed box model references (e.g. `Model: VN19`) and capacity digits (`5000`) are crisp.
 */
export function buildThumbnail160Url(
  imageUrl: string | null,
  allowedImageHost: string
): string | null {
  if (!imageUrl || !allowedImageHost) return null;
  const host = allowedImageHost.trim().toLowerCase();
  if (!host) return null;

  try {
    const parsed = new URL(imageUrl);
    if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== host) {
      return null;
    }
    parsed.pathname = parsed.pathname.replace(/\/fit-in\/\d+x\d+\//i, '/fit-in/600x600/');
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Downloads a `160x160` thumbnail strictly from `allowedImageHost` with redirect blocking
 * and an explicit per-image timeout. Returns `null` on failure without throwing.
 */
export async function fetchThumbnailAsBase64(
  imageUrl: string | null,
  allowedImageHost: string,
  options?: {
    fetchFn?: typeof fetch;
    timeoutMs?: number;
    signal?: AbortSignal;
  }
): Promise<{ base64: string; mimeType: string } | null> {
  const thumbUrl = buildThumbnail160Url(imageUrl, allowedImageHost);
  if (!thumbUrl) return null;

  const fetchFn = options?.fetchFn ?? fetch;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_THUMBNAIL_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (options?.signal) {
    options.signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const resp = await fetchFn(thumbUrl, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'error',
    });
    if (!resp.ok) return null;

    const contentType = (resp.headers.get('content-type') || 'image/jpeg')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!contentType.startsWith('image/')) return null;

    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length === 0 || buf.length > 500_000) return null;

    return {
      base64: buf.toString('base64'),
      mimeType: contentType,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    if (options?.signal) {
      options.signal.removeEventListener('abort', onAbort);
    }
  }
}
