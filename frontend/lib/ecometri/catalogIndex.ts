import { normalizeEcometriProduct } from './normalize';
import type { EcometriConfig, ProductDTO, VisualAnalysis } from './types';

export const CATALOG_INDEX_TTL_MS = 5 * 60_000;
export const CATALOG_INDEX_MAX_ITEMS = 1500;
export const CATALOG_FETCH_LIMIT = 1000;

export interface ScoredItem {
  item: ProductDTO;
  score: number;
}

const DOMAIN_STOPWORDS = new Set([
  'de',
  'del',
  'la',
  'las',
  'el',
  'los',
  'en',
  'con',
  'por',
  'para',
  'un',
  'una',
  'unos',
  'unas',
  'y',
  'o',
  'al',
  'se',
  'su',
  'sus',
  'mas',
  'sin',
  'tipo',
  'producto',
  'articulo',
  'unidad',
]);

// Broad category synonym clusters for Spanish wholesale catalogs so even when
// an exact item does not exist, rankSimilar recommends items from the closest family.
const CATEGORY_CLUSTERS: string[][] = [
  ['mouse', 'raton', 'teclado', 'pad', 'gamer', 'diadema', 'usb', 'hub', 'computador', 'laptop'],
  ['audifono', 'auricular', 'airpod', 'parlante', 'altavoz', 'bocina', 'microfono', 'audio', 'radio'],
  ['cargador', 'cable', 'adaptador', 'bateria', 'powerbank', 'magsafe', 'celular', 'iphone', 'android', 'forro', 'funda', 'vidrio', 'soporte', 'tripode', 'aro'],
  ['tensiometro', 'oximetro', 'termometro', 'bascula', 'pesa', 'masajeador', 'salud', 'ortopedico', 'faja', 'nebulizador'],
  ['plancha', 'secador', 'cepillo', 'depilador', 'afeitadora', 'patillera', 'maquina', 'rizador', 'belleza', 'facial', 'tonificador', 'espejo', 'maquillaje', 'unas'],
  ['termo', 'vaso', 'botella', 'tetera', 'pocillo', 'mug', 'jarra', 'lonchera'],
  ['licuadora', 'batidora', 'picatodo', 'freidora', 'olla', 'sarten', 'cuchillo', 'utensilio', 'cocina', 'cafetera', 'sanduchera', 'wafflera', 'exprimidor', 'gramera'],
  ['ventilador', 'humidificador', 'difusor', 'aromatizador', 'aire', 'purificador', 'lampara', 'bombillo', 'luz', 'panel', 'reflector', 'linterna', 'hogar', 'reloj', 'despertador', 'adorno', 'organizador'],
  ['taladro', 'destornillador', 'herramienta', 'llave', 'alicate', 'cinta', 'candado', 'bomba', 'compresor', 'carro', 'moto'],
  ['juguete', 'consola', 'videojuego', 'control', 'peluche', 'muneca', 'carro', 'dron', 'camara'],
];

export function normalizeTextToken(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function singularizeSpanish(word: string): string {
  if (word.length >= 6 && word.endsWith('es') && !word.endsWith('tes')) {
    return word.slice(0, -2);
  }
  if (word.length >= 5 && word.endsWith('s')) {
    return word.slice(0, -1);
  }
  return word;
}

export function tokenizeForScoring(text: string): string[] {
  const norm = normalizeTextToken(text);
  if (!norm) return [];
  const rawTokens = norm.split(' ');
  const out: string[] = [];
  for (const tok of rawTokens) {
    if (tok.length < 2 || DOMAIN_STOPWORDS.has(tok)) continue;
    out.push(singularizeSpanish(tok));
  }
  return out;
}

function isOneEditAway(a: string, b: string): boolean {
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

function expandCategorySiblings(tokens: string[]): Set<string> {
  const siblings = new Set<string>();
  for (const tok of tokens) {
    for (const cluster of CATEGORY_CLUSTERS) {
      if (cluster.some((c) => tok === c || (tok.length >= 5 && c.startsWith(tok.slice(0, 5))))) {
        for (const member of cluster) {
          siblings.add(member);
        }
      }
    }
  }
  return siblings;
}

/**
 * Pure, deterministic BM25-lite + stem + category-cluster ranker.
 * Guarantees up to `k` items whenever `index.length > 0` (tie-break: score desc -> inStock desc -> id asc).
 */
export function rankSimilar(
  analysis: VisualAnalysis,
  index: ProductDTO[],
  k: number
): ScoredItem[] {
  if (!Array.isArray(index) || index.length === 0 || k <= 0) return [];

  const primaryTokens = tokenizeForScoring(
    [analysis.label, ...analysis.exactTerms].join(' ')
  );
  const secondaryTokens = tokenizeForScoring(analysis.functionalTerms.join(' '));
  const rootTokens = analysis.broadRoots
    .map((r) => normalizeTextToken(r).replace(/\s+/g, ''))
    .filter((r) => r.length >= 4);

  const allQueryTokens = Array.from(new Set([...primaryTokens, ...secondaryTokens]));
  const categorySiblings = expandCategorySiblings(allQueryTokens);

  // Document frequencies for BM25-lite IDF weighting
  const docCount = index.length;
  const docFreq = new Map<string, number>();
  const preparedDocs = index.map((item) => {
    const searchable = `${item.title} ${item.sku || ''} ${(item.slug || '').replace(/-/g, ' ')}`;
    const docTokens = tokenizeForScoring(searchable);
    const unique = new Set(docTokens);
    unique.forEach((t) => docFreq.set(t, (docFreq.get(t) || 0) + 1));
    return { item, docTokens, normFull: normalizeTextToken(searchable) };
  });

  const avgDl =
    preparedDocs.reduce((acc, d) => acc + d.docTokens.length, 0) / Math.max(1, docCount);
  const k1 = 1.2;
  const b = 0.75;

  const primarySet = new Set(primaryTokens);

  const scored: ScoredItem[] = preparedDocs.map(({ item, docTokens, normFull }) => {
    let score = 0;
    const dl = docTokens.length || 1;

    // 1. BM25-lite over exact, singularized, and 1-edit typo matches
    for (const qTok of allQueryTokens) {
      const weight = primarySet.has(qTok) ? 3.0 : 1.5;
      let tf = 0;
      let fuzzyMatch = false;
      for (const dTok of docTokens) {
        if (dTok === qTok) {
          tf += 1;
        } else if (isOneEditAway(dTok, qTok)) {
          tf += 0.7;
          fuzzyMatch = true;
        } else if (qTok.length >= 5 && dTok.startsWith(qTok.slice(0, 5))) {
          tf += 0.55;
        }
      }

      if (tf > 0) {
        const df = docFreq.get(qTok) || (fuzzyMatch ? 2 : 1);
        const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5));
        const normTf = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (dl / Math.max(1, avgDl))));
        score += weight * idf * normTf;
      }
    }

    // 2. Broad roots substring bonus (catches split words like "tension metro")
    const compactFull = normFull.replace(/\s+/g, '');
    for (const root of rootTokens) {
      if (compactFull.includes(root)) {
        score += 1.2;
      }
    }

    // 3. Category sibling fallback bonus (so missing items still recommend closest family!)
    if (score === 0 && categorySiblings.size > 0) {
      for (const dTok of docTokens) {
        if (categorySiblings.has(dTok)) {
          score += 0.35;
        }
      }
    }

    return { item, score };
  });

  scored.sort((a, bItem) => {
    if (bItem.score !== a.score) {
      return bItem.score - a.score;
    }
    if (a.item.inStock !== bItem.item.inStock) {
      return a.item.inStock ? -1 : 1;
    }
    return a.item.id.localeCompare(bItem.item.id);
  });

  return scored.slice(0, k);
}

