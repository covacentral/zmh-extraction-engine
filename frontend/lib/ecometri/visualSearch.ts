import type { ProductDTO, VisualAnalysis } from './types';

export const MAX_IMAGE_BYTES = 350 * 1024;
export const MAX_BODY_BYTES = 480 * 1024;
export const MAX_CHIPS = 6;
export const MAX_RESULT_ITEMS = 5;

const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/g;

function cleanTerm(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(CONTROL_CHARS_RE, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length < 3 || cleaned.length > 40) return null;
  return cleaned;
}

function cleanTermArray(raw: unknown, maxLen: number): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const cleaned = cleanTerm(item);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= maxLen) break;
  }
  return out;
}

/**
 * Validates and sanitizes untrusted JSON output from Gemini Stage 1.
 */
export function parseVisualAnalysis(raw: unknown): VisualAnalysis | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const rawLabel = typeof obj.label === 'string'
    ? obj.label.replace(CONTROL_CHARS_RE, ' ').replace(/\s+/g, ' ').trim()
    : '';
  const label = rawLabel.slice(0, 60);

  const exactTerms = cleanTermArray(obj.exactTerms, 4);
  const functionalTerms = cleanTermArray(obj.functionalTerms, 4);
  const broadRoots = cleanTermArray(obj.broadRoots, 4);

  if (!label && exactTerms.length === 0 && functionalTerms.length === 0 && broadRoots.length === 0) {
    return null;
  }

  return {
    label: label || exactTerms[0] || functionalTerms[0] || broadRoots[0] || 'Producto',
    exactTerms,
    functionalTerms,
    broadRoots,
  };
}

/**
 * Plans search queries for Round 1 (max 3) or Round 2 (max 2).
 */
export function planQueries(analysis: VisualAnalysis, round: 1 | 2): string[] {
  const seen = new Set<string>();
  const pick = (sources: string[], maxCount: number): string[] => {
    const out: string[] = [];
    for (const s of sources) {
      const cleaned = cleanTerm(s);
      if (!cleaned) continue;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(cleaned);
      if (out.length >= maxCount) break;
    }
    return out;
  };

  if (round === 1) {
    return pick([...analysis.exactTerms, ...analysis.functionalTerms], 3);
  }

  // Round 2 excludes terms already used in Round 1
  const round1 = pick([...analysis.exactTerms, ...analysis.functionalTerms], 3);
  round1.forEach((q) => seen.add(q.toLowerCase()));
  return pick([...analysis.broadRoots, ...analysis.functionalTerms], 2);
}

/**
 * Builds up to 6 unique touchable chips for text refinement.
 */
export function buildDetectedChips(analysis: VisualAnalysis): string[] {
  const seen = new Set<string>();
  const chips: string[] = [];
  const pool = [
    ...analysis.exactTerms,
    ...analysis.functionalTerms,
    ...analysis.broadRoots,
  ];
  for (const term of pool) {
    const cleaned = cleanTerm(term);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    chips.push(cleaned);
    if (chips.length >= MAX_CHIPS) break;
  }
  return chips;
}

/**
 * Merges multi-query candidate rounds: deduplicates by id, prioritizes inStock first, stable order.
 */
export function mergeCandidates(rounds: ProductDTO[][]): ProductDTO[] {
  const seen = new Set<string>();
  const merged: Array<{ item: ProductDTO; index: number }> = [];
  let idx = 0;

  for (const list of rounds) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || !item.id || seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push({ item, index: idx++ });
    }
  }

  merged.sort((a, b) => {
    if (a.item.inStock !== b.item.inStock) {
      return a.item.inStock ? -1 : 1;
    }
    return a.index - b.index;
  });

  return merged.map((entry) => entry.item);
}

/**
 * Parses untrusted Gemini Stage 2 rerank output and discards any hallucinated IDs.
 */
export function parseRerankResult(
  raw: unknown,
  candidateIds: string[]
): string[] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const rawOrder = Array.isArray(obj.orderedIds)
    ? obj.orderedIds
    : Array.isArray(obj.ids)
      ? obj.ids
      : null;

  if (!rawOrder) return null;

  const validSet = new Set(candidateIds);
  const seen = new Set<string>();
  const filtered: string[] = [];

  for (const entry of rawOrder) {
    if (typeof entry !== 'string') continue;
    if (!validSet.has(entry) || seen.has(entry)) continue;
    seen.add(entry);
    filtered.push(entry);
  }

  return filtered.length > 0 ? filtered : null;
}

/**
 * Applies validated rerank order while preserving inStock-first priority.
 */
