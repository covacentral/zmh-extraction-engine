import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHttpGeminiClient,
  GeminiQuotaError,
  type EnrichPromptCandidate,
  type GeminiClient,
} from '../../geminiClient';
import {
  buildThumbnail160Url,
  createRateLimiter,
  enrichBatch,
  fetchThumbnailAsBase64,
  type ImageInput,
} from '../enrichBatch';
import {
  FirestoreSemanticStore,
  type FirestoreDbLike,
  type FirestoreDocRefLike,
} from '../firestoreStore';
import { createSemanticIndexLoader } from '../loadIndex';
import { computeShardHash, InMemorySemanticStore, partitionShards } from '../shards';
import { runCatalogEnrichmentSync } from '../syncCore';
import {
  CURRENT_PROMPT_VERSION,
  SEMANTIC_SCHEMA_VERSION,
  type LiveProduct,
  type SemanticItem,
} from '../types';

function mkImgInput(id: string, sku: string, rawTitle: string, imageKey: string | null = `${id}.jpg`): ImageInput {
  return {
    ecometriId: id,
    sku,
    rawTitle,
    imageKey,
    imageBase64: imageKey ? 'ZmFrZS1qcGVn' : null,
    mimeType: imageKey ? 'image/jpeg' : null,
  };
}

function mkValidAiEntry(id: string, displayTitle: string, article = 'mouse') {
  return {
    ecometriId: id,
    ocrBoxText: 'Basik Model M-100',
    displayTitle,
    article,
    brand: 'Basik',
    modelRef: 'M-100',
    colors: ['Negro'],
    keywords: ['mouse', 'raton', 'inalambrico'],
    visualSummary: 'Mouse inalambrico compacto color negro.',
  };
}

test('enrichBatch: handles partially invalid batch with 1-item retry, never trusts Gemini SKU, and handles text-only items with 0 AI calls', async () => {
  const calls: EnrichPromptCandidate[][] = [];
  const fakeClient: GeminiClient = {
    async analyze() {
      throw new Error('unused');
    },
    async rerank() {
      throw new Error('unused');
    },
    async enrichCatalogBatch(candidates) {
      calls.push(candidates);
      if (candidates.length > 1) {
        return {
          items: [
            // Valid item, even if Gemini tries to inject a fake SKU "999999"
            { ...mkValidAiEntry('id-ok', 'Mouse Optico Basik Negro'), sku: '999999' },
            // Invalid item (hallucinated 5000mAh not in rawTitle/modelRef) -> triggers single retry!
            {
              ecometriId: 'id-retry-ok',
              displayTitle: 'Mouse 5000mAh Recargable',
              article: 'mouse',
              colors: ['negro'],
              keywords: ['mouse'],
              visualSummary: 'Mouse con bateria de 5000 mAh.',
            },
            // Missing 'id-always-bad' -> also triggers single retry!
          ],
        };
      }

      // Single-item retry behavior:
      const single = candidates[0];
      if (single.id === 'id-retry-ok') {
        return {
          items: [mkValidAiEntry('id-retry-ok', 'Mouse Recargable Basik Negro')],
        };
      }
      // 'id-always-bad' returns malformed output again -> becomes status: 'failed' without blocking batch!
      return { items: [{ ecometriId: single.id, displayTitle: '' }] };
    },
  };

  let virtualClock = 1_000;
  const waitedMs: number[] = [];
  const limiter = createRateLimiter(12, {
    now: () => virtualClock,
    sleep: async (ms) => {
      waitedMs.push(ms);
      virtualClock += ms;
    },
  });

  const inputs: ImageInput[] = [
    mkImgInput('id-ok', '200101', 'Mouse inalambrico'),
    mkImgInput('id-retry-ok', '200102', 'Mouse recargable'),
    mkImgInput('id-always-bad', '200103', 'Mouse gamer'),
    mkImgInput('id-no-photo', '200104', 'Pad mouse tela', null),
  ];

  const results = await enrichBatch(fakeClient, inputs, limiter, {
    nowIso: '2026-11-27T02:00:00.000Z',
  });

  // 1 batch call (3 vision items; text-only excluded!) + 2 single-item retries = 3 Gemini calls
  assert.equal(calls.length, 3);
  assert.equal(calls[0].length, 3);
  assert.equal(calls[1].length, 1);
  assert.equal(calls[2].length, 1);
  // 12 RPM spacing: 0ms on first call, 5000ms before 2nd, 5000ms before 3rd
  assert.deepEqual(waitedMs, [5000, 5000]);

  assert.equal(results[0].item.status, 'ok');
  assert.equal(results[0].item.sku, '200101'); // Anchored from Ecometri, NOT "999999"!
  assert.equal(results[0].retriedSingle, false);

  assert.equal(results[1].item.status, 'ok');
  assert.equal(results[1].retriedSingle, true);
  assert.equal(results[1].item.displayTitle, 'Mouse Recargable Basik Negro');

  assert.equal(results[2].item.status, 'failed');
  assert.equal(results[2].item.imageKey, 'id-always-bad.jpg');
  assert.equal(results[2].retriedSingle, true);

  assert.equal(results[3].item.source, 'text-only');
  assert.equal(results[3].item.status, 'ok');
});

