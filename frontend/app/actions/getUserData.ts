'use server';

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
    console.error("Firebase Auth Error in Server Action");
  }
}

const db = admin.firestore?.();

export async function getVipClient(comercio: string, vipId: string) {
    if (!db || !comercio || !vipId) return null;
    try {
        const clientDoc = await db.collection('comercios').doc(comercio).collection('clientes').doc(vipId).get();
        if (clientDoc.exists) {
            return { id: clientDoc.id, ...clientDoc.data() };
        }
    } catch(e) {
        console.error("Error fetching VIP:", e);
    }
    return null;
}

export async function getAsesor(comercio: string, asesorId: string) {
    if (!db || !comercio || !asesorId) return null;
    try {
        const asesorDoc = await db.collection('comercios').doc(comercio).collection('asesores').doc(asesorId).get();
        if (asesorDoc.exists) {
            return { id: asesorDoc.id, ...asesorDoc.data() };
        }
    } catch(e) {
        console.error("Error fetching Asesor:", e);
    }
    return null;
}
