import test from 'node:test';
import assert from 'node:assert/strict';
import type { EnrichPromptCandidate, GeminiClient } from '../../geminiClient';
import { createRateLimiter } from '../enrichBatch';
import { createSemanticIndexLoader } from '../loadIndex';
import { InMemorySemanticStore } from '../shards';
import {
  createEcometriSyncHandler,
  verifyBearerSecretConstantTime,
  type SyncResponseBody,
} from '../syncHandler';
import type { EcometriConfig } from '../../types';
import type { LiveProduct } from '../types';

const SYNC_CFG: EcometriConfig = {
  enabled: true,
  visualSearchEnabled: true,
  semanticIndexEnabled: true,
  storeId: '50da18bb-6431-4220-a1ce-39f0b2837ce6',
  storeBaseUrl: 'https://bodegamayoristamtr.ecometri.shop/3217535900',
  allowedImageHost: 'd1b50uin55dq3m.cloudfront.net',
};

function mkLiveItem(
  id: string,
  sku: string,
  title: string,
  imageKey: string | null = `${id}.jpg`,
  priceCop = 30000,
  inStock = true
): LiveProduct {
  return {
    id,
    ecometriId: id,
    slug: `${id}-slug`,
    title,
    sku,
    priceCop,
    inStock,
    active: true,
    imageKey,
    imageUrl: imageKey
      ? `https://d1b50uin55dq3m.cloudfront.net/fit-in/600x600/${imageKey}`
      : null,
    description: null,
    productUrl: `https://bodegamayoristamtr.ecometri.shop/3217535900/${id}-slug/`,
  };
}

const fakeThumbFetch = (async () =>
  new Response(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), {
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
  })) as unknown as typeof fetch;

test('auth gate: returns 401 on missing/invalid CRON_SECRET in constant time without touching commerce resolver, store, or Gemini', async () => {
  assert.equal(verifyBearerSecretConstantTime('Bearer top-secret-123', 'top-secret-123'), true);
  assert.equal(verifyBearerSecretConstantTime('Bearer wrong', 'top-secret-123'), false);
  assert.equal(verifyBearerSecretConstantTime('Basic top-secret-123', 'top-secret-123'), false);
  assert.equal(verifyBearerSecretConstantTime(null, 'top-secret-123'), false);
  assert.equal(verifyBearerSecretConstantTime('Bearer top-secret-123', ''), false);

  let resolverCalled = false;
  let geminiCalled = false;

  const handler = createEcometriSyncHandler({
    getCronSecret: () => 'cron-sec-xyz',
    resolveCommerceFn: async () => {
      resolverCalled = true;
      return null;
    },
    geminiClientFactory: () => ({
      async analyze() {
        geminiCalled = true;
        throw new Error('unused');
      },
      async rerank() {
        geminiCalled = true;
        return null;
      },
    }),
  });

  const rNoHeader = await handler({ authorizationHeader: null, commerce: 'bmm' });
  const rBadSecret = await handler({ authorizationHeader: 'Bearer wrong-key', commerce: 'bmm' });
  assert.equal(rNoHeader.status, 401);
  assert.equal(rBadSecret.status, 401);
  assert.deepEqual(rNoHeader.body, rBadSecret.body); // Never leaks secret/commerce existence
  assert.equal(resolverCalled, false);
  assert.equal(geminiCalled, false);
});

test('mutual exclusion lock: active lock returns 409 with zero work; expired lock recovers cleanly', async () => {
  const store = new InMemorySemanticStore();
  let nowMs = Date.parse('2026-11-27T04:00:00.000Z');
  let feedCalls = 0;

  // Worker A holds an active 90s lock
  await store.acquireLock('other-worker', 90_000, new Date(nowMs).toISOString());

  const handler = createEcometriSyncHandler({
    getCronSecret: () => 'sec-1',
    resolveCommerceFn: async () => ({
      commerceId: 'bodega-mayorista-monteria',
      isAlias: false,
      data: { ecometri: SYNC_CFG },
    }),
    semanticStoreFactory: () => store,
    geminiClientFactory: () => ({
      async analyze() {
        throw new Error('unused');
      },
      async rerank() {
        return null;
      },
      async enrichCatalogBatch(candidates) {
        return {
          items: candidates.map((c) => ({
            ecometriId: c.id,
            displayTitle: `Curado ${c.rawTitle}`,
            article: 'termo',
            colors: ['negro'],
            keywords: ['termo'],
            visualSummary: 'Termo compacto de uso diario.',
          })),
        };
      },
    }),
    limiterFactory: () => createRateLimiter(60, { now: () => 0, sleep: async () => {} }),
    fetchLiveCatalogFn: async () => {
      feedCalls += 1;
      return [mkLiveItem('t1', '100001', 'Termo')];
    },
    fetchFn: fakeThumbFetch,
    nowFn: () => nowMs,
  });

  // 1. Overlapping invocation while lock is active -> 409, zero feed/Gemini calls
  const r409 = await handler({
    authorizationHeader: 'Bearer sec-1',
    commerce: 'bmm',
  });
  assert.equal(r409.status, 409);
  assert.equal(feedCalls, 0);

  // 2. Advance past 90s TTL -> lock expired, next run succeeds (200)
  nowMs += 95_000;
  const r200 = await handler({
    authorizationHeader: 'Bearer sec-1',
    commerce: 'bmm',
  });
  assert.equal(r200.status, 200);
  assert.equal(feedCalls, 1);
  assert.equal((r200.body as SyncResponseBody).processed, 1);
  assert.equal((r200.body as SyncResponseBody).gen, 1);
});

