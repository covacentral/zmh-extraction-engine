import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

// Initialize Firebase once
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
  } catch (e) {
    console.error(e);
  }
}

export async function GET() {
  try {
    const db = admin.firestore?.();
    if (!db) {
      return NextResponse.json({ error: 'DB not setup. Check Service Account in env.' }, { status: 500 });
    }

    const payload = {
        themeHex: "#3b82f6", // Azul premium sugerido
        businessName: "Centro Comercial Bodega Mayorista",
        avatarJid: "573014709090",
        promoJid: "EGSmr9dLr9iG0juYRQG3GT",
        buttons: [
            { type: "whatsapp", url: "https://whatsapp.com/channel/0029VbBXnQY2phHItjmZQx0a", name: "Canal de WhatsApp 1", role: "Únete ahora" },
            { type: "whatsapp", url: "https://whatsapp.com/channel/0029VbBblzrBFLgWbyOgpL2o", name: "Canal de WhatsApp 2", role: "Únete ahora" },
            { type: "whatsapp", url: "https://whatsapp.com/channel/0029VbBtmyBAYlUQ0QfzAG1D", name: "Canal de WhatsApp 3", role: "Únete ahora" },
            { type: "whatsapp", url: "https://whatsapp.com/channel/0029VbCRMzMC1Fu5vMwm9p05", name: "Canal de WhatsApp 4", role: "Únete ahora" }
        ]
    };

    await db.collection('comercios').doc('cc-bodega-mayorista').set(payload);
    
    return NextResponse.json({ ok: true, msg: 'Data seeded to Firebase from Vercel Edge!' });
  } catch (e: any) {
    return NextResponse.json({ error: e.toString() }, { status: 500 });
  }
}
