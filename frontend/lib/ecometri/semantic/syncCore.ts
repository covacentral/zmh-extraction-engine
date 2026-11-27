import { extractStoreSubdomain } from '../catalogIndex';
import type { GeminiClient } from '../geminiClient';
import { normalizeEcometriProduct } from '../normalize';
import type { EcometriConfig } from '../types';
import { computeDelta } from './delta';
import {
  buildFailedSemanticItem,
  enrichBatch,
  fetchThumbnailAsBase64,
  MAX_ENRICH_BATCH_SIZE,
  type ImageInput,
  type RateLimiter,
} from './enrichBatch';
import { extractImageKey } from './imageKey';
import { buildTextOnlySemanticItem } from './parseEnrichment';
import { computeShardHash, partitionShards } from './shards';
import {
  CURRENT_PROMPT_VERSION,
  MAX_SHARD_BYTES,
  MAX_SHARD_ITEMS,
  SEMANTIC_SCHEMA_VERSION,
  type LiveProduct,
  type SemanticItem,
  type SemanticMeta,
  type SemanticStore,
} from './types';

export const SYNC_CATALOG_FETCH_LIMIT = 1500;

function extractRawPictureCandidate(raw: Record<string, unknown>): string | null {
  if (typeof raw.picture_url === 'string' && raw.picture_url.trim()) {
    return raw.picture_url.trim();
  }
  if (typeof raw.imageUrl === 'string' && raw.imageUrl.trim()) {
    return raw.imageUrl.trim();
  }
  if (Array.isArray(raw.product_images) && raw.product_images.length > 0) {
    const first = raw.product_images[0] as Record<string, unknown> | null;
    if (first && typeof first.picture_url === 'string' && first.picture_url.trim()) {
      return first.picture_url.trim();
    }
  }
  return null;
}

/**
 * Fetches and normalizes the live Ecometri store feed into `LiveProduct[]` for delta computation.
 */
export async function fetchLiveCatalogForSync(
  cfg: EcometriConfig,
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<LiveProduct[]> {
  const subdomain = extractStoreSubdomain(cfg.storeBaseUrl);
  if (!subdomain) {
    throw new Error('INVALID_STORE_BASE_URL');
  }

  const url = `https://apiv2.ecometri.shop/api/v1/store/${encodeURIComponent(
    subdomain
  )}/products?limit=${SYNC_CATALOG_FETCH_LIMIT}&offset=0`;

  const resp = await fetchFn(url, {
    method: 'GET',
    signal,
    redirect: 'error',
    headers: { Accept: 'application/json' },
  });

  if (!resp.ok) {
    throw new Error(`ECOMETRI_FEED_HTTP_${resp.status}`);
  }

  const data = (await resp.json()) as { products?: unknown[] };
  const rawList = Array.isArray(data?.products)
    ? data.products
    : Array.isArray(data)
      ? data
      : null;

  if (!rawList) {
    throw new Error('ECOMETRI_FEED_MALFORMED');
  }

  const seen = new Set<string>();
  const out: LiveProduct[] = [];
  for (const raw of rawList) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const obj = raw as Record<string, unknown>;
    const dto = normalizeEcometriProduct(obj, cfg);
    if (!dto || seen.has(dto.id)) continue;
    seen.add(dto.id);

    const rawPic = extractRawPictureCandidate(obj);
    const imageKey = extractImageKey(dto.imageUrl || rawPic);
    const active = obj.active !== false && obj.is_active !== false;

    out.push({
      ...dto,
      ecometriId: dto.id,
      imageKey,
      active,
    });
  }

  return out;
}

export async function readStoredItemsFromStore(
  store: SemanticStore
): Promise<{ meta: SemanticMeta | null; items: SemanticItem[] }> {
  const meta = await store.readMeta();
  if (!meta || meta.gen <= 0 || meta.shardCount <= 0) {
    return { meta, items: [] };
  }
  const shards = await store.readShards(meta.gen, meta.shardCount);
  const items: SemanticItem[] = [];
  for (const shard of shards) {
    items.push(...shard.items);
  }
  return { meta, items };
}

