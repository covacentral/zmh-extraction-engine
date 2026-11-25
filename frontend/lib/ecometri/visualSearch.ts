import type { ProductDTO, VisualAnalysis } from './types';

export const MAX_IMAGE_BYTES = 350 * 1024;
export const MAX_BODY_BYTES = 480 * 1024;
export const MAX_CHIPS = 6;
export const MAX_RESULT_ITEMS = 5;

const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/g;

// Ambiguous modifiers that pull completely unrelated products in substring search
const AMBIGUOUS_STANDALONE_WORDS = new Set([
  'presion',
  'digital',
  'portatil',
  'mini',
  'grande',
  'pequeno',
  'negro',
  'blanco',
  'azul',
  'rosa',
  'rosado',
  'rojo',
  'verde',
  'amarillo',
  'morado',
  'gris',
  'dorado',
  'plateado',
  'usb',
  'led',
  'electrico',
  'electrica',
  'manual',
  'recargable',
  'inalambrico',
  'inalambrica',
  'set',
  'kit',
  'combo',
  'juego',
  'accesorio',
  'accesorios',
  'hogar',
  'salud',
  'belleza',
  'cocina',
  'profesional',
  'nuevo',
  'original',
  'multiusos',
]);

function stripAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isAmbiguousStandalone(term: string): boolean {
  const norm = stripAccents(term.toLowerCase()).trim();
  return AMBIGUOUS_STANDALONE_WORDS.has(norm);
}

function derivePrefixStem(term: string): string | null {
  const firstWord = stripAccents(term.toLowerCase())
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[^a-z0-9]/g, '');
  if (!firstWord || firstWord.length < 6) return null;
  const stem = firstWord.slice(0, 5);
  if (isAmbiguousStandalone(stem)) return null;
  return stem;
}

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
 * Filters out ambiguous standalone modifiers (e.g. "presion", "digital", "mini")
 * and auto-derives a 5-char stem in Round 2 to survive minor spelling mistakes.
 */