test('enrichBatch: exponential backoff on 429 recovers cleanly, and timeout degrades without throwing', async () => {
  let attemptCount = 0;
  const backoffDelays: number[] = [];

  const flakyClient: GeminiClient = {
    async analyze() {
      throw new Error('unused');
    },
    async rerank() {
      throw new Error('unused');
    },
    async enrichCatalogBatch(candidates, signal) {
      attemptCount += 1;
      if (candidates[0].id === 'id-timeout') {
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }
      if (attemptCount <= 2) {
        throw new GeminiQuotaError('RATE_LIMIT');
      }
      return {
        items: [mkValidAiEntry(candidates[0].id, 'Termo Acero Negro', 'termo')],
      };
    },
  };

  const instantLimiter = createRateLimiter(60, {
    now: () => 0,
    sleep: async () => {},
  });

  // 1. 429 twice -> succeeds on 3rd attempt
  const recovered = await enrichBatch(
    flakyClient,
    [mkImgInput('id-429', '300111', 'Termo')],
    instantLimiter,
    {
      maxQuotaRetries: 2,
      baseBackoffMs: 1500,
      sleep: async (ms) => {
        backoffDelays.push(ms);
      },
    }
  );
  assert.equal(recovered[0].item.status, 'ok');
  assert.equal(recovered[0].quotaRetries, 2);
  assert.deepEqual(backoffDelays, [1500, 3000]);

  // 2. Timeout -> degrades to failed item without crashing
  const timedOut = await enrichBatch(
    flakyClient,
    [mkImgInput('id-timeout', '300222', 'Lampara')],
    instantLimiter,
    { callTimeoutMs: 15 }
  );
  assert.equal(timedOut[0].item.status, 'failed');
  assert.equal(timedOut[0].errorReason, 'timeout');

  // 3. Bisect recovery: 6-item slow batch times out, splits 6 -> 3 + 3 and enriches all 6!
  const sixSlowBatch = Array.from({ length: 6 }, (_, i) =>
    mkImgInput(`slow-${i + 1}`, String(310001 + i), `Olla ${i + 1}`)
  );
  const bisectTimeoutClient: GeminiClient = {
    async analyze() {
      throw new Error('unused');
    },
    async rerank() {
      throw new Error('unused');
    },
    async enrichCatalogBatch(candidates, signal) {
      if (candidates.length > 3) {
        return new Promise((_res, rej) => {
          signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            rej(err);
          });
        });
      }
      return {
        items: candidates.map((c) => mkValidAiEntry(c.id, `Olla ${c.id}`, 'olla')),
      };
    },
  };
  const bisectedOk = await enrichBatch(bisectTimeoutClient, sixSlowBatch, instantLimiter, {
    callTimeoutMs: 15,
  });
  assert.equal(bisectedOk.length, 6);
  assert.equal(bisectedOk.every((r) => r.item.status === 'ok'), true);

  // 4. Poison-pill isolation: 1 bad image throwing http_error inside a 4-item batch isolates ONLY that 1 item (retriedSingle=true) while saving the other 3
  const fourMixed = [
    mkImgInput('ok-a', '320001', 'Aro luz'),
    mkImgInput('poison-b', '320002', 'Item bloqueado'),
    mkImgInput('ok-c', '320003', 'Rallador'),
    mkImgInput('ok-d', '320004', 'Mouse'),
  ];
  const poisonClient: GeminiClient = {
    async analyze() {
      throw new Error('unused');
    },
    async rerank() {
      throw new Error('unused');
    },
    async enrichCatalogBatch(candidates) {
      if (candidates.some((c) => c.id === 'poison-b')) {
        throw new Error('GEMINI_INVALID_JSON');
      }
      return {
        items: candidates.map((c) => mkValidAiEntry(c.id, `Limpio ${c.id}`)),
      };
    },
  };
  const isolated = await enrichBatch(poisonClient, fourMixed, instantLimiter);
  assert.equal(isolated[0].item.status, 'ok');
  assert.equal(isolated[1].item.status, 'failed');
  assert.equal(isolated[1].retriedSingle, true);
  assert.equal(isolated[2].item.status, 'ok');
  assert.equal(isolated[3].item.status, 'ok');
});

