import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/firebaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 86400; // 24 hours Edge Cache

function generateFallbackSvg(text: string): string {
  const isNumeric = /^[\d\s\+\-]+$/.test(text) || text.startsWith('57') || text.includes('@');

  if (isNumeric) {
    // Beautiful WhatsApp Icon Avatar
    return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <defs>
        <linearGradient id="waGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#128C7E" />
          <stop offset="100%" stop-color="#25D366" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" rx="100" fill="url(#waGrad)" />
      <g fill="#ffffff" transform="translate(46, 46) scale(4.5)">
        <path d="M12 2C6.48 2 2 6.48 2 12c0 1.82.49 3.53 1.35 5L2 22l5.14-1.33c1.42.82 3.07 1.33 4.86 1.33 5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.57 0-3.03-.45-4.28-1.23l-.31-.19-3.17.82.85-3.08-.2-.32C4.06 14.77 3.6 13.43 3.6 12c0-4.63 3.77-8.4 8.4-8.4 4.63 0 8.4 3.77 8.4 8.4 0 4.63-3.77 8.4-8.4 8.4z"/>
        <path d="M15.5 13.3c-.2-.1-1.2-.6-1.4-.7-.2-.1-.3-.1-.4.1-.1.2-.5.7-.6.8-.1.1-.2.1-.4 0-.2-.1-.8-.3-1.6-1-.6-.5-1-1.2-1.1-1.4-.1-.2 0-.3.1-.4.1-.1.2-.2.3-.3.1-.1.1-.2.2-.3 0-.1 0-.2 0-.3-.1-.1-.4-1.1-.6-1.5-.2-.4-.3-.4-.4-.4h-.4c-.1 0-.4.1-.6.3-.2.2-.7.7-.7 1.7s.7 2 1 2.4c.2.3 1.8 2.7 4.3 3.8.6.3 1.1.4 1.4.5.6.2 1.1.2 1.5.1.5-.1 1.4-.6 1.6-1.1.2-.6.2-1.1.1-1.2-.1-.1-.3-.2-.5-.3z"/>
      </g>
    </svg>`;
  }

  const cleanText = text.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'WA';
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
    <rect width="200" height="200" rx="100" fill="url(#grad)" />
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

  // Query bot server (Cloud Run)
  const BOT_SERVER_URL = process.env.BOT_SERVER_URL || process.env.NEXT_PUBLIC_BOT_SERVER_URL || 'https://botwhatsappbeily-333769495786.us-west1.run.app';
  try {
    const targetUrl = `${BOT_SERVER_URL.replace(/\/$/, '')}/api/avatar/${encodeURIComponent(cleanJid)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout for cold start

    const resp = await fetch(targetUrl, {
      signal: controller.signal,
      next: { revalidate: 86400 },
    });
    clearTimeout(timeoutId);

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
    // Bot unavailable or timed out, gracefully continue to SVG fallback
  }

  // Generate a reliable, beautiful SVG fallback (WhatsApp icon, never "57")
  const fallbackSvg = generateFallbackSvg(cleanJid);
  return new NextResponse(fallbackSvg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}