export function planQueries(analysis: VisualAnalysis, round: 1 | 2): string[] {
  const seen = new Set<string>();
  const pick = (sources: string[], maxCount: number): string[] => {
    const out: string[] = [];
    for (const s of sources) {
      const cleaned = cleanTerm(s);
      if (!cleaned || isAmbiguousStandalone(cleaned)) continue;
      const key = stripAccents(cleaned.toLowerCase());
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

  // Round 2 excludes terms already used in Round 1 and adds typo-resilient 5-char stems
  const round1 = pick([...analysis.exactTerms, ...analysis.functionalTerms], 3);
  round1.forEach((q) => seen.add(stripAccents(q.toLowerCase())));

  const derivedStems: string[] = [];
  for (const t of analysis.exactTerms) {
    const stem = derivePrefixStem(t);
    if (stem) derivedStems.push(stem);
  }

  return pick([...analysis.broadRoots, ...derivedStems, ...analysis.functionalTerms], 3);
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
 * IMPORTANT: An explicit valid empty array `{"orderedIds": []}` returns `[]`
 * (meaning NONE of the candidates match the photographed product), whereas `null`
 * indicates a malformed/unparseable response.
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

  return filtered;
}

/**
 * Applies validated rerank order while preserving inStock-first priority.
 * If `order` is `[]` (explicit semantic rejection of all candidates), returns `[]`.
 * Only falls back to unranked candidates when `order === null` (technical failure).
 */
export function applyRerank(
  candidates: ProductDTO[],
  order: string[] | null
): ProductDTO[] {
  if (order === null) {
    return candidates.slice(0, MAX_RESULT_ITEMS);
  }
  if (order.length === 0) {
    return [];
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

const BUNDLE_OR_ACCESSORY_RE = /\b(pad|combo|set|teclado\s+y|kit)\b/i;

/**
 * Selects up to `maxCount` candidates for Stage 2 visual comparison.
 * When the photographed object is NOT itself a bundle/pad/combo, standalone products
 * are prioritized ahead of bundles/pads so all real matching items enter the visual window.
 */
export function prioritizeCandidatesForRerank(
  candidates: ProductDTO[],
  detectedLabel: string,
  maxCount: number
): ProductDTO[] {
  const labelIsBundle = BUNDLE_OR_ACCESSORY_RE.test(detectedLabel || '');
  if (labelIsBundle || candidates.length <= maxCount) {
    return candidates.slice(0, maxCount);
  }

  const standalone: ProductDTO[] = [];
  const bundles: ProductDTO[] = [];
  for (const item of candidates) {
    if (BUNDLE_OR_ACCESSORY_RE.test(item.title)) {
      bundles.push(item);
    } else {
      standalone.push(item);
    }
  }
  return [...standalone, ...bundles].slice(0, maxCount);
}

export interface VisualRateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetInSec: number;
  resetAt: number;
  retryAfterSec: number;
  scope: 'device' | 'ip' | 'instance';
}

export interface VisualRateLimiter {
  consume(ip: string, deviceId?: string | null): VisualRateLimitResult;
  refund(ip: string, deviceId?: string | null): void;
}

const SAFE_DEVICE_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

export function sanitizeDeviceId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return SAFE_DEVICE_ID_RE.test(trimmed) ? trimmed : null;
}

export function createVisualRateLimiter(options?: {
  maxPerDevice?: number;
  deviceWindowMs?: number;
  maxPerIp?: number;
  ipWindowMs?: number;
  maxPerInstance?: number;
  instanceWindowMs?: number;
  nowFn?: () => number;
}): VisualRateLimiter {
  const maxPerDevice = options?.maxPerDevice ?? 10;
  const deviceWindowMs = options?.deviceWindowMs ?? 5 * 60_000;
  const maxPerIp = options?.maxPerIp ?? 50;
  const ipWindowMs = options?.ipWindowMs ?? 5 * 60_000;
  const maxPerInstance = options?.maxPerInstance ?? 90;
  const instanceWindowMs = options?.instanceWindowMs ?? 60_000;
  const nowFn = options?.nowFn ?? (() => Date.now());

  const deviceTimestamps = new Map<string, number[]>();
  const ipTimestamps = new Map<string, number[]>();
  let instanceTimestamps: number[] = [];

  return {
    consume(ip: string, deviceId?: string | null): VisualRateLimitResult {
      const now = nowFn();

      instanceTimestamps = instanceTimestamps.filter((t) => now - t < instanceWindowMs);
      if (instanceTimestamps.length >= maxPerInstance) {
        const oldest = instanceTimestamps[0];
        const resetAt = oldest + instanceWindowMs;
        const retryAfterSec = Math.max(1, Math.ceil((resetAt - now) / 1000));
        return {
          allowed: false,
          remaining: 0,
          limit: maxPerDevice,
          resetInSec: retryAfterSec,
          resetAt,
          retryAfterSec,
          scope: 'instance',
        };
      }

      const ipKey = (ip || 'unknown').trim() || 'unknown';
      const recentIp = (ipTimestamps.get(ipKey) || []).filter((t) => now - t < ipWindowMs);
      if (recentIp.length >= maxPerIp) {
        ipTimestamps.set(ipKey, recentIp);
        const oldest = recentIp[0];
        const resetAt = oldest + ipWindowMs;
        const retryAfterSec = Math.max(1, Math.ceil((resetAt - now) / 1000));
        return {
          allowed: false,
          remaining: 0,
          limit: maxPerIp,
          resetInSec: retryAfterSec,
          resetAt,
          retryAfterSec,
          scope: 'ip',
        };
      }

      const cleanDevice = sanitizeDeviceId(deviceId);
      const deviceKey = cleanDevice ? `dev:${cleanDevice}` : `ip:${ipKey}`;
      const recentDev = (deviceTimestamps.get(deviceKey) || []).filter(
        (t) => now - t < deviceWindowMs
      );

      if (recentDev.length >= maxPerDevice) {
        deviceTimestamps.set(deviceKey, recentDev);
        const oldest = recentDev[0];
        const resetAt = oldest + deviceWindowMs;
        const retryAfterSec = Math.max(1, Math.ceil((resetAt - now) / 1000));
        return {
          allowed: false,
          remaining: 0,
          limit: maxPerDevice,
          resetInSec: retryAfterSec,
          resetAt,
          retryAfterSec,
          scope: 'device',
        };
      }

      recentDev.push(now);
      deviceTimestamps.set(deviceKey, recentDev);
      recentIp.push(now);
      ipTimestamps.set(ipKey, recentIp);
      instanceTimestamps.push(now);

      const oldestDev = recentDev[0];
      const resetAt = oldestDev + deviceWindowMs;
      const resetInSec = Math.max(1, Math.ceil((resetAt - now) / 1000));

      return {
        allowed: true,
        remaining: Math.max(0, maxPerDevice - recentDev.length),
        limit: maxPerDevice,
        resetInSec,
        resetAt,
        retryAfterSec: 0,
        scope: 'device',
      };
    },
    refund(ip: string, deviceId?: string | null): void {
      const ipKey = (ip || 'unknown').trim() || 'unknown';
      const cleanDevice = sanitizeDeviceId(deviceId);
      const deviceKey = cleanDevice ? `dev:${cleanDevice}` : `ip:${ipKey}`;

      const devArr = deviceTimestamps.get(deviceKey);
      if (devArr && devArr.length > 0) {
        devArr.pop();
        deviceTimestamps.set(deviceKey, devArr);
      }
      const ipArr = ipTimestamps.get(ipKey);
      if (ipArr && ipArr.length > 0) {
        ipArr.pop();
        ipTimestamps.set(ipKey, ipArr);
      }
      if (instanceTimestamps.length > 0) {
        instanceTimestamps.pop();
      }
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