test('loadSemanticIndex: 20 concurrent cold reads execute exactly 1 readMeta and 1 shard load (single-flight), and unchanged gen skips shard reads', async () => {
  const store = new InMemorySemanticStore();
  const items: SemanticItem[] = [
    {
      ecometriId: 'e6b4ac',
      sku: '801268',
      imageKey: 'pb.jpg',
      displayTitle: 'Power Bank Bateria Portatil',
      article: 'power bank',
      brand: null,
      modelRef: null,
      colors: ['negro'],
      keywords: ['powerbank', 'bateria portatil'],
      visualSummary: 'Bateria portatil compacta.',
      source: 'vision',
      status: 'ok',
      enrichedAt: '2026-11-27T01:00:00.000Z',
      promptVersion: CURRENT_PROMPT_VERSION,
    },
  ];
  const shards = partitionShards(items, 300, 600_000, 1);
  await store.writeGeneration(1, shards, {
    schemaVersion: SEMANTIC_SCHEMA_VERSION,
    promptVersion: CURRENT_PROMPT_VERSION,
    gen: 1,
    shardCount: shards.length,
    itemCount: items.length,
    generatedAt: '2026-11-27T01:00:00.000Z',
    shardHashes: shards.map(computeShardHash),
    lockedUntil: null,
  });

  const loader = createSemanticIndexLoader();
  let nowMs = 10_000;

  // Stampede of 20 concurrent cold calls
  const concurrentResults = await Promise.all(
    Array.from({ length: 20 }, () =>
      loader.load('bodega-mayorista-monteria', { store, now: () => nowMs })
    )
  );

  assert.equal(store.metaReads, 1, 'Expected exactly 1 readMeta across 20 concurrent cold calls');
  assert.equal(store.shardReads, 1, 'Expected exactly 1 shard read across 20 concurrent cold calls');
  for (const idx of concurrentResults) {
    assert.ok(idx);
    assert.deepEqual(idx.bySku.get('801268'), ['e6b4ac']);
  }

  // Advance clock past 30-min TTL -> re-reads meta (1 read), sees gen=1 unchanged -> 0 new shard reads!
  nowMs += 31 * 60_000;
  const refreshed = await loader.load('bodega-mayorista-monteria', {
    store,
    now: () => nowMs,
  });
  assert.ok(refreshed);
  assert.equal(store.metaReads, 2);
  assert.equal(store.shardReads, 1);
});

