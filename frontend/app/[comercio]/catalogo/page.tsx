import { notFound } from 'next/navigation';
import CatalogClient from './CatalogClient';
import { db } from '../../../lib/firebaseAdmin';
import { Suspense } from 'react';

export const revalidate = 60; // 1 minute ISR Edge Cache

export default async function CatalogoPage({ params }: { params: { comercio: string } }) {
  const { comercio } = params;
  
  if (!comercio) return notFound();
  if (!db) return notFound();

  // Fast direct Firestore fetch in parallel (<30ms)
  const [doc, sysDoc] = await Promise.all([
    db.collection('comercios').doc(comercio).get(),
    db.collection('comercios').doc(comercio).collection('_system').doc('catalog').get()
  ]);

  if (!doc.exists) return notFound();

  const data = doc.data() || {};
  const compiledCatalog = sysDoc.exists ? sysDoc.data()?.compiledCatalog || [] : [];
  data.compiledCatalog = compiledCatalog;

  const RENDER_API = process.env.NEXT_PUBLIC_RENDER_API || process.env.BOT_SERVER_URL || '';
  const catalogsConfig = data.catalogs || [];
  const legacyJid = data.catalogJid || data.avatarJid;
  
  if (catalogsConfig.length === 0 && legacyJid) {
      catalogsConfig.push({ name: 'Catálogo', jid: legacyJid });
  }

  let mergedCatalog: any[] = [];

  // Non-blocking fast fetch with 1.5s timeout: Never block page load if bot is cold
  if (catalogsConfig.length > 0 && RENDER_API) {
      try {
          const fetchPromises = catalogsConfig.map(async (cat: any) => {
              if (!cat.jid) return [];
              const targetJid = cat.jid.includes('@') ? cat.jid : `${cat.jid}@s.whatsapp.net`;
              
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 1800); // 1.8s timeout
              
              try {
                  const res = await fetch(`${RENDER_API}/api/catalog/${targetJid}`, { 
                      signal: controller.signal,
                      next: { revalidate: 120 }
                  });
                  clearTimeout(timeoutId);
                  
                  if (!res.ok) return [];
                  const apiData = await res.json();
                  if (apiData && apiData.products) {
                      return apiData.products.map((p: any) => ({ ...p, sectionName: cat.name || 'Catálogo' }));
                  }
              } catch (e) {
                  // If timed out or unreachable, fallback silently to compiled catalog
              }
              return [];
          });

          const results = await Promise.all(fetchPromises);
          mergedCatalog = results.flat();
      } catch (err) {
          console.warn("API Pasarela timeout/fallback to Firestore compiled catalog");
      }
  }

  data.whatsappCatalog = mergedCatalog;
  const themeHex = data.themeHex || '#25D366';

  return (
    <Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-black"><div className="animate-spin h-8 w-8 text-white"><svg viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div></div>}>
        <CatalogClient commerceId={comercio} data={data} themeHex={themeHex} RENDER_API={RENDER_API} vipClient={null} asesorData={null} />
    </Suspense>
  );
}
