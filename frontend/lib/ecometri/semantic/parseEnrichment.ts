import {
  CURRENT_PROMPT_VERSION,
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

// Detects standalone 4-5 digit capacity/power numbers (e.g. "5000", "6000", "10000", "20000")
// even when Gemini omits the unit "mAh" in displayTitle!
const STANDALONE_CAPACITY_RE = /\b([1-9]\d{3,4})\b/g;

/**
 * Versioned v3.0 blocklist of normalized (lowercase, accent-free) photo-staging phrases.
 * Any `visualSummary` matching these patterns is rejected so descriptions always read
 * like genuine e-commerce product copy rather than narrating the photograph or packaging.
 */
export const FORBIDDEN_PHOTO_NARRATION_PATTERNS_V3: readonly string[] = [
  'mostrado en',
  'mostrada en',
  'mostrado dentro',
  'mostrada dentro',
  'mostrado junto',
  'mostrada junto',
  'exhibido',
  'exhibida',
  'caja de exhibicion',
  'caja de presentacion',
  'caja de empaque',
  'junto a su caja',
  'al lado de su caja',
  'al lado de la caja',
  'dentro de su caja',
  'acompanado de su caja',
  'acompanada de su caja',
  'acompanado de su empaque',
  'acompanada de su empaque',
  'acompanado de una caja',
  'acompanada de una caja',
  'acompanado de un estuche',
  'acompanada de un estuche',
  'presentado en',
  'presentada en',
  'empacado en',
  'empacada en',
  'viene en una caja',
  'viene en caja',
  'en la foto',
  'en la imagen',
  'se observa',
  'se aprecia',
  'blister',
];

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

function normalizeAccentFreeLower(input: string): string {
  return cleanPlainString(input)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hasPhotoNarration(text: string): boolean {
  const norm = normalizeAccentFreeLower(text);
  if (!norm) return false;
  for (const phrase of FORBIDDEN_PHOTO_NARRATION_PATTERNS_V3) {
    if (norm.includes(phrase)) {
      return true;
    }
  }
  return false;
}

/**
 * Symmetric canonicalizer for alphanumeric model/reference codes:
 * strips common prefixes (`model:`, `modelo:`, `ref:`), accents, hyphens, dots, and spaces.
 * Example: `"Model: VN-19"` -> `"vn19"`, `"KM-6558"` -> `"km6558"`.
 */
export function canonicalizeModelCode(input: string): string {
  return cleanPlainString(input)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^(?:modelo?|ref(?:erencia)?|mod)\s*[:.#-]?\s*/i, '')
    .replace(/[^a-z0-9]/g, '');
}

function sanitizeUncertainOcrTokens(ocrText: string): string {
  return ocrText
    .split(/\s+/)
    .filter((tok) => tok && !tok.includes('?'))
    .join(' ');
}

/**
 * Verifies that `rawModelRef` contains no uncertain `?` characters and appears as a
 * canonicalized substring within `rawTitle` or `ocrBoxText` (when `ocrBoxText` is provided).
 */
export function resolveVerifiedModelRef(
  rawModelRef: unknown,
  rawTitle: string,
  rawOcrBoxText: unknown
): string | null {
  const cleaned = cleanPlainString(rawModelRef).replace(
    /^(?:modelo?|ref(?:erencia)?|mod)\s*[:.#-]?\s*/i,
    ''
  );
  if (!cleaned || cleaned.length < 2 || cleaned.length > 40 || cleaned.includes('?')) {
    return null;
  }

  const canonicalCandidate = canonicalizeModelCode(cleaned);
  if (canonicalCandidate.length < 2) return null;

  // When ocrBoxText is explicitly supplied (v3.0 schema), modelRef MUST be backed by rawTitle or clean ocrBoxText
  if (rawOcrBoxText !== undefined) {
    const cleanOcr =
      typeof rawOcrBoxText === 'string'
        ? sanitizeUncertainOcrTokens(cleanPlainString(rawOcrBoxText))
        : '';
    const evidencePool = canonicalizeModelCode(`${rawTitle} ${cleanOcr}`);
    if (!evidencePool.includes(canonicalCandidate)) {
      return null;
    }
  }

  return cleaned;
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

function extractStandaloneNumbers(text: string): Set<string> {
  const normalized = text.replace(/(\d)[.,](\d{3})(?!\d)/g, '$1$2');
  const out = new Set<string>();
  const re = new RegExp(STANDALONE_CAPACITY_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    out.add(m[1]);
  }
  return out;
}

/**
 * Verifies that `candidateText` does NOT introduce numeric+unit technical claims OR
 * unverified 4-5 digit capacity numbers (e.g. writing "6000" when box says "5000")
 * absent from `allowedEvidence`.
 */
export function hasInventedTechSpecs(
  candidateText: string,
  allowedEvidence: string
): boolean {
  const candidateClaims = extractCanonicalClaims(candidateText);
  if (candidateClaims.size > 0) {
    const evidenceClaims = extractCanonicalClaims(allowedEvidence);
    const evidenceNumbers = extractStandaloneNumbers(allowedEvidence);
    for (const claim of Array.from(candidateClaims)) {
      const digitsOnly = (/^\d+/.exec(claim) || [''])[0];
      // Accept if exact number+unit is in evidence, OR if box printed "5000" next to small "mAh" logo
      const mahSupportedByBoxDigits =
        claim.endsWith('mah') && digitsOnly.length >= 4 && evidenceNumbers.has(digitsOnly);
      if (!evidenceClaims.has(claim) && !mahSupportedByBoxDigits) {
        return true;
      }
    }
  }

  // Also block standalone 4-5 digit capacity hallucinations (e.g. "Power Bank Vizzon 6000" when box says "5000")
  const candidateNumbers = extractStandaloneNumbers(candidateText);
  if (candidateNumbers.size > 0) {
    const evidenceNumbers = extractStandaloneNumbers(allowedEvidence);
    for (const num of Array.from(candidateNumbers)) {
      if (!evidenceNumbers.has(num)) {
        return true;
      }
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
    if (typeof entry !== 'string' || entry.includes('?')) continue;
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
 * Rejects malformed shapes, uncertain `?` claims, photo-narration descriptions,
 * unbacked `modelRef` values, and hallucinated numeric specs.
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

    if (
      !displayTitle ||
      displayTitle.length > MAX_DISPLAY_TITLE_LEN ||
      displayTitle.includes('?')
    ) {
      return null;
    }
    if (!article || article.length < 2 || article.length > 60 || article.includes('?')) {
      return null;
    }
    if (
      !visualSummary ||
      visualSummary.length > MAX_VISUAL_SUMMARY_LEN ||
      visualSummary.includes('?')
    ) {
      return null;
    }

    // Reject photo-staging narration in description or title (v3.0 double enforcement)
    if (hasPhotoNarration(visualSummary) || hasPhotoNarration(displayTitle)) {
      return null;
    }

    const brandRaw = cleanPlainString(obj.brand);
    const brand =
      brandRaw && brandRaw.length <= 40 && !brandRaw.includes('?') ? brandRaw : null;

    const modelRef = resolveVerifiedModelRef(
      obj.modelRef,
      rawTitle,
      obj.ocrBoxText
    );

    const cleanOcrEvidence =
      typeof obj.ocrBoxText === 'string'
        ? sanitizeUncertainOcrTokens(cleanPlainString(obj.ocrBoxText))
        : '';

    const allowedEvidence =
      obj.ocrBoxText !== undefined
        ? `${rawTitle} ${cleanOcrEvidence}`
        : `${rawTitle} ${modelRef || ''}`;

    if (
      hasInventedTechSpecs(displayTitle, allowedEvidence) ||
      hasInventedTechSpecs(visualSummary, allowedEvidence)
    ) {
      return null;
    }

    const colors = normalizeStringList(obj.colors, 5, 3, 25);

    // Seed keywords with verified modelRef variants (with & without hyphen) + brand before AI synonyms
    const seededKeywords: string[] = [];
    if (modelRef) {
      const normRef = normalizeKeywordToken(modelRef);
      const compactRef = canonicalizeModelCode(modelRef);
      if (normRef.length >= 2) seededKeywords.push(normRef);
      if (compactRef.length >= 2 && compactRef !== normRef) {
        seededKeywords.push(compactRef);
      }
    }
    if (brand) {
      const normBrand = normalizeKeywordToken(brand);
      if (normBrand.length >= 2) seededKeywords.push(normBrand);
    }
    const rawKeywords = Array.isArray(obj.keywords) ? obj.keywords : [];
    const keywords = normalizeStringList(
      [...seededKeywords, ...rawKeywords],
      MAX_KEYWORDS,
      2,
      40
    );

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
      promptVersion: ctx?.promptVersion || CURRENT_PROMPT_VERSION,
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
