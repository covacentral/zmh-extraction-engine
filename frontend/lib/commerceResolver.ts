import { db } from './firebaseAdmin';

export interface ResolvedCommerce {
  commerceId: string;
  data: any;
  isAlias: boolean;
}

/**
 * Resolves a commerce either by its primary document ID or by any of its configured aliases / URL masks.
 * Example: 'cc-bodega-mayorista', 'ccbm', 'bodega' -> all resolve to 'cc-bodega-mayorista'
 */
export async function resolveCommerce(slugOrAlias: string): Promise<ResolvedCommerce | null> {
  if (!db || !slugOrAlias || typeof slugOrAlias !== 'string') return null;
  const clean = slugOrAlias.toLowerCase().trim().replace(/^\/+/, '');

  if (!clean) return null;

  try {
    // 1. Direct document ID lookup (<20ms)
    const directRef = db.collection('comercios').doc(clean);
    const directDoc = await directRef.get();
    if (directDoc.exists) {
      return {
        commerceId: directDoc.id,
        data: directDoc.data() || {},
        isAlias: false,
      };
    }

    // 2. Lookup by configured URL masks / aliases array
    const aliasQuery = await db
      .collection('comercios')
      .where('aliases', 'array-contains', clean)
      .limit(1)
      .get();

    if (!aliasQuery.empty) {
      const matchDoc = aliasQuery.docs[0];
      return {
        commerceId: matchDoc.id,
        data: matchDoc.data() || {},
        isAlias: true,
      };
    }
  } catch (err: any) {
    console.warn('[Commerce Resolver Warning]', err.message);
  }

  return null;
}
