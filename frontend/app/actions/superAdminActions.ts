'use server';

import { db } from '../../lib/firebaseAdmin';
import { isValidMasterToken } from '../../lib/superAdminAuth';

function checkAuth(masterToken: string) {
  if (!isValidMasterToken(masterToken)) {
    throw new Error('Unauthorized: Token de Super Admin inválido.');
  }
}

export async function getAllComercios(masterToken: string) {
  checkAuth(masterToken);
  if (!db) throw new Error('Database not connected');

  const snap = await db.collection('comercios').get();
  const list = snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  return list;
}

export async function getCommerceFullConfig(masterToken: string, commerceId: string) {
  checkAuth(masterToken);
  if (!db) throw new Error('Database not connected');

  const doc = await db.collection('comercios').doc(commerceId).get();
  if (!doc.exists) throw new Error('Comercio no encontrado');

  const commerceData = { id: doc.id, ...doc.data() };

  // Fetch catalog from _system/catalog
  const sysDoc = await db.collection('comercios').doc(commerceId).collection('_system').doc('catalog').get();
  const catalogData = sysDoc.exists ? sysDoc.data() : { compiledCatalog: [] };

  return {
    commerce: commerceData,
    catalog: catalogData?.compiledCatalog || []
  };
}

export async function saveCommerceConfig(masterToken: string, commerceId: string, data: any) {
  checkAuth(masterToken);
  if (!db) throw new Error('Database not connected');

  const ref = db.collection('comercios').doc(commerceId);
  const cleanData = { ...data };
  delete cleanData.id;

  await ref.set(cleanData, { merge: true });
  return { success: true };
}

export async function createCommerce(masterToken: string, newCommerceData: any) {
  checkAuth(masterToken);
  if (!db) throw new Error('Database not connected');

  let slug = (newCommerceData.slug || newCommerceData.businessName || 'nuevo-comercio')
    .toLowerCase()
    .trim()
    .replace(/[^\w\-]+/g, '-')
    .replace(/\-\-+/g, '-');

  if (!slug) slug = `comercio-${Date.now()}`;

  const docRef = db.collection('comercios').doc(slug);
  const existing = await docRef.get();
  if (existing.exists) {
    throw new Error(`El identificador "${slug}" ya existe. Por favor elige otro.`);
  }

  const initialData = {
    businessName: newCommerceData.businessName || 'Mi Comercio',
    businessType: newCommerceData.businessType || 'tienda',
    themeHex: newCommerceData.themeHex || '#e11d48',
    description: newCommerceData.description || 'Bienvenido a nuestro concentrador digital.',
    address: newCommerceData.address || '',
    contactPhone: newCommerceData.contactPhone || '',
    dispatchJid: newCommerceData.dispatchJid || '',
    premiumMetrics: false,
    channelSync: true,
    createdAt: new Date().toISOString(),
    links: [],
    vipClients: [],
    advisors: []
  };

  await docRef.set(initialData);

  // Initialize empty catalog
  await docRef.collection('_system').doc('catalog').set({
    compiledCatalog: [],
    updatedAt: Date.now()
  });

  return { success: true, id: slug };
}

export async function deleteCommerce(masterToken: string, commerceId: string) {
  checkAuth(masterToken);
  if (!db) throw new Error('Database not connected');

  await db.collection('comercios').doc(commerceId).delete();
  return { success: true };
}

export async function triggerChannelExtraction(
  masterToken: string,
  commerceId: string,
  channelJid: string,
  count: number = 5
) {
  checkAuth(masterToken);
  if (!channelJid) throw new Error('Se requiere el JID o Link del canal.');

  const botUrl = process.env.RENDER_API || process.env.BOT_URL || 'https://botwhatsappbeily-333769495786.us-west1.run.app';

  try {
    const response = await fetch(`${botUrl}/api/channel/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commerceId,
        channelJid,
        count
      }),
      signal: AbortSignal.timeout(25000)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Error del bot (${response.status})`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (err: any) {
    throw new Error(`Fallo al conectar con el bot de WhatsApp: ${err.message}`);
  }
}

export async function saveCatalogProducts(masterToken: string, commerceId: string, products: any[]) {
  checkAuth(masterToken);
  if (!db) throw new Error('Database not connected');

  const catRef = db.collection('comercios').doc(commerceId).collection('_system').doc('catalog');
  await catRef.set({
    compiledCatalog: products,
    updatedAt: Date.now()
  }, { merge: true });

  return { success: true, count: products.length };
}
