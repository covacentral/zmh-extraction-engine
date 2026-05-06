const express = require('express');
const { default: makeWASocket, fetchLatestBaileysVersion, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const cors = require('cors');
const admin = require('firebase-admin');
const PDFDocument = require('pdfkit');
const cron = require('node-cron');

// Prevent Baileys unhandled promise rejections from crashing the server
process.on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
    console.log('Uncaught Exception:', err);
});

// Initialize Firebase Admin DB
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} else {
    console.warn("WARNING: FIREBASE_SERVICE_ACCOUNT is not set. The bot might not be able to store state.");
}

const db = admin.firestore?.();

const useFirebaseAuthState = async (sessionId) => {
    if (!db) {
        console.warn("Firebase not initialized, falling back to empty creds.");
        return { state: { creds: initAuthCreds(), keys: { get: () => ({}), set: () => {} } }, saveCreds: () => {} };
    }

    const docRef = db.collection('baileys_sessions').doc(sessionId);

    const writeData = async (data, file) => {
        try {
            await docRef.collection('keys').doc(file).set({ data: JSON.stringify(data, BufferJSON.replacer) });
        } catch (error) {
            console.error("Error writing data to firebase:", error);
        }
    };

    const readData = async (file) => {
        try {
            const doc = await docRef.collection('keys').doc(file).get();
            if(doc.exists) {
                return JSON.parse(doc.data().data, BufferJSON.reviver);
            }
        } catch(error) {
            console.error("Error reading data from firebase:", file);
        }
        return null;
    };

    const removeData = async (file) => {
        try {
            await docRef.collection('keys').doc(file).delete();
        } catch (error) {
            console.error("Error removing data from firebase:", file);
        }
    };

    let creds = await readData('creds.json');
    if(!creds) {
        creds = initAuthCreds();
        await writeData(creds, 'creds.json');
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async id => {
                            let value = await readData(`${type}-${id}.json`);
                            if(type === 'app-state-sync-key' && value) {
                                value = Buffer.from(value.data, 'base64');
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for(const category in data) {
                        for(const id in data[category]) {
                            const value = data[category][id];
                            const file = `${category}-${id}.json`;
                            tasks.push(value ? writeData(value, file) : removeData(file));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds.json')
    };
};

const app = express();
app.use(cors());
const port = process.env.PORT || 10000;

let isReady = false;
let globalSock = null;

async function startWhatsApp() {
    const { state, saveCreds } = await useFirebaseAuthState('zmh_hub');
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n================================');
            console.log('👉 NUEVO CODIGO QR ALOJADO AQUÍ:');
            console.log('https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=' + encodeURIComponent(qr));
            console.log('================================\n');
        }

        if (connection === 'close') {
            isReady = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode !== 401) {
                console.log('Reconectando...');
                startWhatsApp();
            } else {
                console.log('DESCONECTADO POR WHATSAPP. BORRA baileys_sessions EN FIREBASE Y REINICIA.');
            }
        } else if (connection === 'open') {
            console.log('\n==== OBSERVADOR LISTO Y CONECTADO ====');
            isReady = true;
            globalSock = sock;
        }
    });
}

startWhatsApp();

app.get('/api/health', (req, res) => res.json({ status: 'ok', ready: isReady }));

app.get('/api/avatar/:jid', async (req, res) => {
    if (!isReady || !globalSock) return res.status(503).json({ error: 'Not ready' });
    try {
        let targetJid = req.params.jid;

        // Detect if it's an invite code (does not have @ and has letters)
        if (!targetJid.includes('@') && /[a-zA-Z]/.test(targetJid)) {
            let inviteCode = targetJid.replace('https://chat.whatsapp.com/', '').trim();
            const inviteInfo = await globalSock.groupGetInviteInfo(inviteCode);
            if (inviteInfo && inviteInfo.id) targetJid = inviteInfo.id;
        } else {
            targetJid = targetJid.includes('@') ? targetJid : `${targetJid}@s.whatsapp.net`;
        }

        const profilePicUrl = await globalSock.profilePictureUrl(targetJid, 'image');
        if (!profilePicUrl) return res.status(404).json({ error: 'No pic' });
        
        // Dynamic fetch of the profile picture to proxy it to frontend avoiding CORS
        const fetch = (await import('node-fetch')).default; // Use dynamic import for fetch if using node 16, or native global fetch for node 18+
        const resp = await (global.fetch ? global.fetch(profilePicUrl) : fetch(profilePicUrl));
        const buffer = await resp.arrayBuffer();
        
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'public, max-age=3600');
        res.send(Buffer.from(buffer));
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error fetching picture' });
    }
});

