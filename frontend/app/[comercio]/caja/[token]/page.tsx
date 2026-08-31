import { notFound } from 'next/navigation';
import { db } from '../../../../lib/firebaseAdmin';
import { resolveCommerce } from '../../../../lib/commerceResolver';
import CajaClient from './CajaClient';
import React from 'react';

export const revalidate = 0; // Dynamic route

export default async function CajaPage({ params }: { params: { comercio: string, token: string } }) {
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
  const businessName = data.businessName || 'Punto de Venta';
  
  return (
    <div style={{ '--theme': themeHex } as React.CSSProperties} className="min-h-screen bg-[#050505] font-sans antialiased text-white">
      <CajaClient 
        commerceId={commerceId} 
        businessName={businessName} 
        themeHex={themeHex} 
        scope={scope} 
      />
    </div>
  );
}
