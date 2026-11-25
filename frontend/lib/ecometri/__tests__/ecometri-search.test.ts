import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCop,
  normalizeEcometriProduct,
  sanitizeDescription,
  sortAndPaginateProducts,
  toClientEcometriConfig,
} from '../normalize';
import { createEcometriSearchHandler } from '../searchHandler';
import type { EcometriConfig } from '../types';

const SAMPLE_CFG: EcometriConfig = {
  enabled: true,
  storeId: '50da18bb-6431-4220-a1ce-39f0b2837ce6',
  storeBaseUrl: 'https://bodegamayoristamtr.ecometri.shop/3217535900',
  allowedImageHost: 'd1b50uin55dq3m.cloudfront.net',
  cartEnabled: false,
  advisorLines: [],
};

test('normalizeEcometriProduct normalizes verified Ecometri public-search fixture', () => {
  const raw = {
    id: 'c1c15098-8ff4-4e3a-9976-2f8f658389fd',
    name: 'Termo licuadora',
    picture_url: '63dcc1f1-ec9c-493f-9155-d4e8ea1896eb.jpg',
    url: 'termo-licuadora-c1c150',
    price: 30000,
    discount_price: 0,
  };

  const dto = normalizeEcometriProduct(raw, SAMPLE_CFG);
  assert.ok(dto);
  assert.equal(dto.id, 'c1c15098-8ff4-4e3a-9976-2f8f658389fd');
  assert.equal(dto.title, 'Termo licuadora');
  assert.equal(dto.priceCop, 30000);
  assert.equal(dto.inStock, true);
  assert.equal(dto.sku, null);
  assert.equal(dto.description, null);
  assert.equal(
    dto.imageUrl,
    'https://d1b50uin55dq3m.cloudfront.net/fit-in/600x600/63dcc1f1-ec9c-493f-9155-d4e8ea1896eb.jpg'
  );
  assert.equal(
    dto.productUrl,
    'https://bodegamayoristamtr.ecometri.shop/3217535900/termo-licuadora-c1c150/'
  );
});

test('normalizeEcometriProduct discards items with non-numeric or invalid price', () => {
  const badPrice = {
    id: 'bad-1',
    name: 'Producto roto',
    picture_url: 'abc.jpg',
    url: 'producto-roto',
    price: '30000',
  };
  assert.equal(normalizeEcometriProduct(badPrice, SAMPLE_CFG), null);
  assert.equal(normalizeEcometriProduct({ ...badPrice, price: 0 }, SAMPLE_CFG), null);
  assert.equal(normalizeEcometriProduct({ ...badPrice, price: Number.NaN }, SAMPLE_CFG), null);
});

test('normalizeEcometriProduct rejects images from disallowed hosts and sanitizes HTML descriptions', () => {
  const raw = {
    id: 'prod-2',
    name: '<b>Ventilador</b>',
    sku: '803353',
    picture_url: 'https://evil.example.com/x.jpg',
    url: 'ventilador-803353',
    price: 45000,
    discount_price: 39900,
    quantity_available: 0,
    description: '<p>Silencioso &amp; <b>recargable</b></p>',
  };

  const dto = normalizeEcometriProduct(raw, SAMPLE_CFG);
  assert.ok(dto);
  assert.equal(dto.title, 'Ventilador');
  assert.equal(dto.sku, '803353');
  assert.equal(dto.priceCop, 39900);
  assert.equal(dto.inStock, false);
  assert.equal(dto.imageUrl, null);
  assert.equal(dto.description, 'Silencioso & recargable');
});

test('sanitizeDescription discards empty/generic placeholders and truncates > 500 chars', () => {
  assert.equal(sanitizeDescription(''), null);
  assert.equal(sanitizeDescription('   '), null);
  assert.equal(sanitizeDescription('Ver detalle del producto Termo tetera'), null);
  assert.equal(sanitizeDescription('Sin descripción.'), null);
  assert.equal(sanitizeDescription('N/A'), null);

  const longText = 'A'.repeat(600);
  const truncated = sanitizeDescription(longText);
  assert.ok(truncated);
  assert.equal(truncated.length, 500);
  assert.ok(truncated.endsWith('...'));
});

test('toClientEcometriConfig strips storeId and formatCop formats COP integers', () => {
  const clientCfg = toClientEcometriConfig(SAMPLE_CFG);
  assert.ok(clientCfg);
  assert.equal('storeId' in clientCfg, false);
  assert.equal(clientCfg.enabled, true);
  assert.match(formatCop(45000), /45\.000/);
});

test('handler returns 404 without invoking fetch when commerce has no ecometri config', async () => {
  let fetchCalled = false;
  const handler = createEcometriSearchHandler({
    bypassRateLimit: true,
    resolveCommerceFn: async () => ({
      commerceId: 'otro-comercio',
      isAlias: false,
      data: { businessName: 'Otro' },
    }),
    fetchFn: async () => {
      fetchCalled = true;
      throw new Error('Should not be called');
    },
  });

  const res = await handler({ commerce: 'otro-comercio', term: 'termo', page: '1' });
  assert.equal(res.status, 404);
  assert.equal(fetchCalled, false);
});

