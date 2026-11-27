import {
  normalizeTextToken,
  rankSimilar,
  singularizeSpanish,
  tokenizeForScoring,
  type ScoredItem,
} from '../catalogIndex';
import type { ProductDTO, VisualAnalysis } from '../types';
import { extractImageKey } from './imageKey';
import { canonicalizeModelCode } from './parseEnrichment';
import { deduplicateGhostTwins } from './twins';
import type { EnrichedProduct, LiveProduct, SemanticIndex } from './types';

export function toLiveProduct(dto: ProductDTO): LiveProduct {
  return {
    ...dto,
    ecometriId: dto.id,
    imageKey: extractImageKey(dto.imageUrl),
    active: true,
  };
}

export function toPublicProductDTO(enriched: EnrichedProduct): ProductDTO {
  const dto: ProductDTO = {
    id: enriched.id,
    slug: enriched.slug,
    title: enriched.title,
    sku: enriched.sku,
    priceCop: enriched.priceCop,
    inStock: enriched.inStock,
    imageUrl: enriched.imageUrl,
    description: enriched.description,
    productUrl: enriched.productUrl,
  };

  if (enriched.displayTitle !== undefined) {
    dto.displayTitle = enriched.displayTitle;
  }
  if (enriched.descriptionSource !== undefined) {
    dto.descriptionSource = enriched.descriptionSource;
  }
  if (enriched.attributes !== undefined) {
    dto.attributes = enriched.attributes;
  }
  if (enriched.matchType !== undefined) {
    dto.matchType = enriched.matchType;
  }
  return dto;
}

/**
 * Joins live Ecometri catalog items (`priceCop`, `inStock`, `title`, `slug`) with slow
 * AI-curated semantic metadata (`displayTitle`, `visualSummary`, `attributes`, `keywords`).
 * - Resolves duplicate SKU ghost twins first via `deduplicateGhostTwins`.
 * - NEVER overwrites `title`, `priceCop`, or `inStock` from the semantic index (D1 + adr-f763cc01).
 */
export function mergeLiveAndSemantic(
  live: LiveProduct[],
  index: SemanticIndex | null,
  options?: { deduplicateTwins?: boolean }
): EnrichedProduct[] {
  const dedupedLive =
    options?.deduplicateTwins === false ? live : deduplicateGhostTwins(live);
  if (!index) {
    return dedupedLive.map((item) => ({
      ...item,
      displayTitle: item.displayTitle || item.title,
      semantic: null,
    }));
  }

  return dedupedLive.map((item): EnrichedProduct => {
    const sem = index.byId.get(item.ecometriId);
    if (!sem || sem.status !== 'ok') {
      return {
        ...item,
        displayTitle: item.displayTitle || item.title,
        semantic: null,
      };
    }

    const hasLiveDescription = Boolean(item.description && item.description.trim());
    const description = hasLiveDescription
      ? item.description
      : sem.visualSummary || null;
    const descriptionSource = hasLiveDescription
      ? 'ecometri'
      : sem.visualSummary
        ? 'ai'
        : undefined;

    const hasAttributes = Boolean(
      sem.brand || sem.modelRef || (sem.colors && sem.colors.length > 0)
    );

    return {
      ...item,
      // Live truth strictly preserved:
      title: item.title,
      priceCop: item.priceCop,
      inStock: item.inStock,
      sku: item.sku || sem.sku || null,
      // Additive curated layer:
      displayTitle: sem.displayTitle || item.title,
      description,
      descriptionSource,
      attributes: hasAttributes
        ? {
            brand: sem.brand,
            modelRef: sem.modelRef,
            colors: [...sem.colors],
          }
        : undefined,
      semantic: sem,
    };
  });
}

function isOneEditDistance(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      edits++;
      if (edits > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else {
        i++;
        j++;
      }
    }
  }
  if (i < a.length || j < b.length) edits++;
  return edits <= 1;
}