export function extractStoreSubdomain(storeBaseUrl: string): string | null {
  try {
    const parsed = new URL(storeBaseUrl.trim());
    if (parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase();
    if (!host.endsWith('.ecometri.shop')) return null;
    const sub = host.slice(0, -'.ecometri.shop'.length);
    if (!sub || !/^[a-z0-9-]+$/.test(sub)) return null;
    return sub;
  } catch {
    return null;
  }
}

export function truncateCatalogDeterministically(
  items: ProductDTO[],
  maxItems: number = CATALOG_INDEX_MAX_ITEMS
): ProductDTO[] {
  const copy = [...items];
  copy.sort((a, b) => {
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  return copy.slice(0, maxItems);
}

export interface CatalogIndexStore {
  getOrFetch(
    commerceId: string,
    cfg: EcometriConfig,
    signal: AbortSignal
  ): Promise<ProductDTO[] | null>;
}

export function createCatalogIndexStore(options?: {
  fetchFn?: typeof fetch;
  nowFn?: () => number;
  ttlMs?: number;
  maxItems?: number;
}): CatalogIndexStore {
  const fetchFn = options?.fetchFn ?? fetch;
  const nowFn = options?.nowFn ?? (() => Date.now());
  const ttlMs = options?.ttlMs ?? CATALOG_INDEX_TTL_MS;
  const maxItems = options?.maxItems ?? CATALOG_INDEX_MAX_ITEMS;

  const cache = new Map<string, { items: ProductDTO[]; expiresAt: number }>();
  const inFlight = new Map<string, Promise<ProductDTO[] | null>>();

  return {
    async getOrFetch(
      commerceId: string,
      cfg: EcometriConfig,
      signal: AbortSignal
    ): Promise<ProductDTO[] | null> {
      const now = nowFn();
      const existing = cache.get(commerceId);
      if (existing && existing.expiresAt > now) {
        return existing.items;
      }

      const pending = inFlight.get(commerceId);
      if (pending) {
        return pending;
      }

      const subdomain = extractStoreSubdomain(cfg.storeBaseUrl);
      if (!subdomain) return null;

      const task = (async (): Promise<ProductDTO[] | null> => {
        try {
          const url = `https://apiv2.ecometri.shop/api/v1/store/${encodeURIComponent(
            subdomain
          )}/products?limit=${CATALOG_FETCH_LIMIT}&offset=0`;

          const resp = await fetchFn(url, {
            method: 'GET',
            signal,
            redirect: 'error',
            headers: { Accept: 'application/json' },
          });

          if (!resp.ok) return existing ? existing.items : null;

          const data = (await resp.json()) as { products?: unknown[] };
          const rawProducts = Array.isArray(data?.products)
            ? data.products
            : Array.isArray(data)
              ? data
              : null;

          if (!rawProducts) return existing ? existing.items : null;

          const seen = new Set<string>();
          const normalized: ProductDTO[] = [];
          for (const raw of rawProducts) {
            const dto = normalizeEcometriProduct(raw, cfg);
            if (dto && !seen.has(dto.id)) {
              seen.add(dto.id);
              normalized.push(dto);
            }
          }

          const truncated = truncateCatalogDeterministically(normalized, maxItems);
          cache.set(commerceId, {
            items: truncated,
            expiresAt: nowFn() + ttlMs,
          });
          return truncated;
        } catch {
          return existing ? existing.items : null;
        } finally {
          inFlight.delete(commerceId);
        }
      })();

      inFlight.set(commerceId, task);
      return task;
    },
  };
}
