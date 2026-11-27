import type { SemanticIndex, SemanticItem, SemanticStore } from './types';

export const SEMANTIC_CACHE_TTL_MS = 30 * 60_000;
export const SEMANTIC_EMPTY_CACHE_TTL_MS = 60_000;

interface CachedEntry {
  index: SemanticIndex | null;
  gen: number;
  expiresAt: number;
}

export function buildSemanticIndexFromItems(
  gen: number,
  items: SemanticItem[]
): SemanticIndex {
  const byId = new Map<string, SemanticItem>();
  const bySku = new Map<string, string[]>();

  for (const item of items) {
    if (item.status !== 'ok') continue;
    byId.set(item.ecometriId, item);
    const skuKey = (item.sku || '').trim().toLowerCase();
    if (skuKey) {
      const existing = bySku.get(skuKey);
      if (existing) {
        if (!existing.includes(item.ecometriId)) {
          existing.push(item.ecometriId);
        }
      } else {
        bySku.set(skuKey, [item.ecometriId]);
      }
    }
  }

  return { gen, byId, bySku };
}

export interface SemanticLoaderDeps {
  store: SemanticStore;
  now: () => number;
  ttlMs?: number;
}

export function createSemanticIndexLoader() {
  const cache = new Map<string, CachedEntry>();
  const inFlight = new Map<string, Promise<SemanticIndex | null>>();

  const load = async (
    commerceId: string,
    deps: SemanticLoaderDeps
  ): Promise<SemanticIndex | null> => {
    const now = deps.now();
    const ttlMs = deps.ttlMs ?? SEMANTIC_CACHE_TTL_MS;

    const cached = cache.get(commerceId);
    if (cached && cached.expiresAt > now) {
      return cached.index;
    }

    const pending = inFlight.get(commerceId);
    if (pending) {
      return pending;
    }

    const promise = (async (): Promise<SemanticIndex | null> => {
      try {
        // 1. Read `meta` first (1 Firestore read)
        const meta = await deps.store.readMeta();
        if (!meta || meta.gen <= 0 || meta.shardCount <= 0) {
          cache.set(commerceId, {
            index: null,
            gen: 0,
            expiresAt: deps.now() + Math.min(ttlMs, SEMANTIC_EMPTY_CACHE_TTL_MS),
          });
          return null;
        }

        // 2. If generation did NOT change since last cached load, skip reading shards (0 extra reads!)
        if (cached && cached.index && cached.gen === meta.gen) {
          cache.set(commerceId, {
            index: cached.index,
            gen: meta.gen,
            expiresAt: deps.now() + ttlMs,
          });
          return cached.index;
        }

        // 3. Read all shards strictly belonging to `meta.gen`
        const shards = await deps.store.readShards(meta.gen, meta.shardCount);
        const allItems: SemanticItem[] = [];
        for (const shard of shards) {
          if (shard.gen !== meta.gen) {
            throw new Error(`SHARD_GEN_MISMATCH_${shard.gen}_EXPECTED_${meta.gen}`);
          }
          allItems.push(...shard.items);
        }

        const built = buildSemanticIndexFromItems(meta.gen, allItems);
        cache.set(commerceId, {
          index: built,
          gen: meta.gen,
          expiresAt: deps.now() + ttlMs,
        });
        return built;
      } catch {
        // Graceful degradation (D5): return stale index if present, otherwise null — never throw
        return cached?.index ?? null;
      } finally {
        inFlight.delete(commerceId);
      }
    })();

    inFlight.set(commerceId, promise);
    return promise;
  };

  const invalidate = (commerceId?: string) => {
    if (commerceId) {
      cache.delete(commerceId);
    } else {
      cache.clear();
    }
  };

  return { load, invalidate };
}

const defaultLoader = createSemanticIndexLoader();

export function loadSemanticIndex(
  commerceId: string,
  deps: SemanticLoaderDeps
): Promise<SemanticIndex | null> {
  return defaultLoader.load(commerceId, deps);
}

export function clearDefaultSemanticIndexCache(commerceId?: string): void {
  defaultLoader.invalidate(commerceId);
}
