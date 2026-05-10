import admin from 'firebase-admin';

// Singleton: Initialize Firebase Admin only once across the entire Next.js runtime.
// All pages and server actions must import from here — never call initializeApp directly.
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: 'zmh-extraction-engine.firebasestorage.app'
      });
    } else {
      console.warn('[Firebase Admin] FIREBASE_SERVICE_ACCOUNT env var is missing.');
    }
  } catch (e) {
    console.error('[Firebase Admin] Initialization failed:', e);
  }
}

const db   = admin.apps.length ? admin.firestore()  : null;
const storage = admin.apps.length ? admin.storage()   : null;

export { db, storage, admin };
