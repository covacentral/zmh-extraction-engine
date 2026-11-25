import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createCatalogIndexStore,
  rankSimilar,
} from '../catalogIndex';
import {
  mergeVisualQuota,
  readLocalVisualQuota,
  recordLocalVisualSuccess,
  type StorageLike,
} from '../clientQuota';
import {
  createHttpGeminiClient,
  GeminiQuotaError,
  type GeminiClient,
} from '../geminiClient';
import {
  createCircuitBreaker,
  createVisualRateLimiter,
  mergeCandidates,
  parseStage2Output,
  parseVisualAnalysis,
  planQueries,
  prioritizeCandidatesForRerank,
  resolveFinalVisualItems,
  validateJpegBase64,
} from '../visualSearch';
import { createVisualSearchHandler } from '../visualSearchHandler';
import type { EcometriConfig, ProductDTO } from '../types';

const SAMPLE_CFG: EcometriConfig = {
  enabled: true,
  visualSearchEnabled: true,
  storeId: '50da18bb-6431-4220-a1ce-39f0b2837ce6',
  storeBaseUrl: 'https://bodegamayoristamtr.ecometri.shop/3217535900',
  allowedImageHost: 'd1b50uin55dq3m.cloudfront.net',
};

const VALID_JPEG_B64 = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
]).toString('base64');
const PNG_B64 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]).toString('base64');
const OVERSIZED_JPEG_B64 = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(360 * 1024, 0x11),
]).toString('base64');

function mkProduct(
  id: string,
  title: string,
  inStock = true,
  sku: string | null = null
): ProductDTO {
  return {
    id,
    slug: id,
    title,
    sku,
    priceCop: 25000,
    inStock,
    imageUrl: `https://d1b50uin55dq3m.cloudfront.net/fit-in/600x600/${id}.jpg`,
    description: null,
    productUrl: `https://bodegamayoristamtr.ecometri.shop/3217535900/${id}/`,
  };
}

test('validateJpegBase64 enforces JPEG magic bytes, no data URI prefix, and <= 350 KB', () => {
  assert.equal(validateJpegBase64(VALID_JPEG_B64).ok, true);
  assert.equal(validateJpegBase64(`data:image/jpeg;base64,${VALID_JPEG_B64}`).status, 400);
  assert.equal(validateJpegBase64(PNG_B64).status, 400);
  assert.equal(validateJpegBase64(OVERSIZED_JPEG_B64).status, 413);
});

test('parseStage2Output discards hallucinated IDs and resolveFinalVisualItems labels exact vs similar', () => {
  const catalog = [
    mkProduct('m1', 'Mouse inalambrico', true, '100001'),
    mkProduct('m2', 'Mouse gamer luz', true, '100002'),
    mkProduct('m3', 'Teclado mecanico', true, '100003'),
  ];

  // Model hallucinates 'ghost-999' -> discarded
  const s2 = parseStage2Output(
    { exactIds: ['ghost-999', 'm2'], similarIds: ['m2', 'm1', 'fake-2'] },
    ['m1', 'm2', 'm3']
  );
  assert.ok(s2);
  assert.deepEqual(s2.exactIds, ['m2']);
  assert.deepEqual(s2.similarIds, ['m1']); // deduplicated against exactIds

  const withExact = resolveFinalVisualItems(catalog, s2, catalog, 5);
  assert.equal(withExact.hasExactMatch, true);
  assert.equal(withExact.items[0].id, 'm2');
  assert.equal(withExact.items[0].matchType, 'exact');
  assert.equal(withExact.items[1].id, 'm1');
  assert.equal(withExact.items[1].matchType, 'similar');

  // When exactIds is empty, never returns 0 items: recommends similar items labeled 'similar'
  const emptyExact = parseStage2Output({ exactIds: [], similarIds: [] }, ['m1', 'm2', 'm3']);
  const recommended = resolveFinalVisualItems(catalog, emptyExact, catalog, 5);
  assert.equal(recommended.hasExactMatch, false);
  assert.equal(recommended.items.length, 3);
  assert.equal(recommended.items.every((i) => i.matchType === 'similar'), true);
});

