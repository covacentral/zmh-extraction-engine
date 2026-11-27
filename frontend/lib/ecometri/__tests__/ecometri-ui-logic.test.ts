import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { toClientEcometriConfig } from '../normalize';

const FRONTEND_ROOT = path.resolve(process.cwd());
const EMOJI_RE = /\p{Extended_Pictographic}/u;

export const OPTION_B_PALETTE = {
  creamBg: '#FAF7F2',
  whiteSurface: '#FFFFFF',
  primaryInk: '#1C1917',
  secondaryInk: '#57534E',
  placeholderInk: '#6B655E',
  innerBorder: '#E6E2DC',
  highContrastBorder: '#57534E',
  availableGreen: '#047857',
  trayBg: '#1C1A19',
  trayTitle: '#FAF7F2',
  traySubtitle: '#B8B0A6',
  trayPillBg: '#FAF7F2',
  trayPillInk: '#1C1917',
} as const;

const RETIRED_DISCORDANT_BORDERS = ['#857D73', '#DED7CB', '#E5DFD4', '#D6CFC4'];

function hexLuminance(hex: string): number {
  const clean = hex.trim().replace(/^#/, '');
  assert.match(clean, /^[0-9a-fA-F]{6}$/, `Invalid hex color: ${hex}`);
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const toLinear = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function wcagContrast(hexA: string, hexB: string): number {
  const l1 = hexLuminance(hexA);
  const l2 = hexLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

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

  assert.equal(EMOJI_RE.test(resultsSrc), false);
  assert.equal(EMOJI_RE.test(quickViewSrc), false);

  assert.equal(quickViewSrc.includes('dangerouslySetInnerHTML'), false);
  assert.equal(resultsSrc.includes('dangerouslySetInnerHTML'), false);

  assert.match(quickViewSrc, /<dialog\b/);
  assert.match(quickViewSrc, /\.showModal\(\)/);
  assert.match(quickViewSrc, /closedby:\s*'any'/);
  assert.match(quickViewSrc, /'closedBy' in HTMLDialogElement\.prototype/);

  assert.match(resultsSrc, /new IntersectionObserver\(/);

  assert.match(clientPageSrc, /dynamic\(\(\) => import\('\.\/EcometriResults'\)/);
  assert.match(clientPageSrc, /data\?\.ecometri\?\.enabled/);
  assert.match(serverPageSrc, /toClientEcometriConfig\(data\?\.ecometri\)/);
});

test('Option B Dual-Tray card enforces harmonious #E6E2DC borders, bans retired beige tones, and verifies WCAG contrast & high-contrast fallbacks', () => {
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

  // 1. Zero emojis & strict sobriety (zero shimmer, zero keyframes, zero brand-tinted box-shadow)
  assert.equal(EMOJI_RE.test(clientPageSrc), false);
  assert.equal(EMOJI_RE.test(triggerSrc), false);
  assert.equal(EMOJI_RE.test(panelSrc), false);
  assert.equal(EMOJI_RE.test(resultsSrc), false);
  assert.equal(EMOJI_RE.test(globalsCss), false);
  assert.equal(/shimmer|@keyframes/i.test(globalsCss), false);
  assert.equal(/box-shadow:[^;]*var\(--(theme|brand-safe)\)/i.test(globalsCss), false);

  // 2. Negative check: none of the 4 retired discordant beige border hexes exist in CSS or components
  for (const retiredHex of RETIRED_DISCORDANT_BORDERS) {
    assert.equal(
      globalsCss.toUpperCase().includes(retiredHex),
      false,
      `Retired discordant border ${retiredHex} must not appear in globals.css`
    );
    assert.equal(resultsSrc.toUpperCase().includes(retiredHex), false);
    assert.equal(panelSrc.toUpperCase().includes(retiredHex), false);
    assert.equal(clientPageSrc.toUpperCase().includes(retiredHex), false);
  }

  // 3. Outer border uses rgba(255, 255, 255, 0.08) over #1C1A19; input boundary guaranteed by #FFFFFF + #E6E2DC + #1C1917 focus ring
  assert.match(globalsCss, /\.hub-catalog-card\s*\{[\s\S]*?background-color:\s*#1C1A19;[\s\S]*?border:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.08\);/);
  assert.match(globalsCss, /\.hub-cream-input-box\s*\{[\s\S]*?background-color:\s*#FFFFFF;[\s\S]*?border:\s*1px solid #E6E2DC;[\s\S]*?box-shadow:\s*0 1px 3px/);
  assert.match(globalsCss, /\.hub-cream-input-box:focus-within\s*\{[\s\S]*?outline:\s*2px solid #1C1917;/);
  assert.equal(globalsCss.includes('hub-cream-results-box'), false);

  // 4. Unified .hub-catalog-card with <search>, single <label htmlFor>, 16px input, and single-link bottom tray
  assert.match(clientPageSrc, /hub-catalog-card/);
  assert.match(clientPageSrc, /<search\b/);
  const labelMatches = clientPageSrc.match(/htmlFor="hub-catalog-search"/g) || [];
  assert.equal(labelMatches.length, 1);

  const inputBlockMatch = clientPageSrc.match(/<input[\s\S]*?id="hub-catalog-search"[\s\S]*?\/>/);
  assert.ok(inputBlockMatch);
  assert.match(inputBlockMatch[0], /type="search"/);
  assert.match(inputBlockMatch[0], /\btext-base\b/);
  assert.equal(/aria-label=/.test(inputBlockMatch[0]), false);

  const trayContentMatch = clientPageSrc.match(/const trayContent = \(([\s\S]*?)\);/);
  assert.ok(trayContentMatch);
  assert.equal(/<(button|a)\b/i.test(trayContentMatch[1]), false);

  assert.match(clientPageSrc, /\{visualSearchEnabled && \(\s*<VisualSearchTrigger/);
  assert.match(triggerSrc, /aria-label="Buscar por foto"/);
  assert.match(triggerSrc, /<span>Foto<\/span>/);
  assert.match(triggerSrc, /min-h-\[40px\]/);

  // 5. Verify all palette hex constants exist in globals.css and pass mathematical WCAG 2.1 contrast thresholds
  for (const hex of Object.values(OPTION_B_PALETTE)) {
    assert.ok(
      globalsCss.toUpperCase().includes(hex.toUpperCase()),
      `Expected ${hex} to be anchored in globals.css`
    );
  }

  assert.ok(wcagContrast(OPTION_B_PALETTE.primaryInk, OPTION_B_PALETTE.creamBg) >= 15);
  assert.ok(wcagContrast(OPTION_B_PALETTE.secondaryInk, OPTION_B_PALETTE.creamBg) >= 4.5);
  assert.ok(wcagContrast(OPTION_B_PALETTE.placeholderInk, OPTION_B_PALETTE.whiteSurface) >= 4.5);
  assert.ok(wcagContrast(OPTION_B_PALETTE.highContrastBorder, OPTION_B_PALETTE.creamBg) >= 4.5);
  assert.ok(wcagContrast(OPTION_B_PALETTE.availableGreen, OPTION_B_PALETTE.whiteSurface) >= 4.5);
  assert.ok(wcagContrast(OPTION_B_PALETTE.trayTitle, OPTION_B_PALETTE.trayBg) >= 15);
  assert.ok(wcagContrast(OPTION_B_PALETTE.traySubtitle, OPTION_B_PALETTE.trayBg) >= 4.5);
  assert.ok(wcagContrast(OPTION_B_PALETTE.trayPillInk, OPTION_B_PALETTE.trayPillBg) >= 15);
  assert.ok(wcagContrast('#1C1917', OPTION_B_PALETTE.creamBg) >= 3.0);
  assert.ok(wcagContrast('#FAF7F2', OPTION_B_PALETTE.trayBg) >= 3.0);

  // 6. Execute ClientPage's actual resolveSafeBrandAccent against bright/pastel/white worst-case themes
  const fnMatch = clientPageSrc.match(
    /function resolveSafeBrandAccent\(rawHex\?: string\): string \{([\s\S]*?)\n\}/
  );
  assert.ok(fnMatch);
  const jsBody = fnMatch[1].replace(/:\s*number/g, '');
  const evalResolver = new Function('rawHex', jsBody) as (h?: string) => string;

  const bmmResolved = evalResolver('#FF3DB8');
  assert.notEqual(bmmResolved, '#1C1917');
  assert.ok(wcagContrast(bmmResolved, '#FFFFFF') >= 4.5);

  for (const trickyTheme of ['#FFFFFF', '#FAF7F2', '#FFFF00', '#A7F3D0', '#38BDF8', '', 'bad']) {
    const safe = evalResolver(trickyTheme);
    assert.ok(wcagContrast(safe, '#FFFFFF') >= 4.5);
  }
  assert.equal(evalResolver('#FFFFFF'), '#1C1917');
  assert.equal(evalResolver('#FFFF00'), '#1C1917');

  // 7. prefers-contrast: more, forced-colors: active, reduced-motion, and privacy invariants
  assert.match(globalsCss, /@media \(prefers-contrast: more\)[\s\S]*?border-color:\s*#57534E/);
  assert.match(globalsCss, /@media \(forced-colors: active\)[\s\S]*?border:\s*1px solid CanvasText/);
  assert.match(globalsCss, /outline:\s*2px solid Highlight/);
  assert.match(globalsCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.equal(/\.sku\b/.test(resultsSrc), false);
  assert.equal(/\.sku\b/.test(panelSrc), false);
  assert.equal(/\b(coincidencia|exact[oa]s?|id[eé]ntic[oa]s?)\b|100\s*%/i.test(panelSrc), false);
});
