import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEcometriProductHandler,
  normalizeProductDetail,
  PRODUCT_CACHE_CONTROL,
} from '../productDetail';
import type { EcometriConfig } from '../types';

const SAMPLE_CFG: EcometriConfig = {
  enabled: true,
  storeId: '50da18bb-6431-4220-a1ce-39f0b2837ce6',
  storeBaseUrl: 'https://bodegamayoristamtr.ecometri.shop/3217535900',
  allowedImageHost: 'd1b50uin55dq3m.cloudfront.net',
};

test('normalizeProductDetail extracts SKU, availability and ignores generic description from JSON-LD', () => {
  const html = `
    <html><head>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Product","name":"Termo licuadora","sku":"802665","description":"Ver detalle del producto Termo licuadora","offers":{"@type":"Offer","availability":"https://schema.org/InStock"}}
      </script>
    </head><body></body></html>
  `;
  const detail = normalizeProductDetail(html);
  assert.equal(detail.sku, '802665');
  assert.equal(detail.inStock, true);
  assert.equal(detail.description, null);
});

test('normalizeProductDetail falls back to RSC tokens when JSON-LD is absent', () => {
  const html = `<html><body><script>self.__next_f.push([1,"{\\"sku\\":\\"200041\\",\\"availability\\":\\"https://schema.org/OutOfStock\\"}"])</script></body></html>`;
  const detail = normalizeProductDetail(html);
  assert.equal(detail.sku, '200041');
  assert.equal(detail.inStock, false);
  assert.equal(detail.description, null);
});

test('normalizeProductDetail returns nulls on plain HTML without JSON-LD or RSC', () => {
  const detail = normalizeProductDetail('<html><body><h1>Hola</h1></body></html>');
  assert.deepEqual(detail, { sku: null, inStock: null, description: null });
});

test('product handler rejects invalid/SSRF slugs with 400 without invoking fetch', async () => {
  let fetchCalled = false;
  const handler = createEcometriProductHandler({
    bypassRateLimit: true,
    resolveCommerceFn: async () => ({
      commerceId: 'bmm',
      isAlias: true,
      data: { ecometri: SAMPLE_CFG },
    }),
    fetchFn: async () => {
      fetchCalled = true;
      throw new Error('Should not be called');
    },
  });

  for (const badSlug of ['', '../secret', 'foo%2Fbar', 'foo@evil.com', 'Mayusculas-123', 'a/b']) {
    const res = await handler({ commerce: 'bmm', slug: badSlug });
    assert.equal(res.status, 400, `Expected 400 for slug "${badSlug}"`);
  }
  assert.equal(fetchCalled, false);
});

test('product handler returns 404 without invoking fetch when commerce has no ecometri config', async () => {
  let fetchCalled = false;
  const handler = createEcometriProductHandler({
    bypassRateLimit: true,
    resolveCommerceFn: async () => ({
      commerceId: 'otro',
      isAlias: false,
      data: { businessName: 'Otro' },
    }),
    fetchFn: async () => {
      fetchCalled = true;
      throw new Error('Should not be called');
    },
  });

  const res = await handler({ commerce: 'otro', slug: 'termo-licuadora-c1c150' });
  assert.equal(res.status, 404);
  assert.equal(fetchCalled, false);
});

test('product handler uses redirect:error, returns 200 with Cache-Control, never exposes storeId, and logs parse_miss', async () => {
  let capturedUrl = '';
  let capturedRedirect: RequestRedirect | undefined;
  const warnings: string[] = [];

  const handler = createEcometriProductHandler({
    bypassRateLimit: true,
    logger: { warn: (msg) => warnings.push(msg) },
    resolveCommerceFn: async () => ({
      commerceId: 'bodega-mayorista-monteria',
      isAlias: false,
      data: { ecometri: SAMPLE_CFG },
    }),
    fetchFn: async (input, init) => {
      capturedUrl = String(input);
      capturedRedirect = init?.redirect;
      return new Response('<html><body>No JSON-LD here</body></html>', { status: 200 });
    },
  });

  const res = await handler({ commerce: 'bmm', slug: 'termo-licuadora-c1c150' });
  assert.equal(res.status, 200);
  assert.equal(capturedUrl, 'https://bodegamayoristamtr.ecometri.shop/3217535900/termo-licuadora-c1c150/');
  assert.equal(capturedRedirect, 'error');
  assert.equal(res.headers?.['Cache-Control'], PRODUCT_CACHE_CONTROL);
  assert.deepEqual(res.body, { sku: null, inStock: null, description: null });
  assert.equal(JSON.stringify(res.body).includes(SAMPLE_CFG.storeId), false);
  assert.equal(warnings.includes('[ecometri-product] parse_miss'), true);
});

test('product handler degrades gracefully on timeout (504) and redirect/network failure (502)', async () => {
  const timeoutHandler = createEcometriProductHandler({
    bypassRateLimit: true,
    timeoutMs: 25,
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

  const tRes = await timeoutHandler({ commerce: 'bmm', slug: 'termo-licuadora-c1c150' });
  assert.equal(tRes.status, 504);
  assert.deepEqual(tRes.body, { sku: null, inStock: null, description: null });

  const redirectErrHandler = createEcometriProductHandler({
    bypassRateLimit: true,
    resolveCommerceFn: async () => ({
      commerceId: 'bmm',
      isAlias: false,
      data: { ecometri: SAMPLE_CFG },
    }),
    fetchFn: async () => {
      throw new TypeError('Failed to fetch: redirect mode is error');
    },
  });

  const rRes = await redirectErrHandler({ commerce: 'bmm', slug: 'termo-licuadora-c1c150' });
  assert.equal(rRes.status, 502);
  assert.deepEqual(rRes.body, { sku: null, inStock: null, description: null });
});