test('rankSimilar is 100% deterministic across runs, typo-tolerant, and never empty on non-empty catalog', () => {
  const index: ProductDTO[] = [
    mkProduct('id-3', 'Olla a presion 5L', true, '300003'),
    mkProduct('id-2', 'Tensiometro digital brazo', true, '200002'),
    mkProduct('id-1', 'Tensiometro manual', false, '200001'),
    mkProduct('id-4', 'Termometro infrarrojo', true, '200004'),
  ];

  const typoAnalysis = parseVisualAnalysis({
    label: 'Tensionetro de brazo',
    exactTerms: ['tensionetro'],
    functionalTerms: ['salud'],
    broadRoots: ['tensi'],
  })!;

  const runA = rankSimilar(typoAnalysis, index, 5);
  const runB = rankSimilar(typoAnalysis, index, 5);
  assert.deepEqual(runA, runB);
  assert.equal(runA[0].item.id, 'id-2'); // Typo 'tensionetro' still matches 'Tensiometro' #1!

  // Non-existent item (e.g. 'bicicleta') still returns deterministic fallback items (never 0)
  const missingAnalysis = parseVisualAnalysis({
    label: 'Bicicleta montanera',
    exactTerms: ['bicicleta'],
    functionalTerms: [],
    broadRoots: [],
  })!;
  const fallbackRun = rankSimilar(missingAnalysis, index, 3);
  assert.equal(fallbackRun.length, 3);
  // Deterministic tie-break: inStock true first, then id asc
  assert.deepEqual(
    fallbackRun.map((x) => x.item.id),
    ['id-2', 'id-3', 'id-4']
  );
});

