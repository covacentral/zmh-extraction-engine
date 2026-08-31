import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/firebaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // 5 minutes cache

export async function GET(
  request: NextRequest,
  { params }: { params: { jid: string } }
) {
  const { jid } = params;

  if (!jid || typeof jid !== 'string') {
    return NextResponse.json({ ok: false, error: 'Invalid JID' }, { status: 400 });
  }

  const cleanJid = decodeURIComponent(jid).trim();
  const targetJid = cleanJid.includes('@') ? cleanJid : `${cleanJid}@s.whatsapp.net`;

  try {
    // 1. Try finding matching commerce by JID in Firestore
    if (db) {
      const snap = await db
        .collection('comercios')
        .where('catalogJid', '==', cleanJid)
        .limit(1)
        .get();

      let commerceDoc = snap.empty ? null : snap.docs[0];

      if (!commerceDoc) {
        // Try fallback query by avatarJid or doc ID
        const avatarSnap = await db
          .collection('comercios')
          .where('avatarJid', '==', cleanJid)
          .limit(1)
          .get();
        if (!avatarSnap.empty) {
          commerceDoc = avatarSnap.docs[0];
        }
      }

      if (commerceDoc) {
        const sysDoc = await db
          .collection('comercios')
          .doc(commerceDoc.id)
          .collection('_system')
          .doc('catalog')
          .get();

        if (sysDoc.exists && sysDoc.data()?.compiledCatalog) {
          const products = sysDoc.data()?.compiledCatalog || [];
          return NextResponse.json(
            { ok: true, source: 'firestore_cache', products },
            {
              status: 200,
              headers: {
                'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
              },
            }
          );
        }
      }
    }

    // 2. Try querying Bot Server if configured (with strict 3s timeout)
    const BOT_SERVER_URL = process.env.BOT_SERVER_URL || process.env.NEXT_PUBLIC_BOT_SERVER_URL;
    if (BOT_SERVER_URL) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const resp = await fetch(`${BOT_SERVER_URL.replace(/\/$/, '')}/api/catalog/${encodeURIComponent(targetJid)}`, {
          signal: controller.signal,
          next: { revalidate: 300 },
        });
        clearTimeout(timeoutId);

        if (resp.ok) {
          const data = await resp.json();
          return NextResponse.json(data, {
            status: 200,
            headers: {
              'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
            },
          });
        }
      } catch {
        // Bot offline / timeout -> fallback to empty catalog
      }
    }

    // Return empty catalog gracefully instead of 500
    return NextResponse.json(
      { ok: true, source: 'fallback_empty', products: [] },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (err: any) {
    console.error('[Catalog Route] Error:', err);
    return NextResponse.json({ ok: false, error: 'Internal Server Error', products: [] }, { status: 500 });
  }
}
