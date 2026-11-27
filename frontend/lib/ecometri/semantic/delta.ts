import type { LiveProduct, SemanticItem } from './types';

export interface DeltaResult {
  dirty: LiveProduct[];
  /** Maps target ecometriId -> source ecometriId sharing the exact same imageKey */
  reusable: Map<string, string>;
  removed: string[];
}

/**
 * Pure delta detector anchored strictly to `ecometriId`, `imageKey`, and `promptVersion`.
 * Price, discount, stock, or slug changes NEVER mark an item dirty.
 */
export function computeDelta(
  live: LiveProduct[],
  stored: SemanticItem[],
  promptVersion: string
): DeltaResult {
  const storedById = new Map<string, SemanticItem>();
  const validByImageKey = new Map<string, SemanticItem>();

  for (const item of stored) {
    storedById.set(item.ecometriId, item);
    if (
      item.status === 'ok' &&
      item.promptVersion === promptVersion &&
      item.imageKey &&
      !validByImageKey.has(item.imageKey)
    ) {
      validByImageKey.set(item.imageKey, item);
    }
  }

  const dirty: LiveProduct[] = [];
  const reusable = new Map<string, string>();
  const liveIds = new Set<string>();
  const firstDirtyByImageKey = new Map<string, string>();

  for (const liveItem of live) {
    liveIds.add(liveItem.ecometriId);
    const existing = storedById.get(liveItem.ecometriId);

    // Unchanged imageKey (including both null for text-only, and already-attempted failed items
    // per D6/D7 so broken images do not re-burn Gemini quota until imageKey or promptVersion changes)
    if (
      existing &&
      existing.promptVersion === promptVersion &&
      existing.imageKey === liveItem.imageKey
    ) {
      continue;
    }

    // Reuse an already-enriched item with the exact same imageKey
    if (liveItem.imageKey) {
      const storedDonor = validByImageKey.get(liveItem.imageKey);
      if (storedDonor && storedDonor.ecometriId !== liveItem.ecometriId) {
        reusable.set(liveItem.ecometriId, storedDonor.ecometriId);
        continue;
      }

      // Deduplicate within the same dirty batch if two new records share an imageKey
      const batchDonorId = firstDirtyByImageKey.get(liveItem.imageKey);
      if (batchDonorId && batchDonorId !== liveItem.ecometriId) {
        reusable.set(liveItem.ecometriId, batchDonorId);
        continue;
      }

      firstDirtyByImageKey.set(liveItem.imageKey, liveItem.ecometriId);
    }

    dirty.push(liveItem);
  }

  const removed: string[] = [];
  for (const item of stored) {
    if (!liveIds.has(item.ecometriId)) {
      removed.push(item.ecometriId);
    }
  }

  return { dirty, reusable, removed };
}