function scoreTokensAgainstField(
  queryTokens: string[],
  compactQuery: string,
  fieldText: string,
  fieldWeight: number
): { score: number; matchedTokens: Set<string> } {
  const matchedTokens = new Set<string>();
  const normField = normalizeTextToken(fieldText);
  if (!normField) return { score: 0, matchedTokens };

  const fieldTokens = normField
    .split(' ')
    .filter((t) => t.length >= 2)
    .map(singularizeSpanish);
  const compactField = normField.replace(/\s+/g, '');

  let score = 0;

  // Compound match (e.g. query "powerbank" vs field "power bank")
  if (compactQuery.length >= 4 && compactField.includes(compactQuery)) {
    score += fieldWeight * 1.35;
    queryTokens.forEach((qt) => matchedTokens.add(qt));
  }

  for (const qTok of queryTokens) {
    let bestFactor = 0;
    for (const fTok of fieldTokens) {
      if (fTok === qTok) {
        bestFactor = Math.max(bestFactor, 1.0);
      } else if (qTok.length >= 4 && fTok.startsWith(qTok)) {
        bestFactor = Math.max(bestFactor, 0.8);
      } else if (isOneEditDistance(fTok, qTok)) {
        bestFactor = Math.max(bestFactor, 0.72);
      }
    }
    if (bestFactor > 0) {
      score += fieldWeight * bestFactor;
      matchedTokens.add(qTok);
    }
  }

  return { score, matchedTokens };
}

/**
 * Deterministic multi-field text, modelRef & SKU scorer (D10 + v3.0 ADR):
 * Fixed hierarchy:
 *   SKU exact (10,000) > modelRef exact >=4 chars (1,200) > SKU prefix (900) > weighted fields.
 */
export function scoreTextQuery(term: string, p: EnrichedProduct): number {
  const rawTrimmed = (term || '').trim();
  if (!rawTrimmed) return 0;

  const qCompactRaw = rawTrimmed.toLowerCase();
  const skuNorm = (p.sku || '').trim().toLowerCase();
  const sem = p.semantic && p.semantic.status === 'ok' ? p.semantic : null;

  // 1. Exact SKU match (maximum priority: 10,000)
  if (skuNorm) {
    if (/^\d{3,}$/.test(qCompactRaw) && skuNorm === qCompactRaw) {
      return 10_000;
    }
    if (qCompactRaw.length >= 3 && skuNorm === qCompactRaw) {
      return 10_000;
    }
  }

  // 2. Exact canonical `modelRef` match (minimum 4 alphanumeric chars, symmetric normalization -> 1,200)
  const canonicalItemModel = sem?.modelRef ? canonicalizeModelCode(sem.modelRef) : '';
  let modelRefExactBoost = 0;
  if (canonicalItemModel.length >= 4) {
    const fullQueryModel = canonicalizeModelCode(rawTrimmed);
    if (fullQueryModel === canonicalItemModel) {
      return 1_200;
    }
    const rawParts = rawTrimmed
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    for (let i = 0; i < rawParts.length; i++) {
      const singlePart = canonicalizeModelCode(rawParts[i]);
      if (singlePart.length >= 4 && singlePart === canonicalItemModel) {
        modelRefExactBoost = 1_200;
        break;
      }
      if (i + 1 < rawParts.length) {
        const joinedPair = canonicalizeModelCode(`${rawParts[i]}${rawParts[i + 1]}`);
        if (joinedPair.length >= 4 && joinedPair === canonicalItemModel) {
          modelRefExactBoost = 1_200;
          break;
        }
      }
    }
  }

  // 3. Prefix / substring numeric SKU match (900 / 600, strictly below modelRef exact 1,200)
  if (skuNorm && /^\d{3,}$/.test(qCompactRaw)) {
    if (skuNorm.startsWith(qCompactRaw)) return Math.max(modelRefExactBoost, 900);
    if (skuNorm.includes(qCompactRaw)) return Math.max(modelRefExactBoost, 600);
  }

  // 4. Normalized tokenization across live & semantic fields (tolerating mixed v2/v3 items)
  const normQuery = normalizeTextToken(rawTrimmed);
  if (!normQuery) return modelRefExactBoost;

  let queryTokens = tokenizeForScoring(rawTrimmed);
  if (queryTokens.length === 0) {
    queryTokens = normQuery
      .split(' ')
      .filter((t) => t.length >= 2)
      .map(singularizeSpanish);
  }
  if (queryTokens.length === 0) return modelRefExactBoost;

  const compactQuery = normQuery.replace(/\s+/g, '');

  const weightedFields: Array<[string, number]> = [
    [p.title, 40],
    [sem?.displayTitle || '', 36],
    [sem?.article || '', 34],
    [sem?.modelRef || '', 32],
    [sem?.brand || '', 30],
    [(sem?.keywords || []).join(' '), 24],
    [(sem?.colors || []).join(' '), 16],
  ];

  let totalScore = modelRefExactBoost;
  const globalMatched = new Set<string>();

  for (const [text, weight] of weightedFields) {
    if (!text) continue;
    const res = scoreTokensAgainstField(queryTokens, compactQuery, text, weight);
    totalScore += res.score;
    res.matchedTokens.forEach((t) => globalMatched.add(t));
  }

  if (totalScore === 0 || (globalMatched.size === 0 && modelRefExactBoost === 0)) {
    return 0;
  }

  // Multi-token coverage bonus so matching all query words beats matching just one word
  const coverageRatio = globalMatched.size / queryTokens.length;
  totalScore += globalMatched.size * 30 * coverageRatio;

  return Math.round(totalScore * 100) / 100;
}

