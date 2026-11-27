import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { toClientEcometriConfig } from '../normalize';

const FRONTEND_ROOT = path.resolve(process.cwd());
const EMOJI_RE = /\p{Extended_Pictographic}/u;

test('toClientEcometriConfig returns null when disabled or absent (zero-impact isolation)', () => {
  assert.equal(toClientEcometriConfig(undefined), null);
  assert.equal(toClientEcometriConfig(null), null);
  assert.equal(
    toClientEcometriConfig({
      enabled: false,
      storeId: 'secret-uuid',
      storeBaseUrl: 'https://example.ecometri.shop/123',
      allowedImageHost: 'd1b50uin55dq3m.cloudfront.net',
    }),
    null
  );
});

test('EcometriResults and ProductQuickView contain zero emojis and follow security/a11y invariants', () => {
  const resultsSrc = fs.readFileSync(
    path.join(FRONTEND_ROOT, 'app', '[comercio]', 'EcometriResults.tsx'),
    'utf8'
  );
  const quickViewSrc = fs.readFileSync(
    path.join(FRONTEND_ROOT, 'app', '[comercio]', 'ProductQuickView.tsx'),
    'utf8'
  );
  const clientPageSrc = fs.readFileSync(
    path.join(FRONTEND_ROOT, 'app', '[comercio]', 'ClientPage.tsx'),
    'utf8'
  );
  const serverPageSrc = fs.readFileSync(
    path.join(FRONTEND_ROOT, 'app', '[comercio]', 'page.tsx'),
    'utf8'
  );

  // Zero emojis in new UI components
  assert.equal(EMOJI_RE.test(resultsSrc), false);
  assert.equal(EMOJI_RE.test(quickViewSrc), false);

  // Never render untrusted third-party HTML
  assert.equal(quickViewSrc.includes('dangerouslySetInnerHTML'), false);
  assert.equal(resultsSrc.includes('dangerouslySetInnerHTML'), false);

  // Native accessible dialog + light-dismiss + Safari fallback
  assert.match(quickViewSrc, /<dialog\b/);
  assert.match(quickViewSrc, /\.showModal\(\)/);
  assert.match(quickViewSrc, /closedby:\s*'any'/);
  assert.match(quickViewSrc, /'closedBy' in HTMLDialogElement\.prototype/);

  // Infinite scroll uses IntersectionObserver (not scroll event)
  assert.match(resultsSrc, /new IntersectionObserver\(/);

  // Conditional lazy-loading in ClientPage and storeId stripping in page.tsx
  assert.match(clientPageSrc, /dynamic\(\(\) => import\('\.\/EcometriResults'\)/);
  assert.match(clientPageSrc, /data\?\.ecometri\?\.enabled/);
  assert.match(serverPageSrc, /toClientEcometriConfig\(data\?\.ecometri\)/);
});

test('co-primary search bar & Foto trigger enforce ADR invariants (single accessible label, 16px search input, oklab/forced-colors fallbacks, opt-in Foto, zero SKU/exactness in rows)', () => {
  const clientPageSrc = fs.readFileSync(
    path.join(FRONTEND_ROOT, 'app', '[comercio]', 'ClientPage.tsx'),
    'utf8'
  );
  const triggerSrc = fs.readFileSync(
    path.join(FRONTEND_ROOT, 'app', '[comercio]', 'VisualSearchTrigger.tsx'),
    'utf8'
  );
  const panelSrc = fs.readFileSync(
    path.join(FRONTEND_ROOT, 'app', '[comercio]', 'VisualSearchPanel.tsx'),
    'utf8'
  );
  const resultsSrc = fs.readFileSync(
    path.join(FRONTEND_ROOT, 'app', '[comercio]', 'EcometriResults.tsx'),
    'utf8'
  );
  const globalsCss = fs.readFileSync(
    path.join(FRONTEND_ROOT, 'app', 'globals.css'),
    'utf8'
  );

  // Zero emojis across modified UI & CSS files
  assert.equal(EMOJI_RE.test(clientPageSrc), false);
  assert.equal(EMOJI_RE.test(triggerSrc), false);
  assert.equal(EMOJI_RE.test(panelSrc), false);
  assert.equal(EMOJI_RE.test(resultsSrc), false);
  assert.equal(EMOJI_RE.test(globalsCss), false);

  // Semantic <search> landmark + single <label htmlFor="hub-catalog-search"> + decorative badge aria-hidden="true"
  assert.match(clientPageSrc, /<search\b/);
  const labelMatches = clientPageSrc.match(/htmlFor="hub-catalog-search"/g) || [];
  assert.equal(labelMatches.length, 1, 'Expected exactly one <label htmlFor="hub-catalog-search">');
  assert.match(clientPageSrc, /aria-hidden="true"[\s\S]{0,120}hub-search-badge/);

  // Search input has type="search" and 16px (text-base) font size without conflicting aria-label
  const inputBlockMatch = clientPageSrc.match(/<input[\s\S]*?id="hub-catalog-search"[\s\S]*?\/>/);
  assert.ok(inputBlockMatch, 'Expected #hub-catalog-search input');
  assert.match(inputBlockMatch[0], /type="search"/);
  assert.match(inputBlockMatch[0], /\btext-base\b/);
  assert.equal(/aria-label=/.test(inputBlockMatch[0]), false, 'Visible <label> must be the sole accessible name');

  // VisualSearchTrigger stays strictly opt-in behind visualSearchEnabled, displays "Foto" and aria-label="Buscar por foto"
  assert.match(clientPageSrc, /\{visualSearchEnabled && \(\s*<VisualSearchTrigger/);
  assert.match(triggerSrc, /aria-label="Buscar por foto"/);
  assert.match(triggerSrc, /<span>Foto<\/span>/);

  // Progressive oklab + solid base + forced-colors + prefers-reduced-motion in globals.css
  assert.match(globalsCss, /@supports \(color: color-mix\(in oklab, red, blue\)\)/);
  assert.match(globalsCss, /@media \(forced-colors: active\)/);
  assert.match(globalsCss, /outline:\s*2px solid Highlight/);
  assert.match(globalsCss, /@media \(prefers-reduced-motion: reduce\)/);

  // No SKU rendered in list rows and no exactness claims in visual panel
  assert.equal(/\.sku\b/.test(resultsSrc), false);
  assert.equal(/\.sku\b/.test(panelSrc), false);
  assert.equal(/\b(coincidencia|exact[oa]s?|id[eé]ntic[oa]s?)\b|100\s*%/i.test(panelSrc), false);
});
