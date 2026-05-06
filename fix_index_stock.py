import re

with open('index.js', 'r') as f:
    content = f.read()

injection = """
                // --- LIVE INVENTORY DEDUCTION (ZERO-READ CACHE) ---
                try {
                    const sysDocRef = db.collection('comercios').doc(commerceId).collection('_system').doc('catalog');
                    const sysDoc = await sysDocRef.get();
                    if (sysDoc.exists) {
                        const sysData = sysDoc.data();
                        let compiled = sysData.compiledCatalog || [];
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
                            console.log(`Live Inventory updated for ${commerceId}`);
                        }
                    }
                } catch (err) {
                    console.error("Live inventory deduction failed:", err);
                }
                // -------------------------------------------------
"""

target = "caption: msg \n                });"

if target in content:
    content = content.replace(target, target + "\n" + injection)
    with open('index.js', 'w') as f:
        f.write(content)
    print("index.js modified successfully")
else:
    print("target not found")
