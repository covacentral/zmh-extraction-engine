import crypto from 'crypto';
import type { ResolvedCommerce } from '../../commerceResolver';
import { createHttpGeminiClient, type GeminiClient } from '../geminiClient';
import {
  createRateLimiter,
  DEFAULT_ENRICH_RPM,
  MAX_ENRICH_BATCH_SIZE,
  type RateLimiter,
} from './enrichBatch';
import { FirestoreSemanticStore } from './firestoreStore';
import { clearDefaultSemanticIndexCache } from './loadIndex';
import {
  fetchLiveCatalogForSync,
  runCatalogEnrichmentSync,
} from './syncCore';
import type { LiveProduct, SemanticStore } from './types';
import type { EcometriConfig } from '../types';

export const MAX_SYNC_ITEMS_PER_RUN = 24;
export const SYNC_BUDGET_MS = 45_000;
export const SYNC_LOCK_TTL_MS = 90_000;

export interface SyncResponseBody {
  processed: number;
  reused: number;
  failed: number;
  removed: number;
  backlog: number;
  gen: number;
  semanticIndexEnabled?: boolean;
}

export interface SyncRequestInput {
  authorizationHeader: string | null;
  commerce: string | null;
  enableSemantic?: boolean | null;
}

export interface SyncHandlerResult {
  status: number;
  body: SyncResponseBody | { error: string };
}

/**
 * Constant-time bearer secret verification (D8).
 * Hashes both inputs with SHA-256 before `timingSafeEqual` so neither content
 * nor secret length can leak via timing side-channels.
 */
export function verifyBearerSecretConstantTime(
  authorizationHeader: string | null | undefined,
  expectedSecret: string | null | undefined
): boolean {
  const secret = typeof expectedSecret === 'string' ? expectedSecret.trim() : '';
  if (!secret || typeof authorizationHeader !== 'string') {
    return false;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) return false;
  const provided = match[1].trim();
  if (!provided) return false;

  const hashProvided = crypto.createHash('sha256').update(provided, 'utf8').digest();
  const hashExpected = crypto.createHash('sha256').update(secret, 'utf8').digest();
  return crypto.timingSafeEqual(hashProvided, hashExpected);
}

export interface SyncHandlerDeps {
  getCronSecret?: () => string | undefined;
  resolveCommerceFn: (slugOrAlias: string) => Promise<ResolvedCommerce | null>;
  semanticStoreFactory?: (commerceId: string) => SemanticStore;
  geminiClientFactory?: () => GeminiClient | null;
  limiterFactory?: () => RateLimiter;
  fetchLiveCatalogFn?: (
    cfg: EcometriConfig,
    fetchFn: typeof fetch,
    signal?: AbortSignal
  ) => Promise<LiveProduct[]>;
  fetchFn?: typeof fetch;
  nowFn?: () => number;
  sleepFn?: (ms: number, signal?: AbortSignal) => Promise<void>;
  updateSemanticFlagFn?: (commerceId: string, enabled: boolean) => Promise<void>;
  maxItemsPerRun?: number;
  budgetMs?: number;
  lockTtlMs?: number;
}

async function defaultUpdateSemanticFlag(
  commerceId: string,
  enabled: boolean
): Promise<void> {
  const { db } = await import('../../firebaseAdmin');
  if (!db) throw new Error('FIRESTORE_UNAVAILABLE');
  await db
    .collection('comercios')
    .doc(commerceId)
    .set({ ecometri: { semanticIndexEnabled: enabled } }, { merge: true });
}