test('handler validates term length and page bounds (400)', async () => {
  const handler = createEcometriSearchHandler({
    bypassRateLimit: true,
    resolveCommerceFn: async () => ({
      commerceId: 'bmm',
      isAlias: true,
      data: { ecometri: SAMPLE_CFG },
    }),
    fetchFn: async () => {
      throw new Error('Should not be called');
    },
  });

  assert.equal((await handler({ commerce: 'bmm', term: 'a', page: '1' })).status, 400);
  assert.equal((await handler({ commerce: 'bmm', term: 'a'.repeat(65), page: '1' })).status, 400);
  assert.equal((await handler({ commerce: 'bmm', term: 'termo', page: '0' })).status, 400);
  assert.equal((await handler({ commerce: 'bmm', term: 'termo', page: '51' })).status, 400);
  assert.equal((await handler({ commerce: 'bmm', term: 'termo', page: 'abc' })).status, 400);
});

test('handler globally prioritizes inStock before paginating 5 per page and never exposes storeId', async () => {
  const fixture = [
    { id: '1', name: 'Agotado A', url: 'a-1', price: 10000, quantity_available: 0 },
    { id: '2', name: 'Disponible B', url: 'b-2', price: 20000, quantity_available: 3 },
    { id: '3', name: 'Agotado C', url: 'c-3', price: 15000, quantity_available: 0 },
    { id: '4', name: 'Disponible D', url: 'd-4', price: 25000, quantity_available: 5 },
    { id: '5', name: 'Disponible E', url: 'e-5', price: 30000, quantity_available: 1 },
    { id: '6', name: 'Disponible F', url: 'f-6', price: 35000, quantity_available: 2 },
    { id: '7', name: 'Disponible G', url: 'g-7', price: 40000, quantity_available: 4 },
  ];

  const handler = createEcometriSearchHandler({
    bypassRateLimit: true,
    resolveCommerceFn: async () => ({
      commerceId: 'bodega-mayorista-monteria',
      isAlias: false,
      data: { ecometri: SAMPLE_CFG },
    }),
    fetchFn: async () =>
      new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  });

  const p1 = await handler({ commerce: 'bmm', term: 'termo', page: '1' });
  assert.equal(p1.status, 200);
  assert.equal(p1.headers?.['Cache-Control'], 'public, s-maxage=60, stale-while-revalidate=300');
  assert.equal(JSON.stringify(p1.body).includes(SAMPLE_CFG.storeId), false);

  const b1 = p1.body as any;
  assert.equal(b1.total, 7);
  assert.equal(b1.page, 1);
  assert.equal(b1.hasMore, true);
  assert.deepEqual(
    b1.items.map((x: any) => x.id),
    ['2', '4', '5', '6', '7']
  );

  const p2 = await handler({ commerce: 'bmm', term: 'termo', page: '2' });
  assert.equal(p2.status, 200);
  const b2 = p2.body as any;
  assert.equal(b2.total, 7);
  assert.equal(b2.page, 2);
  assert.equal(b2.hasMore, false);
  assert.deepEqual(
    b2.items.map((x: any) => x.id),
    ['1', '3']
  );
});

test('handler returns 504 on upstream timeout and 502 on upstream HTTP error', async () => {
  const timeoutHandler = createEcometriSearchHandler({
    bypassRateLimit: true,
    timeoutMs: 30,
    resolveCommerceFn: async () => ({
      commerceId: 'bmm',
      isAlias: false,
      data: { ecometri: SAMPLE_CFG },
    }),
    fetchFn: (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }),
  });

  const timeoutRes = await timeoutHandler({ commerce: 'bmm', term: 'termo', page: '1' });
  assert.equal(timeoutRes.status, 504);
  assert.equal(JSON.stringify(timeoutRes.body).includes(SAMPLE_CFG.storeId), false);

  const errHandler = createEcometriSearchHandler({
    bypassRateLimit: true,
    resolveCommerceFn: async () => ({
      commerceId: 'bmm',
      isAlias: false,
      data: { ecometri: SAMPLE_CFG },
    }),
    fetchFn: async () => new Response('Server error', { status: 500 }),
  });

  const errRes = await errHandler({ commerce: 'bmm', term: 'termo', page: '1' });
  assert.equal(errRes.status, 502);
});

test('sortAndPaginateProducts keeps deterministic tie-breaking across pages', () => {
  const items = Array.from({ length: 7 }, (_, i) => ({
    id: `id-${i}`,
    title: `Item ${i}`,
    sku: null,
    priceCop: 1000 * (i + 1),
    inStock: i % 2 === 1,
    imageUrl: null,
    description: null,
    productUrl: `https://bodegamayoristamtr.ecometri.shop/3217535900/item-${i}/`,
  }));

  const p1 = sortAndPaginateProducts(items, 1, 5);
  const p2 = sortAndPaginateProducts(items, 2, 5);
  const combined = [...p1.items, ...p2.items].map((i) => i.id);
  assert.deepEqual(combined, ['id-1', 'id-3', 'id-5', 'id-0', 'id-2', 'id-4', 'id-6']);
});
