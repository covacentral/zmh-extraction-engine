import crypto from 'crypto';
import {
  MAX_SHARD_BYTES,
  MAX_SHARD_ITEMS,
  type SemanticItem,
  type SemanticMeta,
  type SemanticShard,
  type SemanticStore,
} from './types';

export function computeShardHash(shard: SemanticShard): string {
  const canonical = JSON.stringify(shard.items);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Deterministically partitions `items` into shards respecting BOTH `maxItems` AND `maxBytes`
 * (serialized UTF-8 JSON byte size). Byte limit strictly dominates item count.
 */
export function partitionShards(
  items: SemanticItem[],
  maxItems: number = MAX_SHARD_ITEMS,
  maxBytes: number = MAX_SHARD_BYTES,
  gen: number = 1
): SemanticShard[] {
  if (!Array.isArray(items) || items.length === 0) return [];

  const effectiveMaxItems = Math.max(1, maxItems);
  const effectiveMaxBytes = Math.max(1, maxBytes);

  const sorted = [...items].sort((a, b) => a.ecometriId.localeCompare(b.ecometriId));
  const shards: SemanticShard[] = [];
  let currentBatch: SemanticItem[] = [];

  const flush = () => {
    if (currentBatch.length === 0) return;
    shards.push({
      gen,
      index: shards.length,
      items: currentBatch,
    });
    currentBatch = [];
  };

  for (const item of sorted) {
    const candidateBatch = [...currentBatch, item];
    const candidateShard: SemanticShard = {
      gen,
      index: shards.length,
      items: candidateBatch,
    };
    const byteSize = Buffer.byteLength(JSON.stringify(candidateShard), 'utf8');

    if (
      currentBatch.length > 0 &&
      (candidateBatch.length > effectiveMaxItems || byteSize > effectiveMaxBytes)
    ) {
      flush();
      currentBatch.push(item);
    } else {
      currentBatch = candidateBatch;
    }
  }

  flush();
  return shards;
}

/**
 * Heremetic in-memory implementation of `SemanticStore` with generation isolation
 * and optimistic locking for unit testing.
 */
export class InMemorySemanticStore implements SemanticStore {
  private meta: SemanticMeta | null = null;
  private shardsByKey = new Map<string, SemanticShard>();
  public metaReads = 0;
  public shardReads = 0;

  private makeKey(gen: number, index: number): string {
    return `gen_${gen}_shard_${index}`;
  }

  async readMeta(): Promise<SemanticMeta | null> {
    this.metaReads += 1;
    return this.meta ? structuredClone(this.meta) : null;
  }

  async readShards(gen: number, shardCount: number): Promise<SemanticShard[]> {
    const out: SemanticShard[] = [];
    for (let i = 0; i < shardCount; i++) {
      this.shardReads += 1;
      const found = this.shardsByKey.get(this.makeKey(gen, i));
      if (!found) {
        throw new Error(`MISSING_SHARD_GEN_${gen}_IDX_${i}`);
      }
      out.push(structuredClone(found));
    }
    return out;
  }

  async writeGeneration(
    nextGen: number,
    shards: SemanticShard[],
    meta: SemanticMeta
  ): Promise<void> {
    const prevGen = this.meta?.gen;

    // 1. Write all shards under the new generation prefix FIRST
    for (const shard of shards) {
      const normalizedShard: SemanticShard = {
        gen: nextGen,
        index: shard.index,
        items: structuredClone(shard.items),
      };
      this.shardsByKey.set(this.makeKey(nextGen, shard.index), normalizedShard);
    }

    // 2. Atomically flip `meta` to point to `nextGen`
    this.meta = structuredClone({
      ...meta,
      gen: nextGen,
      shardCount: shards.length,
    });

    // 3. Best-effort cleanup of orphan shards from previous generations
    if (typeof prevGen === 'number' && prevGen !== nextGen) {
      for (const key of Array.from(this.shardsByKey.keys())) {
        if (key.startsWith(`gen_${prevGen}_shard_`)) {
          this.shardsByKey.delete(key);
        }
      }
    }
  }

  async acquireLock(ownerId: string, ttlMs: number, nowIso: string): Promise<boolean> {
    const nowMs = Date.parse(nowIso);
    if (this.meta?.lockedUntil) {
      const lockedUntilMs = Date.parse(this.meta.lockedUntil);
      if (Number.isFinite(lockedUntilMs) && lockedUntilMs > nowMs && this.meta.lockOwner !== ownerId) {
        return false;
      }
    }

    const nextLockIso = new Date(nowMs + ttlMs).toISOString();
    if (this.meta) {
      this.meta = {
        ...this.meta,
        lockedUntil: nextLockIso,
        lockOwner: ownerId,
      };
    } else {
      this.meta = {
        schemaVersion: 2,
        promptVersion: '',
        gen: 0,
        shardCount: 0,
        itemCount: 0,
        generatedAt: nowIso,
        shardHashes: [],
        lockedUntil: nextLockIso,
        lockOwner: ownerId,
      };
    }
    return true;
  }

  async releaseLock(ownerId: string): Promise<void> {
    if (this.meta && (!this.meta.lockOwner || this.meta.lockOwner === ownerId)) {
      this.meta = {
        ...this.meta,
        lockedUntil: null,
        lockOwner: null,
      };
    }
  }

  /** Test helper to simulate interrupted shard write BEFORE meta flip */
  writePartialShardsWithoutMetaFlip(nextGen: number, shards: SemanticShard[]): void {
    for (const shard of shards) {
      this.shardsByKey.set(this.makeKey(nextGen, shard.index), structuredClone(shard));
    }
  }
}
