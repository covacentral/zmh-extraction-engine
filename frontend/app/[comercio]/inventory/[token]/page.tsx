import { notFound } from 'next/navigation';
import { db } from '../../../../lib/firebaseAdmin';
import { resolveCommerce } from '../../../../lib/commerceResolver';
import InventoryClient from './InventoryClient';

export const revalidate = 0; // Dynamic route

export default async function InventoryPage({ params }: { params: { comercio: string, token: string } }) {
  const { comercio, token } = params;

  if (!comercio || !token) return notFound();

  // Validate Token against Commerce Document (slug or alias)
  const resolved = await resolveCommerce(comercio);
  if (!resolved) return notFound();

  const { commerceId, data } = resolved;
  
  // Check Master Token
  let scope = null;
  if (data.inventoryToken === token) {
      scope = 'MASTER';
  } else {
      // Check in 'areas' subcollection
      const areasSnap = await db!.collection('comercios').doc(commerceId).collection('areas').where('token', '==', token).get();
      if (!areasSnap.empty) {
          scope = areasSnap.docs[0].id;
      }
  }

  if (!scope) return notFound();

  const themeHex = data.themeHex || '#25D366';
  const businessName = data.businessName || 'PIMS Inventario';
  
  // Get Materialized Cache from the new location
  const sysDoc = await db!.collection('comercios').doc(commerceId).collection('_system').doc('catalog').get();
  const compiledCatalog = sysDoc.exists ? sysDoc.data()?.compiledCatalog || [] : [];
  
  // Get all registered areas and providers for datalists
  const areasListSnap = await db!.collection('comercios').doc(commerceId).collection('areas').get();
  const providersSnap = await db!.collection('comercios').doc(commerceId).collection('providers').get();
  
  const areasList = areasListSnap.docs.map(d => ({
      name: d.id,
      token: scope === 'MASTER' ? (d.data().token || '') : ''
  }));
  const providersList = providersSnap.docs.map(d => d.data().name);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <InventoryClient 
        commerceId={commerceId} 
        businessName={businessName} 
        themeHex={themeHex} 
        scope={scope} 
        authToken={token} 
        catalogCache={compiledCatalog}
        areasList={areasList}
        providersList={providersList}
      />
    </main>
  );
}
