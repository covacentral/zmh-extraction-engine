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