test('resumable backfill & FirestoreSemanticStore: mid-run checkpoint resumes without repeating completed batches, and interrupted shard write leaves meta untouched', async () => {
  // 1. Resumable backfill via checkpointItems
  const store = new InMemorySemanticStore();
  const liveProducts: LiveProduct[] = Array.from({ length: 12 }, (_, i) => ({
    id: `p-${i + 1}`,
    ecometriId: `p-${i + 1}`,
    slug: `p-${i + 1}`,
    title: `Mouse modelo ${i + 1}`,
    sku: String(500001 + i),
    priceCop: 25000,
    inStock: true,
    active: true,
    imageKey: `img-${i + 1}.jpg`,
    imageUrl: `https://d1b50uin55dq3m.cloudfront.net/fit-in/600x600/img-${i + 1}.jpg`,
    description: null,
    productUrl: `https://bodegamayoristamtr.ecometri.shop/321/p-${i + 1}/`,
  }));

  const fakeThumbFetch = (async () =>
    new Response(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    })) as unknown as typeof fetch;

  let savedCheckpoint: SemanticItem[] = [];
  let enrichedIdsAcrossRuns: string[] = [];
  let crashAfterFirstBatch = true;

  const fakeGemini: GeminiClient = {
    async analyze() {
      throw new Error('unused');
    },
    async rerank() {
      throw new Error('unused');
    },
    async enrichCatalogBatch(candidates) {
      enrichedIdsAcrossRuns.push(...candidates.map((c) => c.id));
      return {
        items: candidates.map((c) => mkValidAiEntry(c.id, `Curado ${c.rawTitle}`)),
      };
    },
  };

  const limiter = createRateLimiter(60, { now: () => 0, sleep: async () => {} });
  const cfg = {
    enabled: true,
    storeId: 's1',
    storeBaseUrl: 'https://bodegamayoristamtr.ecometri.shop/321',
    allowedImageHost: 'd1b50uin55dq3m.cloudfront.net',
  };

  // First run crashes right after batch 1 (6 items in v3.0) writes checkpoint, BEFORE writeGeneration
  await assert.rejects(async () => {
    await runCatalogEnrichmentSync({
      cfg,
      liveProducts,
      store,
      geminiClient: fakeGemini,
      limiter,
      batchSize: 6,
      fetchFn: fakeThumbFetch,
      onCheckpoint: (items) => {
        savedCheckpoint = items;
        if (crashAfterFirstBatch) {
          crashAfterFirstBatch = false;
          throw new Error('SIMULATED_PROCESS_CRASH');
        }
      },
    });
  }, /SIMULATED_PROCESS_CRASH/);

  assert.equal(savedCheckpoint.length, 6);
  assert.equal(await store.readMeta(), null); // Store meta untouched after crash!

  // Second run resumes from `savedCheckpoint` -> ONLY enriches the remaining 6 items (p-7..p-12)!
  enrichedIdsAcrossRuns = [];
  const summary = await runCatalogEnrichmentSync({
    cfg,
    liveProducts,
    store,
    geminiClient: fakeGemini,
    limiter,
    checkpointItems: savedCheckpoint,
    batchSize: 6,
    fetchFn: fakeThumbFetch,
  });

  assert.deepEqual(enrichedIdsAcrossRuns, ['p-7', 'p-8', 'p-9', 'p-10', 'p-11', 'p-12']);
  assert.equal(summary.processed, 6);
  assert.equal(summary.backlog, 0);
  assert.equal(summary.gen, 1);

  // 2. FirestoreSemanticStore interrupted write leaves previous meta.gen intact, and blocks non-whitelisted thumbnail hosts
  const docs = new Map<string, Record<string, unknown>>();
  let failOnMetaWrite = false;

  const makeDocRef = (docId: string): FirestoreDocRefLike => ({
    async get() {
      const d = docs.get(docId);
      return { exists: d !== undefined, data: () => (d ? structuredClone(d) : undefined) };
    },
    async set(data: unknown) {
      if (docId === 'meta' && failOnMetaWrite) {
        throw new Error('SIMULATED_META_WRITE_FAILURE');
      }
      docs.set(docId, structuredClone(data as Record<string, unknown>));
    },
    async delete() {
      docs.delete(docId);
    },
  });

  const fakeFirestoreDb: FirestoreDbLike = {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: (docId: string) => makeDocRef(docId),
        }),
      }),
    }),
    async runTransaction(fn) {
      return fn({
        get: (ref) => ref.get(),
        set: (ref, data, opts) => {
          void opts;
          return ref.set(data);
        },
      });
    },
  };

  const fsStore = new FirestoreSemanticStore('bmm', fakeFirestoreDb);
  const gen1Shards = partitionShards(savedCheckpoint.slice(0, 2), 300, 600_000, 1);
  await fsStore.writeGeneration(1, gen1Shards, {
    schemaVersion: SEMANTIC_SCHEMA_VERSION,
    promptVersion: CURRENT_PROMPT_VERSION,
    gen: 1,
    shardCount: gen1Shards.length,
    itemCount: 2,
    generatedAt: '2026-11-27T01:00:00.000Z',
    shardHashes: gen1Shards.map(computeShardHash),
    lockedUntil: null,
  });

  failOnMetaWrite = true;
  const gen2Shards = partitionShards(savedCheckpoint.slice(0, 4), 300, 600_000, 2);
  await assert.rejects(() =>
    fsStore.writeGeneration(2, gen2Shards, {
      schemaVersion: SEMANTIC_SCHEMA_VERSION,
      promptVersion: CURRENT_PROMPT_VERSION,
      gen: 2,
      shardCount: gen2Shards.length,
      itemCount: 4,
      generatedAt: '2026-11-27T02:00:00.000Z',
      shardHashes: gen2Shards.map(computeShardHash),
      lockedUntil: null,
    })
  );

  const visibleMetaAfterCrash = await fsStore.readMeta();
  assert.ok(visibleMetaAfterCrash);
  assert.equal(visibleMetaAfterCrash.gen, 1);

  // SSRF check on fetchThumbnailAsBase64: non-whitelisted host returns null without calling fetch
  let networkCalled = false;
  const blocked = await fetchThumbnailAsBase64(
    'https://evil.example.com/fit-in/600x600/pic.jpg',
    'd1b50uin55dq3m.cloudfront.net',
    {
      fetchFn: (async () => {
        networkCalled = true;
        throw new Error('MUST_NOT_BE_CALLED');
      }) as unknown as typeof fetch,
    }
  );
  assert.equal(blocked, null);
  assert.equal(networkCalled, false);

  // v3.0: Verify 600x600 high-clarity OCR URL generation & gemini-flash-latest primary for enrichCatalogBatch vs flash-lite for live analyze
  assert.equal(
    buildThumbnail160Url(
      'https://d1b50uin55dq3m.cloudfront.net/fit-in/160x160/pic.jpg',
      'd1b50uin55dq3m.cloudfront.net'
    ),
    'https://d1b50uin55dq3m.cloudfront.net/fit-in/600x600/pic.jpg'
  );

  const hitUrls: string[] = [];
  const httpClient = createHttpGeminiClient('fake-key', async (url) => {
    const u = String(url);
    hitUrls.push(u);
    if (u.includes('gemini-flash-latest') && hitUrls.length === 1) {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({ items: [] }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    label: 'Mouse',
                    exactTerms: ['mouse'],
                    functionalTerms: [],
                    broadRoots: [],
                  }),
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  });

  assert.ok(httpClient.enrichCatalogBatch);
  await httpClient.enrichCatalogBatch(
    [{ id: '1', rawTitle: 'T', imageBase64: 'ZmFrZQ==', mimeType: 'image/jpeg' }],
    new AbortController().signal
  );
  assert.match(hitUrls[0], /gemini-flash-latest:generateContent/);

  await httpClient.analyze('ZmFrZQ==', new AbortController().signal);
  assert.match(hitUrls[1], /gemini-flash-lite-latest:generateContent/);
});
