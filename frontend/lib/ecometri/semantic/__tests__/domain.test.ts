import test from 'node:test';
import assert from 'node:assert/strict';
import { extractImageKey } from '../imageKey';
import { computeDelta } from '../delta';
import {
  buildTextOnlySemanticItem,
  hasInventedTechSpecs,
  hasPhotoNarration,
  parseEnrichment,
} from '../parseEnrichment';
import {
  computeShardHash,
  InMemorySemanticStore,
  partitionShards,
} from '../shards';
import { deduplicateGhostTwins, resolveSkuTwins } from '../twins';
import {
  CURRENT_PROMPT_VERSION,
  SEMANTIC_SCHEMA_VERSION,
  type LiveProduct,
  type SemanticItem,
} from '../types';

function mkLive(overrides: Partial<LiveProduct> & { ecometriId: string; sku: string; title: string }): LiveProduct {
  const imageKey =
    overrides.imageKey !== undefined
      ? overrides.imageKey
      : `${overrides.ecometriId}-img.jpg`;
  return {
    id: overrides.ecometriId,
    ecometriId: overrides.ecometriId,
    slug: `${overrides.ecometriId}-slug`,
    title: overrides.title,
    sku: overrides.sku,
    priceCop: overrides.priceCop ?? 35000,
    inStock: overrides.inStock ?? true,
    active: overrides.active ?? true,
    imageKey,
    imageUrl: imageKey
      ? `https://d1b50uin55dq3m.cloudfront.net/fit-in/600x600/${imageKey}`
      : null,
    description: null,
    productUrl: `https://bodegamayoristamtr.ecometri.shop/3217535900/${overrides.ecometriId}-slug/`,
  };
}

function mkStored(overrides: Partial<SemanticItem> & { ecometriId: string; sku: string }): SemanticItem {
  return {
    ecometriId: overrides.ecometriId,
    sku: overrides.sku,
    imageKey:
      overrides.imageKey !== undefined
        ? overrides.imageKey
        : `${overrides.ecometriId}-img.jpg`,
    displayTitle: overrides.displayTitle ?? 'Producto Curado',
    article: overrides.article ?? 'producto',
    brand: overrides.brand ?? null,
    modelRef: overrides.modelRef ?? null,
    colors: overrides.colors ?? ['negro'],
    keywords: overrides.keywords ?? ['producto', 'hogar'],
    visualSummary:
      overrides.visualSummary ?? 'Producto de uso cotidiano en presentacion individual.',
    source: overrides.source ?? 'vision',
    status: overrides.status ?? 'ok',
    enrichedAt: overrides.enrichedAt ?? '2026-11-27T00:00:00.000Z',
    promptVersion: overrides.promptVersion ?? CURRENT_PROMPT_VERSION,
  };
}

test('D1 schema invariant: SemanticItem contains zero price, discount, stock, slug, or active fields', () => {
  const parsed = parseEnrichment(
    {
      displayTitle: 'Power Bank Bateria Portatil',
      article: 'power bank',
      brand: 'Basik',
      modelRef: 'PB-10',
      colors: ['Negro'],
      keywords: ['powerbank', 'bateria portatil', 'cargador externo'],
      visualSummary: 'Bateria portatil compacta color negro con puertos USB visibles.',
      // Untrusted extra live fields that must NEVER leak into SemanticItem:
      price: 55000,
      priceCop: 55000,
      discount_price: 45000,
      inStock: true,
      stock: 11,
      quantity_available: 11,
      slug: 'power-band-e6b4ac',
      active: true,
    },
    {
      ecometriId: 'e6b4ac',
      sku: '801268',
      rawTitle: 'Power, Band',
      imageKey: 'uuid-pb.jpg',
      promptVersion: CURRENT_PROMPT_VERSION,
      nowIso: '2026-11-27T01:00:00.000Z',
    }
  );

  assert.ok(parsed);
  const forbiddenKeys = [
    'price',
    'priceCop',
    'discount_price',
    'inStock',
    'stock',
    'quantity_available',
    'slug',
    'active',
  ];
  for (const key of forbiddenKeys) {
    assert.equal(key in parsed, false, `Forbidden live field "${key}" leaked into SemanticItem`);
  }
});

test('extractImageKey canonicalizes CloudFront URLs and raw filenames and rejects invalid paths', () => {
  assert.equal(
    extractImageKey('https://d1b50uin55dq3m.cloudfront.net/fit-in/600x600/8F0FDB23-e81e.JPEG?v=2'),
    '8f0fdb23-e81e.jpeg'
  );
  assert.equal(extractImageKey('  63dcc1f1-ec9c.jpg  '), '63dcc1f1-ec9c.jpg');
  assert.equal(extractImageKey(''), null);
  assert.equal(extractImageKey(null), null);
  assert.equal(extractImageKey('../secret.jpg'), null);
});

