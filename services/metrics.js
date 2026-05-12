/**
 * services/metrics.js
 * Handles Premium Metrics rollups and Live Inventory Deduction.
 * Extracted from index.js to keep dispatch route lean.
 */
const { db, admin } = require('./firebase');

/**
 * Deducts stock from the CQRS cache and the individual product docs (batch write).
 * Only runs for POS (isStoreSale) orders.
 */
async function deductInventory(commerceId, cart) {
    if (!db) return;
    try {
        const sysDocRef = db.collection('comercios').doc(commerceId).collection('_system').doc('catalog');
        const sysDoc = await sysDocRef.get();
        if (!sysDoc.exists) return;

        let compiled = sysDoc.data().compiledCatalog || [];
        let modified = false;
        const batch = db.batch();

        for (const item of cart) {
            if (!item.id) continue;
            const isVariation = String(item.id).includes('_');
            const parts = String(item.id).split('_');
            const actualDocId = isVariation ? parts[0] : item.id;
            const vIdx = isVariation ? parseInt(parts[1]) : 0;

            const cacheIndex = compiled.findIndex(p => p.id === actualDocId);
            if (cacheIndex !== -1) {
                const cachedProd = compiled[cacheIndex];
                if (cachedProd.variations && cachedProd.variations.length > vIdx) {
                    cachedProd.variations[vIdx].stock = Math.max(0, (cachedProd.variations[vIdx].stock || 0) - (item.qty || 1));
                    modified = true;
                    const docRef = db.collection('comercios').doc(commerceId).collection('catalogo').doc(actualDocId);
                    batch.update(docRef, { variations: compiled[cacheIndex].variations });
                }
            }
        }

        if (modified) {
            batch.update(sysDocRef, { compiledCatalog: compiled, updatedAt: new Date().toISOString() });
            await batch.commit();
            console.log(`[Inventory] Live deduction applied for ${commerceId}`);
        }
    } catch (err) {
        console.error('[Inventory] Deduction failed:', err);
    }
}

/**
 * Saves an order to Firestore and updates daily OLAP rollup stats.
 * Only runs for commerces with premiumMetrics === true.
 */
async function savePremiumMetrics(commerceId, orderData) {
    if (!db) return;
    const { name, phone, datetime, cart, total, isWholesale, isStoreSale,
            asesorName, asesorSection, businessType, orderContext, facCode } = orderData;

    try {
        const FieldValue = admin.firestore.FieldValue;
        const todayDate = new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0];
        const statsRef = db.collection('comercios').doc(commerceId).collection('estadisticas').doc(todayDate);

        const modo = isWholesale ? 'Mayorista' : 'Minorista';
        const safeAsesor = asesorName
            ? asesorName.replace(/[./[\]*]/g, '').substring(0, 50)
            : `Web ${modo}`;
        const safeArea = asesorSection
            ? asesorSection.replace(/[./[\]*]/g, '').substring(0, 50)
            : `Web ${modo}`;

        let updateData = { updatedAt: new Date().toISOString() };

        if (isStoreSale) {
            updateData.totalSales  = FieldValue.increment(total);
            updateData.totalOrders = FieldValue.increment(1);
            updateData[`salesByAsesor.${safeAsesor}`]  = FieldValue.increment(total);
            updateData[`ordersByAsesor.${safeAsesor}`] = FieldValue.increment(1);
            updateData[`salesByModo.${modo}`]          = FieldValue.increment(total);
            updateData[`ordersByModo.${modo}`]         = FieldValue.increment(1);
            updateData[`salesByArea.${safeArea}`]      = FieldValue.increment(total);
        } else {
            updateData.webPotentialValue                    = FieldValue.increment(total);
            updateData.webOrders                            = FieldValue.increment(1);
            updateData[`webLeadsByEntidad.${safeAsesor}`]  = FieldValue.increment(1);
            updateData[`webOrdersByModo.${modo}`]          = FieldValue.increment(1);
        }

        cart.forEach(item => {
            const safeKey  = (item.name || 'Desconocido').replace(/[./[\]*]/g, '').substring(0, 50);
            const safeBrand = item.brand ? item.brand.replace(/[./[\]*]/g, '').substring(0, 50) : null;

            if (isStoreSale) {
                if (safeBrand) updateData[`salesByBrand.${safeBrand}`] = FieldValue.increment(item.qty * item.price);
                updateData[`soldProducts.${safeKey}.qty`]    = FieldValue.increment(item.qty);
                updateData[`soldProducts.${safeKey}.revenue`] = FieldValue.increment(item.qty * item.price);
                updateData[`soldProducts.${safeKey}.byAsesor.${safeAsesor}.qty`]     = FieldValue.increment(item.qty);
                updateData[`soldProducts.${safeKey}.byAsesor.${safeAsesor}.revenue`] = FieldValue.increment(item.qty * item.price);
                updateData[`soldProducts.${safeKey}.byModo.${modo}.qty`]             = FieldValue.increment(item.qty);
                updateData[`soldProducts.${safeKey}.byModo.${modo}.revenue`]         = FieldValue.increment(item.qty * item.price);
            }
        });

        await statsRef.set(updateData, { merge: true });

        await db.collection('comercios').doc(commerceId).collection('pedidos').add({
            facCode, name: name || '', phone: phone || '', datetime,
            cart, total, isWholesale, isStoreSale, businessType,
            asesorName, asesorSection, orderContext: orderContext || {},
            createdAt: new Date().toISOString()
        });
    } catch (err) {
        console.error('[Metrics] Error saving premium metrics:', err);
    }
}

module.exports = { deductInventory, savePremiumMetrics };
