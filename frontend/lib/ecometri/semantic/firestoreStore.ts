import {
  SEMANTIC_SCHEMA_VERSION,
  type SemanticMeta,
  type SemanticShard,
  type SemanticStore,
} from './types';

function makeShardDocId(gen: number, index: number): string {
  return `gen_${gen}_shard_${index}`;
}

export interface FirestoreDocSnapLike {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface FirestoreDocRefLike {
  get(): Promise<FirestoreDocSnapLike>;
  set(data: unknown): Promise<unknown>;
  delete(): Promise<unknown>;
}

export interface FirestoreTransactionLike {
  get(ref: FirestoreDocRefLike): Promise<FirestoreDocSnapLike>;
  set(ref: FirestoreDocRefLike, data: unknown, options?: { merge?: boolean }): unknown;
}

export interface FirestoreDbLike {
  collection(path: string): {
    doc(id: string): {
      collection(sub: string): {
        doc(docId: string): FirestoreDocRefLike;
      };
    };
  };
  runTransaction<T>(updateFn: (tx: FirestoreTransactionLike) => Promise<T>): Promise<T>;
}

/**
 * Production Firestore adapter for `comercios/{commerceId}/semantic_index/{meta | gen_N_shard_i}`.
 * - Uses Firestore transactions on `meta` for optimistic mutual-exclusion locking (`lockedUntil`).
 * - Writes all `gen_N_shard_i` documents BEFORE updating `meta` in a single atomic flip.
 * - Cleans up previous generation's shard documents best-effort after the flip.
 */
export class FirestoreSemanticStore implements SemanticStore {
  private readonly commerceId: string;
  private firestore: FirestoreDbLike | null | undefined;

  constructor(commerceId: string, firestoreInstance?: FirestoreDbLike | null) {
    this.commerceId = commerceId;
    this.firestore = firestoreInstance;
  }

  private async resolveFirestore(): Promise<FirestoreDbLike> {
    if (this.firestore === undefined) {
      const mod = await import('../../firebaseAdmin');
      this.firestore = (mod.db as unknown as FirestoreDbLike | null) ?? null;
    }
    if (!this.firestore) {
      throw new Error('FIRESTORE_UNAVAILABLE');
    }
    return this.firestore;
  }

  private async getDocRef(docId: string): Promise<FirestoreDocRefLike> {
    const fsDb = await this.resolveFirestore();
    return fsDb
      .collection('comercios')
      .doc(this.commerceId)
      .collection('semantic_index')
      .doc(docId);
  }

  async readMeta(): Promise<SemanticMeta | null> {
    const ref = await this.getDocRef('meta');
    const snap = await ref.get();
    if (!snap.exists) return null;
    const data = snap.data();
    if (!data || typeof data.gen !== 'number') return null;
    return data as unknown as SemanticMeta;
  }

  async readShards(gen: number, shardCount: number): Promise<SemanticShard[]> {
    if (gen <= 0 || shardCount <= 0) return [];
    const refs = await Promise.all(
      Array.from({ length: shardCount }, (_, idx) =>
        this.getDocRef(makeShardDocId(gen, idx))
      )
    );
    const snaps = await Promise.all(refs.map((r) => r.get()));
    const shards: SemanticShard[] = [];
    for (let i = 0; i < snaps.length; i++) {
      if (!snaps[i].exists) {
        throw new Error(`MISSING_FIRESTORE_SHARD_GEN_${gen}_IDX_${i}`);
      }
      const raw = snaps[i].data() as unknown as SemanticShard | undefined;
      if (!raw || raw.gen !== gen || !Array.isArray(raw.items)) {
        throw new Error(`CORRUPT_FIRESTORE_SHARD_GEN_${gen}_IDX_${i}`);
      }
      shards.push(raw);
    }
    return shards;
  }

  async writeGeneration(
    nextGen: number,
    shards: SemanticShard[],
    meta: SemanticMeta
  ): Promise<void> {
    const prevMeta = await this.readMeta();

    // 1. Persist all shards of `nextGen` BEFORE flipping `meta`
    await Promise.all(
      shards.map(async (shard) => {
        const ref = await this.getDocRef(makeShardDocId(nextGen, shard.index));
        await ref.set({
          gen: nextGen,
          index: shard.index,
          items: shard.items,
        });
      })
    );

    // 2. Single atomic `meta` document flip pointing readers to `nextGen`
    const finalMeta: SemanticMeta = {
      ...meta,
      gen: nextGen,
      shardCount: shards.length,
    };
    const metaRef = await this.getDocRef('meta');
    await metaRef.set(finalMeta);

    // 3. Best-effort deletion of orphan shards from previous generation
    if (prevMeta && prevMeta.gen > 0 && prevMeta.gen !== nextGen && prevMeta.shardCount > 0) {
      const deletions = Array.from({ length: prevMeta.shardCount }, async (_, idx) => {
        const oldRef = await this.getDocRef(makeShardDocId(prevMeta.gen, idx));
        await oldRef.delete().catch(() => undefined);
      });
      await Promise.all(deletions);
    }
  }

  async acquireLock(ownerId: string, ttlMs: number, nowIso: string): Promise<boolean> {
    const fsDb = await this.resolveFirestore();
    const metaRef = await this.getDocRef('meta');
    const nowMs = Date.parse(nowIso);
    const nextLockedUntil = new Date(nowMs + ttlMs).toISOString();

    return fsDb.runTransaction(async (tx) => {
      const snap = await tx.get(metaRef);
      if (snap.exists) {
        const current = snap.data() as unknown as Partial<SemanticMeta> | undefined;
        if (current?.lockedUntil) {
          const lockedMs = Date.parse(current.lockedUntil);
          if (
            Number.isFinite(lockedMs) &&
            lockedMs > nowMs &&
            current.lockOwner !== ownerId
          ) {
            return false;
          }
        }
        tx.set(
          metaRef,
          {
            ...current,
            lockedUntil: nextLockedUntil,
            lockOwner: ownerId,
          },
          { merge: true }
        );
        return true;
      }

      const bootstrapMeta: SemanticMeta = {
        schemaVersion: SEMANTIC_SCHEMA_VERSION,
        promptVersion: '',
        gen: 0,
        shardCount: 0,
        itemCount: 0,
        generatedAt: nowIso,
        shardHashes: [],
        lockedUntil: nextLockedUntil,
        lockOwner: ownerId,
      };
      tx.set(metaRef, bootstrapMeta);
      return true;
    });
  }

  async releaseLock(ownerId: string): Promise<void> {
    let fsDb: FirestoreDbLike;
    try {
      fsDb = await this.resolveFirestore();
    } catch {
      return;
    }
    const metaRef = await this.getDocRef('meta');
    await fsDb
      .runTransaction(async (tx) => {
        const snap = await tx.get(metaRef);
        if (!snap.exists) return;
        const current = snap.data() as unknown as Partial<SemanticMeta> | undefined;
        if (!current?.lockOwner || current.lockOwner === ownerId) {
          tx.set(
            metaRef,
            {
              lockedUntil: null,
              lockOwner: null,
            },
            { merge: true }
          );
        }
      })
      .catch(() => undefined);
  }
}