test('computeDelta: price or stock change produces 0 dirty; imageKey change is dirty; shared imageKey is reusable; deleted is removed', () => {
  const stored: SemanticItem[] = [
    mkStored({ ecometriId: 'id-1', sku: '100001', imageKey: 'img-a.jpg' }),
    mkStored({ ecometriId: 'id-2', sku: '100002', imageKey: 'img-b.jpg' }),
    mkStored({ ecometriId: 'id-deleted', sku: '100999', imageKey: 'img-del.jpg' }),
  ];

  const live: LiveProduct[] = [
    // id-1 changed price (35k -> 49k), title, and went out of stock, SAME imageKey -> 0 dirty!
    mkLive({ ecometriId: 'id-1', sku: '100001', title: 'Termo Acero Nuevo Titulo', imageKey: 'img-a.jpg', priceCop: 49000, inStock: false }),
    // id-2 corrected its photo in Ecometri -> dirty!
    mkLive({ ecometriId: 'id-2', sku: '100002', title: 'Mouse', imageKey: 'img-b-new.jpg' }),
    // id-3 is brand new but shares img-a.jpg with id-1 -> reusable (0 AI calls)!
    mkLive({ ecometriId: 'id-3', sku: '100001', title: 'Termo twin', imageKey: 'img-a.jpg' }),
    // id-4 and id-5 are both new and share img-c.jpg -> id-4 dirty, id-5 reusable -> id-4!
    mkLive({ ecometriId: 'id-4', sku: '100004', title: 'Lampara', imageKey: 'img-c.jpg' }),
    mkLive({ ecometriId: 'id-5', sku: '100004', title: 'Lampara twin', imageKey: 'img-c.jpg' }),
  ];

  const delta = computeDelta(live, stored, CURRENT_PROMPT_VERSION);
  assert.deepEqual(
    delta.dirty.map((d) => d.ecometriId),
    ['id-2', 'id-4']
  );
  assert.equal(delta.reusable.get('id-3'), 'id-1');
  assert.equal(delta.reusable.get('id-5'), 'id-4');
  assert.deepEqual(delta.removed, ['id-deleted']);
});

test('twins: resolves all 7 audited duplicate SKU scenarios deterministically (active inStock wins over ghost)', () => {
  const auditedPairs: Array<[string, string, string, string]> = [
    ['801268', 'Power, Band', 'fa8a93', 'e6b4ac'],
    ['802684', 'Power bank', 'e8f5b8', '5cedf6'],
    ['200584', 'Base celular', 'ceebad', '1dab61'],
    ['803256', 'Scooter', 'e827b6', '8d6e30'],
    ['803297', 'Microfono solapa, YS K9', 'c13c45', 'a6034e'],
    ['803047', 'Soporte muneca', '583319', '3ca6a6'],
    ['200030', 'Adorno ayudante para cocina', 'b1fb7e', '1ad55a'],
  ];

  const liveAll: LiveProduct[] = [];
  for (const [sku, title, ghostId, activeId] of auditedPairs) {
    const ghost = mkLive({ ecometriId: ghostId, sku, title, inStock: false });
    const active = mkLive({ ecometriId: activeId, sku, title, inStock: true });
    assert.equal(resolveSkuTwins([ghost, active]).ecometriId, activeId);
    assert.equal(resolveSkuTwins([active, ghost]).ecometriId, activeId);
    liveAll.push(ghost, active);
  }

  const deduped = deduplicateGhostTwins(liveAll);
  assert.equal(deduped.length, 7);
  assert.equal(deduped.every((p) => p.inStock), true);
});

test('imageless product fallback: buildTextOnlySemanticItem indexes without vision', () => {
  const item = buildTextOnlySemanticItem(
    {
      ecometriId: 'no-img-01',
      sku: '701999',
      title: 'Cable Tipo C Carga Rapida',
      imageKey: null,
    },
    CURRENT_PROMPT_VERSION,
    '2026-11-27T01:00:00.000Z'
  );
  assert.equal(item.source, 'text-only');
  assert.equal(item.status, 'ok');
  assert.equal(item.imageKey, null);
  assert.ok(item.keywords.includes('cable'));
});

