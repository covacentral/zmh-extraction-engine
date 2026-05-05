'use server';

import { db, storage } from '../lib/firebaseAdmin';
import crypto from 'crypto';

/**
 * Uploads a base64 WebP image to Firebase Storage and returns the public URL.
 */
export async function uploadProductImage(commerceId: string, base64Data: string): Promise<string> {
    if (!storage) throw new Error("Storage is not initialized");
    
    try {
        const bucket = storage.bucket();
        // Remove the data URI prefix (data:image/webp;base64,)
        const base64Str = base64Data.replace(/^data:image\/[a-z]+;base64,/, "");
        const buffer = Buffer.from(base64Str, 'base64');
        
        const fileName = `inventory/${commerceId}/${crypto.randomUUID()}.webp`;
        const file = bucket.file(fileName);
        
        await file.save(buffer, {
            metadata: {
                contentType: 'image/webp',
            },
        });
        
        await file.makePublic();
        return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    } catch (e: any) {
        console.error("Upload error:", e);
        throw new Error("Error uploading image: " + e.message);
    }
}

/**
 * Verifies if the token is valid for the given commerce.
 * Returns the "area" scope of the token, or "MASTER" if it's the master token.
 * Throws an error if invalid.
 */
async function verifyToken(commerceId: string, token: string): Promise<string> {
    const doc = await db!.collection('comercios').doc(commerceId).get();
    if (!doc.exists) throw new Error("Commerce not found");
    const data = doc.data();
    
    // Master Token
    if (data?.inventoryToken === token) return 'MASTER';
    
    // Check if it's an area token (e.g. inventoryToken_Cova == token)
    let matchedArea = null;
    if (data) {
        for (const [key, val] of Object.entries(data)) {
            if (key.startsWith('inventoryToken_') && val === token) {
                matchedArea = key.replace('inventoryToken_', '');
                break;
            }
        }
    }
    
    if (matchedArea) return matchedArea;
    throw new Error("Invalid Token");
}

/**
 * Saves a single product to the 'catalogo' subcollection and immediately
 * updates the Materialized Cache (Zero-Read Architecture).
 */
export async function saveProduct(commerceId: string, token: string, product: any) {
    if (!db) throw new Error("DB not initialized");
    
    const scope = await verifyToken(commerceId, token);
    
    // If scope is not MASTER, enforce the product area to match the token scope
    if (scope !== 'MASTER') {
        product.area = scope;
    }
    
    product.updatedAt = new Date().toISOString();
    
    // 1. Write the individual document to the subcollection (for OLTP / deep management)
    let docRef;
    if (product.id) {
        docRef = db.collection('comercios').doc(commerceId).collection('catalogo').doc(product.id);
        await docRef.set(product, { merge: true });
    } else {
        docRef = await db.collection('comercios').doc(commerceId).collection('catalogo').add(product);
        product.id = docRef.id;
    }

    // 2. ZERO-READ CACHING: Read all products and bundle them into compiledCatalog
    // This happens asynchronously so we don't block the client upload queue as much
    updateMaterializedCache(commerceId).catch(err => console.error("Cache compilation failed:", err));

    return { ok: true, id: docRef.id };
}

/**
 * Background task to recompile the public catalog JSON.
 * Maintains O(1) reads for the public storefront.
 */
async function updateMaterializedCache(commerceId: string) {
    if (!db) return;
    const snap = await db.collection('comercios').doc(commerceId).collection('catalogo')
        .where('status', '==', 'active').get();
        
    const compiled = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // Write the flat array into the master commerce document
    await db.collection('comercios').doc(commerceId).set({
        compiledCatalog: compiled
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
