import { notFound } from 'next/navigation';
import ProductClient from './ProductClient';
import { db } from '../../../../lib/firebaseAdmin';
import { Suspense } from 'react';
import type { Metadata, ResolvingMetadata } from 'next';

export const revalidate = 60; // 1 minute

export async function generateMetadata(
  { params }: { params: { comercio: string, id: string } },
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { comercio, id } = params;
  if (!comercio || !id || !db) return {};

  const [doc, sysDoc] = await Promise.all([
    db.collection('comercios').doc(comercio).get(),
    db.collection('comercios').doc(comercio).collection('_system').doc('catalog').get()
  ]);

  if (!doc.exists) return {};

  const data = doc.data() || {};
  const compiledCatalog = sysDoc.exists ? sysDoc.data()?.compiledCatalog || [] : [];
  const product = compiledCatalog.find((p: any) => p.id === id);

  if (!product) return { title: data.businessName || 'Producto' };

  const getImageUrl = (prod: any) => {
    if (!prod.imageUrls) return '';
    if (typeof prod.imageUrls === 'string') return prod.imageUrls;
    if (prod.imageUrls.original) return prod.imageUrls.original;
    if (prod.imageUrls.requested) return prod.imageUrls.requested;
    if (Array.isArray(prod.imageUrls)) return prod.imageUrls[0] || '';
    return '';
  };

  const image = getImageUrl(product);

  return {
    title: `${product.name} | ${data.businessName || 'Catálogo'}`,
    description: product.description?.slice(0, 150) || `Compra ${product.name}`,
    openGraph: {
      title: product.name,
      description: product.description?.slice(0, 150),
      images: image ? [image] : [],
    },
  };
}

export default async function ProductoPage({ params }: { params: { comercio: string, id: string } }) {
  const { comercio, id } = params;
  
  if (!comercio || !id) return notFound();
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
  if (catalogsConfig.length > 0 && RENDER_API) {
      try {
          const fetchPromises = catalogsConfig.map(async (cat: any) => {
              if (!cat.jid) return [];
              const targetJid = cat.jid.includes('@') ? cat.jid : `${cat.jid}@s.whatsapp.net`;
              
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 1800);
              
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
              } catch (e) {}
              return [];
          });

          const results = await Promise.all(fetchPromises);
          mergedCatalog = results.flat();
      } catch (err) {}
  }

  data.whatsappCatalog = mergedCatalog;
  const themeHex = data.themeHex || '#25D366';

  return (
    <Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-black"><div className="animate-spin h-8 w-8 text-white"><svg viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div></div>}>
        <ProductClient commerceId={comercio} productId={id} data={data} themeHex={themeHex} RENDER_API={RENDER_API} />
    </Suspense>
  );
}
