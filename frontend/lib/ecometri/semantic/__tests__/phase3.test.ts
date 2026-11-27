import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { CatalogIndexStore } from '../../catalogIndex';
import type { GeminiClient } from '../../geminiClient';
import { createEcometriSearchHandler } from '../../searchHandler';
import type { EcometriConfig, ProductDTO } from '../../types';
import { createVisualSearchHandler } from '../../visualSearchHandler';
import { buildSemanticIndexFromItems } from '../loadIndex';
import { InMemorySemanticStore } from '../shards';
import { mergeLiveAndSemantic, scoreTextQuery, toLiveProduct } from '../searchJoin';
import { CURRENT_PROMPT_VERSION, type SemanticItem } from '../types';

const SEMANTIC_CFG: EcometriConfig = {
  enabled: true,
  visualSearchEnabled: true,
  semanticIndexEnabled: true,
  storeId: '50da18bb-6431-4220-a1ce-39f0b2837ce6',
  storeBaseUrl: 'https://bodegamayoristamtr.ecometri.shop/3217535900',
  allowedImageHost: 'd1b50uin55dq3m.cloudfront.net',
};

const VALID_JPEG_B64 = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
]).toString('base64');

function mkLiveDto(overrides: Partial<ProductDTO> & { id: string; title: string; sku: string }): ProductDTO {
  return {
    id: overrides.id,
    slug: `${overrides.id}-slug`,
    title: overrides.title,
    sku: overrides.sku,
    priceCop: overrides.priceCop ?? 42000,
    inStock: overrides.inStock ?? true,
    imageUrl:
      overrides.imageUrl !== undefined
        ? overrides.imageUrl
        : `https://d1b50uin55dq3m.cloudfront.net/fit-in/600x600/${overrides.id}.jpg`,
    description: overrides.description ?? null,
    productUrl: `https://bodegamayoristamtr.ecometri.shop/3217535900/${overrides.id}-slug/`,
  };
}

function mkSemantic(overrides: Partial<SemanticItem> & { ecometriId: string; sku: string; displayTitle: string }): SemanticItem {
  return {
    ecometriId: overrides.ecometriId,
    sku: overrides.sku,
    imageKey: `${overrides.ecometriId}.jpg`,
    displayTitle: overrides.displayTitle,
    article: overrides.article ?? 'articulo',
    brand: overrides.brand ?? null,
    modelRef: overrides.modelRef ?? null,
    colors: overrides.colors ?? [],
    keywords: overrides.keywords ?? [],
    visualSummary:
      overrides.visualSummary ?? 'Descripcion curada a partir de la foto del producto.',
    source: 'vision',
    status: 'ok',
    enrichedAt: '2026-11-27T01:00:00.000Z',
    promptVersion: CURRENT_PROMPT_VERSION,
  };
}

