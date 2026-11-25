import { db } from './firebaseAdmin';

export interface ResolvedCommerce {
  commerceId: string;
  data: any;
  isAlias: boolean;
}

const CACHE_TTL_MS = 30_000;
const commerceCache = new Map<string, { value: ResolvedCommerce | null; expiresAt: number }>();

/**
 * Resolves a commerce either by its primary document ID or by any of its configured aliases / URL masks.
 * Deduplicated with a 30s in-memory cache so layout metadata and page share a single Firestore read.
 * Example: 'cc-bodega-mayorista', 'ccbm', 'bodega' -> all resolve to 'cc-bodega-mayorista'
 */
export async function resolveCommerce(slugOrAlias: string): Promise<ResolvedCommerce | null> {
  if (!db || !slugOrAlias || typeof slugOrAlias !== 'string') return null;
  const clean = slugOrAlias.toLowerCase().trim().replace(/^\/+/, '');

  if (!clean) return null;

  const now = Date.now();
  const cached = commerceCache.get(clean);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    // 1. Direct document ID lookup (<20ms)
    const directRef = db.collection('comercios').doc(clean);
    const directDoc = await directRef.get();
    if (directDoc.exists) {
      const result: ResolvedCommerce = {
        commerceId: directDoc.id,
        data: directDoc.data() || {},
        isAlias: false,
      };
      commerceCache.set(clean, { value: result, expiresAt: now + CACHE_TTL_MS });
      return result;
    }

    // 2. Lookup by configured URL masks / aliases array
    const aliasQuery = await db
      .collection('comercios')
      .where('aliases', 'array-contains', clean)
      .limit(1)
      .get();

    if (!aliasQuery.empty) {
      const matchDoc = aliasQuery.docs[0];
      const result: ResolvedCommerce = {
        commerceId: matchDoc.id,
        data: matchDoc.data() || {},
        isAlias: true,
      };
      commerceCache.set(clean, { value: result, expiresAt: now + CACHE_TTL_MS });
      return result;
    }
  } catch (err: any) {
    console.warn('[Commerce Resolver Warning]', err.message);
  }

  return null;
}
