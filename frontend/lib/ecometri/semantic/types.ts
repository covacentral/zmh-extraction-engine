import type { ProductDTO } from '../types';

export const SEMANTIC_SCHEMA_VERSION = 2 as const;
export const CURRENT_PROMPT_VERSION = 'v2.0';
export const MAX_SHARD_ITEMS = 300;
export const MAX_SHARD_BYTES = 600_000;
export const MAX_KEYWORDS = 15;
export const MAX_DISPLAY_TITLE_LEN = 80;
export const MAX_VISUAL_SUMMARY_LEN = 280;

/**
 * Metadata document stored at `comercios/{commerceId}/semantic_index/meta`.
 */
export interface SemanticMeta {
  schemaVersion: typeof SEMANTIC_SCHEMA_VERSION;
  promptVersion: string;
  gen: number;
  shardCount: number;
  itemCount: number;
  generatedAt: string;
  shardHashes: string[];
  lockedUntil: string | null;
  lockOwner?: string | null;
}

/**
 * Enriched semantic record persisted inside `SemanticShard`.
 * STRICT INVARIANT (D1): Must NEVER contain price, discount_price, stock, slug, or active fields.
 */
export interface SemanticItem {
  ecometriId: string;
  sku: string;
  imageKey: string | null;
  displayTitle: string;
  article: string;
  brand: string | null;
  modelRef: string | null;
  colors: string[];
  keywords: string[];
  visualSummary: string;
  source: 'vision' | 'text-only';
  status: 'ok' | 'failed';
  enrichedAt: string;
  promptVersion: string;
}

export interface SemanticShard {
  gen: number;
  index: number;
  items: SemanticItem[];
}

/**
 * Live Ecometri product representation used during runtime join & delta detection.
 */
export interface LiveProduct extends ProductDTO {
  ecometriId: string;
  imageKey: string | null;
  active: boolean;
}

export interface EnrichedProduct extends LiveProduct {
  semantic: SemanticItem | null;
}

export interface SemanticIndex {
  gen: number;
  byId: Map<string, SemanticItem>;
  bySku: Map<string, string[]>;
}

export interface SemanticStore {
  readMeta(): Promise<SemanticMeta | null>;
  readShards(gen: number, shardCount: number): Promise<SemanticShard[]>;
  writeGeneration(
    nextGen: number,
    shards: SemanticShard[],
    meta: SemanticMeta
  ): Promise<void>;
  acquireLock(ownerId: string, ttlMs: number, nowIso: string): Promise<boolean>;
  releaseLock(ownerId: string): Promise<void>;
}
