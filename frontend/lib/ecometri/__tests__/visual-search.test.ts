import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyRerank,
  createCircuitBreaker,
  createVisualRateLimiter,
  mergeCandidates,
  parseRerankResult,
  parseVisualAnalysis,
  planQueries,
  prioritizeCandidatesForRerank,
  validateJpegBase64,
} from '../visualSearch';
import {
  GeminiQuotaError,
  type GeminiClient,
} from '../geminiClient';
import { createVisualSearchHandler } from '../visualSearchHandler';
import type { EcometriConfig, ProductDTO } from '../types';

const SAMPLE_CFG: EcometriConfig = {
  enabled: true,
  visualSearchEnabled: true,
  storeId: '50da18bb-6431-4220-a1ce-39f0b2837ce6',
  storeBaseUrl: 'https://bodegamayoristamtr.ecometri.shop/3217535900',
  allowedImageHost: 'd1b50uin55dq3m.cloudfront.net',
};

// Minimal valid JPEG magic bytes (FF D8 FF E0 ...)
const VALID_JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString('base64');
// PNG header (89 50 4E 47)
const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
// > 350 KB JPEG
const OVERSIZED_JPEG_B64 = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(360 * 1024, 0x11),
]).toString('base64');

test('validateJpegBase64 enforces JPEG magic bytes, no data URI prefix, and <= 350 KB', () => {
  assert.equal(validateJpegBase64(VALID_JPEG_B64).ok, true);
  assert.equal(validateJpegBase64(`data:image/jpeg;base64,${VALID_JPEG_B64}`).status, 400);
  assert.equal(validateJpegBase64(PNG_B64).status, 400);
  assert.equal(validateJpegBase64(OVERSIZED_JPEG_B64).status, 413);
});

test('parseVisualAnalysis, planQueries, mergeCandidates and parseRerankResult enforce contracts', () => {
  const analysis = parseVisualAnalysis({
    label: 'Termo licuadora\u0007',
    exactTerms: ['termo licuadora', 'ab', 'Termo Licuadora'],
    functionalTerms: ['licuadora portatil', 'vaso recargable'],
    broadRoots: ['termo', 'licua'],
  });
  assert.ok(analysis);
  assert.equal(analysis.label, 'Termo licuadora');
  assert.deepEqual(analysis.exactTerms, ['termo licuadora']);

  const r1 = planQueries(analysis, 1);
  const r2 = planQueries(analysis, 2);
  assert.equal(r1.length <= 3, true);
  assert.equal(r2.length <= 2, true);
  assert.equal(r2.includes('termo licuadora'), false);

  const candidates: ProductDTO[] = [
    { id: 'a', slug: 'a', title: 'Agotado', sku: null, priceCop: 10000, inStock: false, imageUrl: null, description: null, productUrl: 'https://x.com/a/' },
    { id: 'b', slug: 'b', title: 'Disp 1', sku: null, priceCop: 20000, inStock: true, imageUrl: null, description: null, productUrl: 'https://x.com/b/' },
    { id: 'c', slug: 'c', title: 'Disp 2', sku: null, priceCop: 30000, inStock: true, imageUrl: null, description: null, productUrl: 'https://x.com/c/' },
  ];

  const merged = mergeCandidates([[candidates[0], candidates[1]], [candidates[1], candidates[2]]]);
  assert.deepEqual(merged.map((x) => x.id), ['b', 'c', 'a']);

  // Model hallucinates 'ghost-id' -> must be discarded
  const rerankedIds = parseRerankResult({ orderedIds: ['ghost-id', 'c', 'b', 'a'] }, ['a', 'b', 'c']);
  assert.deepEqual(rerankedIds, ['c', 'b', 'a']);

  const finalList = applyRerank(merged, rerankedIds);
  assert.deepEqual(finalList.map((x) => x.id), ['c', 'b', 'a']);
});

test('handler returns 404 without calling Gemini or fetch when visualSearchEnabled is false', async () => {
  let geminiCalled = false;
  let fetchCalled = false;

  const mockGemini: GeminiClient = {
    async analyze() {
      geminiCalled = true;
      throw new Error('Should not be called');
    },
    async rerank() {
      geminiCalled = true;
      return null;
    },
  };

  const handler = createVisualSearchHandler({
    resolveCommerceFn: async () => ({
      commerceId: 'bmm',
      isAlias: true,
      data: { ecometri: { ...SAMPLE_CFG, visualSearchEnabled: false } },
    }),
    geminiClient: mockGemini,
    fetchFn: async () => {
      fetchCalled = true;
      throw new Error('Should not be called');
    },
  });

  const res = await handler({
    rawBody: { commerceId: 'bmm', imageBase64: VALID_JPEG_B64, mimeType: 'image/jpeg' },
    clientIp: '1.2.3.4',
  });

  assert.equal(res.status, 404);
  assert.equal(geminiCalled, false);
  assert.equal(fetchCalled, false);
});

