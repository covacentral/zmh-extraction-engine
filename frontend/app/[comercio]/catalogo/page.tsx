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

export default async function CatalogoPage({ params, searchParams }: { params: { comercio: string }, searchParams: { [key: string]: string | string[] | undefined } }) {
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

  let vipClient = null;
  const vipId = searchParams?.vip;
  if (vipId && typeof vipId === 'string') {
      const clientDoc = await db.collection('comercios').doc(comercio).collection('clientes').doc(vipId).get();
      if (clientDoc.exists) {
          vipClient = { id: clientDoc.id, ...clientDoc.data() };
      }
  }

  let asesorData = null;
  const asesorId = searchParams?.asesor;
  if (asesorId && typeof asesorId === 'string') {
      const asesorDoc = await db.collection('comercios').doc(comercio).collection('asesores').doc(asesorId).get();
      if (asesorDoc.exists) {
          asesorData = { id: asesorDoc.id, ...asesorDoc.data() };
      }
  }

  return <CatalogClient commerceId={comercio} data={data} themeHex={themeHex} RENDER_API={RENDER_API} vipClient={vipClient} asesorData={asesorData} />;
}