test('searchHandler + mergeLiveAndSemantic: exact SKU 801268 resolves active twin with LIVE price/stock, synonym search finds broken Ecometri titles, and live price updates reflect immediately', async () => {
  let currentPowerBankPrice = 58000;

  const semanticItems: SemanticItem[] = [
    mkSemantic({
      ecometriId: 'e6b4ac',
      sku: '801268',
      displayTitle: 'Power Bank Bateria Portatil Negra',
      article: 'power bank',
      brand: 'Basik',
      modelRef: 'PB-X',
      colors: ['negro'],
      keywords: ['powerbank', 'bateria portatil', 'cargador externo'],
      visualSummary: 'Bateria portatil compacta color negro con doble puerto USB.',
    }),
    mkSemantic({
      ecometriId: 'tm-01',
      sku: '300555',
      displayTitle: 'Tensiometro Digital de Brazo',
      article: 'tensiometro',
      keywords: ['baumanometro', 'multimetro', 'medidor presion'],
      visualSummary: 'Monitor digital de presion arterial con brazalete ajustable.',
    }),
  ];

  const semIndex = buildSemanticIndexFromItems(1, semanticItems);

  const catalogStore: CatalogIndexStore = {
    async getOrFetch() {
      return [
        // Ghost out-of-stock twin sharing SKU 801268 with stale price 30000
        mkLiveDto({
          id: 'fa8a93',
          sku: '801268',
          title: 'Power, Band',
          priceCop: 30000,
          inStock: false,
        }),
        // Active in-stock twin with live dynamic price
        mkLiveDto({
          id: 'e6b4ac',
          sku: '801268',
          title: 'Power, Band',
          priceCop: currentPowerBankPrice,
          inStock: true,
        }),
        mkLiveDto({
          id: 'tm-01',
          sku: '300555',
          title: 'Tension metro',
          priceCop: 65000,
          inStock: true,
        }),
      ];
    },
  };

  let upstreamCalled = false;
  const handler = createEcometriSearchHandler({
    bypassRateLimit: true,
    resolveCommerceFn: async () => ({
      commerceId: 'bodega-mayorista-monteria',
      isAlias: false,
      data: { ecometri: SEMANTIC_CFG },
    }),
    catalogIndexStore: catalogStore,
    semanticStoreFactory: () => new InMemorySemanticStore(),
    loadSemanticIndexFn: async () => semIndex,
    fetchFn: async () => {
      upstreamCalled = true;
      throw new Error('Upstream should not be called when semantic index matches');
    },
  });

  // 1. Exact SKU 801268 returns ONLY the active twin with live price 58000, original title preserved, and curated displayTitle + attributes + AI description
  const skuRes = await handler({ commerce: 'bmm', term: '801268', page: '1' });
  assert.equal(skuRes.status, 200);
  const skuBody = skuRes.body as { items: ProductDTO[]; total: number };
  assert.equal(skuBody.total, 1);
  assert.equal(skuBody.items[0].id, 'e6b4ac');
  assert.equal(skuBody.items[0].title, 'Power, Band'); // Original live title intact (adr-f763cc01)
  assert.equal(skuBody.items[0].displayTitle, 'Power Bank Bateria Portatil Negra');
  assert.equal(skuBody.items[0].priceCop, 58000);
  assert.equal(skuBody.items[0].inStock, true);
  assert.equal(skuBody.items[0].descriptionSource, 'ai');
  assert.equal(skuBody.items[0].attributes?.brand, 'Basik');
  assert.equal(upstreamCalled, false);

  // 2. Synonym "multimetro" finds "Tension metro" via semantic keywords!
  const synRes = await handler({ commerce: 'bmm', term: 'multimetro', page: '1' });
  assert.equal(synRes.status, 200);
  const synBody = synRes.body as { items: ProductDTO[] };
  assert.equal(synBody.items[0].id, 'tm-01');
  assert.equal(synBody.items[0].displayTitle, 'Tensiometro Digital de Brazo');

  // 3. Compound synonym "powerbank" matches "Power, Band"
  const pbRes = await handler({ commerce: 'bmm', term: 'powerbank', page: '1' });
  assert.equal((pbRes.body as { items: ProductDTO[] }).items[0].id, 'e6b4ac');

  // 4. Live price changes in Ecometri (58000 -> 49900) -> immediately reflected WITHOUT touching semantic index!
  currentPowerBankPrice = 49900;
  const updatedPriceRes = await handler({ commerce: 'bmm', term: '801268', page: '1' });
  assert.equal((updatedPriceRes.body as { items: ProductDTO[] }).items[0].priceCop, 49900);
});

