import { notFound } from 'next/navigation';
import CatalogClient from './CatalogClient';
import admin from 'firebase-admin';
import { Suspense } from 'react';

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

export const revalidate = 300; // 5 minutes

export default async function CatalogoPage({ params }: { params: { comercio: string } }) {
  const { comercio } = params;
  
  if (!comercio) return notFound();

  const doc = await db.collection('comercios').doc(comercio).get();
  if (!doc.exists) return notFound();

  const data = doc.data() || {};
  const RENDER_API = process.env.NEXT_PUBLIC_RENDER_API || 'https://zmh-extraction-engine.onrender.com';

  // API Pasarela: Fetch catalog directly from WhatsApp (Node.js cache) instead of Firestore
  const sourceJid = data.catalogJid || data.avatarJid;
  if (sourceJid) {
      const targetJid = sourceJid.includes('@') ? sourceJid : `${sourceJid}@s.whatsapp.net`;
      try {
          const res = await fetch(`${RENDER_API}/api/catalog/${targetJid}`, { 
              next: { revalidate: 300 } // Vercel Edge Cache (5 minutes)
          });
          if (!res.ok) throw new Error(`API Pasarela Error: ${res.status}`);
          const apiData = await res.json();
          if (apiData && apiData.products) {
              data.whatsappCatalog = apiData.products;
          }
          if (apiData && apiData.profile) {
              data.profile = apiData.profile;
          }
      } catch (err) {
          console.error("Error fetching from API Pasarela:", err);
          // If this throws during ISR, Vercel will keep the old cached page automatically.
          // If it's the first build, it will fallback to an empty catalog.
          data.whatsappCatalog = data.whatsappCatalog || [];
      }
  }

  const themeHex = data.themeHex || '#25D366';

  return (
    <Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-black"><div className="animate-spin h-8 w-8 text-white"><svg viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div></div>}>
        <CatalogClient commerceId={comercio} data={data} themeHex={themeHex} RENDER_API={RENDER_API} vipClient={null} asesorData={null} />
    </Suspense>
  );
}
