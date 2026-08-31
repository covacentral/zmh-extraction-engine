'use server';

import { db } from '../../lib/firebaseAdmin';

export async function getVipClient(comercio: string, vipId: string) {
  if (!db || !comercio || !vipId) return null;

  const cleanComercio = String(comercio).replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanVipId = String(vipId).replace(/[^a-zA-Z0-9_-]/g, '');

  if (!cleanComercio || !cleanVipId) return null;

  try {
    const clientDoc = await db.collection('comercios').doc(cleanComercio).collection('clientes').doc(cleanVipId).get();
    if (clientDoc.exists) {
      const data = clientDoc.data() || {};
      return { id: clientDoc.id, name: data.name || '', phone: data.phone || '', address: data.address || '', discount: data.discount || 0 };
    }
  } catch (e: any) {
    console.error('[UserData Action] Error fetching VIP:', e.message);
  }
  return null;
}

export async function getAsesor(comercio: string, asesorId: string) {
  if (!db || !comercio || !asesorId) return null;

  const cleanComercio = String(comercio).replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanAsesorId = String(asesorId).replace(/[^a-zA-Z0-9_-]/g, '');

  if (!cleanComercio || !cleanAsesorId) return null;

  try {
    const asesorDoc = await db.collection('comercios').doc(cleanComercio).collection('asesores').doc(cleanAsesorId).get();
    if (asesorDoc.exists) {
      const data = asesorDoc.data() || {};
      return { id: asesorDoc.id, name: data.name || '', section: data.section || '', phone: data.phone || '' };
    }
  } catch (e: any) {
    console.error('[UserData Action] Error fetching Asesor:', e.message);
  }
  return null;
}
