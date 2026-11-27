import type { LiveProduct } from './types';

function compareTwinsPriority(a: LiveProduct, b: LiveProduct): number {
  const aActiveInStock = a.active && a.inStock ? 1 : 0;
  const bActiveInStock = b.active && b.inStock ? 1 : 0;
  if (aActiveInStock !== bActiveInStock) {
    return bActiveInStock - aActiveInStock;
  }

  const aActive = a.active ? 1 : 0;
  const bActive = b.active ? 1 : 0;
  if (aActive !== bActive) {
    return bActive - aActive;
  }

  const aStock = a.inStock ? 1 : 0;
  const bStock = b.inStock ? 1 : 0;
  if (aStock !== bStock) {
    return bStock - aStock;
  }

  return a.ecometriId.localeCompare(b.ecometriId);
}

/**
 * Deterministically picks the canonical winner among records sharing the same SKU:
 * prefers `inStock && active`, then `active`, then smallest `ecometriId`.
 */
export function resolveSkuTwins(candidates: LiveProduct[]): LiveProduct {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('resolveSkuTwins requires at least one candidate');
  }
  const sorted = [...candidates].sort(compareTwinsPriority);
  return sorted[0];
}

/**
 * Filters out out-of-stock ghost twins ONLY when an active in-stock twin with the
 * exact same SKU exists, while keeping all active in-stock variants intact.
 */
export function deduplicateGhostTwins(live: LiveProduct[]): LiveProduct[] {
  const bySku = new Map<string, LiveProduct[]>();
  const noSku: LiveProduct[] = [];

  for (const item of live) {
    const skuKey = (item.sku || '').trim();
    if (!skuKey) {
      noSku.push(item);
      continue;
    }
    const list = bySku.get(skuKey) || [];
    list.push(item);
    bySku.set(skuKey, list);
  }

  const keptIds = new Set<string>(noSku.map((x) => x.ecometriId));

  bySku.forEach((group) => {
    if (group.length === 1) {
      keptIds.add(group[0].ecometriId);
      return;
    }

    const activeInStock = group.filter((g) => g.active && g.inStock);
    if (activeInStock.length > 0) {
      for (const activeItem of activeInStock) {
        keptIds.add(activeItem.ecometriId);
      }
    } else {
      // All twins are out of stock: keep deterministic winner only
      const winner = resolveSkuTwins(group);
      keptIds.add(winner.ecometriId);
    }
  });

  return live.filter((item) => keptIds.has(item.ecometriId));
}