export function createEcometriSyncHandler({
  getCronSecret = () => process.env.CRON_SECRET,
  resolveCommerceFn,
  semanticStoreFactory = (id) => new FirestoreSemanticStore(id),
  geminiClientFactory = () => {
    const key = (process.env.GEMINI_API_KEY || '').trim();
    return key ? createHttpGeminiClient(key) : null;
  },
  limiterFactory = () => createRateLimiter(DEFAULT_ENRICH_RPM),
  fetchLiveCatalogFn = fetchLiveCatalogForSync,
  fetchFn = fetch,
  nowFn = () => Date.now(),
  sleepFn,
  updateSemanticFlagFn = defaultUpdateSemanticFlag,
  maxItemsPerRun = MAX_SYNC_ITEMS_PER_RUN,
  budgetMs = SYNC_BUDGET_MS,
  lockTtlMs = SYNC_LOCK_TTL_MS,
}: SyncHandlerDeps) {
  return async function executeSync(
    input: SyncRequestInput
  ): Promise<SyncHandlerResult> {
    // 1. Constant-time auth gate BEFORE touching Firestore, Ecometri, or Gemini (401 leaks zero info)
    if (!verifyBearerSecretConstantTime(input.authorizationHeader, getCronSecret())) {
      return {
        status: 401,
        body: { error: 'No autorizado.' },
      };
    }

    const commerceParam = (input.commerce || '').trim();
    if (!commerceParam || commerceParam.length > 128) {
      return {
        status: 400,
        body: { error: 'Parametro commerce requerido.' },
      };
    }

    const resolved = await resolveCommerceFn(commerceParam);
    const cfg = resolved?.data?.ecometri;
    if (
      !resolved ||
      !cfg ||
      cfg.enabled !== true ||
      typeof cfg.storeBaseUrl !== 'string' ||
      !cfg.storeBaseUrl.trim() ||
      typeof cfg.allowedImageHost !== 'string' ||
      !cfg.allowedImageHost.trim()
    ) {
      return {
        status: 404,
        body: { error: 'Comercio no habilitado para sincronizacion.' },
      };
    }

    // Immediate authenticated emergency rollback without invoking Gemini (`enableSemantic === false`)
    if (input.enableSemantic === false) {
      await updateSemanticFlagFn(resolved.commerceId, false);
      clearDefaultSemanticIndexCache(resolved.commerceId);
      return {
        status: 200,
        body: {
          processed: 0,
          reused: 0,
          failed: 0,
          removed: 0,
          backlog: 0,
          gen: 0,
          semanticIndexEnabled: false,
        },
      };
    }

    const geminiClient = geminiClientFactory();
    if (!geminiClient) {
      return {
        status: 503,
        body: { error: 'Cliente de enriquecimiento IA no configurado.' },
      };
    }

    const store = semanticStoreFactory(resolved.commerceId);
    const ownerId = `sync-${nowFn()}-${crypto.randomBytes(4).toString('hex')}`;
    const nowIso = new Date(nowFn()).toISOString();

    let lockAcquired = false;
    try {
      lockAcquired = await store.acquireLock(ownerId, lockTtlMs, nowIso);
    } catch {
      return {
        status: 503,
        body: { error: 'Almacen de indice semantico no disponible.' },
      };
    }

    if (!lockAcquired) {
      return {
        status: 409,
        body: { error: 'Sincronizacion en curso para este comercio.' },
      };
    }

    try {
      const feedController = new AbortController();
      const feedTimer = setTimeout(
        () => feedController.abort(),
        Math.min(10_000, budgetMs)
      );
      let liveProducts: LiveProduct[];
      try {
        liveProducts = await fetchLiveCatalogFn(cfg, fetchFn, feedController.signal);
      } finally {
        clearTimeout(feedTimer);
      }

      const summary = await runCatalogEnrichmentSync({
        cfg,
        liveProducts,
        store,
        geminiClient,
        limiter: limiterFactory(),
        batchSize: MAX_ENRICH_BATCH_SIZE,
        maxVisionItems: maxItemsPerRun,
        budgetMs,
        dryRun: false,
        now: nowFn,
        fetchFn,
        sleep: sleepFn,
      });

      clearDefaultSemanticIndexCache(resolved.commerceId);

      const responseBody: SyncResponseBody = {
        processed: summary.processed,
        reused: summary.reused,
        failed: summary.failed,
        removed: summary.removed,
        backlog: summary.backlog,
        gen: summary.gen,
      };

      if (input.enableSemantic === true && summary.backlog === 0 && summary.gen > 0) {
        await updateSemanticFlagFn(resolved.commerceId, true);
        responseBody.semanticIndexEnabled = true;
      }

      return {
        status: 200,
        body: responseBody,
      };
    } catch {
      return {
        status: 502,
        body: { error: 'Fallo durante la sincronizacion incremental.' },
      };
    } finally {
      await store.releaseLock(ownerId).catch(() => undefined);
    }
  };
}
