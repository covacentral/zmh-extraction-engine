import { notFound } from 'next/navigation';
import CatalogClient from './CatalogClient';
import { db } from '../../../lib/firebaseAdmin';
import { Suspense } from 'react';

export const revalidate = 300; // 5 minutes

export default async function CatalogoPage({ params }: { params: { comercio: string } }) {
  const { comercio } = params;
  
  if (!comercio) return notFound();

  const doc = await db.collection('comercios').doc(comercio).get();
  if (!doc.exists) return notFound();

  const data = doc.data() || {};
  const RENDER_API = process.env.NEXT_PUBLIC_RENDER_API || 'https://zmh-extraction-engine.onrender.com';

  // API Pasarela: Fetch multi-catalog directly from WhatsApp (Node.js cache) instead of Firestore
  const catalogsConfig = data.catalogs || [];
  const legacyJid = data.catalogJid || data.avatarJid;
  
  if (catalogsConfig.length === 0 && legacyJid) {
      catalogsConfig.push({ name: 'Catálogo', jid: legacyJid });
  }

  let mergedCatalog: any[] = [];

  if (catalogsConfig.length > 0) {
      try {
          const fetchPromises = catalogsConfig.map(async (cat: any) => {
              if (!cat.jid) return [];
              const targetJid = cat.jid.includes('@') ? cat.jid : `${cat.jid}@s.whatsapp.net`;
              const res = await fetch(`${RENDER_API}/api/catalog/${targetJid}`, { 
                  next: { revalidate: 300 } // Vercel Edge Cache (5 minutes)
              });
              if (!res.ok) {
                  console.warn(`API Pasarela Error for ${targetJid}: ${res.status}`);
                  return [];
              }
              const apiData = await res.json();
              if (apiData && apiData.products) {
                  // Inject sectionName
                  return apiData.products.map((p: any) => ({ ...p, sectionName: cat.name || 'Catálogo' }));
              }
              return [];
          });

          const results = await Promise.all(fetchPromises);
          mergedCatalog = results.flat();
      } catch (err) {
          console.error("Error fetching multi-catalog from API Pasarela:", err);
      }
  }

  const sysDoc = await db.collection('comercios').doc(comercio).collection('_system').doc('catalog').get();
  data.compiledCatalog = sysDoc.exists ? sysDoc.data()?.compiledCatalog || [] : [];
  data.whatsappCatalog = mergedCatalog;

  const themeHex = data.themeHex || '#25D366';

  return (
    <Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-black"><div className="animate-spin h-8 w-8 text-white"><svg viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div></div>}>
        <CatalogClient commerceId={comercio} data={data} themeHex={themeHex} RENDER_API={RENDER_API} vipClient={null} asesorData={null} />
    </Suspense>
  );
}