test('handler rejects oversized payload (413) and non-JPEG mime/magic bytes (400)', async () => {
  const handler = createVisualSearchHandler({
    resolveCommerceFn: async () => ({
      commerceId: 'bmm',
      isAlias: false,
      data: { ecometri: SAMPLE_CFG },
    }),
    geminiClient: null,
  });

  const cl413 = await handler({
    contentLengthHeader: String(500 * 1024),
    rawBody: { commerceId: 'bmm', imageBase64: VALID_JPEG_B64, mimeType: 'image/jpeg' },
  });
  assert.equal(cl413.status, 413);

  const img413 = await handler({
    rawBody: { commerceId: 'bmm', imageBase64: OVERSIZED_JPEG_B64, mimeType: 'image/jpeg' },
  });
  assert.equal(img413.status, 413);

  const badMime = await handler({
    rawBody: { commerceId: 'bmm', imageBase64: VALID_JPEG_B64, mimeType: 'image/png' },
  });
  assert.equal(badMime.status, 400);

  const badMagic = await handler({
    rawBody: { commerceId: 'bmm', imageBase64: PNG_B64, mimeType: 'image/jpeg' },
  });
  assert.equal(badMagic.status, 400);
});

test('rate limiter scopes quota per device (10 per 5 min) so devices on the same Wi-Fi IP do not block each other', async () => {
  let now = 1_000_000;
  const limiter = createVisualRateLimiter({ nowFn: () => now });

  const mockGemini: GeminiClient = {
    async analyze() {
      return {
        label: 'Termo',
        exactTerms: ['termo'],
        functionalTerms: [],
        broadRoots: [],
      };
    },
    async rerank() {
      return [];
    },
  };

  const handler = createVisualSearchHandler({
    resolveCommerceFn: async () => ({
      commerceId: 'bmm',
      isAlias: false,
      data: { ecometri: SAMPLE_CFG },
    }),
    geminiClient: mockGemini,
    rateLimiter: limiter,
    nowFn: () => now,
    fetchFn: async () => new Response(JSON.stringify([]), { status: 200 }),
  });

  // Device A uses all 10 attempts on shared Wi-Fi IP 9.9.9.9
  for (let i = 0; i < 10; i++) {
    const ok = await handler({
      rawBody: { commerceId: 'bmm', imageBase64: VALID_JPEG_B64, mimeType: 'image/jpeg' },
      clientIp: '9.9.9.9',
      deviceId: 'device_alpha_1234',
    });
    assert.equal(ok.status, 200);
    assert.equal((ok.body as any).quota.remaining, 9 - i);
    assert.equal((ok.body as any).quota.limit, 10);
  }

  // 11th attempt for Device A -> 429 with quota & Retry-After
  const eleventh = await handler({
    rawBody: { commerceId: 'bmm', imageBase64: VALID_JPEG_B64, mimeType: 'image/jpeg' },
    clientIp: '9.9.9.9',
    deviceId: 'device_alpha_1234',
  });
  assert.equal(eleventh.status, 429);
  assert.ok(eleventh.headers?.['Retry-After']);
  assert.equal((eleventh.body as any).quota.remaining, 0);

  // Device B on the EXACT SAME Wi-Fi IP 9.9.9.9 is NOT blocked!
  const devB = await handler({
    rawBody: { commerceId: 'bmm', imageBase64: VALID_JPEG_B64, mimeType: 'image/jpeg' },
    clientIp: '9.9.9.9',
    deviceId: 'device_beta_5678',
  });
  assert.equal(devB.status, 200);
  assert.equal((devB.body as any).quota.remaining, 9);

  // Advance clock past 5 minutes -> Device A is allowed again
  now += 5 * 60_000 + 1000;
  const afterWindow = await handler({
    rawBody: { commerceId: 'bmm', imageBase64: VALID_JPEG_B64, mimeType: 'image/jpeg' },
    clientIp: '9.9.9.9',
    deviceId: 'device_alpha_1234',
  });
  assert.equal(afterWindow.status, 200);
  assert.equal((afterWindow.body as any).quota.remaining, 9);
});

test('prioritizeCandidatesForRerank keeps standalone mouses ahead of pads and combos', () => {
  const mk = (id: string, title: string): ProductDTO => ({
    id,
    slug: id,
    title,
    sku: null,
    priceCop: 20000,
    inStock: true,
    imageUrl: null,
    description: null,
    productUrl: `https://x.com/${id}/`,
  });
  const list = [
    mk('p1', 'Pad mouse gamer'),
    mk('c1', 'Combo mouse + teclado'),
    mk('m1', 'Mouse inalambrico'),
    mk('m2', 'Mouse recargable'),
  ];
  const ordered = prioritizeCandidatesForRerank(list, 'Mouse inalambrico', 2);
  assert.deepEqual(ordered.map((x) => x.id), ['m1', 'm2']);
});

