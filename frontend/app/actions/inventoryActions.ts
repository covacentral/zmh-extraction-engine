'use server';

import { db, storage } from '../../lib/firebaseAdmin';

/**
 * Validates the token against the MASTER token or Area tokens.
 * Returns 'MASTER' or the area name.
 */
async function verifyToken(commerceId: string, token: string) {
  if (!db) throw new Error('Database service unavailable');
  if (!commerceId || typeof commerceId !== 'string') throw new Error('Invalid commerceId');
  if (!token || typeof token !== 'string') throw new Error('Unauthorized: Missing auth token');

  const cleanCommerceId = commerceId.trim();
  const cleanToken = token.trim();

  const doc = await db.collection('comercios').doc(cleanCommerceId).get();
  if (!doc.exists) throw new Error('Commerce not found');

  const data = doc.data();
  if (data && typeof data.inventoryToken === 'string' && data.inventoryToken === cleanToken) {
    return 'MASTER';
  }

  // Check in subcollection 'areas'
  const areasSnap = await db
    .collection('comercios')
    .doc(cleanCommerceId)
    .collection('areas')
    .where('token', '==', cleanToken)
    .get();

  if (!areasSnap.empty) {
    return areasSnap.docs[0].id; // The document ID is the area name
  }

  throw new Error('Unauthorized: Invalid Token');
}

/**
 * Uploads a base64/webp image to Firebase Storage and returns the public URL.
 * Protected: requires valid token and enforces size / mime checks.
 */
