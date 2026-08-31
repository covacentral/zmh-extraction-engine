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

  // Sanitize and enforce maximum 5 URL aliases/masks
  if (Array.isArray(cleanData.aliases)) {
    cleanData.aliases = Array.from(new Set(
      cleanData.aliases
        .map((a: any) => String(a || '').toLowerCase().trim().replace(/[^a-z0-9\-_]/g, ''))
        .filter((a: string) => a.length > 0 && a !== commerceId.toLowerCase())
    )).slice(0, 5);
  }

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
    aliases: Array.isArray(newCommerceData.aliases) ? newCommerceData.aliases.slice(0, 5) : [],
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
