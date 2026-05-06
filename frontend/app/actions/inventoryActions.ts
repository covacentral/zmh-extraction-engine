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
    
    // Write Provider for autocompletion
    if (product.provider) {
        const pId = product.provider.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
        if (pId) {
            await db.collection('comercios').doc(commerceId).collection('providers').doc(pId).set({ name: product.provider.trim() }, { merge: true });
        }
    }
    
    // Write Area for autocompletion (if master adds a new area)
    if (product.area && scope === 'MASTER') {
        const aId = product.area.trim();
        if (aId) {
            await db.collection('comercios').doc(commerceId).collection('areas').doc(aId).set({ name: aId }, { merge: true });
        }
    }

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
