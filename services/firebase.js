/**
 * services/firebase.js
 * Singleton: Firebase Admin initialization for the bot server.
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
        console.warn('[Firebase] FIREBASE_SERVICE_ACCOUNT not set.');
    }
}

const db = admin.apps.length ? admin.firestore() : null;

module.exports = { admin, db };
