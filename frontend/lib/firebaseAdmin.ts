import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: 'zmh-extraction-engine.firebasestorage.app'
      });
    }
  } catch (e) {
    console.error("Firebase Admin Initialization Error", e);
  }
}

const db = admin.firestore?.();
const storage = admin.storage?.();

export { db, storage, admin };
