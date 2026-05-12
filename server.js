/**
 * server.js — Entry point for ZMH WhatsApp Bot
 * Refactored from the monolithic index.js into modular services and routes.
 *
 * Architecture:
 *   server.js           ← Express init, global error handlers, WhatsApp connection
 *   services/firebase.js ← Firebase Admin singleton
 *   services/pdf.js      ← 80mm thermal PDF generation
 *   services/metrics.js  ← OLAP rollups + inventory deduction
 */

'use strict';

const express = require('express');
const cors    = require('cors');
const cron    = require('node-cron');

const { default: makeWASocket, fetchLatestBaileysVersion, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const PDFDocument = require('pdfkit');

const { db, admin }            = require('./services/firebase');
const { deductInventory, savePremiumMetrics } = require('./services/metrics');

// ── Global error guards (keep process alive from Baileys rejections) ──────────
process.on('unhandledRejection', (reason) => console.error('[UnhandledRejection]', reason));
process.on('uncaughtException',  (err)    => console.error('[UncaughtException]', err));

// ── Express setup ─────────────────────────────────────────────────────────────
const app  = express();
const port = process.env.PORT || 10000;
app.use(cors());
app.use(express.json());

// ── WhatsApp state ────────────────────────────────────────────────────────────
let isReady   = false;
let globalSock = null;

// ── Firebase Auth State for Baileys (persists WA session in Firestore) ────────
const useFirebaseAuthState = async (sessionId) => {
    if (!db) {
        console.warn('[WA] Firebase not available, using in-memory session.');
        return { state: { creds: initAuthCreds(), keys: { get: () => ({}), set: () => {} } }, saveCreds: () => {} };
    }

    const docRef = db.collection('baileys_sessions').doc(sessionId);

    const writeData = async (data, file) => {
        try { await docRef.collection('keys').doc(file).set({ data: JSON.stringify(data, BufferJSON.replacer) }); }
        catch (e) { console.error('[WA] Write error:', e); }
    };
    const readData = async (file) => {
        try {
            const doc = await docRef.collection('keys').doc(file).get();
            if (doc.exists) return JSON.parse(doc.data().data, BufferJSON.reviver);
        } catch (e) { console.error('[WA] Read error:', file); }
        return null;
    };
    const removeData = async (file) => {
        try { await docRef.collection('keys').doc(file).delete(); }
        catch (e) { console.error('[WA] Remove error:', e); }
    };

    let creds = await readData('creds.json');
    if (!creds) { creds = initAuthCreds(); await writeData(creds, 'creds.json'); }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async id => {
                        let value = await readData(`${type}-${id}.json`);
                        if (type === 'app-state-sync-key' && value) value = Buffer.from(value.data, 'base64');
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data)
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const file  = `${category}-${id}.json`;
                            tasks.push(value ? writeData(value, file) : removeData(file));
                        }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds.json')
    };
};

// ── WhatsApp connection ───────────────────────────────────────────────────────
async function startWhatsApp() {
    const { state, saveCreds } = await useFirebaseAuthState('zmh_hub');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({ version, auth: state, printQRInTerminal: false, syncFullHistory: false });
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            console.log('\n================================');
            console.log('👉 QR CODE: https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=' + encodeURIComponent(qr));
            console.log('================================\n');
        }
        if (connection === 'close') {
            isReady = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode !== 401) { console.log('[WA] Reconnecting...'); startWhatsApp(); }
            else console.log('[WA] Disconnected by WhatsApp. Delete baileys_sessions in Firebase and restart.');
        } else if (connection === 'open') {
            console.log('\n==== OBSERVADOR LISTO Y CONECTADO ====');
            isReady    = true;
            globalSock = sock;
        }
    });
}

startWhatsApp();