export function applyRerank(
  candidates: ProductDTO[],
  order: string[] | null
): ProductDTO[] {
  if (!order || order.length === 0) {
    return candidates.slice(0, MAX_RESULT_ITEMS);
  }

  const byId = new Map<string, ProductDTO>();
  for (const item of candidates) {
    byId.set(item.id, item);
  }

  const ranked: ProductDTO[] = [];
  const used = new Set<string>();
  for (const id of order) {
    const found = byId.get(id);
    if (found && !used.has(id)) {
      used.add(id);
      ranked.push(found);
    }
  }

  // Ensure inStock items still come first if model mixed them
  const inStock = ranked.filter((x) => x.inStock);
  const outOfStock = ranked.filter((x) => !x.inStock);
  return [...inStock, ...outOfStock].slice(0, MAX_RESULT_ITEMS);
}

export interface JpegValidationResult {
  ok: boolean;
  status?: 400 | 413;
  error?: string;
  byteLength?: number;
}

/**
 * Validates pure base64 JPEG (no data: prefix), <= 350 KB decoded, and JPEG magic bytes FFD8FF.
 */
export function validateJpegBase64(imageBase64: unknown): JpegValidationResult {
  if (typeof imageBase64 !== 'string' || !imageBase64.trim()) {
    return { ok: false, status: 400, error: 'Imagen requerida.' };
  }

  const trimmed = imageBase64.trim();
  if (/^data:/i.test(trimmed)) {
    return { ok: false, status: 400, error: 'No se permite prefijo data URI.' };
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) || trimmed.length % 4 !== 0) {
    return { ok: false, status: 400, error: 'Base64 invalido.' };
  }

  const buf = Buffer.from(trimmed, 'base64');
  if (buf.length > MAX_IMAGE_BYTES) {
    return { ok: false, status: 413, error: 'La imagen supera el limite de 350 KB.' };
  }

  if (buf.length < 3 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
    return { ok: false, status: 400, error: 'Formato invalido: se requiere JPEG.' };
  }

  return { ok: true, byteLength: buf.length };
}

export interface VisualRateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

export interface VisualRateLimiter {
  consume(ip: string): VisualRateLimitResult;
}

export function createVisualRateLimiter(options?: {
  maxPerIp?: number;
  ipWindowMs?: number;
  maxPerInstance?: number;
  instanceWindowMs?: number;
  nowFn?: () => number;
}): VisualRateLimiter {
  const maxPerIp = options?.maxPerIp ?? 3;
  const ipWindowMs = options?.ipWindowMs ?? 5 * 60_000;
  const maxPerInstance = options?.maxPerInstance ?? 30;
  const instanceWindowMs = options?.instanceWindowMs ?? 60_000;
  const nowFn = options?.nowFn ?? (() => Date.now());

  const ipTimestamps = new Map<string, number[]>();
  let instanceTimestamps: number[] = [];

  return {
    consume(ip: string): VisualRateLimitResult {
      const now = nowFn();

      instanceTimestamps = instanceTimestamps.filter((t) => now - t < instanceWindowMs);
      if (instanceTimestamps.length >= maxPerInstance) {
        const oldest = instanceTimestamps[0];
        const retryAfterSec = Math.max(1, Math.ceil((instanceWindowMs - (now - oldest)) / 1000));
        return { allowed: false, retryAfterSec };
      }

      const key = (ip || 'unknown').trim() || 'unknown';
      const recent = (ipTimestamps.get(key) || []).filter((t) => now - t < ipWindowMs);
      if (recent.length >= maxPerIp) {
        ipTimestamps.set(key, recent);
        const oldest = recent[0];
        const retryAfterSec = Math.max(1, Math.ceil((ipWindowMs - (now - oldest)) / 1000));
        return { allowed: false, retryAfterSec };
      }

      recent.push(now);
      ipTimestamps.set(key, recent);
      instanceTimestamps.push(now);
      return { allowed: true, retryAfterSec: 0 };
    },
  };
}

export interface CircuitBreaker {
  isOpen(): boolean;
  trip(): void;
  recordSuccess(): void;
  getRetryAfterSec(): number;
}

export function createCircuitBreaker(options?: {
  baseOpenMs?: number;
  maxOpenMs?: number;
  nowFn?: () => number;
}): CircuitBreaker {
  const baseOpenMs = options?.baseOpenMs ?? 60_000;
  const maxOpenMs = options?.maxOpenMs ?? 10 * 60_000;
  const nowFn = options?.nowFn ?? (() => Date.now());

  let openUntil = 0;
  let consecutiveTrips = 0;

  return {
    isOpen(): boolean {
      return nowFn() < openUntil;
    },
    trip(): void {
      const now = nowFn();
      const duration = Math.min(maxOpenMs, baseOpenMs * Math.pow(2, consecutiveTrips));
      consecutiveTrips += 1;
      openUntil = now + duration;
    },
    recordSuccess(): void {
      consecutiveTrips = 0;
      openUntil = 0;
    },
    getRetryAfterSec(): number {
      const remaining = openUntil - nowFn();
      return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
    },
  };
}