/**
 * Stage 1 candidate ranker for Visual Search enhanced with `SemanticIndex` (D11).
 * Degrades identically to `rankSimilar` when `semanticIndex` is null, and guarantees
 * up to `k` items whenever `liveItems.length > 0` (adr-26fe41b4).
 */
export function rankVisualWithSemantics(
  analysis: VisualAnalysis,
  liveItems: ProductDTO[],
  semanticIndex: SemanticIndex | null,
  k: number
): ScoredItem[] {
  if (!Array.isArray(liveItems) || liveItems.length === 0 || k <= 0) return [];

  if (!semanticIndex || semanticIndex.byId.size === 0) {
    return rankSimilar(analysis, liveItems, k);
  }

  const enriched = mergeLiveAndSemantic(liveItems.map(toLiveProduct), semanticIndex);
  const enrichedById = new Map<string, EnrichedProduct>(
    enriched.map((e) => [e.id, e])
  );

  // Build synthetic searchable DTOs carrying semantic fields in `title` ONLY for `rankSimilar`
  // BM25-lite + category-cluster fallback, then map back to clean `toPublicProductDTO`.
  const syntheticDtos: ProductDTO[] = enriched.map((e) => {
    const sem = e.semantic;
    const semanticText = sem
      ? [
          e.title,
          sem.displayTitle,
          sem.article,
          sem.brand || '',
          sem.modelRef || '',
          ...sem.colors,
          ...sem.keywords,
        ]
          .filter(Boolean)
          .join(' ')
      : e.title;
    return {
      ...toPublicProductDTO(e),
      title: semanticText,
    };
  });

  const baseRanked = rankSimilar(analysis, syntheticDtos, enriched.length);

  // Add direct weighted boost from primary visual terms (including extracted brand & modelRef!)
  const primaryQuery = [analysis.label, ...analysis.exactTerms.slice(0, 5)]
    .filter(Boolean)
    .join(' ');

  const combined: ScoredItem[] = baseRanked.map(({ item: syn, score: bm25Score }) => {
    const orig = enrichedById.get(syn.id)!;
    const directScore = primaryQuery ? scoreTextQuery(primaryQuery, orig) : 0;
    const directBoost = directScore >= 1_200 ? 120 + directScore * 0.05 : directScore * 0.05;
    return {
      item: toPublicProductDTO(orig),
      score: bm25Score + directBoost,
    };
  });

  combined.sort((a, bItem) => {
    if (bItem.score !== a.score) return bItem.score - a.score;
    if (a.item.inStock !== bItem.item.inStock) return a.item.inStock ? -1 : 1;
    return a.item.id.localeCompare(bItem.item.id);
  });

  return combined.slice(0, k);
}
