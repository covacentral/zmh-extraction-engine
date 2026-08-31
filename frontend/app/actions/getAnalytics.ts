'use server';

import { db, admin } from '../../lib/firebaseAdmin';

export async function getAnalyticsData(commerceId: string, token: string, days: number = 30) {
  if (!db || !admin) return [];

  // Security Input Validation
  if (!commerceId || typeof commerceId !== 'string') {
    throw new Error('Invalid commerceId');
  }

  if (!token || typeof token !== 'string') {
    throw new Error('Unauthorized: metrics token is required');
  }

  // Sanitize days range (between 1 and 365)
  const safeDays = Math.max(1, Math.min(365, Number(days) || 30));

  try {
    // 1. Verify token and permission against Commerce Document
    const commerceDoc = await db.collection('comercios').doc(commerceId).get();
    if (!commerceDoc.exists) {
      throw new Error('Commerce not found');
    }

    const commerceData = commerceDoc.data() || {};
    if (!commerceData.premiumMetrics || commerceData.metricsToken !== token) {
      throw new Error('Unauthorized: Invalid metrics token or metrics not enabled');
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - safeDays);

    const startString = startDate.toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0];
    const endString = endDate.toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0];

    // Fetch rollups for the date range
    const snap = await db
      .collection('comercios')
      .doc(commerceId)
      .collection('estadisticas')
      .where(admin.firestore.FieldPath.documentId(), '>=', startString)
      .where(admin.firestore.FieldPath.documentId(), '<=', endString)
      .get();

    const data = snap.docs.map((doc) => ({
      date: doc.id,
      ...doc.data(),
    }));

    // Sort ascending by date
    return data.sort((a, b) => a.date.localeCompare(b.date));
  } catch (e: any) {
    console.error('[Analytics Action] Error:', e.message);
    return [];
  }
}
