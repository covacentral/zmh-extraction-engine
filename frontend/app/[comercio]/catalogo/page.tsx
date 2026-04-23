import { notFound } from 'next/navigation';
import { adminDb } from '@/lib/firebase-admin';
import CatalogClient from './CatalogClient';

export default async function CatalogoPage({ params }: { params: { comercio: string } }) {
  const { comercio } = params;
  
  if (!comercio) return notFound();

  const doc = await adminDb.collection('comercios').doc(comercio).get();
  if (!doc.exists) return notFound();

  const data = doc.data();
  if (!data) return notFound();

  const themeHex = data.themeHex || '#25D366';
  const RENDER_API = process.env.NEXT_PUBLIC_RENDER_API || 'https://zmh-extraction-engine.onrender.com';

  return <CatalogClient commerceId={comercio} data={data} themeHex={themeHex} RENDER_API={RENDER_API} />;
}
