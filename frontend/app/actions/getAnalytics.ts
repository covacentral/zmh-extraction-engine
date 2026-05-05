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

export async function getAnalyticsData(commerceId: string, days: number = 30) {
    if (!db) return [];
    
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - days);
        
        const startString = startDate.toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0];
        const endString = endDate.toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0];

        // Fetch rollups for the date range
        // Since document IDs are 'YYYY-MM-DD', we can use >= and <= on FieldPath.documentId()
        const snap = await db.collection('comercios').doc(commerceId).collection('estadisticas')
            .where(admin.firestore.FieldPath.documentId(), '>=', startString)
            .where(admin.firestore.FieldPath.documentId(), '<=', endString)
            .get();

        const data = snap.docs.map(doc => ({
            date: doc.id,
            ...doc.data()
        }));

        // Sort ascending by date
        return data.sort((a, b) => a.date.localeCompare(b.date));
    } catch (e) {
        console.error("Error fetching analytics:", e);
        return [];
    }
}
