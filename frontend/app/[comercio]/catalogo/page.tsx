import { notFound } from 'next/navigation';
import CatalogClient from './CatalogClient';
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
    console.error("Firebase Auth Error");
  }
}

const db = admin.firestore();

export default async function CatalogoPage({ params }: { params: { comercio: string } }) {
  const { comercio } = params;
  
  if (!comercio) return notFound();

  const doc = await db.collection('comercios').doc(comercio).get();
  if (!doc.exists) return notFound();

  const data = doc.data() || {};

  // Fetch independent catalog to prevent main document bloat
  const catalogDoc = await db.collection('catalogos').doc(comercio).get();
  if (catalogDoc.exists) {
      const catalogData = catalogDoc.data();
      if (catalogData && catalogData.whatsappCatalog) {
          data.whatsappCatalog = catalogData.whatsappCatalog;
      }
  }

  const themeHex = data.themeHex || '#25D366';
  const RENDER_API = process.env.NEXT_PUBLIC_RENDER_API || 'https://zmh-extraction-engine.onrender.com';

  return <CatalogClient commerceId={comercio} data={data} themeHex={themeHex} RENDER_API={RENDER_API} />;
}