app.get('/api/seed', async (req, res) => {
    try {
        if (!db) return res.status(500).json({ error: 'DB not setup' });
        await db.collection('comercios').doc('cc-bodega-mayorista').set({
            themeHex: "#3b82f6", // Premium Blue
            businessName: "Centro Comercial Bodega Mayorista",
            avatarJid: "573014709090",
            promoJid: "EGSmr9dLr9iG0juYRQG3GT",
            buttons: [
                { type: "whatsapp", url: "https://whatsapp.com/channel/0029VbBXnQY2phHItjmZQx0a", name: "Canal Ofertas 1", role: "Descuentos Diarios" },
                { type: "whatsapp", url: "https://whatsapp.com/channel/0029VbBblzrBFLgWbyOgpL2o", name: "Canal Mayoristas 2", role: "Catálogo Nuevo" },
                { type: "whatsapp", url: "https://whatsapp.com/channel/0029VbBtmyBAYlUQ0QfzAG1D", name: "Canal Vip 3", role: "Promos Flash" },
                { type: "whatsapp", url: "https://whatsapp.com/channel/0029VbCRMzMC1Fu5vMwm9p05", name: "Canal Asistencia 4", role: "Soporte Técnico" }
            ]
        });
        res.json({ ok: true });
    } catch(e) { res.status(500).json({ err: e.toString() }); }
});

app.use(express.json());

// API Pasarela: Fetch Catalog directly from WhatsApp
app.get('/api/catalog/:jid', async (req, res) => {
    if (!isReady || !globalSock) return res.status(503).json({ error: 'WhatsApp offline' });
    
    const { jid } = req.params;
    if (!jid) return res.status(400).json({ error: 'Missing JID' });
    
    const targetJid = jid.includes('@') ? jid : `${jid}@s.whatsapp.net`;
    
    try {
        let products = [];
        if (typeof globalSock.getCatalog === 'function') {
            const catalog = await globalSock.getCatalog({ jid: targetJid });
            if (catalog && catalog.products) products = catalog.products;
        } else {
            const result = await globalSock.query({
                tag: 'iq',
                attrs: { to: 's.whatsapp.net', type: 'get', xmlns: 'w:biz:catalog' },
                content: [{ tag: 'product_catalog', attrs: { jid: targetJid, allow_paged: 'true' } }]
            });
            products = result?.content || [];
        }
        
        // Serialize to strip undefined values to ensure clean JSON output
        const sanitizedProducts = JSON.parse(JSON.stringify(products));
        
        // Cache headers to instruct edge networks (like Vercel) if they fetch this
        res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
        res.json({ ok: true, products: sanitizedProducts });
    } catch(err) {
        console.error('Error fetching catalog API Pasarela:', targetJid, err.message);
        res.status(500).json({ error: 'Failed to fetch catalog', details: err.message });
    }
});

