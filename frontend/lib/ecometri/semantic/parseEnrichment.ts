import {
  MAX_DISPLAY_TITLE_LEN,
  MAX_KEYWORDS,
  MAX_VISUAL_SUMMARY_LEN,
  type SemanticItem,
} from './types';

const EMOJI_RE = new RegExp('\\p{Extended_Pictographic}', 'gu');
const HTML_TAG_RE = /<[^>]*>/g;
const CONTROL_RE = /[\u0000-\u001F\u007F]/g;

// Detects numeric + unit technical claims (e.g. "20000mAh", "65 W", "128GB", "12 meses de garantia")
const TECH_SPEC_CLAIM_RE =
  /\b(\d+(?:[.,]\d+)?)\s*(mah|ah|wh|watts?|w|voltios?|volts?|v|amperios?|amp|gb|tb|mb|ghz|mhz|hz|lumens?|lm|litros?|ml|kg|gramos?|gr|horas?|meses\s+de\s+garantia|a[nñ]os?\s+de\s+garantia)\b/gi;

export interface EnrichmentContext {
  ecometriId: string;
  sku: string;
  rawTitle: string;
  imageKey: string | null;
  promptVersion: string;
  nowIso?: string;
}

function cleanPlainString(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(HTML_TAG_RE, ' ')
    .replace(EMOJI_RE, '')
    .replace(CONTROL_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeKeywordToken(input: string): string {
  return cleanPlainString(input)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalizeUnit(rawUnit: string): string {
  const u = rawUnit
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (u === 'watt' || u === 'watts' || u === 'w') return 'w';
  if (u === 'voltio' || u === 'voltios' || u === 'volt' || u === 'volts' || u === 'v') return 'v';
  if (u === 'amperio' || u === 'amperios' || u === 'amp') return 'amp';
  if (u === 'gramo' || u === 'gramos' || u === 'gr') return 'gr';
  if (u === 'litro' || u === 'litros') return 'litros';
  if (u === 'lumen' || u === 'lumens' || u === 'lm') return 'lm';
  if (u === 'hora' || u === 'horas') return 'horas';
  if (u.startsWith('meses')) return 'mesesgarantia';
  if (u.startsWith('ano')) return 'anosgarantia';
  return u.replace(/\s+/g, '');
}

function extractCanonicalClaims(text: string): Set<string> {
  const out = new Set<string>();
  const re = new RegExp(TECH_SPEC_CLAIM_RE.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const num = match[1].replace(/(\d)[.,](\d{3})(?!\d)/g, '$1$2').replace(',', '.');
    const unit = canonicalizeUnit(match[2]);
    out.add(`${num}${unit}`);
  }
  return out;
}

/**
 * Verifies that `candidateText` does NOT introduce numeric+unit technical claims
 * absent from `allowedEvidence` (rawTitle + legible modelRef).
 */
export function hasInventedTechSpecs(
  candidateText: string,
  allowedEvidence: string
): boolean {
  const candidateClaims = extractCanonicalClaims(candidateText);
  if (candidateClaims.size === 0) return false;
  const evidenceClaims = extractCanonicalClaims(allowedEvidence);
  for (const claim of Array.from(candidateClaims)) {
    if (!evidenceClaims.has(claim)) {
      return true;
    }
  }
  return false;
}

function normalizeStringList(
  raw: unknown,
  maxCount: number,
  minLen = 2,
  maxLen = 40
): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const norm = normalizeKeywordToken(entry);
    if (norm.length < minLen || norm.length > maxLen) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
    if (out.length >= maxCount) break;
  }
  return out;
}

/**
 * Defensive parser for untrusted Gemini enrichment JSON. Never throws.
 * Returns `null` if malformed or if anti-hallucination guardrails reject invented specs.
 */
export function parseEnrichment(
  raw: unknown,
  ctx?: EnrichmentContext
): SemanticItem | null {
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const obj = raw as Record<string, unknown>;

    const ecometriId =
      ctx?.ecometriId ||
      (typeof obj.ecometriId === 'string' ? obj.ecometriId.trim() : '');
    const sku =
      ctx?.sku ?? (typeof obj.sku === 'string' ? obj.sku.trim() : '');
    if (!ecometriId) return null;

    const rawTitle = ctx?.rawTitle ?? '';
    const displayTitle = cleanPlainString(obj.displayTitle);
    const article = normalizeKeywordToken(
      typeof obj.article === 'string' ? obj.article : ''
    );
    const visualSummary = cleanPlainString(obj.visualSummary);

    if (!displayTitle || displayTitle.length > MAX_DISPLAY_TITLE_LEN) {
      return null;
    }
    if (!article || article.length < 2 || article.length > 60) {
      return null;
    }
    if (!visualSummary || visualSummary.length > MAX_VISUAL_SUMMARY_LEN) {
      return null;
    }

    const brandRaw = cleanPlainString(obj.brand);
    const brand = brandRaw && brandRaw.length <= 40 ? brandRaw : null;

    const modelRaw = cleanPlainString(obj.modelRef);
    const modelRef = modelRaw && modelRaw.length <= 40 ? modelRaw : null;

    const allowedEvidence = `${rawTitle} ${modelRef || ''}`;
    if (
      hasInventedTechSpecs(displayTitle, allowedEvidence) ||
      hasInventedTechSpecs(visualSummary, allowedEvidence)
    ) {
      return null;
    }

    const colors = normalizeStringList(obj.colors, 5, 3, 25);
    const keywords = normalizeStringList(obj.keywords, MAX_KEYWORDS, 2, 40);

    return {
      ecometriId,
      sku,
      imageKey: ctx ? ctx.imageKey : typeof obj.imageKey === 'string' ? obj.imageKey : null,
      displayTitle,
      article,
      brand,
      modelRef,
      colors,
      keywords,
      visualSummary,
      source: 'vision',
      status: 'ok',
      enrichedAt: ctx?.nowIso || new Date().toISOString(),
      promptVersion: ctx?.promptVersion || 'v2.0',
    };
  } catch {
    return null;
  }
}

/**
 * Local fallback enrichment for products without an image (e.g. the 1 imageless product in Ecometri).
 */
export function buildTextOnlySemanticItem(
  item: { ecometriId: string; sku: string; title: string; imageKey: string | null },
  promptVersion: string,
  nowIso: string = new Date().toISOString()
): SemanticItem {
  const cleanTitle = cleanPlainString(item.title).slice(0, MAX_DISPLAY_TITLE_LEN) || 'Producto';
  const tokens = normalizeKeywordToken(cleanTitle)
    .split(' ')
    .filter((t) => t.length >= 3)
    .slice(0, MAX_KEYWORDS);

  return {
    ecometriId: item.ecometriId,
    sku: item.sku,
    imageKey: item.imageKey,
    displayTitle: cleanTitle,
    article: tokens.slice(0, 2).join(' ') || normalizeKeywordToken(cleanTitle) || 'producto',
    brand: null,
    modelRef: null,
    colors: [],
    keywords: Array.from(new Set(tokens)),
    visualSummary: `${cleanTitle}. Consulta disponibilidad y detalles con nuestros asesores.`,
    source: 'text-only',
    status: 'ok',
    enrichedAt: nowIso,
    promptVersion,
  };
}