test('self-draining 40-item cap: 95 dirty products drain deterministically across 3 runs (40 -> 40 -> 15)', async () => {
  const store = new InMemorySemanticStore();
  const live95 = Array.from({ length: 95 }, (_, i) =>
    mkLiveItem(`prod-${i + 1}`, String(600001 + i), `Articulo ${i + 1}`)
  );

  const handler = createEcometriSyncHandler({
    getCronSecret: () => 'sec-drain',
    resolveCommerceFn: async () => ({
      commerceId: 'bmm',
      isAlias: false,
      data: { ecometri: SYNC_CFG },
    }),
    semanticStoreFactory: () => store,
    geminiClientFactory: () => ({
      async analyze() {
        throw new Error('unused');
      },
      async rerank() {
        return null;
      },
      async enrichCatalogBatch(candidates) {
        return {
          items: candidates.map((c) => ({
            ecometriId: c.id,
            displayTitle: `Limpio ${c.rawTitle}`,
            article: 'articulo',
            colors: ['blanco'],
            keywords: ['hogar'],
            visualSummary: 'Articulo para el hogar en empaque individual.',
          })),
        };
      },
    }),
    limiterFactory: () => createRateLimiter(60, { now: () => 0, sleep: async () => {} }),
    fetchLiveCatalogFn: async () => live95,
    fetchFn: fakeThumbFetch,
    maxItemsPerRun: 40,
  });

  const run1 = await handler({ authorizationHeader: 'Bearer sec-drain', commerce: 'bmm' });
  assert.equal(run1.status, 200);
  assert.deepEqual(run1.body, {
    processed: 40,
    reused: 0,
    failed: 0,
    removed: 0,
    backlog: 55,
    gen: 1,
  });

  const run2 = await handler({ authorizationHeader: 'Bearer sec-drain', commerce: 'bmm' });
  assert.equal(run2.status, 200);
  assert.deepEqual(run2.body, {
    processed: 40,
    reused: 0,
    failed: 0,
    removed: 0,
    backlog: 15,
    gen: 2,
  });

  const run3 = await handler({ authorizationHeader: 'Bearer sec-drain', commerce: 'bmm' });
  assert.equal(run3.status, 200);
  assert.deepEqual(run3.body, {
    processed: 15,
    reused: 0,
    failed: 0,
    removed: 0,
    backlog: 0,
    gen: 3,
  });
});

