import type { VisualSearchQuota } from './types';

export const CLIENT_QUOTA_LIMIT = 10;
export const CLIENT_QUOTA_WINDOW_MS = 5 * 60_000;

function getStorageKey(commerceId: string): string {
  return `zmh:vsearch:q:v1:${(commerceId || 'default').toLowerCase()}`;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function resolveDefaultStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readValidTimestamps(
  storage: StorageLike | null,
  key: string,
  now: number
): number[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is number =>
        typeof t === 'number' &&
        Number.isFinite(t) &&
        t > 0 &&
        now - t < CLIENT_QUOTA_WINDOW_MS
    );
  } catch {
    return [];
  }
}

function writeTimestamps(
  storage: StorageLike | null,
  key: string,
  timestamps: number[]
): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(timestamps));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Cosmetic client-side sliding-window mirror (counts ONLY successful searches).
 * Never replaces server authority; prevents visual bounce across serverless instances.
 */
export function readLocalVisualQuota(
  commerceId: string,
  now: number = Date.now(),
  storage: StorageLike | null = resolveDefaultStorage()
): VisualSearchQuota {
  const key = getStorageKey(commerceId);
  const recent = readValidTimestamps(storage, key, now);
  writeTimestamps(storage, key, recent);

  if (recent.length === 0) {
    return {
      remaining: CLIENT_QUOTA_LIMIT,
      limit: CLIENT_QUOTA_LIMIT,
      resetInSec: 0,
      resetAt: 0,
    };
  }

  const oldest = recent[0];
  const resetAt = oldest + CLIENT_QUOTA_WINDOW_MS;
  const resetInSec = Math.max(1, Math.ceil((resetAt - now) / 1000));
  const remaining = Math.max(0, CLIENT_QUOTA_LIMIT - recent.length);

  return {
    remaining,
    limit: CLIENT_QUOTA_LIMIT,
    resetInSec,
    resetAt,
  };
}

export function recordLocalVisualSuccess(
  commerceId: string,
  now: number = Date.now(),
  storage: StorageLike | null = resolveDefaultStorage()
): VisualSearchQuota {
  const key = getStorageKey(commerceId);
  const recent = readValidTimestamps(storage, key, now);
  recent.push(now);
  writeTimestamps(storage, key, recent);
  return readLocalVisualQuota(commerceId, now, storage);
}

/**
 * Combines authoritative server quota with cosmetic local mirror:
 * takes max(used_server, used_local) === min(remaining_server, remaining_local)
 * so cold serverless instances never cause the displayed remaining count to jump upward,
 * while server 0 (429) always wins immediately.
 */
export function mergeVisualQuota(
  serverQuota: VisualSearchQuota | undefined | null,
  localQuota: VisualSearchQuota
): VisualSearchQuota {
  if (!serverQuota) return localQuota;

  const limit = serverQuota.limit || localQuota.limit || CLIENT_QUOTA_LIMIT;
  const remaining = Math.min(serverQuota.remaining, localQuota.remaining);
  const resetAt = Math.max(serverQuota.resetAt || 0, localQuota.resetAt || 0);
  const resetInSec = Math.max(serverQuota.resetInSec || 0, localQuota.resetInSec || 0);

  return {
    remaining,
    limit,
    resetInSec: remaining < limit ? resetInSec : 0,
    resetAt: remaining < limit ? resetAt : 0,
  };
}
