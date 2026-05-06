import re

with open('index.js', 'r') as f:
    content = f.read()

# 1. Fix JID Routing
jid_pattern = r"        let dispatchJid = doc\.data\(\)\.dispatchJid;.*?console\.error\(\"Failed to resolve group invite link\", e\);\n            \}\n        \}"
new_jid = r"""        let dispatchJid;
        const commerceData = doc.data();

        if (isStoreSale) {
            dispatchJid = commerceData.posJid || commerceData.dispatchJid;
        } else if (isWholesale) {
            dispatchJid = commerceData.wholesaleJid || commerceData.dispatchJid;
        } else {
            dispatchJid = commerceData.retailJid || commerceData.dispatchJid;
        }

        if (!dispatchJid) return res.status(400).json({ error: 'Este comercio aún no ha configurado su grupo de WhatsApp en Firestore.' });
        
        if (dispatchJid.includes('chat.whatsapp.com/')) {
            const inviteCode = dispatchJid.replace('https://chat.whatsapp.com/', '').trim();
            try {
                const groupInfo = await globalSock.groupGetInviteInfo(inviteCode);
                if (groupInfo && groupInfo.id) {
                    dispatchJid = groupInfo.id;
                    if (isStoreSale && commerceData.posJid?.includes('chat.whatsapp.com/')) {
                        await doc.ref.update({ posJid: dispatchJid });
                    } else if (isWholesale && commerceData.wholesaleJid?.includes('chat.whatsapp.com/')) {
                        await doc.ref.update({ wholesaleJid: dispatchJid });
                    } else if (!isWholesale && !isStoreSale && commerceData.retailJid?.includes('chat.whatsapp.com/')) {
                        await doc.ref.update({ retailJid: dispatchJid });
                    } else {
                        await doc.ref.update({ dispatchJid: dispatchJid });
                    }
                }
            } catch(e) {
                console.error("Failed to resolve group invite link", e);
            }
        }"""
content = re.sub(jid_pattern, new_jid, content, flags=re.DOTALL)

# 2. Restrict Live Inventory Deduction
inventory_pattern = r"                // --- LIVE INVENTORY DEDUCTION \(ZERO-READ CACHE\) ---\n                try \{.*?// -------------------------------------------------"
new_inventory = r"""                // --- LIVE INVENTORY DEDUCTION (ZERO-READ CACHE) ---
                if (isStoreSale) {
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
                }
                // -------------------------------------------------"""
content = re.sub(inventory_pattern, new_inventory, content, flags=re.DOTALL)

# 3. Segregate Metrics
metrics_pattern = r"                        let updateData = \{.*?await statsRef\.set\(updateData, \{ merge: true \}\);"
new_metrics = r"""                        let updateData = { updatedAt: new Date().toISOString() };

                        if (isStoreSale) {
                            updateData.totalSales = FieldValue.increment(total);
                            updateData.totalOrders = FieldValue.increment(1);
                        } else {
                            updateData.webPotentialValue = FieldValue.increment(total);
                            updateData.webOrders = FieldValue.increment(1);
                        }

                        // Entidad y Modalidad
                        const modo = isWholesale ? 'Mayorista' : 'Minorista';
                        const safeAsesor = asesorName ? asesorName.replace(/[\.\/\[\]\*]/g, '').substring(0, 50) : `Web ${modo}`;
                        
                        // By Asesor / Entidad
                        if (isStoreSale) {
                            updateData[`salesByAsesor.${safeAsesor}`] = FieldValue.increment(total);
                            updateData[`ordersByAsesor.${safeAsesor}`] = FieldValue.increment(1);
                        } else {
                            updateData[`webLeadsByEntidad.${safeAsesor}`] = FieldValue.increment(1);
                        }

                        // By Modo
                        if (isStoreSale) {
                            updateData[`salesByModo.${modo}`] = FieldValue.increment(total);
                            updateData[`ordersByModo.${modo}`] = FieldValue.increment(1);
                        } else {
                            updateData[`webOrdersByModo.${modo}`] = FieldValue.increment(1);
                        }

                        // By Area
                        const safeArea = asesorSection ? asesorSection.replace(/[\.\/\[\]\*]/g, '').substring(0, 50) : `Web ${modo}`;
                        if (isStoreSale) {
                            updateData[`salesByArea.${safeArea}`] = FieldValue.increment(total);
                        }

                        // By Brand and Product
                        cart.forEach(item => {
                            if (isStoreSale && item.brand) {
                                const safeBrand = item.brand.replace(/[\.\/\[\]\*]/g, '').substring(0, 50);
                                updateData[`salesByBrand.${safeBrand}`] = FieldValue.increment(item.qty * item.price);
                            }
                            const safeKey = (item.name || 'Desconocido').replace(/[\.\/\[\]\*]/g, '').substring(0, 50);
                            
                            if (isStoreSale) {
                                updateData[`soldProducts.${safeKey}.qty`] = FieldValue.increment(item.qty);
                                updateData[`soldProducts.${safeKey}.revenue`] = FieldValue.increment(item.qty * item.price);
                                
                                updateData[`soldProducts.${safeKey}.byAsesor.${safeAsesor}.qty`] = FieldValue.increment(item.qty);
                                updateData[`soldProducts.${safeKey}.byAsesor.${safeAsesor}.revenue`] = FieldValue.increment(item.qty * item.price);
                                
                                updateData[`soldProducts.${safeKey}.byModo.${modo}.qty`] = FieldValue.increment(item.qty);
                                updateData[`soldProducts.${safeKey}.byModo.${modo}.revenue`] = FieldValue.increment(item.qty * item.price);
                            }
                        });

                        await statsRef.set(updateData, { merge: true });"""
content = re.sub(metrics_pattern, new_metrics, content, flags=re.DOTALL)

with open('index.js', 'w') as f:
    f.write(content)
print("index.js updated successfully")