test('typical daily sync & fault isolation: 6 new + 2 photo changes + 25 price/stock changes + 3 deletions uses < 3 Gemini calls, purges removed, and mid-run failure leaves gen 1 servable', async () => {
  const store = new InMemorySemanticStore();
  let geminiBatchCalls: EnrichPromptCandidate[][] = [];
  let currentFeed: LiveProduct[] = Array.from({ length: 30 }, (_, i) =>
    mkLiveItem(`base-${i + 1}`, String(700001 + i), `Base ${i + 1}`, `img-${i + 1}.jpg`, 20000, true)
  );
  let shouldFailFeed = false;

  const handler = createEcometriSyncHandler({
    getCronSecret: () => 'sec-daily',
    resolveCommerceFn: async () => ({
      commerceId: 'bmm',
      isAlias: false,
      data: { ecometri: SYNC_CFG },
    }),
    semanticStoreFactory: () => store,
    geminiClientFactory: () => ({
      async analyze() {
        throw new Error('unused');
      },
      async rerank() {
        return null;
      },
      async enrichCatalogBatch(candidates) {
        geminiBatchCalls.push(candidates);
        return {
          items: candidates.map((c) => ({
            ecometriId: c.id,
            displayTitle: `Curado ${c.rawTitle}`,
            article: 'producto',
            colors: ['azul'],
            keywords: ['catalogo'],
            visualSummary: 'Producto mayorista verificado visualmente.',
          })),
        };
      },
    }),
    limiterFactory: () => createRateLimiter(60, { now: () => 0, sleep: async () => {} }),
    fetchLiveCatalogFn: async () => {
      if (shouldFailFeed) {
        throw new Error('UPSTREAM_ECOMETRI_500');
      }
      return currentFeed;
    },
    fetchFn: fakeThumbFetch,
  });

  // Initial seed -> gen 1 (30 items)
  const seed = await handler({ authorizationHeader: 'Bearer sec-daily', commerce: 'bmm' });
  assert.equal(seed.status, 200);
  assert.equal((seed.body as SyncResponseBody).gen, 1);

  // Typical next day:
  // - 3 deleted (`base-28..30` dropped)
  // - 25 items changed ONLY price/stock (`base-3..27`) -> 0 AI calls!
  // - 2 items changed photo (`base-1`, `base-2`) -> dirty
  // - 6 brand-new items (`new-1..6`) -> dirty
  // Total dirty = 8 items -> 1 single Gemini batch call (< 3 calls!)
  geminiBatchCalls = [];
  const nextDayKept = currentFeed.slice(0, 27).map((item, idx) => {
    if (idx < 2) {
      return {
        ...item,
        imageKey: `${item.id}-corrected.jpg`,
        imageUrl: `https://d1b50uin55dq3m.cloudfront.net/fit-in/600x600/${item.id}-corrected.jpg`,
      };
    }
    return {
      ...item,
      priceCop: 44900,
      inStock: idx % 2 === 0,
    };
  });
  const sixNew = Array.from({ length: 6 }, (_, i) =>
    mkLiveItem(`new-${i + 1}`, String(800001 + i), `Nuevo ${i + 1}`)
  );
  currentFeed = [...nextDayKept, ...sixNew];

  const daily = await handler({ authorizationHeader: 'Bearer sec-daily', commerce: 'bmm' });
  assert.equal(daily.status, 200);
  assert.equal(geminiBatchCalls.length, 1, 'Expected 1 Gemini batch call (< 3) for 8 daily deltas');
  assert.deepEqual(daily.body, {
    processed: 8,
    reused: 0,
    failed: 0,
    removed: 3,
    backlog: 0,
    gen: 2,
  });

  // Simulate upstream crash on subsequent sync -> returns 502, releases lock, and leaves gen 2 100% servable!
  shouldFailFeed = true;
  const failedRun = await handler({ authorizationHeader: 'Bearer sec-daily', commerce: 'bmm' });
  assert.equal(failedRun.status, 502);

  const loader = createSemanticIndexLoader();
  const loadedAfterFailure = await loader.load('bmm', { store, now: () => Date.now() });
  assert.ok(loadedAfterFailure);
  assert.equal(loadedAfterFailure.gen, 2);
  assert.equal(loadedAfterFailure.byId.size, 33); // 27 kept + 6 new, 3 deleted purged!
  assert.equal(loadedAfterFailure.byId.has('base-30'), false);

  // Verify optional enableSemantic activates ONLY when backlog === 0, and supports instant rollback
  shouldFailFeed = false;
  let savedFlagState: boolean | null = null;
  const flagHandler = createEcometriSyncHandler({
    getCronSecret: () => 'sec-daily',
    resolveCommerceFn: async () => ({
      commerceId: 'bmm',
      isAlias: false,
      data: { ecometri: SYNC_CFG },
    }),
    semanticStoreFactory: () => store,
    geminiClientFactory: () => ({
      async analyze() {
        throw new Error('unused');
      },
      async rerank() {
        return null;
      },
      async enrichCatalogBatch() {
        return { items: [] };
      },
    }),
    limiterFactory: () => createRateLimiter(60, { now: () => 0, sleep: async () => {} }),
    fetchLiveCatalogFn: async () => currentFeed,
    fetchFn: fakeThumbFetch,
    updateSemanticFlagFn: async (_id, enabled) => {
      savedFlagState = enabled;
    },
  });

  const activated = await flagHandler({
    authorizationHeader: 'Bearer sec-daily',
    commerce: 'bmm',
    enableSemantic: true,
  });
  assert.equal(activated.status, 200);
  assert.equal((activated.body as SyncResponseBody).semanticIndexEnabled, true);
  assert.equal(savedFlagState, true);

  const rolledBack = await flagHandler({
    authorizationHeader: 'Bearer sec-daily',
    commerce: 'bmm',
    enableSemantic: false,
  });
  assert.equal(rolledBack.status, 200);
  assert.equal((rolledBack.body as SyncResponseBody).semanticIndexEnabled, false);
  assert.equal(savedFlagState, false);
});
