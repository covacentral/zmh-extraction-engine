/**
 * Extracts a canonical, query-free image fingerprint (filename) from an Ecometri
 * `picture_url` or CloudFront `/fit-in/.../` URL.
 * Returns `null` when the product has no valid image.
 */
export function extractImageKey(pictureUrl: string | null | undefined): string | null {
  if (typeof pictureUrl !== 'string') return null;
  const trimmed = pictureUrl.trim();
  if (!trimmed) return null;

  let pathPart = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      pathPart = parsed.pathname;
    } catch {
      return null;
    }
  } else {
    pathPart = trimmed.split('?')[0].split('#')[0];
  }

  let decodedPath = pathPart;
  try {
    decodedPath = decodeURIComponent(pathPart);
  } catch {
    return null;
  }

  if (decodedPath.includes('..') || decodedPath.includes('\\')) {
    return null;
  }

  const segments = decodedPath
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length === 0 || segments.some((s) => s === '.' || s === '..')) {
    return null;
  }
  const basename = segments[segments.length - 1];
  if (!basename || basename.includes('..') || /[\s<>"]/.test(basename)) {
    return null;
  }

  return basename.toLowerCase();
}