export interface SyncExecutionOptions {
  cfg: EcometriConfig;
  liveProducts: LiveProduct[];
  store: SemanticStore;
  geminiClient?: GeminiClient;
  limiter?: RateLimiter;
  checkpointItems?: SemanticItem[];
  promptVersion?: string;
  batchSize?: number;
  maxVisionItems?: number;
  budgetMs?: number;
  dryRun?: boolean;
  now?: () => number;
  fetchFn?: typeof fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  onCheckpoint?: (accumulatedItems: SemanticItem[]) => Promise<void> | void;
}

export interface SyncExecutionSummary {
  dryRun: boolean;
  totalLive: number;
  dirtyVisionTotal: number;
  dirtyTextOnlyTotal: number;
  estimatedGeminiBatches: number;
  processed: number;
  reused: number;
  failed: number;
  removed: number;
  backlog: number;
  gen: number;
}

/**
 * Shared pure-injected sync/backfill engine reused identically by `enrich-ecometri-catalog.ts`
 * (CLI backfill) and `/api/ecometri-sync` (daily incremental sync).
 */
export async function runCatalogEnrichmentSync(
  opts: SyncExecutionOptions
): Promise<SyncExecutionSummary> {
  const now = opts.now ?? (() => Date.now());
  const startedAt = now();
  const promptVersion = opts.promptVersion ?? CURRENT_PROMPT_VERSION;
  const batchSize = Math.min(
    MAX_ENRICH_BATCH_SIZE,
    Math.max(1, opts.batchSize ?? MAX_ENRICH_BATCH_SIZE)
  );

  const { meta: prevMeta, items: storedInDb } = await readStoredItemsFromStore(
    opts.store
  );

  // Merge stored DB items with optional local disk checkpoint items (checkpoint overrides stale DB)
  const baselineMap = new Map<string, SemanticItem>();
  for (const item of storedInDb) {
    baselineMap.set(item.ecometriId, item);
  }
  if (opts.checkpointItems) {
    for (const ckItem of opts.checkpointItems) {
      baselineMap.set(ckItem.ecometriId, ckItem);
    }
  }

  const baselineItems = Array.from(baselineMap.values());
  const delta = computeDelta(opts.liveProducts, baselineItems, promptVersion);

  const dirtyTextOnly = delta.dirty.filter((p) => !p.imageKey || !p.imageUrl);
  const dirtyVision = delta.dirty.filter((p) => Boolean(p.imageKey && p.imageUrl));
  const estimatedGeminiBatches = Math.ceil(dirtyVision.length / batchSize);

  if (opts.dryRun) {
    return {
      dryRun: true,
      totalLive: opts.liveProducts.length,
      dirtyVisionTotal: dirtyVision.length,
      dirtyTextOnlyTotal: dirtyTextOnly.length,
      estimatedGeminiBatches,
      processed: 0,
      reused: delta.reusable.size,
      failed: 0,
      removed: delta.removed.length,
      backlog: dirtyVision.length + dirtyTextOnly.length,
      gen: prevMeta?.gen ?? 0,
    };
  }

  if (!opts.geminiClient || !opts.limiter) {
    throw new Error('MISSING_GEMINI_CLIENT_OR_LIMITER');
  }

  const nowIso = () => new Date(now()).toISOString();
  const workingById = new Map<string, SemanticItem>(baselineMap);
  let processed = 0;
  let failed = 0;

  // 1. Process imageless products locally (0 AI calls)
  for (const textItem of dirtyTextOnly) {
    const enriched = buildTextOnlySemanticItem(
      {
        ecometriId: textItem.ecometriId,
        sku: textItem.sku || '',
        title: textItem.title,
        imageKey: textItem.imageKey,
      },
      promptVersion,
      nowIso()
    );
    workingById.set(enriched.ecometriId, enriched);
    processed += 1;
  }

  // 2. Process vision dirty items within `maxVisionItems` cap and `budgetMs` wall-clock budget
  const visionCap =
    typeof opts.maxVisionItems === 'number'
      ? Math.max(0, opts.maxVisionItems)
      : dirtyVision.length;
  const candidateVision = dirtyVision.slice(0, visionCap);
  let visionAttempted = 0;

  for (let offset = 0; offset < candidateVision.length; offset += batchSize) {
    if (typeof opts.budgetMs === 'number' && now() - startedAt >= opts.budgetMs) {
      break;
    }

    const chunk = candidateVision.slice(offset, offset + batchSize);
    visionAttempted += chunk.length;

    const batchInputs: ImageInput[] = await Promise.all(
      chunk.map(async (liveProd): Promise<ImageInput> => {
        const thumb = await fetchThumbnailAsBase64(
          liveProd.imageUrl,
          opts.cfg.allowedImageHost,
          { fetchFn: opts.fetchFn }
        );
        return {
          ecometriId: liveProd.ecometriId,
          sku: liveProd.sku || '',
          rawTitle: liveProd.title,
          imageKey: liveProd.imageKey,
          imageBase64: thumb?.base64 ?? null,
          mimeType: thumb?.mimeType ?? null,
        };
      })
    );

    const downloadable = batchInputs.filter((x) => Boolean(x.imageBase64));
    const downloadFailed = batchInputs.filter((x) => !x.imageBase64);

    for (const badThumb of downloadFailed) {
      workingById.set(
        badThumb.ecometriId,
        buildFailedSemanticItem(badThumb, promptVersion, nowIso())
      );
      failed += 1;
    }

    if (downloadable.length > 0) {
      const enrichedResults = await enrichBatch(
        opts.geminiClient,
        downloadable,
        opts.limiter,
        {
          promptVersion,
          nowIso: nowIso(),
          batchSize,
          sleep: opts.sleep,
        }
      );

      for (const res of enrichedResults) {
        workingById.set(res.item.ecometriId, res.item);
        if (res.item.status === 'ok') {
          processed += 1;
        } else {
          failed += 1;
        }
      }
    }

    if (opts.onCheckpoint) {
      await opts.onCheckpoint(Array.from(workingById.values()));
    }
  }

  // 3. Apply zero-cost `imageKey` reuse across twins/duplicates
  let reused = 0;
  const liveById = new Map<string, LiveProduct>(
    opts.liveProducts.map((p) => [p.ecometriId, p])
  );
  delta.reusable.forEach((donorId, targetId) => {
    const donor = workingById.get(donorId);
    const targetLive = liveById.get(targetId);
    if (donor && donor.status === 'ok' && targetLive) {
      workingById.set(targetId, {
        ...donor,
        ecometriId: targetId,
        sku: targetLive.sku || '',
      });
      reused += 1;
    }
  });

  // 4. Purge removed products (keep ONLY items currently present in `liveProducts`)
  const finalItems: SemanticItem[] = [];
  for (const liveProd of opts.liveProducts) {
    const item = workingById.get(liveProd.ecometriId);
    if (item) {
      finalItems.push(item);
    }
  }

  const backlog = Math.max(0, dirtyVision.length - visionAttempted);
  const hasChanges =
    processed > 0 ||
    reused > 0 ||
    failed > 0 ||
    delta.removed.length > 0 ||
    Boolean(opts.checkpointItems && opts.checkpointItems.length > 0 && !prevMeta);

  if (!hasChanges && prevMeta && prevMeta.gen > 0) {
    return {
      dryRun: false,
      totalLive: opts.liveProducts.length,
      dirtyVisionTotal: dirtyVision.length,
      dirtyTextOnlyTotal: dirtyTextOnly.length,
      estimatedGeminiBatches,
      processed: 0,
      reused: 0,
      failed: 0,
      removed: 0,
      backlog,
      gen: prevMeta.gen,
    };
  }

  const nextGen = (prevMeta?.gen ?? 0) + 1;
  const shards = partitionShards(
    finalItems,
    MAX_SHARD_ITEMS,
    MAX_SHARD_BYTES,
    nextGen
  );
  const nextMeta: SemanticMeta = {
    schemaVersion: SEMANTIC_SCHEMA_VERSION,
    promptVersion,
    gen: nextGen,
    shardCount: shards.length,
    itemCount: finalItems.length,
    generatedAt: nowIso(),
    shardHashes: shards.map(computeShardHash),
    lockedUntil: null,
    lockOwner: null,
  };

  await opts.store.writeGeneration(nextGen, shards, nextMeta);

  return {
    dryRun: false,
    totalLive: opts.liveProducts.length,
    dirtyVisionTotal: dirtyVision.length,
    dirtyTextOnlyTotal: dirtyTextOnly.length,
    estimatedGeminiBatches,
    processed,
    reused,
    failed,
    removed: delta.removed.length,
    backlog,
    gen: nextGen,
  };
}
