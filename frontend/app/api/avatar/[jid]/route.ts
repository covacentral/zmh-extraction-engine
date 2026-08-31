import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/firebaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // 1 hour Edge Cache

function generateFallbackSvg(text: string): string {
  const cleanText = (text || 'Z').replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'WA';
  const colors = [
    ['#4F46E5', '#7C3AED'],
    ['#059669', '#10B981'],
    ['#D97706', '#F59E0B'],
    ['#DC2626', '#EF4444'],
    ['#2563EB', '#3B82F6'],
    ['#7C2D12', '#B45309'],
    ['#4338CA', '#6366F1'],
  ];
  const colorIndex = cleanText.charCodeAt(0) % colors.length;
  const [c1, c2] = colors[colorIndex];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c1}" />
        <stop offset="100%" stop-color="${c2}" />
      </linearGradient>
    </defs>
    <rect width="200" height="200" rx="40" fill="url(#grad)" />
    <text x="50%" y="54%" font-family="system-ui, -apple-system, sans-serif" font-size="72" font-weight="700" fill="#ffffff" text-anchor="middle" dominant-baseline="middle" letter-spacing="2">
      ${cleanText}
    </text>
  </svg>`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { jid: string } }
) {
  const { jid } = params;

  if (!jid || typeof jid !== 'string') {
    const svg = generateFallbackSvg('?');
    return new NextResponse(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  }

  const cleanJid = decodeURIComponent(jid).trim();

  // If it's a direct URL (like firebase storage or external CDN)
  if (cleanJid.startsWith('http://') || cleanJid.startsWith('https://')) {
    try {
      const resp = await fetch(cleanJid, { next: { revalidate: 86400 } });
      if (resp.ok) {
        const buffer = await resp.arrayBuffer();
        const contentType = resp.headers.get('content-type') || 'image/jpeg';
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
          },
        });
      }
    } catch {
      // Fallback
    }
  }

  // Check if we have an avatar URL cached in Firestore for this commerce/contact
  if (db) {
    try {
      const doc = await db.collection('avatar_cache').doc(cleanJid).get();
      if (doc.exists) {
        const cachedUrl = doc.data()?.url;
        if (cachedUrl) {
          const resp = await fetch(cachedUrl, { next: { revalidate: 86400 } });
          if (resp.ok) {
            const buffer = await resp.arrayBuffer();
            const contentType = resp.headers.get('content-type') || 'image/jpeg';
            return new NextResponse(buffer, {
              status: 200,
              headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
              },
            });
          }
        }
      }
    } catch (e) {
      console.warn('[Avatar Route] Firestore cache lookup failed:', e);
    }
  }

  // Check if bot server or Cloud Run URL is configured in environment
  const BOT_SERVER_URL = process.env.BOT_SERVER_URL || process.env.NEXT_PUBLIC_BOT_SERVER_URL;
  if (BOT_SERVER_URL) {
    try {
      const targetUrl = `${BOT_SERVER_URL.replace(/\/$/, '')}/api/avatar/${encodeURIComponent(cleanJid)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

      const resp = await fetch(targetUrl, {
        signal: controller.signal,
        next: { revalidate: 3600 },
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const buffer = await resp.arrayBuffer();
        const contentType = resp.headers.get('content-type') || 'image/jpeg';
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
          },
        });
      }
    } catch {
      // Bot unavailable or timed out, gracefully continue to SVG fallback
    }
  }

  // Generate a reliable, beautiful SVG fallback
  const fallbackSvg = generateFallbackSvg(cleanJid);
  return new NextResponse(fallbackSvg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}