test('createCatalogIndexStore enforces 5-min TTL, single-flight, and 1500-item deterministic cap', async () => {
  let now = 5_000_000;
  let fetchCount = 0;

  const rawProducts = Array.from({ length: 1600 }, (_, i) => ({
    id: `p-${String(i).padStart(4, '0')}`,
    name: `Producto ${i}`,
    slug: `producto-${i}`,
    sku: String(100000 + i),
    price: 10000,
    quantity_available: i % 2 === 0 ? 5 : 0,
  }));

  const store = createCatalogIndexStore({
    nowFn: () => now,
    ttlMs: 300_000,
    maxItems: 1500,
    fetchFn: async () => {
      fetchCount += 1;
      return new Response(JSON.stringify({ products: rawProducts }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  const ctrl = new AbortController();
  const [first, concurrent] = await Promise.all([
    store.getOrFetch('bmm', SAMPLE_CFG, ctrl.signal),
    store.getOrFetch('bmm', SAMPLE_CFG, ctrl.signal),
  ]);
  assert.equal(fetchCount, 1); // Single-flight deduplication!
  assert.ok(first);
  assert.equal(first.length, 1500);
  assert.equal(first, concurrent);
  assert.equal(first[0].inStock, true); // In-stock items kept first before truncation

  // Within 5-min TTL -> cached
  now += 120_000;
  await store.getOrFetch('bmm', SAMPLE_CFG, ctrl.signal);
  assert.equal(fetchCount, 1);

  // Past 5-min TTL -> refreshes
  now += 200_000;
  await store.getOrFetch('bmm', SAMPLE_CFG, ctrl.signal);
  assert.equal(fetchCount, 2);
});

test('createHttpGeminiClient fails over once on 429 to alternate model without throwing GeminiQuotaError', async () => {
  const calledModels: string[] = [];
  const client = createHttpGeminiClient('fake-key', async (input) => {
    const url = String(input);
    calledModels.push(url);
    if (calledModels.length === 1) {
      return new Response('Rate limited', {
        status: 429,
        headers: { 'Retry-After': '20' },
      });
    }
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    label: 'Mouse inalambrico',
                    exactTerms: ['mouse'],
                    functionalTerms: ['raton'],
                    broadRoots: ['mouse'],
                  }),
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  });

  const analysis = await client.analyze(VALID_JPEG_B64, new AbortController().signal);
  assert.equal(calledModels.length, 2);
  assert.equal(analysis.label, 'Mouse inalambrico');

  // Double 429 on both models throws GeminiQuotaError
  const double429Client = createHttpGeminiClient('fake-key', async () => {
    return new Response('Rate limited', {
      status: 429,
      headers: { 'Retry-After': '25' },
    });
  });
  await assert.rejects(
    () => double429Client.analyze(VALID_JPEG_B64, new AbortController().signal),
    GeminiQuotaError
  );
});

test('handler emits quota on 200, 400/413, 429, and 503/504, and breaker stays bounded in 15s..60s', async () => {
  let now = 2_000_000;
  let analyzeCalls = 0;
  const breaker = createCircuitBreaker({ nowFn: () => now, jitterMs: 0 });
  const limiter = createVisualRateLimiter({ maxPerDevice: 2, nowFn: () => now });

  const indexStore = {
    async getOrFetch() {
      return [mkProduct('m1', 'Mouse inalambrico', true, '500111')];
    },
  };

  let shouldFail429 = false;
  const mockGemini: GeminiClient = {
    async analyze() {
      analyzeCalls += 1;
      if (shouldFail429) {
        throw new GeminiQuotaError('GEMINI_RATE_LIMITED', 120); // 120s clamped to 60s max!
      }
      return {
        label: 'Teclado bluetooth',
        exactTerms: ['teclado'],
        functionalTerms: ['mouse'],
        broadRoots: [],
      };
    },
    async rerank() {
      return { exactIds: [], similarIds: [] };
    },
  };

  const handler = createVisualSearchHandler({
    resolveCommerceFn: async () => ({
      commerceId: 'bmm',
      isAlias: false,
      data: { ecometri: SAMPLE_CFG },
    }),
    geminiClient: mockGemini,
    catalogIndexStore: indexStore,
    circuitBreaker: breaker,
    rateLimiter: limiter,
    nowFn: () => now,
    fetchFn: async () =>
      new Response(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      }),
  });

  // 1) 413 includes quota
  const r413 = await handler({
    contentLengthHeader: String(600 * 1024),
    rawBody: {},
    deviceId: 'dev_test_quota_1',
  });
  assert.equal(r413.status, 413);
  assert.ok((r413.body as any).quota);

  // 2) 400 includes quota
  const r400 = await handler({
    rawBody: { commerceId: 'bmm', imageBase64: PNG_B64, mimeType: 'image/jpeg' },
    deviceId: 'dev_test_quota_1',
  });
  assert.equal(r400.status, 400);
  assert.ok((r400.body as any).quota);

  // 3) 200 with exactIds=[] still recommends similar items (never 0) and includes quota
  const r200a = await handler({
    rawBody: { commerceId: 'bmm', imageBase64: VALID_JPEG_B64, mimeType: 'image/jpeg' },
    deviceId: 'dev_test_quota_1',
  });
  assert.equal(r200a.status, 200);
  assert.equal((r200a.body as any).items.length, 1);
  assert.equal((r200a.body as any).items[0].matchType, 'similar');
  assert.equal((r200a.body as any).hasExactMatch, false);
  assert.equal((r200a.body as any).quota.remaining, 1);

  // 4) Second 200 consumes last slot (remaining: 0), third returns 429 with quota
  await handler({
    rawBody: { commerceId: 'bmm', imageBase64: VALID_JPEG_B64, mimeType: 'image/jpeg' },
    deviceId: 'dev_test_quota_1',
  });
  const r429 = await handler({
    rawBody: { commerceId: 'bmm', imageBase64: VALID_JPEG_B64, mimeType: 'image/jpeg' },
    deviceId: 'dev_test_quota_1',
  });
  assert.equal(r429.status, 429);
  assert.equal((r429.body as any).quota.remaining, 0);

  // 5) Different device hits Gemini 429 -> 503 includes quota (refunded!) & breaker clamped <= 60s
  shouldFail429 = true;
  const r503 = await handler({
    rawBody: { commerceId: 'bmm', imageBase64: VALID_JPEG_B64, mimeType: 'image/jpeg' },
    deviceId: 'dev_test_quota_2',
  });
  assert.equal(r503.status, 503);
  assert.equal((r503.body as any).quota.remaining, 2); // Refunded!
  assert.equal(breaker.getRetryAfterSec(), 60); // Clamped to max 60s!

  const callsBeforeOpen = analyzeCalls;
  const whileOpen = await handler({
    rawBody: { commerceId: 'bmm', imageBase64: VALID_JPEG_B64, mimeType: 'image/jpeg' },
    deviceId: 'dev_test_quota_2',
  });
  assert.equal(whileOpen.status, 503);
  assert.equal(analyzeCalls, callsBeforeOpen); // Did not call Gemini while breaker open
  assert.ok((whileOpen.body as any).quota);
});

test('mergeVisualQuota prevents serverless bounce while respecting server 0', () => {
  const mem = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => {
      mem.set(k, v);
    },
  };

  let now = 10_000_000;
  recordLocalVisualSuccess('bmm', now, storage);
  recordLocalVisualSuccess('bmm', now + 1000, storage);
  const local = readLocalVisualQuota('bmm', now + 2000, storage);
  assert.equal(local.remaining, 8);

  // Cold serverless instance thinks remaining is 9 -> UI shows min(9, 8) = 8 (no bounce!)
  const mergedCold = mergeVisualQuota(
    { remaining: 9, limit: 10, resetInSec: 300, resetAt: now + 300_000 },
    local
  );
  assert.equal(mergedCold.remaining, 8);

  // Server enforces 429 (remaining: 0) -> UI shows 0 immediately
  const merged429 = mergeVisualQuota(
    { remaining: 0, limit: 10, resetInSec: 180, resetAt: now + 180_000 },
    local
  );
  assert.equal(merged429.remaining, 0);
});

test('handler returns 404 without calling Gemini/fetch when disabled, and 504 timeout still emits quota', async () => {
  let geminiCalled = false;
  let fetchCalled = false;

  const disabledHandler = createVisualSearchHandler({
    resolveCommerceFn: async () => ({
      commerceId: 'bmm',
      isAlias: false,
      data: { ecometri: { ...SAMPLE_CFG, visualSearchEnabled: false } },
    }),
    geminiClient: {
      async analyze() {
        geminiCalled = true;
        throw new Error('Should not run');
      },
      async rerank() {
        geminiCalled = true;
        return null;
      },
    },
    fetchFn: async () => {
      fetchCalled = true;
      throw new Error('Should not run');
    },
  });

  const r404 = await disabledHandler({
    rawBody: { commerceId: 'bmm', imageBase64: VALID_JPEG_B64, mimeType: 'image/jpeg' },
    deviceId: 'dev_404_check',
  });
  assert.equal(r404.status, 404);
  assert.equal(geminiCalled, false);
  assert.equal(fetchCalled, false);
  assert.ok((r404.body as any).quota);

  const timeoutHandler = createVisualSearchHandler({
    totalBudgetMs: 25,
    resolveCommerceFn: async () => ({
      commerceId: 'bmm',
      isAlias: false,
      data: { ecometri: SAMPLE_CFG },
    }),
    geminiClient: {
      analyze(_img, signal) {
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      },
      async rerank() {
        return null;
      },
    },
  });

  const r504 = await timeoutHandler({
    rawBody: { commerceId: 'bmm', imageBase64: VALID_JPEG_B64, mimeType: 'image/jpeg' },
    deviceId: 'dev_504_check',
  });
  assert.equal(r504.status, 504);
  assert.equal((r504.body as any).quota.remaining, 10); // Refunded on timeout!
});

test('VisualSearchPanel enforces neutral similarity heading, hides SKU in list, forbids exactness claims, and preserves server order', () => {
  const EMOJI_RE = /\p{Extended_Pictographic}/u;
  const FORBIDDEN_CLAIMS_RE = /\b(coincidencia|exact[oa]s?|id[eé]ntic[oa]s?)\b|100\s*%/i;

  const root = path.resolve(process.cwd());
  const triggerSrc = fs.readFileSync(path.join(root, 'app', '[comercio]', 'VisualSearchTrigger.tsx'), 'utf8');
  const panelSrc = fs.readFileSync(path.join(root, 'app', '[comercio]', 'VisualSearchPanel.tsx'), 'utf8');

  assert.equal(EMOJI_RE.test(triggerSrc), false);
  assert.equal(EMOJI_RE.test(panelSrc), false);

  // Neutral similarity heading present and zero exactness claims in VisualSearchPanel
  assert.match(panelSrc, /Resultados ordenados por similitud/);
  assert.equal(FORBIDDEN_CLAIMS_RE.test(panelSrc), false);

  // SKU is NOT rendered in the list rows (reserved for ProductQuickView)
  assert.equal(panelSrc.includes('item.sku'), false);
  assert.equal(panelSrc.includes('Ref:'), false);

  // Client never re-sorts or filters state.items
  assert.equal(panelSrc.includes('state.items.sort'), false);
  assert.equal(panelSrc.includes('state.items.filter'), false);
  assert.match(panelSrc, /state\.items\.map\(/);
});

test('planQueries, mergeCandidates, prioritizeCandidatesForRerank and server descending similarity order', () => {
  const c1 = mkProduct('m1', 'Mouse A', true, '100001');
  const c2 = mkProduct('m2', 'Mouse B', true, '100002');
  const c3 = mkProduct('m3', 'Mouse C', true, '100003');
  const ordered = resolveFinalVisualItems(
    [c1, c2, c3],
    { exactIds: ['m2'], similarIds: ['m3'] },
    [c1, c2, c3],
    5
  );
  // Strict descending similarity order: exactIds ('m2') -> similarIds ('m3') -> lexical fallback ('m1')
  assert.deepEqual(
    ordered.items.map((x) => x.id),
    ['m2', 'm3', 'm1']
  );
  const analysis = parseVisualAnalysis({
    label: 'Tensiometro digital',
    exactTerms: ['tensionetro', 'presion', 'digital'],
    functionalTerms: [],
    broadRoots: [],
  })!;
  assert.deepEqual(planQueries(analysis, 1), ['tensionetro']);
  assert.equal(planQueries(analysis, 2).includes('tensi'), true);

  const merged = mergeCandidates([[mkProduct('1', 'A', false), mkProduct('2', 'B', true)]]);
  assert.equal(merged[0].id, '2');

  const prio = prioritizeCandidatesForRerank(
    [mkProduct('p1', 'Pad mouse'), mkProduct('m1', 'Mouse inalambrico')],
    'Mouse inalambrico',
    1
  );
  assert.equal(prio[0].id, 'm1');

  const EMOJI_RE = /\p{Extended_Pictographic}/u;
  const root = path.resolve(process.cwd());
  const triggerSrc = fs.readFileSync(path.join(root, 'app', '[comercio]', 'VisualSearchTrigger.tsx'), 'utf8');
  const panelSrc = fs.readFileSync(path.join(root, 'app', '[comercio]', 'VisualSearchPanel.tsx'), 'utf8');
  assert.equal(EMOJI_RE.test(triggerSrc), false);
  assert.equal(EMOJI_RE.test(panelSrc), false);
});