// ── Helper: resolve JID from invite link ─────────────────────────────────────
async function resolveJid(rawJid, commerceDoc, field) {
    if (!rawJid) return null;
    if (!rawJid.includes('chat.whatsapp.com/')) return rawJid;

    const inviteCode = rawJid.replace('https://chat.whatsapp.com/', '').trim();
    try {
        const groupInfo = await globalSock.groupGetInviteInfo(inviteCode);
        if (groupInfo?.id) {
            await commerceDoc.ref.update({ [field]: groupInfo.id });
            return groupInfo.id;
        }
    } catch (e) { console.error('[JID] Failed to resolve invite link:', e); }
    return rawJid;
}

// ── Helper: build WhatsApp message text ──────────────────────────────────────
function buildOrderMessage({ name, phone, datetime, cart, total, isWholesale, isStoreSale, asesorName, asesorSection, businessType, orderContext }) {
    const isRestaurant = businessType === 'RESTAURANTE';
    let msg = '';

    if (isRestaurant && orderContext) {
        msg = `🍽️ *NUEVO PEDIDO DE RESTAURANTE*\n\n`;
        if (orderContext.mode === 'mesa') {
            msg += `📍 *Sede:* ${orderContext.sede || 'N/A'}\n🪑 *Mesa:* ${orderContext.mesa}\n👤 *Cliente:* ${name || 'Sin nombre'}\n\n`;
        } else if (orderContext.mode === 'mesero') {
            msg += `🤵‍♂️ *Mesero:* ${orderContext.mesero || asesorName}\n📍 *Sede:* ${orderContext.sede || 'N/A'}\n🪑 *Mesa:* ${orderContext.mesa}\n👤 *Cliente:* ${name || 'Sin nombre'}\n\n`;
        } else {
            msg += `🛵 *Tipo:* ${orderContext.deliveryType === 'delivery' ? 'Envío a Domicilio' : 'Recoger Local'}\n`;
            msg += `👤 *Cliente:* ${name}\n📱 *Teléfono:* +${(phone || '').replace(/\D/g, '')}\n`;
            if (orderContext.deliveryType === 'delivery') msg += `📍 *Dirección:* ${orderContext.address}\n\n`;
            else msg += `🕒 *Para:* ${datetime}\n\n`;
        }
    } else if (isStoreSale) {
        msg  = `🏬 *NUEVA VENTA EN TIENDA*\n\n`;
        msg += `👨‍💼 *Asesor:* ${asesorName} (${asesorSection})\n`;
        msg += `👤 *Cliente:* ${name}\n`;
        msg += `🏢 *Modo:* ${isWholesale ? 'Mayorista' : 'Minorista'}\n\n`;
    } else {
        msg  = `🔔 *NUEVO PEDIDO / CITA*\n\n`;
        msg += `👤 *Cliente:* ${name}\n`;
        msg += `📱 *Teléfono:* +${(phone || '').replace(/\D/g, '')}\n`;
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

    msg += isStoreSale
        ? 'Adjunto se envía la factura de cobro.'
        : 'Para atender esta solicitud, responde a este ticket. Toca el número arriba para abrir el chat con el cliente.';

    return msg;
}

// ── Helper: generate PDF in-line (preserving original layout exactly) ─────────
function generateInlinePDF(orderData, facCode) {
    const { name, phone, cart, total, isWholesale, asesorName, businessType, orderContext, businessName } = orderData;
    const commerceName = businessName || 'BODEGA MAYORISTA';
    const isRestaurant = businessType === 'RESTAURANTE';
    const isAsesor     = !!asesorName;
    const isVip        = isWholesale && !isAsesor;

    const docPdf  = new PDFDocument({ size: [226, 800], margin: 10 });
    const buffers = [];
    docPdf.on('data', buffers.push.bind(buffers));

    docPdf.font('Courier-Bold').fontSize(12).text(commerceName, { align: 'center' });
    docPdf.moveDown(0.5);
    docPdf.font('Courier').fontSize(9);

    if (isRestaurant && orderContext && (orderContext.mode === 'mesa' || orderContext.mode === 'mesero')) {
        if (orderContext.mode === 'mesa') {
            docPdf.text(`Comanda de Mesa: ${facCode}`, { align: 'center' });
            docPdf.text(`Fecha: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`, { align: 'center' });
            docPdf.text(`Sede: ${orderContext.sede || 'N/A'}`, { align: 'center' });
            docPdf.text(`Mesa: ${orderContext.mesa}`, { align: 'center' });
            if (name) docPdf.text(`Cliente: ${name}`, { align: 'center' });
        } else {
            docPdf.text(`Comanda: ${facCode}`, { align: 'center' });
            docPdf.text(`Fecha: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`, { align: 'center' });
            docPdf.text(`Sede: ${orderContext.sede || 'N/A'}`, { align: 'center' });
            docPdf.text(`Mesa: ${orderContext.mesa}`, { align: 'center' });
            docPdf.text(`Mesero: ${orderContext.mesero || asesorName}`, { align: 'center' });
        }
    } else {
        const isDelivery = orderContext?.deliveryType === 'delivery';
        const isPickup   = orderContext?.deliveryType === 'pickup';
        docPdf.text(isDelivery ? `Guía de Despacho: ${facCode}` : `Recibo de Caja: ${facCode}`, { align: 'center' });
        docPdf.text(`Fecha: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`, { align: 'center' });
        if (isAsesor) docPdf.text(`Asesor: ${asesorName}`, { align: 'center' });
        if (isDelivery) docPdf.text(`Tipo: DOMICILIO / ENCARGO`, { align: 'center' });
        else if (isPickup) docPdf.text(`Tipo: RECOGER / MOSTRADOR`, { align: 'center' });
        else docPdf.text(`Modalidad: ${isWholesale ? 'MAYORISTA' : 'MINORISTA'}`, { align: 'center' });
        if (name) docPdf.text(`Cliente: ${name}${isVip ? ' (VIP)' : ''}`, { align: 'center' });
        if (phone) docPdf.text(`Tel: ${(phone).replace(/\D/g, '')}`, { align: 'center' });
        if (isDelivery && orderContext?.address) docPdf.text(`Dir: ${orderContext.address}`, { align: 'center' });
    }

    docPdf.moveDown(0.5);
    docPdf.font('Courier-Bold');
    docPdf.text('--------------------------------------', { align: 'center' });
    docPdf.text('CANT REF  PRODUCTO',    { align: 'left' });
    docPdf.text('       V.UNIT           SUBTOTAL', { align: 'left' });
    docPdf.text('--------------------------------------', { align: 'center' });
    docPdf.font('Courier');

    cart.forEach(item => {
        const ref      = (item.refCode || '').substring(0, 4).padEnd(4, ' ');
        const qty      = String(item.qty).padStart(2, ' ') + 'x';
        const mod      = (isRestaurant && item.modifier) ? (item.modifier === 'aqui' ? ' [AQ]' : ' [LL]') : '';
        const prodName = (item.name || '').substring(0, 27 - mod.length) + mod;
        docPdf.text(`${qty} ${ref} ${prodName}`, { align: 'left' });

        const unitPrice  = `$${item.price.toLocaleString('es-CO')}`;
        const subTotal   = `$${(item.qty * item.price).toLocaleString('es-CO')}`;
        const line2Prefix  = `       ${unitPrice}`;
        const paddingNeeded = Math.max(0, 38 - line2Prefix.length - subTotal.length);
        docPdf.text(line2Prefix + ' '.repeat(paddingNeeded) + subTotal, { align: 'left' });
        docPdf.moveDown(0.2);
    });

    docPdf.font('Courier-Bold');
    docPdf.text('--------------------------------------', { align: 'center' });
    docPdf.fontSize(11).text(`TOTAL: $${total.toLocaleString('es-CO')}`, { align: 'right' });
    docPdf.end();

    return new Promise((resolve) => {
        docPdf.on('end', () => resolve(Buffer.concat(buffers)));
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/health', (req, res) => res.json({ status: 'ok', ready: isReady }));

// Avatar proxy (avoids CORS on client)
app.get('/api/avatar/:jid', async (req, res) => {
    if (!isReady || !globalSock) return res.status(503).json({ error: 'Not ready' });
    try {
        let targetJid = req.params.jid;
        if (!targetJid.includes('@') && /[a-zA-Z]/.test(targetJid)) {
            const inviteCode = targetJid.replace('https://chat.whatsapp.com/', '').trim();
            const inviteInfo = await globalSock.groupGetInviteInfo(inviteCode);
            if (inviteInfo?.id) targetJid = inviteInfo.id;
        } else {
            targetJid = targetJid.includes('@') ? targetJid : `${targetJid}@s.whatsapp.net`;
        }
        const profilePicUrl = await globalSock.profilePictureUrl(targetJid, 'image');
        if (!profilePicUrl) return res.status(404).json({ error: 'No pic' });
        const fetch  = (await import('node-fetch')).default;
        const resp   = await (global.fetch ? global.fetch(profilePicUrl) : fetch(profilePicUrl));
        const buffer = await resp.arrayBuffer();
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'public, max-age=3600');
        res.send(Buffer.from(buffer));
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error fetching picture' }); }
});

// WhatsApp catalog passthrough
app.get('/api/catalog/:jid', async (req, res) => {
    if (!isReady || !globalSock) return res.status(503).json({ error: 'WhatsApp offline' });
    const { jid } = req.params;
    if (!jid) return res.status(400).json({ error: 'Missing JID' });
    const targetJid = jid.includes('@') ? jid : `${jid}@s.whatsapp.net`;
    try {
        let products = [];
        if (typeof globalSock.getCatalog === 'function') {
            const catalog = await globalSock.getCatalog({ jid: targetJid });
            if (catalog?.products) products = catalog.products;
        } else {
            const result = await globalSock.query({
                tag: 'iq', attrs: { to: 's.whatsapp.net', type: 'get', xmlns: 'w:biz:catalog' },
                content: [{ tag: 'product_catalog', attrs: { jid: targetJid, allow_paged: 'true' } }]
            });
            products = result?.content || [];
        }
        res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
        res.json({ ok: true, products: JSON.parse(JSON.stringify(products)) });
    } catch (err) {
        console.error('[Catalog] Error:', targetJid, err.message);
        res.status(500).json({ error: 'Failed to fetch catalog', details: err.message });
    }
});

// Main dispatch endpoint
app.post('/api/dispatch', async (req, res) => {
    if (!isReady || !globalSock) return res.status(503).json({ error: 'WhatsApp offline' });
    try {
        const { commerceId, name, phone, datetime, cart = [], total = 0,
                isWholesale = false, isStoreSale = false, asesorName = '',
                asesorSection = '', businessType = 'RETAIL', orderContext } = req.body;

        if (!db) return res.status(500).json({ error: 'Database not available' });

        const doc = await db.collection('comercios').doc(commerceId).get();
        if (!doc.exists) return res.status(404).json({ error: 'Commerce not found' });

        const commerceData = doc.data();

        // Generate receipt code
        const now     = new Date();
        const timeStr = now.toLocaleString('es-CO', { timeZone: 'America/Bogota', year:'2-digit', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: false }).replace(/\D/g, '');
        const facCode = `REC-${timeStr.slice(0,10)}-${timeStr.slice(10)}${now.getMilliseconds().toString().padStart(3,'0')}`;

        // Resolve dispatch JID
        let rawJid, jidField;
        if (isStoreSale)    { rawJid = commerceData.posJid      || commerceData.dispatchJid; jidField = 'posJid'; }
        else if (isWholesale) { rawJid = commerceData.wholesaleJid || commerceData.dispatchJid; jidField = 'wholesaleJid'; }
        else                  { rawJid = commerceData.retailJid   || commerceData.dispatchJid; jidField = 'retailJid'; }

        if (!rawJid) return res.status(400).json({ error: 'Este comercio no ha configurado su grupo de WhatsApp.' });

        const dispatchJid = await resolveJid(rawJid, doc, jidField);

        // Build text message
        const orderPayload = { name, phone, datetime, cart, total, isWholesale, isStoreSale, asesorName, asesorSection, businessType, orderContext, facCode, businessName: commerceData.businessName };
        const msg = buildOrderMessage(orderPayload);

        // Generate PDF and send
        const pdfBuffer = await generateInlinePDF(orderPayload, facCode);
        await globalSock.sendMessage(dispatchJid, { document: pdfBuffer, mimetype: 'application/pdf', fileName: `${facCode}.pdf`, caption: msg });

        // Async post-processing (don't block the response)
        setImmediate(async () => {
            if (isStoreSale) await deductInventory(commerceId, cart);
            if (commerceData.premiumMetrics === true) await savePremiumMetrics(commerceId, orderPayload);
        });

        res.json({ ok: true, msg: 'Ticket y Factura despachados exitosamente.' });
    } catch (e) {
        console.error('[Dispatch] Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Daily report endpoint (triggered by external CRON or manually)
app.get('/api/report/daily', async (req, res) => {
    if (!isReady || !globalSock) return res.status(503).json({ error: 'WhatsApp offline' });
    if (!db) return res.status(500).json({ error: 'DB not available' });
    if (req.query.key !== (process.env.CRON_KEY || 'default_secret')) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
        const todayEnd   = new Date(); todayEnd.setHours(23,59,59,999);

        const comerciosSnap = await db.collection('comercios').where('premiumMetrics', '==', true).get();
        let reportsSent = 0;

        for (const comercioDoc of comerciosSnap.docs) {
            const commerceId = comercioDoc.id;
            const data       = comercioDoc.data();
            if (!data.dispatchJid) continue;

            const pedidosSnap = await db.collection('comercios').doc(commerceId).collection('pedidos')
                .where('createdAt', '>=', todayStart.toISOString())
                .where('createdAt', '<=', todayEnd.toISOString()).get();

            if (pedidosSnap.empty) continue;

            const escapeCSV = (str) => {
                if (str == null) return '';
                const s = String(str);
                return (s.includes('"') || s.includes(',') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
            };

            let csv = '\uFEFF';
            csv += 'Factura,Fecha,Asesor,Area/Seccion,Modo,Tipo_Entrega,Cliente,Telefono,Direccion,Ref_Producto,Marca,Producto,Cantidad,Precio_Unitario,Subtotal\n';
            let dailyTotal = 0;

            pedidosSnap.docs.forEach(pDoc => {
                const p = pDoc.data();
                const dateStr = new Date(p.createdAt).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota' });
                const asesor  = p.asesorName || 'Web / Cliente';
                const area    = p.asesorSection || 'N/A';
                const modo    = p.isWholesale ? 'Mayorista' : 'Minorista';
                const tipoEntrega = p.orderContext?.mode === 'delivery' ? (p.orderContext?.deliveryType || 'N/A') : (p.orderContext?.mode || 'tienda');
                const cliPhone = (p.phone || '').replace(/\D/g, '');

                p.cart.forEach(item => {
                    const sub = item.qty * item.price;
                    csv += `${escapeCSV(p.facCode)},${escapeCSV(dateStr)},${escapeCSV(asesor)},${escapeCSV(area)},${escapeCSV(modo)},${escapeCSV(tipoEntrega)},${escapeCSV(p.name)},${escapeCSV(cliPhone)},${escapeCSV(p.orderContext?.address || '')},${escapeCSV(item.refCode || '')},${escapeCSV(item.brand || 'N/A')},${escapeCSV(item.name)},${escapeCSV(item.qty)},${escapeCSV(item.price)},${escapeCSV(sub)}\n`;
                });
                dailyTotal += p.total;
            });

            const csvBuffer = Buffer.from(csv, 'utf8');
            const fileName  = `Reporte_${commerceId}_${todayStart.toISOString().split('T')[0]}.csv`;
            const caption   = `📊 *Reporte Diario Automático*\n\nComercio: ${data.businessName || commerceId}\nTotal Facturado Hoy: *$${dailyTotal.toLocaleString('es-CO')}*\nPedidos procesados: ${pedidosSnap.size}\n\n_Abre en Excel o Google Sheets._`;

            await globalSock.sendMessage(data.dispatchJid, { document: csvBuffer, mimetype: 'text/csv', fileName, caption });
            reportsSent++;
        }

        res.json({ ok: true, msg: `Daily reports sent to ${reportsSent} premium comercios.` });
    } catch (err) {
        console.error('[Report] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Debug & admin endpoints
app.get('/api/debug-catalog', async (req, res) => {
    try {
        if (!db) return res.status(500).json({ error: 'DB not available' });
        const doc = await db.collection('comercios').doc(req.query.id || 'cc-bodega-mayorista').get();
        res.json((doc.data()?.whatsappCatalog || []).slice(0, 3));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/test-db', async (req, res) => {
    try {
        if (!db) return res.status(500).json({ status: 'error', message: 'DB not initialized' });
        await db.collection('test_ping').doc('123').set({ ok: true, time: new Date().toISOString() });
        res.json({ status: 'ok', message: 'Successfully wrote to Firestore!' });
    } catch (e) { res.status(500).json({ status: 'error', message: e.toString() }); }
});

app.get('/api/seed-products', async (req, res) => {
    try {
        if (!db) return res.status(500).json({ error: 'DB not available' });
        if (req.query.key !== (process.env.CRON_KEY || 'default_secret')) return res.status(401).json({ error: 'Unauthorized' });

        const commerceId = 'cc-bodega-mayorista';
        const products = [];
        const batch = db.batch();
        
        for (let i = 1; i <= 50; i++) {
            const product = {
                id: `prod-fake-${i}`,
                name: `Producto Ficticio ${i}`,
                description: `Esta es una descripción ficticia para el producto de prueba número ${i}. Ideal para hacer tests de la interfaz de ZMH y carrito.`,
                normalPrice: Math.floor(Math.random() * 90) + 10,
                wholesalePrice: Math.floor(Math.random() * 80) + 8,
                status: 'active',
                reference: `REF-00${i}`,
                brand: ['Generico', 'ZMH', 'SuperTest'][Math.floor(Math.random() * 3)],
                area: ['Electrónica', 'Hogar', 'Moda', 'Ferretería'][Math.floor(Math.random() * 4)],
                imageUrl: `https://picsum.photos/seed/fake${i}/400/400`,
                variations: [
                    { name: 'S', stock: 10, priceMod: 0, imageWebp: `https://picsum.photos/seed/fake${i}S/400/400` },
                    { name: 'M', stock: 5, priceMod: 0, imageWebp: `https://picsum.photos/seed/fake${i}M/400/400` }
                ]
            };
            products.push(product);
            const docRef = db.collection('comercios').doc(commerceId).collection('catalogo').doc(product.id);
            batch.set(docRef, product);
        }

        const sysRef = db.collection('comercios').doc(commerceId).collection('_system').doc('catalog');
        batch.set(sysRef, { compiledCatalog: products, updatedAt: new Date().toISOString() }, { merge: true });

        await batch.commit();
        res.json({ ok: true, msg: '50 productos inyectados a cc-bodega-mayorista.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(port, () => console.log(`[Server] API listening on port ${port}`));