test('D12 & D5 governance: semanticIndexEnabled=false executes ZERO semantic reads, and Firestore failure degrades gracefully to upstream search', async () => {
  let semanticLoaderCalls = 0;
  let upstreamCalls = 0;

  const upstreamFixture = [
    { id: 'up-1', name: 'Termo Acero', url: 'termo-1', price: 29000, quantity_available: 4 },
  ];

  // 1. Flag disabled -> 0 reads to semantic loader
  const disabledHandler = createEcometriSearchHandler({
    bypassRateLimit: true,
    resolveCommerceFn: async () => ({
      commerceId: 'bmm',
      isAlias: false,
      data: { ecometri: { ...SEMANTIC_CFG, semanticIndexEnabled: false } },
    }),
    loadSemanticIndexFn: async () => {
      semanticLoaderCalls += 1;
      return null;
    },
    fetchFn: async () => {
      upstreamCalls += 1;
      return new Response(JSON.stringify(upstreamFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  const resDisabled = await disabledHandler({ commerce: 'bmm', term: 'termo', page: '1' });
  assert.equal(resDisabled.status, 200);
  assert.equal(semanticLoaderCalls, 0);
  assert.equal(upstreamCalls, 1);

  // 2. Flag enabled, but Firestore throws error -> degrades cleanly to upstream 200 (never 500)
  const brokenFirestoreHandler = createEcometriSearchHandler({
    bypassRateLimit: true,
    resolveCommerceFn: async () => ({
      commerceId: 'bmm',
      isAlias: false,
      data: { ecometri: SEMANTIC_CFG },
    }),
    loadSemanticIndexFn: async () => {
      semanticLoaderCalls += 1;
      throw new Error('FIRESTORE_DOWN');
    },
    fetchFn: async () => {
      upstreamCalls += 1;
      return new Response(JSON.stringify(upstreamFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  const resDegraded = await brokenFirestoreHandler({
    commerce: 'bmm',
    term: 'termo',
    page: '1',
  });
  assert.equal(resDegraded.status, 200);
  assert.equal(semanticLoaderCalls, 1);
  assert.equal((resDegraded.body as { items: ProductDTO[] }).items[0].id, 'up-1');
});

test('visualSearchHandler D11: uses semantic fields to disambiguate generic "Mouse" items and passes curated displayTitle + attributes to UI', async () => {
  const liveMice: ProductDTO[] = [
    mkLiveDto({ id: 'm-black', sku: '200001', title: 'Mouse inalambrico', priceCop: 18000 }),
    mkLiveDto({ id: 'm-pink', sku: '200002', title: 'Mouse inalambrico', priceCop: 22000 }),
  ];

  const semIndex = buildSemanticIndexFromItems(1, [
    mkSemantic({
      ecometriId: 'm-black',
      sku: '200001',
      displayTitle: 'Mouse Inalambrico Optico Negro',
      article: 'mouse inalambrico',
      colors: ['negro'],
      keywords: ['raton', 'mouse negro'],
    }),
    mkSemantic({
      ecometriId: 'm-pink',
      sku: '200002',
      displayTitle: 'Mouse Inalambrico Silencioso Rosado',
      article: 'mouse inalambrico',
      brand: 'LogiPlus',
      colors: ['rosado'],
      keywords: ['raton rosado', 'mouse silencioso'],
      visualSummary: 'Mouse ergonomico inalambrico en acabado rosado mate.',
    }),
  ]);

  let stage2CandidateTitles: string[] = [];
  const fakeGemini: GeminiClient = {
    async analyze() {
      return {
        label: 'Mouse inalambrico rosado',
        exactTerms: ['mouse', 'rosado'],
        functionalTerms: ['raton silencioso'],
        broadRoots: ['mouse'],
      };
    },
    async rerank(_img, candidates) {
      stage2CandidateTitles = candidates.map((c) => c.title);
      return { exactIds: ['m-pink'], similarIds: ['m-black'] };
    },
  };

  const handler = createVisualSearchHandler({
    resolveCommerceFn: async () => ({
      commerceId: 'bmm',
      isAlias: false,
      data: { ecometri: SEMANTIC_CFG },
    }),
    geminiClient: fakeGemini,
    catalogIndexStore: {
      async getOrFetch() {
        return liveMice;
      },
    },
    loadSemanticIndexFn: async () => semIndex,
    fetchFn: async () =>
      new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      }),
  });

  const res = await handler({
    rawBody: { commerceId: 'bmm', imageBase64: VALID_JPEG_B64, mimeType: 'image/jpeg' },
    deviceId: 'dev_vis_sem_1',
  });

  assert.equal(res.status, 200);
  assert.ok(stage2CandidateTitles.includes('Mouse Inalambrico Silencioso Rosado'));
  const body = res.body as { items: ProductDTO[] };
  assert.equal(body.items[0].id, 'm-pink');
  assert.equal(body.items[0].title, 'Mouse inalambrico');
  assert.equal(body.items[0].displayTitle, 'Mouse Inalambrico Silencioso Rosado');
  assert.equal(body.items[0].attributes?.brand, 'LogiPlus');
  assert.equal(body.items[0].priceCop, 22000);
});

test('scoreTextQuery enforces v3.0 fixed hierarchy: SKU exact > modelRef exact (>=4 chars, hyphen-insensitive) > SKU prefix > title/semantic fields, and tolerates mixed v2/v3 index', async () => {
  const [enriched] = mergeLiveAndSemantic(
    [toLiveProduct(mkLiveDto({ id: 'p1', sku: '801545', title: 'Power Bank Vizzon' }))],
    buildSemanticIndexFromItems(1, [
      mkSemantic({
        ecometriId: 'p1',
        sku: '801545',
        displayTitle: 'Power Bank Magnetico Vizzon VN19 5000mAh',
        article: 'power bank',
        brand: 'Vizzon',
        modelRef: 'VN-19',
        keywords: ['cargador portatil', 'vn19'],
      }),
    ])
  );

  const exactSku = scoreTextQuery('801545', enriched);
  const exactModelNoHyphen = scoreTextQuery('vn19', enriched);
  const exactModelWithHyphen = scoreTextQuery('VN-19', enriched);
  const prefixSku = scoreTextQuery('8015', enriched);
  const titleHit = scoreTextQuery('power bank', enriched);
  const keywordHit = scoreTextQuery('cargador portatil', enriched);

  assert.equal(exactSku, 10_000);
  assert.equal(exactModelNoHyphen, 1_200);
  assert.equal(exactModelWithHyphen, 1_200);
  assert.ok(exactSku > exactModelNoHyphen);
  assert.ok(exactModelNoHyphen > prefixSku);
  assert.ok(prefixSku > titleHit);
  assert.ok(titleHit > keywordHit);
  assert.ok(keywordHit > 0);

  // Short modelRef (<4 chars, e.g. "K9") does NOT trigger the 1200 exact boost (prevents false positives)
  const [shortRefItem] = mergeLiveAndSemantic(
    [toLiveProduct(mkLiveDto({ id: 'p-short', sku: '803297', title: 'Microfono K9' }))],
    buildSemanticIndexFromItems(1, [
      {
        ...mkSemantic({
          ecometriId: 'p-short',
          sku: '803297',
          displayTitle: 'Microfono Inalambrico K9',
          article: 'microfono',
          modelRef: 'K9',
          keywords: ['k9', 'lavalier'],
        }),
        promptVersion: 'v2.0', // Also verifies mixed v2.0 + v3.0 coexistence!
      },
    ])
  );
  const k9Score = scoreTextQuery('k9', shortRefItem);
  assert.ok(k9Score > 0 && k9Score < 900);

  // Visual search Stage 1 extracting ["powerbank", "vizzon", "vn19"] + 300x300 Stage 2 thumbnail puts VN19 #1 within 9.2s budget
  const fetchedThumbUrls: string[] = [];
  const visHandler = createVisualSearchHandler({
    resolveCommerceFn: async () => ({
      commerceId: 'bmm',
      isAlias: false,
      data: { ecometri: SEMANTIC_CFG },
    }),
    geminiClient: {
      async analyze() {
        return {
          label: 'Power Bank Vizzon VN19',
          exactTerms: ['powerbank', 'vizzon', 'vn19'],
          functionalTerms: ['carga inalambrica'],
          broadRoots: ['power'],
        };
      },
      async rerank(_img, candidates) {
        return { exactIds: [candidates[0].id], similarIds: candidates.slice(1).map((c) => c.id) };
      },
    },
    catalogIndexStore: {
      async getOrFetch() {
        return [
          mkLiveDto({ id: 'other-pb', sku: '801268', title: 'Power, Band', priceCop: 30000 }),
          mkLiveDto({ id: 'vz-801545', sku: '801545', title: 'Power Bank Vizzon', priceCop: 40000 }),
        ];
      },
    },
    loadSemanticIndexFn: async () =>
      buildSemanticIndexFromItems(2, [
        {
          ...mkSemantic({
            ecometriId: 'other-pb',
            sku: '801268',
            displayTitle: 'Power Bank Basica Negra',
            article: 'power bank',
          }),
          promptVersion: 'v2.0',
        },
        mkSemantic({
          ecometriId: 'vz-801545',
          sku: '801545',
          displayTitle: 'Power Bank Magnetico Vizzon VN19 5000mAh',
          article: 'power bank',
          brand: 'Vizzon',
          modelRef: 'VN19',
          keywords: ['vn19', 'vizzon', 'powerbank'],
        }),
      ]),
    fetchFn: async (url) => {
      fetchedThumbUrls.push(String(url));
      return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      });
    },
  });

  const visRes = await visHandler({
    rawBody: { commerceId: 'bmm', imageBase64: VALID_JPEG_B64, mimeType: 'image/jpeg' },
    deviceId: 'dev_vn19_test',
  });
  assert.equal(visRes.status, 200);
  assert.equal((visRes.body as { items: ProductDTO[] }).items[0].id, 'vz-801545');
  assert.ok(fetchedThumbUrls.some((u) => u.includes('/fit-in/300x300/')));
});

test('mixed fallback branch (D1 + D10): when semanticIndex is loaded but live catalogIndex fails or returns 0 matches, handler falls back to upstream preserving live price/stock without partial-window twin distortion', async () => {
  const semIndex = buildSemanticIndexFromItems(1, [
    mkSemantic({
      ecometriId: 'up-prod-1',
      sku: '801268',
      displayTitle: 'Power Bank Curada Negra',
      article: 'power bank',
      brand: 'Basik',
      visualSummary: 'Bateria portatil compacta negra.',
    }),
  ]);

  let upstreamCalled = false;
  const handler = createEcometriSearchHandler({
    bypassRateLimit: true,
    resolveCommerceFn: async () => ({
      commerceId: 'bmm',
      isAlias: false,
      data: { ecometri: SEMANTIC_CFG },
    }),
    // Live catalogIndex fails -> forces fallback to fetchUpstreamPage while semanticIndex IS loaded!
    catalogIndexStore: {
      async getOrFetch() {
        throw new Error('CATALOG_FEED_TIMEOUT');
      },
    },
    loadSemanticIndexFn: async () => semIndex,
    fetchFn: async () => {
      upstreamCalled = true;
      return new Response(
        JSON.stringify([
          {
            id: 'up-prod-1',
            name: 'Power, Band',
            sku: '801268',
            url: 'power-band-up',
            price: 63900,
            quantity_available: 0,
          },
          {
            id: 'up-prod-2',
            name: 'Power, Band Variante',
            sku: '801268',
            url: 'power-band-var',
            price: 71000,
            quantity_available: 4,
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    },
  });

  const res = await handler({ commerce: 'bmm', term: 'power', page: '1' });
  assert.equal(res.status, 200);
  assert.equal(upstreamCalled, true);

  const body = res.body as { items: ProductDTO[]; total: number };
  // Both upstream records are preserved (deduplicateTwins: false on partial upstream window),
  // with inStock=true first (`up-prod-2` at 71000) and `up-prod-1` keeping live price 63900 & inStock=false!
  assert.equal(body.total, 2);
  assert.equal(body.items[0].id, 'up-prod-2');
  assert.equal(body.items[0].priceCop, 71000);
  assert.equal(body.items[0].inStock, true);

  assert.equal(body.items[1].id, 'up-prod-1');
  assert.equal(body.items[1].priceCop, 63900);
  assert.equal(body.items[1].inStock, false);
  assert.equal(body.items[1].displayTitle, 'Power Bank Curada Negra');
  assert.equal(body.items[1].attributes?.brand, 'Basik');
});

test('semantic route global pagination (adr-d237394b) & curated UI contract: inStock-first precedes higher-score out-of-stock across pages 1..2, preserving score order within groups', async () => {
  // 6 matching items: `oos-top` has the HIGHEST semantic score (exact SKU/title match)
  // but is out of stock (`inStock: false`), while `s1..s5` are `inStock: true` with descending scores.
  const liveItems: ProductDTO[] = [
    mkLiveDto({ id: 'oos-top', sku: '900100', title: 'Mouse Gamer Pro Elite', inStock: false }),
    mkLiveDto({ id: 's-low', sku: '900105', title: 'Tapete apoyo', inStock: true }),
    mkLiveDto({ id: 's-high', sku: '900101', title: 'Mouse Gamer Pro', inStock: true }),
    mkLiveDto({ id: 's-mid1', sku: '900102', title: 'Mouse Optico', inStock: true }),
    mkLiveDto({ id: 's-mid2', sku: '900103', title: 'Mouse Vertical', inStock: true }),
    mkLiveDto({ id: 's-mid3', sku: '900104', title: 'Mouse Recargable', inStock: true }),
  ];

  const semIndex = buildSemanticIndexFromItems(1, [
    mkSemantic({
      ecometriId: 'oos-top',
      sku: '900100',
      displayTitle: 'Mouse Gamer Pro Elite RGB',
      article: 'mouse gamer pro',
      keywords: ['mouse gamer pro'],
    }),
    mkSemantic({
      ecometriId: 's-high',
      sku: '900101',
      displayTitle: 'Mouse Gamer Pro Negro',
      article: 'mouse gamer',
      keywords: ['mouse gamer'],
    }),
    mkSemantic({
      ecometriId: 's-mid1',
      sku: '900102',
      displayTitle: 'Mouse Optico Negro',
      article: 'mouse',
    }),
    mkSemantic({
      ecometriId: 's-mid2',
      sku: '900103',
      displayTitle: 'Mouse Vertical Ergonomico',
      article: 'mouse',
    }),
    mkSemantic({
      ecometriId: 's-mid3',
      sku: '900104',
      displayTitle: 'Mouse Recargable Slim',
      article: 'mouse',
    }),
    mkSemantic({
      ecometriId: 's-low',
      sku: '900105',
      displayTitle: 'Pad Para Raton',
      article: 'accesorio',
      keywords: ['mouse'],
    }),
  ]);

  const handler = createEcometriSearchHandler({
    bypassRateLimit: true,
    resolveCommerceFn: async () => ({
      commerceId: 'bmm',
      isAlias: false,
      data: { ecometri: SEMANTIC_CFG },
    }),
    catalogIndexStore: {
      async getOrFetch() {
        return liveItems;
      },
    },
    loadSemanticIndexFn: async () => semIndex,
    fetchFn: async () => {
      throw new Error('Upstream not expected');
    },
  });

  const p1 = await handler({ commerce: 'bmm', term: 'mouse gamer', page: '1' });
  const p2 = await handler({ commerce: 'bmm', term: 'mouse gamer', page: '2' });
  assert.equal(p1.status, 200);
  assert.equal(p2.status, 200);

  const b1 = p1.body as { items: ProductDTO[]; total: number; hasMore: boolean };
  const b2 = p2.body as { items: ProductDTO[]; total: number; hasMore: boolean };

  assert.equal(b1.total, 6);
  assert.equal(b1.hasMore, true);
  assert.equal(b1.items.length, 5);
  // Every item on page 1 is inStock=true, led by highest-scoring inStock item `s-high`, ending with lowest-scoring inStock `s-low`
  assert.equal(b1.items.every((x) => x.inStock), true);
  assert.equal(b1.items[0].id, 's-high');
  assert.equal(b1.items[4].id, 's-low');

  // Higher-scoring out-of-stock `oos-top` is deterministically placed on page 2
  assert.equal(b2.hasMore, false);
  assert.deepEqual(
    b2.items.map((x) => x.id),
    ['oos-top']
  );

  // Verify curated UI components wire `displayTitle || title` and `ProductQuickView` attributes cleanly
  const root = path.resolve(process.cwd());
  const resultsSrc = fs.readFileSync(path.join(root, 'app', '[comercio]', 'EcometriResults.tsx'), 'utf8');
  const visualSrc = fs.readFileSync(path.join(root, 'app', '[comercio]', 'VisualSearchPanel.tsx'), 'utf8');
  const quickViewSrc = fs.readFileSync(path.join(root, 'app', '[comercio]', 'ProductQuickView.tsx'), 'utf8');

  assert.match(resultsSrc, /item\.displayTitle \|\| item\.title/);
  assert.match(visualSrc, /item\.displayTitle \|\| item\.title/);
  assert.match(quickViewSrc, /product\?\.displayTitle \|\| product\?\.title/);
  assert.match(quickViewSrc, /Marca:/);
  assert.match(quickViewSrc, /Modelo:/);
  assert.match(quickViewSrc, /Color:/);
});