test('parseEnrichment rejects hallucinated technical specs (mAh/W/GB/garantia) and caps keywords at 15', () => {
  // Hallucinated 20000mAh when rawTitle only says "Power, Band" -> rejected (null)!
  const hallucinated = parseEnrichment(
    {
      displayTitle: 'Power Bank 20000mAh Carga Rapida',
      article: 'power bank',
      brand: null,
      modelRef: null,
      colors: ['negro'],
      keywords: ['powerbank'],
      visualSummary: 'Bateria externa de 20000 mAh con carga de 65W.',
    },
    {
      ecometriId: 'e6b4ac',
      sku: '801268',
      rawTitle: 'Power, Band',
      imageKey: 'pb.jpg',
      promptVersion: CURRENT_PROMPT_VERSION,
    }
  );
  assert.equal(hallucinated, null);

  // Legitimate 65W present in rawTitle/modelRef -> accepted!
  const manyKeywords = Array.from({ length: 22 }, (_, i) => `Sinónimo ${i + 1}`);
  const valid = parseEnrichment(
    {
      displayTitle: 'Cargador de Pared USB-C 65W Blanco',
      article: 'cargador',
      brand: 'Ugreen',
      modelRef: 'CD244 65W',
      colors: ['Blanco', 'blanco'],
      keywords: manyKeywords,
      visualSummary: 'Cargador compacto de 65W color blanco en empaque original.',
    },
    {
      ecometriId: 'chg-1',
      sku: '400111',
      rawTitle: 'Cargador 65W',
      imageKey: 'chg.jpg',
      promptVersion: CURRENT_PROMPT_VERSION,
    }
  );
  assert.ok(valid);
  assert.equal(valid.keywords.length, 15);
  assert.deepEqual(valid.colors, ['blanco']);
  assert.equal(hasInventedTechSpecs('Garantia de 12 meses de garantia', 'Termo acero'), true);
  assert.equal(hasInventedTechSpecs('Disco de 2 TB', 'Pack x 2 unidades'), true);
  assert.equal(hasInventedTechSpecs('Bateria 20000mAh', 'Power bank 20.000 mAh'), false);

  // Malformed garbage never throws
  assert.equal(parseEnrichment(null), null);
  assert.equal(parseEnrichment('not-json'), null);
  assert.equal(parseEnrichment({ displayTitle: 'x'.repeat(81), article: 'a', visualSummary: 'b' }), null);
});

test('v3.0 SKU 801545 Vizzon OCR & anti-photo-narration guardrails: rejects 6000 vs 5000 misread, rejects unbacked modelRef/doubtful ?, and rejects box/photo narration', () => {
  const vizzonCtx = {
    ecometriId: 'vz-801545',
    sku: '801545',
    rawTitle: 'Power Bank Vizzon',
    imageKey: 'a6b1b588-966d-49ab-b1fc-792e9363453c.jpg',
    promptVersion: CURRENT_PROMPT_VERSION,
  };

  // 1. Misreading 5000 as 6000 (even without "mAh" unit!) when ocrBoxText reads "5000" -> rejected!
  assert.equal(
    parseEnrichment(
      {
        ocrBoxText: 'Vizzon Model: VN19 15W MAGNETIC WIRELESS CHARGING POWER BANK 5000',
        displayTitle: 'Power Bank Vizzon Magnetico 6000 Negro',
        article: 'power bank',
        brand: 'Vizzon',
        modelRef: 'VN19',
        colors: ['negro'],
        keywords: ['powerbank'],
        visualSummary: 'Bateria externa magnetica compacta para recarga inalambrica.',
      },
      vizzonCtx
    ),
    null
  );

  // 2. Doubtful OCR digit "?000" cannot justify "5000mAh" in displayTitle, and "?" tokens never enter keywords
  assert.equal(
    parseEnrichment(
      {
        ocrBoxText: 'Vizzon Model: VN19 ?000mAh',
        displayTitle: 'Power Bank Vizzon VN19 5000mAh',
        article: 'power bank',
        brand: 'Vizzon',
        modelRef: 'VN19',
        colors: ['negro'],
        keywords: ['powerbank', '?000mah'],
        visualSummary: 'Bateria externa magnetica compacta.',
      },
      vizzonCtx
    ),
    null
  );

  // 3. Literal photo/box narration phrases reported by user -> rejected!
  const forbiddenSummaries = [
    'Cargador portatil Power Bank Vizzon de color negro, mostrado dentro de su caja de presentacion blanca.',
    'Bateria portatil rectangular de color negro acompanada de su caja de empaque.',
    'Mouse inalambrico ergonomico empacado en blister.',
    'Producto portatil al lado de su caja con cable incluido.',
    'Mouse gamer blanco presentado en su caja de exhibicion.',
  ];
  for (const badSummary of forbiddenSummaries) {
    assert.equal(hasPhotoNarration(badSummary), true, `Expected narration rejection for: ${badSummary}`);
    assert.equal(
      parseEnrichment(
        {
          ocrBoxText: 'Vizzon Model: VN19 5000',
          displayTitle: 'Power Bank Magnetico Vizzon VN19',
          article: 'power bank',
          brand: 'Vizzon',
          modelRef: 'VN19',
          colors: ['negro'],
          keywords: ['powerbank'],
          visualSummary: badSummary,
        },
        vizzonCtx
      ),
      null
    );
  }

  // 4. Hallucinated modelRef ("VN99") absent from ocrBoxText -> modelRef discarded (null), while valid VN19 + 5000mAh + 15W succeeds!
  const unbackedRef = parseEnrichment(
    {
      ocrBoxText: 'Vizzon 15W MAGNETIC WIRELESS CHARGING POWER BANK 5000',
      displayTitle: 'Power Bank Inalambrico Magnetico Vizzon 5000mAh',
      article: 'power bank',
      brand: 'Vizzon',
      modelRef: 'VN99',
      colors: ['negro'],
      keywords: ['powerbank', '?bad'],
      visualSummary:
        'Bateria externa inalambrica magnetica de 5000 mAh con carga rapida de 15W, compacta y ligera para recargar tu celular sin cables.',
    },
    vizzonCtx
  );
  assert.ok(unbackedRef);
  assert.equal(unbackedRef.modelRef, null);
  assert.equal(unbackedRef.keywords.some((k) => k.includes('?')), false);

  const validVizzon = parseEnrichment(
    {
      ocrBoxText: 'Vizzon Model: VN19 15W MAGNETIC WIRELESS CHARGING POWER BANK 5000',
      displayTitle: 'Power Bank Magnetico Vizzon VN19 5000mAh Negro',
      article: 'power bank',
      brand: 'Vizzon',
      modelRef: 'Model: VN19',
      colors: ['negro'],
      keywords: ['powerbank', 'bateria portatil', 'magsafe'],
      visualSummary:
        'Bateria externa inalambrica magnetica de 5000 mAh con carga rapida de 15W, diseno compacto ideal para recargar smartphones sin cables.',
    },
    vizzonCtx
  );
  assert.ok(validVizzon);
  assert.equal(validVizzon.modelRef, 'VN19');
  assert.equal(validVizzon.keywords.includes('vn19'), true);
  assert.equal(validVizzon.keywords.includes('vizzon'), true);
});