test('Gemini 429 opens circuit breaker and next request returns 503 without calling Gemini', async () => {
  let now = 2_000_000;
  let analyzeCalls = 0;
  const breaker = createCircuitBreaker({ nowFn: () => now });

  const mockGemini: GeminiClient = {
    async analyze() {
      analyzeCalls += 1;
      throw new GeminiQuotaError();
    },
    async rerank() {
      return null;
    },
  };

  const handler = createVisualSearchHandler({
    resolveCommerceFn: async () => ({
      commerceId: 'bmm',
      isAlias: false,
      data: { ecometri: SAMPLE_CFG },
    }),
    geminiClient: mockGemini,
    circuitBreaker: breaker,
    rateLimiter: createVisualRateLimiter({ maxPerIp: 10, nowFn: () => now }),
    nowFn: () => now,
  });

  const first = await handler({
    rawBody: { commerceId: 'bmm', imageBase64: VALID_JPEG_B64, mimeType: 'image/jpeg' },
    clientIp: '5.5.5.5',
  });
  assert.equal(first.status, 503);
  assert.equal((first.body as any).degraded, 'paused');
  assert.equal(analyzeCalls, 1);

  const second = await handler({
    rawBody: { commerceId: 'bmm', imageBase64: VALID_JPEG_B64, mimeType: 'image/jpeg' },
    clientIp: '5.5.5.5',
  });
  assert.equal(second.status, 503);
  assert.equal((second.body as any).degraded, 'paused');
  assert.equal(analyzeCalls, 1); // Did NOT call Gemini while breaker is open
});

test('Stage 2 rerank failure degrades cleanly to 200 rerank_skipped with Stage 1 items', async () => {
  const ecometriFixture = [
    { id: '1', name: 'Termo A', picture_url: 'a.jpg', url: 'termo-a', price: 20000 },
    { id: '2', name: 'Termo B', picture_url: 'b.jpg', url: 'termo-b', price: 25000 },
    { id: '3', name: 'Termo C', picture_url: 'c.jpg', url: 'termo-c', price: 30000 },
  ];

  const mockGemini: GeminiClient = {
    async analyze() {
      return {
        label: 'Termo',
        exactTerms: ['termo'],
        functionalTerms: [],
        broadRoots: [],
      };
    },
    async rerank() {
      throw new Error('Stage 2 timeout');
    },
  };

  const handler = createVisualSearchHandler({
    resolveCommerceFn: async () => ({
      commerceId: 'bmm',
      isAlias: false,
      data: { ecometri: SAMPLE_CFG },
    }),
    geminiClient: mockGemini,
    fetchFn: async (url) => {
      if (String(url).includes('apiv2.ecometri.shop')) {
        return new Response(JSON.stringify(ecometriFixture), { status: 200 });
      }
      return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      });
    },
  });

  const res = await handler({
    rawBody: { commerceId: 'bmm', imageBase64: VALID_JPEG_B64, mimeType: 'image/jpeg' },
    clientIp: '7.7.7.7',
  });

  assert.equal(res.status, 200);
  const body = res.body as any;
  assert.equal(body.degraded, 'rerank_skipped');
  assert.equal(body.items.length, 3);
  assert.equal(JSON.stringify(body).includes(SAMPLE_CFG.storeId), false);
});

test('planQueries blocks ambiguous modifiers (presion), derives typo-resilient 5-char stem (tensi), and empty rerank rejects unrelated items', () => {
  const analysis = parseVisualAnalysis({
    label: 'Tensiometro digital',
    exactTerms: ['tensionetro', 'presion', 'digital'],
    functionalTerms: [],
    broadRoots: [],
  });
  assert.ok(analysis);

  const r1 = planQueries(analysis, 1);
  assert.equal(r1.includes('presion'), false);
  assert.equal(r1.includes('digital'), false);
  assert.deepEqual(r1, ['tensionetro']);

  const r2 = planQueries(analysis, 2);
  assert.equal(r2.includes('tensi'), true);

  // Explicit empty orderedIds [] means Gemini rejected all unrelated candidates (e.g. Olla a presion)
  const rejected = parseRerankResult({ orderedIds: [] }, ['olla-1', 'olla-2']);
  assert.deepEqual(rejected, []);

  const candidates: ProductDTO[] = [
    { id: 'olla-1', slug: 'olla-1', title: 'Olla a presion', sku: null, priceCop: 95000, inStock: true, imageUrl: null, description: null, productUrl: 'https://x.com/olla-1/' },
  ];
  assert.deepEqual(applyRerank(candidates, rejected), []);
});

test('FASE_3 UI components contain zero emojis', () => {
  const EMOJI_RE = /\p{Extended_Pictographic}/u;
  const root = path.resolve(process.cwd());
  const triggerSrc = fs.readFileSync(path.join(root, 'app', '[comercio]', 'VisualSearchTrigger.tsx'), 'utf8');
  const panelSrc = fs.readFileSync(path.join(root, 'app', '[comercio]', 'VisualSearchPanel.tsx'), 'utf8');
  assert.equal(EMOJI_RE.test(triggerSrc), false);
  assert.equal(EMOJI_RE.test(panelSrc), false);
});
