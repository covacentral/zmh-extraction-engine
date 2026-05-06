'use server';

import { db, storage } from '../../lib/firebaseAdmin';

/**
 * Uploads a base64/webp image to Firebase Storage and returns the public URL
 */
export async function uploadProductImage(commerceId: string, base64Data: string) {
    if (!storage) throw new Error("Storage not initialized");

    const bucketName = 'zmh-extraction-engine.firebasestorage.app';
    const bucket = storage.bucket(bucketName);
    
    // Extract base64 payload
    const base64Payload = base64Data.split(';base64,').pop();
    if (!base64Payload) throw new Error("Invalid base64 data");

    const buffer = Buffer.from(base64Payload, 'base64');
    const fileName = `inventory/${commerceId}/${Date.now()}-${Math.random().toString(36).substring(7)}.webp`;
    
    const file = bucket.file(fileName);
    
    await file.save(buffer, {
        metadata: {
            contentType: 'image/webp',
            cacheControl: 'public, max-age=31536000'
        }
    });

    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(fileName)}?alt=media`;
}

/**
 * Validates the token against the MASTER token or Area tokens.
 * Returns 'MASTER' or the area name.
 */
async function verifyToken(commerceId: string, token: string) {
    if (!db) throw new Error("DB not initialized");
    const doc = await db.collection('comercios').doc(commerceId).get();
    if (!doc.exists) throw new Error("Commerce not found");

    const data = doc.data();
    if (data && data.inventoryToken === token) {
        return 'MASTER';
    }

    // Check in subcollection 'areas'
    const areasSnap = await db.collection('comercios').doc(commerceId).collection('areas').where('token', '==', token).get();
    if (!areasSnap.empty) {
        return areasSnap.docs[0].id; // The document ID is the area name
    }

    throw new Error("Invalid Token");
}

/**
 * Saves a single product to the 'catalogo' subcollection and immediately
 * updates the Materialized Cache.
 */
export async function saveProduct(commerceId: string, token: string, product: any) {
    if (!db) throw new Error("DB not initialized");
    
    const scope = await verifyToken(commerceId, token);
    
    // If scope is not MASTER, enforce the product area to match the token scope
    if (scope !== 'MASTER') {
        product.area = scope;
    }
    
    product.updatedAt = new Date().toISOString();
    
    // Auto-learning removed. Areas and Providers are strictly managed by MASTER in settings.

    // Write the individual document to the subcollection
    let docRef;
    if (product.id) {
        docRef = db.collection('comercios').doc(commerceId).collection('catalogo').doc(product.id);
        await docRef.set(product, { merge: true });
    } else {
        docRef = await db.collection('comercios').doc(commerceId).collection('catalogo').add(product);
        product.id = docRef.id;
    }

    // ZERO-READ CACHING: Update Materialized Cache
    try {
        await updateMaterializedCache(commerceId);
    } catch (err) {
        console.error("Cache compilation failed:", err);
    }

    return { ok: true, id: docRef.id };
}

/**
 * Background task to recompile the public catalog JSON.
 * Writes to _system/catalog.
 */
export async function updateMaterializedCache(commerceId: string) {
    if (!db) return;
    const snap = await db.collection('comercios').doc(commerceId).collection('catalogo').get();
        
    const compiled = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    await db.collection('comercios').doc(commerceId).collection('_system').doc('catalog').set({
        compiledCatalog: compiled,
        updatedAt: new Date().toISOString()
    }, { merge: true });
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
    await db.collection('comercios').doc(commerceId).collection('catalogo').doc(productId).delete();
    await updateMaterializedCache(commerceId);
    return { ok: true };
}

/**
 * Toggles a product's status and updates the cache
 */
export async function toggleProductStatus(commerceId: string, token: string, productId: string, newStatus: string) {
    if (!db) return;
    await verifyToken(commerceId, token); // Verify any valid token (areas can do this)
    await db.collection('comercios').doc(commerceId).collection('catalogo').doc(productId).update({ status: newStatus });
    await updateMaterializedCache(commerceId);
    return { ok: true };
}

/**
 * Add a new Area
 */
export async function addArea(commerceId: string, token: string, areaName: string, areaToken: string) {
    if (!db) return;
    const scope = await verifyToken(commerceId, token);
    if (scope !== 'MASTER') throw new Error("Unauthorized");
    
    const id = areaName.trim();
    await db.collection('comercios').doc(commerceId).collection('areas').doc(id).set({ name: id, token: areaToken }, { merge: true });
    return { ok: true };
}

/**
 * Delete an Area
 */
export async function deleteArea(commerceId: string, token: string, areaId: string) {
    if (!db) return;
    const scope = await verifyToken(commerceId, token);
    if (scope !== 'MASTER') throw new Error("Unauthorized");
    
    await db.collection('comercios').doc(commerceId).collection('areas').doc(areaId).delete();
    return { ok: true };
}

/**
 * Add a Provider
 */
export async function addProvider(commerceId: string, token: string, providerName: string) {
    if (!db) return;
    const scope = await verifyToken(commerceId, token);
    if (scope !== 'MASTER') throw new Error("Unauthorized");
    
    const id = providerName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    await db.collection('comercios').doc(commerceId).collection('providers').doc(id).set({ name: providerName.trim() }, { merge: true });
    return { ok: true };
}

/**
 * Delete a Provider
 */
export async function deleteProvider(commerceId: string, token: string, providerId: string) {
    if (!db) return;
    const scope = await verifyToken(commerceId, token);
    if (scope !== 'MASTER') throw new Error("Unauthorized");
    
    await db.collection('comercios').doc(commerceId).collection('providers').doc(providerId).delete();
    return { ok: true };
}