app.post('/api/dispatch', async (req, res) => {
    if (!isReady || !globalSock) return res.status(503).json({ error: 'WhatsApp offline' });
    try {
        const { commerceId, name, phone, datetime, cart = [], total = 0, isWholesale = false, isStoreSale = false, asesorName = '', asesorSection = '', businessType = 'RETAIL', orderContext } = req.body;
        
        const doc = await db.collection('comercios').doc(commerceId).get();
        if (!doc.exists) return res.status(404).json({ error: 'Commerce not found' });
        
        let dispatchJid;
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
        }
        
        let msg = '';
        const isRestaurant = businessType === 'RESTAURANTE';
        
        if (isRestaurant && orderContext) {
            msg = `🍽️ *NUEVO PEDIDO DE RESTAURANTE*\n\n`;
            if (orderContext.mode === 'mesa') {
                msg += `📍 *Sede:* ${orderContext.sede || 'N/A'}\n`;
                msg += `🪑 *Mesa:* ${orderContext.mesa}\n`;
                msg += `👤 *Cliente:* ${name || 'Sin nombre'}\n\n`;
            } else if (orderContext.mode === 'mesero') {
                msg += `🤵‍♂️ *Mesero:* ${orderContext.mesero || asesorName}\n`;
                msg += `📍 *Sede:* ${orderContext.sede || 'N/A'}\n`;
                msg += `🪑 *Mesa:* ${orderContext.mesa}\n`;
                msg += `👤 *Cliente:* ${name || 'Sin nombre'}\n\n`;
            } else {
                msg += `🛵 *Tipo:* ${orderContext.deliveryType === 'delivery' ? 'Envío a Domicilio' : 'Recoger Local'}\n`;
                msg += `👤 *Cliente:* ${name}\n`;
                msg += `📱 *Teléfono:* +${phone.replace(/\D/g,'')}\n`;
                if (orderContext.deliveryType === 'delivery') {
                    msg += `📍 *Dirección:* ${orderContext.address}\n\n`;
                } else {
                    msg += `🕒 *Para:* ${datetime}\n\n`;
                }
            }
        } else if (isStoreSale) {
            msg = `🏬 *NUEVA VENTA EN TIENDA*\n\n`;
            msg += `👨‍💼 *Asesor:* ${asesorName} (${asesorSection})\n`;
            msg += `👤 *Cliente:* ${name}\n`;
            msg += `🏢 *Modo:* ${isWholesale ? 'Mayorista' : 'Minorista'}\n\n`;
        } else {
            msg = `🔔 *NUEVO PEDIDO / CITA*\n\n`;
            msg += `👤 *Cliente:* ${name}\n`;
            msg += `📱 *Teléfono:* +${phone.replace(/\D/g,'')}\n`;
            msg += `🕒 *Fecha sugerida:* ${datetime}\n`;
            msg += `🏢 *Modo:* ${isWholesale ? 'Mayorista' : 'Minorista'}\n\n`;
        }
        
        if (cart.length > 0) {
            msg += `🛒 *CARRITO:*\n`;
            cart.forEach(item => {
                const ref = item.refCode ? ` [REF: ${item.refCode}]` : '';
                const mod = (isRestaurant && item.modifier) ? (item.modifier === 'aqui' ? ' [🍽️ Aquí]' : ' [🛍️ Llevar]') : '';
                msg += `- ${item.qty}x ${item.name}${ref}${mod} ($${item.price})\n`;
            });
            msg += `\n💰 *Total:* $${total}\n\n`;
        } else {
            msg += `🛒 *CARRITO:* Vacío (Solo Agendamiento)\n\n`;
        }
        
        if (!isStoreSale) {
            msg += `Para atender esta solicitud, responde a este ticket. Toca el número arriba para abrir el chat con el cliente.`;
        } else {
            msg += `Adjunto se envía la factura de cobro.`;
        }

        // ALWAYS generate PDF
        {
            // Generate PDF Buffer for 80mm Thermal Printer (approx 226 points width)
            const docPdf = new PDFDocument({ size: [226, 800], margin: 10 });
            let buffers = [];
            docPdf.on('data', buffers.push.bind(buffers));
            
            // Build PDF Content
            const commerceName = doc.data().businessName || 'BODEGA MAYORISTA';
            const now = new Date();
            const timeStr = now.toLocaleString('es-CO', { timeZone: 'America/Bogota', year:'2-digit', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: false }).replace(/\D/g, '');
            const ms = now.getMilliseconds().toString().padStart(3, '0');
            const facCode = `REC-${timeStr.slice(0, 10)}-${timeStr.slice(10)}${ms}`;

            docPdf.font('Courier-Bold').fontSize(12).text(commerceName, { align: 'center' });
            docPdf.moveDown(0.5);
            
            docPdf.font('Courier').fontSize(9);
            const isRestaurant = businessType === 'RESTAURANTE';
            
            if (isRestaurant && orderContext && (orderContext.mode === 'mesa' || orderContext.mode === 'mesero')) {
                if (orderContext.mode === 'mesa') {
                   docPdf.text(`Comanda de Mesa: ${facCode}`, { align: 'center' });
                   docPdf.text(`Fecha: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`, { align: 'center' });
                   docPdf.text(`Sede: ${orderContext.sede || 'N/A'}`, { align: 'center' });
                   docPdf.text(`Mesa: ${orderContext.mesa}`, { align: 'center' });
                   if (name) docPdf.text(`Cliente: ${name}`, { align: 'center' });
                } else if (orderContext.mode === 'mesero') {
                   docPdf.text(`Comanda: ${facCode}`, { align: 'center' });
                   docPdf.text(`Fecha: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`, { align: 'center' });
                   docPdf.text(`Sede: ${orderContext.sede || 'N/A'}`, { align: 'center' });
                   docPdf.text(`Mesa: ${orderContext.mesa}`, { align: 'center' });
                   docPdf.text(`Mesero: ${orderContext.mesero || asesorName}`, { align: 'center' });
                }
            } else {
                // Retail, VIP, Asesor, or Restaurant Delivery
                const isDelivery = orderContext?.deliveryType === 'delivery';
                const isPickup = orderContext?.deliveryType === 'pickup';
                const isAsesor = !!asesorName;
                const isVip = isWholesale && !isAsesor; // Approximation of VIP for PDF display
                
                docPdf.text(isDelivery ? `Guía de Despacho: ${facCode}` : `Recibo de Caja: ${facCode}`, { align: 'center' });
                docPdf.text(`Fecha: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`, { align: 'center' });
                
                if (isAsesor) {
                    docPdf.text(`Asesor: ${asesorName}`, { align: 'center' });
                }
                
                if (isDelivery) {
                    docPdf.text(`Tipo: DOMICILIO / ENCARGO`, { align: 'center' });
                } else if (isPickup) {
                    docPdf.text(`Tipo: RECOGER / MOSTRADOR`, { align: 'center' });
                } else {
                    docPdf.text(`Modalidad: ${isWholesale ? 'MAYORISTA' : 'MINORISTA'}`, { align: 'center' });
                }

                if (name) docPdf.text(`Cliente: ${name}${isVip ? ' (VIP)' : ''}`, { align: 'center' });
                
                if (phone) {
                    docPdf.text(`Tel: ${phone.replace(/\D/g,'')}`, { align: 'center' });
                }
                
                if (isDelivery && orderContext?.address) {
                    docPdf.text(`Dir: ${orderContext.address}`, { align: 'center' });
                }
            }
            docPdf.moveDown(0.5);
            

            
            docPdf.font('Courier-Bold');
            docPdf.text('--------------------------------------', { align: 'center' });
            docPdf.text('CANT REF  PRODUCTO', { align: 'left' });
            docPdf.text('       V.UNIT           SUBTOTAL', { align: 'left' });
            docPdf.text('--------------------------------------', { align: 'center' });
            docPdf.font('Courier');

            cart.forEach(item => {
                const ref = (item.refCode || '').substring(0, 4).padEnd(4, ' ');
                const qty = String(item.qty).padStart(2, ' ') + 'x';
                const mod = (isRestaurant && item.modifier) ? (item.modifier === 'aqui' ? ' [AQ]' : ' [LL]') : '';
                const prodName = (item.name || '').substring(0, 27 - mod.length) + mod;
                
                // Line 1: CANT REF PRODUCTO
                docPdf.text(`${qty} ${ref} ${prodName}`, { align: 'left' });
                
                // Line 2: V.UNIT and SUBTOTAL
                const unitPrice = `$${item.price.toLocaleString('es-CO')}`;
                const subTotal = `$${(item.qty * item.price).toLocaleString('es-CO')}`;
                
                // Max line length for Courier 9pt on 206pt usable width is ~38 chars.
                const line2Prefix = `       ${unitPrice}`;
                const paddingNeeded = Math.max(0, 38 - line2Prefix.length - subTotal.length);
                const line2 = line2Prefix + ' '.repeat(paddingNeeded) + subTotal;
                
                docPdf.text(line2, { align: 'left' });
                docPdf.moveDown(0.2);
            });

            docPdf.font('Courier-Bold');
            docPdf.text('--------------------------------------', { align: 'center' });
            docPdf.fontSize(11).text(`TOTAL: $${total.toLocaleString('es-CO')}`, { align: 'right' });
            
            docPdf.end();

            docPdf.on('end', async () => {
                const pdfData = Buffer.concat(buffers);
                await globalSock.sendMessage(dispatchJid, { 
                    document: pdfData, 
                    mimetype: 'application/pdf', 
                    fileName: `${facCode}.pdf`, 
                    caption: msg 
                });

                // --- LIVE INVENTORY DEDUCTION (ZERO-READ CACHE) ---
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
                // -------------------------------------------------


                // Premium Metrics: Guardado Silencioso y Agregaciones (Rollups)
                const commerceData = doc.data();
                if (commerceData.premiumMetrics === true) {
                    try {
                        const todayDate = new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0];
                        const statsRef = db.collection('comercios').doc(commerceId).collection('estadisticas').doc(todayDate);
                        
                        const FieldValue = admin.firestore.FieldValue;
                        
                        let updateData = { updatedAt: new Date().toISOString() };

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

                        await statsRef.set(updateData, { merge: true });

                        await db.collection('comercios').doc(commerceId).collection('pedidos').add({
                            facCode,
                            name: name || '',
                            phone: phone || '',
                            datetime,
                            cart,
                            total,
                            isWholesale,
                            isStoreSale,
                            businessType,
                            asesorName,
                            asesorSection,
                            orderContext: orderContext || {},
                            createdAt: new Date().toISOString()
                        });
                    } catch (err) {
                        console.error('Error saving premium metrics and rollups:', err);
                    }
                }

                res.json({ ok: true, msg: 'Ticket y Factura despachados exitosamente.' });
            });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// CRON JOB: Generador de Reportes Diarios (CSV vía WhatsApp)
app.get('/api/report/daily', async (req, res) => {
    try {
        if (!isReady || !globalSock) return res.status(503).json({ error: 'WhatsApp offline' });
        
        // Secure endpoint
        const cronKey = req.query.key;
        if (cronKey !== (process.env.CRON_KEY || 'default_secret')) {
             return res.status(401).json({ error: 'Unauthorized' });
        }

        const todayStart = new Date();
        todayStart.setHours(0,0,0,0);
        const todayEnd = new Date();
        todayEnd.setHours(23,59,59,999);

        // Fetch all premium comercios
        const comerciosSnap = await db.collection('comercios').where('premiumMetrics', '==', true).get();
        let reportsSent = 0;

        for (const comercioDoc of comerciosSnap.docs) {
            const commerceId = comercioDoc.id;
            const data = comercioDoc.data();
            if (!data.dispatchJid) continue;

            // Fetch today's orders
            const pedidosSnap = await db.collection('comercios').doc(commerceId).collection('pedidos')
                .where('createdAt', '>=', todayStart.toISOString())
                .where('createdAt', '<=', todayEnd.toISOString())
                .get();

            if (pedidosSnap.empty) continue; // Skip if no sales today

            // Build CSV
            let csv = '\uFEFF'; // BOM for Excel UTF-8 compatibility
            csv += 'Factura,Fecha,Asesor,Area/Seccion,Modo,Tipo_Entrega,Cliente,Telefono,Direccion,Ref_Producto,Marca,Producto,Cantidad,Precio_Unitario,Subtotal\n';
            
            let dailyTotal = 0;

            // Helper to escape CSV strings
            const escapeCSV = (str) => {
                if (str == null) return '';
                const s = String(str);
                // If it contains quotes, commas, or newlines, enclose in quotes and double internal quotes
                if (s.includes('"') || s.includes(',') || s.includes('\n')) {
                    return `"${s.replace(/"/g, '""')}"`;
                }
                return s;
            };

            pedidosSnap.docs.forEach(pDoc => {
                const p = pDoc.data();
                const dateObj = new Date(p.createdAt);
                const dateStr = dateObj.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota' });
                
                const asesor = p.asesorName || 'Web / Cliente';
                const area = p.asesorSection || 'N/A';
                const modo = p.isWholesale ? 'Mayorista' : 'Minorista';
                const tipoEntrega = p.orderContext?.mode === 'delivery' ? (p.orderContext?.deliveryType || 'N/A') : (p.orderContext?.mode || 'tienda');
                
                const cliName = p.name || '';
                const cliPhone = (p.phone || '').replace(/\D/g, '');
                const cliAddress = p.orderContext?.address || '';

                p.cart.forEach(item => {
                    const ref = item.refCode || '';
                    const brand = item.brand || 'N/A';
                    const prodName = item.name || '';
                    const sub = (item.qty * item.price);
                    
                    csv += `${escapeCSV(p.facCode)},${escapeCSV(dateStr)},${escapeCSV(asesor)},${escapeCSV(area)},${escapeCSV(modo)},${escapeCSV(tipoEntrega)},${escapeCSV(cliName)},${escapeCSV(cliPhone)},${escapeCSV(cliAddress)},${escapeCSV(ref)},${escapeCSV(brand)},${escapeCSV(prodName)},${escapeCSV(item.qty)},${escapeCSV(item.price)},${escapeCSV(sub)}\n`;
                });
                dailyTotal += p.total;
            });

            const csvBuffer = Buffer.from(csv, 'utf8');
            const fileName = `Reporte_${commerceId}_${todayStart.toISOString().split('T')[0]}.csv`;
            const caption = `📊 *Reporte Diario Automático*\n\nComercio: ${data.businessName || commerceId}\nTotal Facturado Hoy: *$${dailyTotal.toLocaleString('es-CO')}*\nPedidos procesados: ${pedidosSnap.size}\n\n_Puedes abrir este archivo directamente en Excel o Google Sheets._`;

            await globalSock.sendMessage(data.dispatchJid, { 
                document: csvBuffer, 
                mimetype: 'text/csv', 
                fileName: fileName, 
                caption: caption 
            });
            reportsSent++;
        }

        res.json({ ok: true, msg: `Daily reports sent to ${reportsSent} premium comercios.` });
    } catch(err) {
        console.error('Error generating daily reports:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/debug-catalog', async (req, res) => {
    try {
        const doc = await db.collection('comercios').doc(req.query.id || 'cc-bodega-mayorista').get();
        const catalog = doc.data()?.whatsappCatalog || [];
        res.json(catalog.slice(0, 3));
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});
// Endpoint temporal para migrar pedidos antiguos a estadisticas
app.get('/api/migrate-stats', async (req, res) => {
    try {
        const cronKey = req.query.key;
        if (cronKey !== (process.env.CRON_KEY || 'default_secret')) {
             return res.status(401).json({ error: 'Unauthorized' });
        }

        const comerciosSnap = await db.collection('comercios').get();
        let migratedCount = 0;

        for (const comercioDoc of comerciosSnap.docs) {
            const commerceId = comercioDoc.id;
            const pedidosSnap = await db.collection('comercios').doc(commerceId).collection('pedidos').get();
            
            if (pedidosSnap.empty) continue;

            const dailyStats = {};

            pedidosSnap.docs.forEach(pDoc => {
                const p = pDoc.data();
                if (!p.createdAt) return;

                const dateObj = new Date(p.createdAt);
                const dateStr = dateObj.toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0];
                
                if (!dailyStats[dateStr]) {
                    dailyStats[dateStr] = {
                        totalSales: 0,
                        totalOrders: 0,
                        salesByAsesor: {},
                        ordersByAsesor: {},
                        salesByArea: {},
                        salesByBrand: {},
                        soldProducts: {}
                    };
                }

                const stats = dailyStats[dateStr];
                const total = p.total || 0;

                stats.totalSales += total;
                stats.totalOrders += 1;

                const modo = p.isWholesale ? 'Mayorista' : 'Minorista';
                const safeAsesor = p.asesorName ? p.asesorName.replace(/[\.\/\[\]\*]/g, '').substring(0, 50) : `Web ${modo}`;
                
                stats.salesByAsesor[safeAsesor] = (stats.salesByAsesor[safeAsesor] || 0) + total;
                stats.ordersByAsesor[safeAsesor] = (stats.ordersByAsesor[safeAsesor] || 0) + 1;

                if (!stats.salesByModo) stats.salesByModo = {};
                if (!stats.ordersByModo) stats.ordersByModo = {};
                stats.salesByModo[modo] = (stats.salesByModo[modo] || 0) + total;
                stats.ordersByModo[modo] = (stats.ordersByModo[modo] || 0) + 1;

                const safeArea = p.asesorSection ? p.asesorSection.replace(/[\.\/\[\]\*]/g, '').substring(0, 50) : `Web ${modo}`;
                stats.salesByArea[safeArea] = (stats.salesByArea[safeArea] || 0) + total;

                if (Array.isArray(p.cart)) {
                    p.cart.forEach(item => {
                        const qty = item.qty || 1;
                        const price = item.price || 0;
                        if (item.brand) {
                            const safeBrand = item.brand.replace(/[\.\/\[\]\*]/g, '').substring(0, 50);
                            stats.salesByBrand[safeBrand] = (stats.salesByBrand[safeBrand] || 0) + (qty * price);
                        }
                        const safeKey = (item.name || 'Desconocido').replace(/[\.\/\[\]\*]/g, '').substring(0, 50);
                        
                        if (!stats.soldProducts[safeKey]) {
                            stats.soldProducts[safeKey] = { qty: 0, revenue: 0, byAsesor: {}, byModo: {} };
                        }
                        
                        stats.soldProducts[safeKey].qty += qty;
                        stats.soldProducts[safeKey].revenue += (qty * price);
                        
                        stats.soldProducts[safeKey].byAsesor[safeAsesor] = stats.soldProducts[safeKey].byAsesor[safeAsesor] || { qty: 0, revenue: 0 };
                        stats.soldProducts[safeKey].byAsesor[safeAsesor].qty += qty;
                        stats.soldProducts[safeKey].byAsesor[safeAsesor].revenue += (qty * price);
                        
                        stats.soldProducts[safeKey].byModo[modo] = stats.soldProducts[safeKey].byModo[modo] || { qty: 0, revenue: 0 };
                        stats.soldProducts[safeKey].byModo[modo].qty += qty;
                        stats.soldProducts[safeKey].byModo[modo].revenue += (qty * price);
                    });
                }
            });

            // Write all aggregated stats to Firestore
            for (const [dateStr, stats] of Object.entries(dailyStats)) {
                stats.updatedAt = new Date().toISOString();
                await db.collection('comercios').doc(commerceId).collection('estadisticas').doc(dateStr).set(stats, { merge: true });
                migratedCount++;
            }
        }

        res.json({ ok: true, msg: `Migrated OLAP stats for ${migratedCount} daily records.` });
    } catch(err) {
        console.error('Migration error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Endpoint temporal para sembrar datos falsos
app.get('/api/seed-stats', async (req, res) => {
    try {
        const cronKey = req.query.key;
        if (cronKey !== (process.env.CRON_KEY || 'default_secret')) return res.status(401).json({ error: 'Unauthorized' });
        
        const commerceId = req.query.id || 'cc-bodega-mayorista';
        const asesores = ['Web Minorista', 'Web Mayorista', 'Juan', 'Maria', 'Carlos'];
        const modos = ['Minorista', 'Mayorista'];
        const brands = ['Samsung', 'Sony', 'LG', 'JBL'];
        const products = ['Smartphone', 'TV 4K', 'Parlante Bluetooth', 'Audifonos'];

        let stats = {
            totalSales: 0, totalOrders: 0,
            salesByAsesor: {}, ordersByAsesor: {},
            salesByArea: {}, salesByBrand: {}, soldProducts: {},
            updatedAt: new Date().toISOString()
        };

        for (let i = 0; i < 50; i++) {
            const asesor = asesores[Math.floor(Math.random() * asesores.length)];
            const isWholesale = asesor === 'Web Mayorista' || Math.random() > 0.5;
            const modo = isWholesale ? 'Mayorista' : 'Minorista';
            const area = asesor.includes('Web') ? `Web ${modo}` : 'Electronica';
            
            const totalItems = Math.floor(Math.random() * 5) + 1;
            let orderTotal = 0;

            for (let j = 0; j < totalItems; j++) {
                const pName = products[Math.floor(Math.random() * products.length)];
                const brand = brands[Math.floor(Math.random() * brands.length)];
                const qty = Math.floor(Math.random() * 3) + 1;
                const price = Math.floor(Math.random() * 500) * 1000 + 50000;
                
                orderTotal += qty * price;

                stats.salesByBrand[brand] = (stats.salesByBrand[brand] || 0) + (qty * price);

                if (!stats.soldProducts[pName]) stats.soldProducts[pName] = { qty: 0, revenue: 0, byAsesor: {}, byModo: {} };
                
                stats.soldProducts[pName].qty += qty;
                stats.soldProducts[pName].revenue += (qty * price);
                
                stats.soldProducts[pName].byAsesor[asesor] = stats.soldProducts[pName].byAsesor[asesor] || { qty: 0, revenue: 0 };
                stats.soldProducts[pName].byAsesor[asesor].qty += qty;
                stats.soldProducts[pName].byAsesor[asesor].revenue += (qty * price);

                stats.soldProducts[pName].byModo[modo] = stats.soldProducts[pName].byModo[modo] || { qty: 0, revenue: 0 };
                stats.soldProducts[pName].byModo[modo].qty += qty;
                stats.soldProducts[pName].byModo[modo].revenue += (qty * price);
            }

            stats.totalOrders += 1;
            stats.totalSales += orderTotal;
            stats.salesByAsesor[asesor] = (stats.salesByAsesor[asesor] || 0) + orderTotal;
            stats.ordersByAsesor[asesor] = (stats.ordersByAsesor[asesor] || 0) + 1;
            
            if (!stats.salesByModo) stats.salesByModo = {};
            if (!stats.ordersByModo) stats.ordersByModo = {};
            stats.salesByModo[modo] = (stats.salesByModo[modo] || 0) + orderTotal;
            stats.ordersByModo[modo] = (stats.ordersByModo[modo] || 0) + 1;

            stats.salesByArea[area] = (stats.salesByArea[area] || 0) + orderTotal;
        }

        const todayDate = new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0];
        await db.collection('comercios').doc(commerceId).collection('estadisticas').doc(todayDate).set(stats, { merge: true });

        res.json({ ok: true, msg: '50 fake orders generated and rolled up.', totalSales: stats.totalSales });
    } catch(e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});
app.listen(port, () => console.log(`API port ${port}`));

app.get('/api/test-db', async (req, res) => {
    try {
        if (!db) return res.status(500).json({ status: 'error', message: 'DB not initialized' });
        await db.collection('test_ping').doc('123').set({ ok: true, time: new Date().toISOString() });
        res.json({ status: 'ok', message: 'Successfully wrote to Firestore!' });
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.toString(), stack: e.stack });
    }
});