test('partitionShards enforces both maxItems and maxBytes deterministically, and InMemorySemanticStore isolates generations', async () => {
  const itemsA = Array.from({ length: 25 }, (_, i) =>
    mkStored({
      ecometriId: `prod-${String(25 - i).padStart(3, '0')}`,
      sku: String(200000 + i),
      visualSummary: 'Descripcion limpia '.repeat(8).trim(),
    })
  );
  const itemsB = [...itemsA].reverse();

  // Byte cap (2500 bytes) forces smaller shards than maxItems (100)
  const shardsA = partitionShards(itemsA, 100, 2500, 1);
  const shardsB = partitionShards(itemsB, 100, 2500, 1);

  assert.deepEqual(shardsA, shardsB); // 100% deterministic regardless of input order
  assert.ok(shardsA.length > 1);
  for (const shard of shardsA) {
    const bytes = Buffer.byteLength(JSON.stringify(shard), 'utf8');
    assert.ok(bytes <= 2500, `Shard exceeded maxBytes: ${bytes}`);
  }

  // Generation atomicity: partial write of gen 2 without meta flip leaves gen 1 intact
  const store = new InMemorySemanticStore();
  await store.writeGeneration(1, shardsA, {
    schemaVersion: SEMANTIC_SCHEMA_VERSION,
    promptVersion: CURRENT_PROMPT_VERSION,
    gen: 1,
    shardCount: shardsA.length,
    itemCount: itemsA.length,
    generatedAt: '2026-11-27T01:00:00.000Z',
    shardHashes: shardsA.map(computeShardHash),
    lockedUntil: null,
  });

  const corruptedGen2 = partitionShards(itemsA.slice(0, 3), 100, 2500, 2);
  store.writePartialShardsWithoutMetaFlip(2, corruptedGen2);

  const visibleMeta = await store.readMeta();
  assert.ok(visibleMeta);
  assert.equal(visibleMeta.gen, 1);
  const visibleShards = await store.readShards(visibleMeta.gen, visibleMeta.shardCount);
  assert.equal(visibleShards.every((s) => s.gen === 1), true);

  // Mutual exclusion lock check
  assert.equal(await store.acquireLock('worker-A', 60_000, '2026-11-27T02:00:00.000Z'), true);
  assert.equal(await store.acquireLock('worker-B', 60_000, '2026-11-27T02:00:30.000Z'), false);
  await store.releaseLock('worker-A');
  assert.equal(await store.acquireLock('worker-B', 60_000, '2026-11-27T02:00:35.000Z'), true);
});