export async function uploadProductImage(commerceId: string, base64Data: string, token: string) {
  if (!storage) throw new Error('Storage service unavailable');
  
  // Security check: Verify token
  await verifyToken(commerceId, token);

  const cleanCommerceId = commerceId.replace(/[^a-zA-Z0-9_-]/g, '');
  const bucketName = 'zmh-extraction-engine.firebasestorage.app';
  const bucket = storage.bucket(bucketName);

  // Extract base64 payload
  const base64Payload = base64Data.split(';base64,').pop();
  if (!base64Payload) throw new Error('Invalid image payload');

  // Limit file size to ~5MB (approx 7M base64 chars)
  if (base64Payload.length > 7 * 1024 * 1024) {
    throw new Error('Image too large (max 5MB allowed)');
  }

  const buffer = Buffer.from(base64Payload, 'base64');
  const fileName = `inventory/${cleanCommerceId}/${Date.now()}-${Math.random().toString(36).substring(7)}.webp`;

  const file = bucket.file(fileName);

  await file.save(buffer, {
    metadata: {
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000',
    },
  });

  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(fileName)}?alt=media`;
}

/**
 * Saves a single product to the 'catalogo' subcollection and immediately
 * updates the Materialized Cache.
 */
export async function saveProduct(commerceId: string, token: string, product: any) {
  if (!db) throw new Error('Database service unavailable');

  const scope = await verifyToken(commerceId, token);

  // If scope is not MASTER, enforce the product area to match the token scope
  if (scope !== 'MASTER') {
    product.area = scope;
  }

  product.updatedAt = new Date().toISOString();

  // Write the individual document to the subcollection
  let docRef;
  if (product.id) {
    const cleanId = String(product.id).replace(/[^a-zA-Z0-9_-]/g, '');
    docRef = db.collection('comercios').doc(commerceId).collection('catalogo').doc(cleanId);
    await docRef.set(product, { merge: true });
  } else {
    docRef = await db.collection('comercios').doc(commerceId).collection('catalogo').add(product);
    product.id = docRef.id;
  }

  // CQRS Write-Through Cache: Incremental upsert
  try {
    await upsertProductInCache(commerceId, { ...product, id: product.id || docRef.id });
  } catch (err) {
    console.error('Cache upsert failed:', err);
  }

  return { ok: true, id: docRef.id };
}

/**
 * CQRS Write-Through Cache: Incremental upsert.
 */
async function upsertProductInCache(commerceId: string, product: any) {
  if (!db) return;
  const cacheRef = db.collection('comercios').doc(commerceId).collection('_system').doc('catalog');
  const cacheDoc = await cacheRef.get();

  let compiled: any[];

  if (!cacheDoc.exists) {
    console.warn(`[CQRS] Cache miss for ${commerceId}. Triggering full bootstrap recompile.`);
    const snap = await db.collection('comercios').doc(commerceId).collection('catalogo').get();
    compiled = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } else {
    compiled = cacheDoc.data()?.compiledCatalog || [];
    const existingIndex = compiled.findIndex((p: any) => p.id === product.id);
    if (existingIndex >= 0) {
      compiled[existingIndex] = product;
    } else {
      compiled.push(product);
    }
  }

  await cacheRef.set({ compiledCatalog: compiled, updatedAt: new Date().toISOString() }, { merge: true });
}

/**
 * CQRS Write-Through Cache: Incremental delete.
 */
async function deleteProductFromCache(commerceId: string, productId: string) {
  if (!db) return;
  const cacheRef = db.collection('comercios').doc(commerceId).collection('_system').doc('catalog');
  const cacheDoc = await cacheRef.get();
  if (!cacheDoc.exists) return;

  const compiled = (cacheDoc.data()?.compiledCatalog || []).filter((p: any) => p.id !== productId);
  await cacheRef.set({ compiledCatalog: compiled, updatedAt: new Date().toISOString() }, { merge: true });
}

/**
 * Fetch the draft products (or all products) for the PIMS manager
 */
export async function getInventory(commerceId: string, token: string) {
  if (!db) return [];
  const scope = await verifyToken(commerceId, token);

  let query: any = db.collection('comercios').doc(commerceId).collection('catalogo');

  if (scope !== 'MASTER') {
    query = query.where('area', '==', scope);
  }

  const snap = await query.get();
  return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
}

/**
 * Delete a product
 */
export async function deleteProduct(commerceId: string, token: string, productId: string) {
  if (!db) return;
  await verifyToken(commerceId, token);
  const cleanId = String(productId).replace(/[^a-zA-Z0-9_-]/g, '');
  await db.collection('comercios').doc(commerceId).collection('catalogo').doc(cleanId).delete();
  await deleteProductFromCache(commerceId, cleanId);
  return { ok: true };
}

/**
 * Toggles a product's status and updates the cache
 */
export async function toggleProductStatus(commerceId: string, token: string, productId: string, newStatus: string) {
  if (!db) return;
  await verifyToken(commerceId, token);
  const cleanId = String(productId).replace(/[^a-zA-Z0-9_-]/g, '');
  const safeStatus = ['ACTIVE', 'INACTIVE', 'DRAFT', 'ARCHIVED'].includes(newStatus) ? newStatus : 'ACTIVE';
  
  await db.collection('comercios').doc(commerceId).collection('catalogo').doc(cleanId).update({ status: safeStatus });

  const cacheRef = db.collection('comercios').doc(commerceId).collection('_system').doc('catalog');
  const cacheDoc = await cacheRef.get();
  if (cacheDoc.exists) {
    const compiled = cacheDoc.data()?.compiledCatalog || [];
    const idx = compiled.findIndex((p: any) => p.id === cleanId);
    if (idx >= 0) {
      compiled[idx].status = safeStatus;
      await cacheRef.set({ compiledCatalog: compiled, updatedAt: new Date().toISOString() }, { merge: true });
    }
  }
  return { ok: true };
}

/**
 * Add a new Area
 */
export async function addArea(commerceId: string, token: string, areaName: string, areaToken: string) {
  if (!db) return;
  const scope = await verifyToken(commerceId, token);
  if (scope !== 'MASTER') throw new Error('Unauthorized');

  const id = areaName.trim().replace(/[/.]/g, '_');
  await db.collection('comercios').doc(commerceId).collection('areas').doc(id).set({ name: id, token: areaToken.trim() }, { merge: true });
  return { ok: true };
}

/**
 * Delete an Area
 */
export async function deleteArea(commerceId: string, token: string, areaId: string) {
  if (!db) return;
  const scope = await verifyToken(commerceId, token);
  if (scope !== 'MASTER') throw new Error('Unauthorized');

  await db.collection('comercios').doc(commerceId).collection('areas').doc(areaId).delete();
  return { ok: true };
}

/**
 * Add a Provider
 */
export async function addProvider(commerceId: string, token: string, providerName: string) {
  if (!db) return;
  const scope = await verifyToken(commerceId, token);
  if (scope !== 'MASTER') throw new Error('Unauthorized');

  const id = providerName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  await db.collection('comercios').doc(commerceId).collection('providers').doc(id).set({ name: providerName.trim() }, { merge: true });
  return { ok: true };
}

/**
 * Delete a Provider
 */
export async function deleteProvider(commerceId: string, token: string, providerId: string) {
  if (!db) return;
  const scope = await verifyToken(commerceId, token);
  if (scope !== 'MASTER') throw new Error('Unauthorized');

  await db.collection('comercios').doc(commerceId).collection('providers').doc(providerId).delete();
  return { ok: true };
}
