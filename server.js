/**
 * server.js — Entry point for ZMH WhatsApp Bot
 * Modular, resilient, and hardened against disconnects and unhandled errors.
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

const { default: makeWASocket, fetchLatestBaileysVersion, initAuthCreds, BufferJSON, proto, getBinaryNodeChild, getAllBinaryNodeChildren } = require('@whiskeysockets/baileys');
const PDFDocument = require('pdfkit');

const { db, admin }            = require('./services/firebase');
const { deductInventory, savePremiumMetrics } = require('./services/metrics');
const { extractProductFromMessage } = require('./services/channelExtractor');

// ── Global error guards (keep process alive from Baileys rejections) ──────────
process.on('unhandledRejection', (reason) => console.error('[UnhandledRejection]', reason));
process.on('uncaughtException',  (err)    => console.error('[UncaughtException]', err));

// ── Express setup ─────────────────────────────────────────────────────────────
const app  = express();
const port = process.env.PORT || 10000;
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── WhatsApp state ────────────────────────────────────────────────────────────
let isReady    = false;
let globalSock = null;
let reconnecting = false;

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
    if (reconnecting) return;
    try {
        const { state, saveCreds } = await useFirebaseAuthState('zmh_hub');
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            syncFullHistory: false,
            connectTimeoutMs: 30000,
            defaultQueryTimeoutMs: 15000,
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
            if (qr) {
                console.log('\n================================');
                console.log('👉 QR CODE: https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=' + encodeURIComponent(qr));
                console.log('================================\n');
            }
            if (connection === 'close') {
                isReady = false;
                globalSock = null;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode !== 401) {
                    console.log('[WA] Connection closed, reconnecting in 5s (status:', statusCode, ')...');
                    reconnecting = true;
                    setTimeout(() => {
                        reconnecting = false;
                        startWhatsApp();
                    }, 5000);
                } else {
                    console.log('[WA] Disconnected by WhatsApp (401). Session reset needed in Firestore.');
                }
            } else if (connection === 'open') {
                console.log('\n==== WHATSAPP BOT CONECTADO Y ACTIVO ====');
                isReady      = true;
                globalSock   = sock;
                reconnecting = false;
            }
        });

        // ── Real-time WhatsApp Channel Post Listener ─────────────────────────
        sock.ev.on('messages.upsert', async ({ messages }) => {
            if (!db || !messages || !Array.isArray(messages)) return;
            for (const msg of messages) {
                const remoteJid = msg.key?.remoteJid || '';
                if (!remoteJid.endsWith('@newsletter')) continue;

                try {
                    const comerciosSnap = await db.collection('comercios').get();
                    for (const doc of comerciosSnap.docs) {
                        const data = doc.data();
                        const channelList = Array.isArray(data.catalogs) ? data.catalogs : [];
                        const isMatchingChannel = 
                            data.channelJid === remoteJid ||
                            channelList.some(c => c.jid === remoteJid || c.channelJid === remoteJid);

                        if (isMatchingChannel && data.channelSync !== false) {
                            const channelName = data.channelName || data.businessName || 'Canal';
                            const product = extractProductFromMessage(msg, channelName);
                            if (product && product.name) {
                                await upsertChannelProduct(doc.id, product);
                                console.log(`[WA Channel Realtime] Producto extraído para ${doc.id}: ${product.name} ($${product.price})`);
                            }
                        }
                    }
                } catch (chErr) {
                    console.error('[WA Channel Upsert Error]', chErr.message);
                }
            }
        });
    } catch (err) {
        console.error('[WA Init Error]', err);
        setTimeout(() => startWhatsApp(), 10000);
    }
}

// Launch WhatsApp non-blocking so HTTP server binds immediately
setImmediate(() => {
    startWhatsApp();
});

// ── Helper: resolve JID from invite link ─────────────────────────────────────
async function resolveJid(rawJid, commerceDoc, field) {
    if (!rawJid) return null;
    if (!rawJid.includes('chat.whatsapp.com/')) return rawJid;

    const inviteCode = rawJid.replace('https://chat.whatsapp.com/', '').trim();
    try {
        if (globalSock) {
            const groupInfo = await globalSock.groupGetInviteInfo(inviteCode);
            if (groupInfo?.id) {
                await commerceDoc.ref.update({ [field]: groupInfo.id });
                return groupInfo.id;
            }
        }
    } catch (e) { console.error('[JID] Failed to resolve invite link:', e.message); }
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

// ── Helper: generate PDF in-line ─────────────────────────────────────────────
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

app.get('/api/health', (req, res) => res.json({ status: 'ok', ready: isReady, bot: isReady ? 'connected' : 'offline' }));

// Avatar proxy (with robust 404/privacy error handling)
app.get('/api/avatar/:jid', async (req, res) => {
    if (!isReady || !globalSock) return res.status(503).json({ error: 'WhatsApp offline' });
    try {
        let targetJid = req.params.jid;
        if (!targetJid.includes('@') && /[a-zA-Z]/.test(targetJid)) {
            const inviteCode = targetJid.replace('https://chat.whatsapp.com/', '').trim();
            try {
                const inviteInfo = await globalSock.groupGetInviteInfo(inviteCode);
                if (inviteInfo?.id) targetJid = inviteInfo.id;
            } catch {
                return res.status(404).json({ error: 'Invite link not found' });
            }
        } else {
            targetJid = targetJid.includes('@') ? targetJid : `${targetJid}@s.whatsapp.net`;
        }

        let profilePicUrl = null;
        try {
            profilePicUrl = await globalSock.profilePictureUrl(targetJid, 'image');
        } catch (picErr) {
            // Normal 404 when user has no photo or restricted privacy
            return res.status(404).json({ error: 'No profile picture found' });
        }

        if (!profilePicUrl) return res.status(404).json({ error: 'No profile picture found' });

        const fetch  = (await import('node-fetch')).default;
        const resp   = await (global.fetch ? global.fetch(profilePicUrl) : fetch(profilePicUrl));
        if (!resp.ok) return res.status(404).json({ error: 'CDN image unavailable' });

        const buffer = await resp.arrayBuffer();
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'public, max-age=3600');
        res.send(Buffer.from(buffer));
    } catch (e) {
        console.error('[Avatar Error]', e.message);
        res.status(500).json({ error: 'Error fetching picture' });
    }
});

// WhatsApp catalog passthrough (with timeout safety)
app.get('/api/catalog/:jid', async (req, res) => {
    if (!isReady || !globalSock) return res.status(503).json({ error: 'WhatsApp offline' });
    const { jid } = req.params;
    if (!jid) return res.status(400).json({ error: 'Missing JID' });
    const targetJid = jid.includes('@') ? jid : `${jid}@s.whatsapp.net`;

    try {
        let products = [];
        const catalogPromise = (typeof globalSock.getCatalog === 'function')
            ? globalSock.getCatalog({ jid: targetJid })
            : globalSock.query({
                tag: 'iq', attrs: { to: 's.whatsapp.net', type: 'get', xmlns: 'w:biz:catalog' },
                content: [{ tag: 'product_catalog', attrs: { jid: targetJid, allow_paged: 'true' } }]
            });

        // 5s timeout guard
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timed Out')), 5000));
        const result = await Promise.race([catalogPromise, timeoutPromise]);

        if (result?.products) products = result.products;
        else if (result?.content) products = result.content;

        res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
        res.json({ ok: true, products: JSON.parse(JSON.stringify(products)) });
    } catch (err) {
        console.warn('[Catalog] Notice for', targetJid, ':', err.message);
        res.status(200).json({ ok: false, error: 'Catalog query timed out or empty', products: [] });
    }
});

// Main dispatch endpoint
app.post('/api/dispatch', async (req, res) => {
    if (!isReady || !globalSock) return res.status(503).json({ error: 'WhatsApp offline' });
    try {
        const { commerceId, name, phone, datetime, cart = [], total = 0,
                isWholesale = false, isStoreSale = false, asesorName = '',
                asesorSection = '', businessType = 'RETAIL', orderContext } = req.body;

        if (!commerceId) return res.status(400).json({ error: 'commerceId is required' });
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
        if (isStoreSale)      { rawJid = commerceData.posJid       || commerceData.dispatchJid; jidField = 'posJid'; }
        else if (isWholesale) { rawJid = commerceData.wholesaleJid || commerceData.dispatchJid; jidField = 'wholesaleJid'; }
        else                  { rawJid = commerceData.retailJid    || commerceData.dispatchJid; jidField = 'retailJid'; }

        if (!rawJid) return res.status(400).json({ error: 'Este comercio no ha configurado su grupo de WhatsApp.' });

        const dispatchJid = await resolveJid(rawJid, doc, jidField);

        // Build text message
        const orderPayload = { name, phone, datetime, cart, total, isWholesale, isStoreSale, asesorName, asesorSection, businessType, orderContext, facCode, businessName: commerceData.businessName };
        const msg = buildOrderMessage(orderPayload);

        // Generate PDF and send
        const pdfBuffer = await generateInlinePDF(orderPayload, facCode);
        await globalSock.sendMessage(dispatchJid, { document: pdfBuffer, mimetype: 'application/pdf', fileName: `${facCode}.pdf`, caption: msg });

        // Async post-processing
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

// Daily report endpoint (Strictly protected by CRON_KEY)
app.get('/api/report/daily', async (req, res) => {
    const cronKey = process.env.CRON_KEY;
    if (!cronKey || req.query.key !== cronKey) {
        return res.status(401).json({ error: 'Unauthorized: Valid CRON_KEY is required' });
    }
    if (!isReady || !globalSock) return res.status(503).json({ error: 'WhatsApp offline' });
    if (!db) return res.status(500).json({ error: 'DB not available' });

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

// ── Channel Product Helpers ──────────────────────────────────────────────────
async function upsertChannelProduct(commerceId, product) {
    if (!db || !commerceId || !product) return;
    const catRef = db.collection('comercios').doc(commerceId).collection('_system').doc('catalog');
    const catDoc = await catRef.get();
    let catalog = catDoc.exists ? (catDoc.data()?.compiledCatalog || []) : [];

    const existingIdx = catalog.findIndex(p => 
        (product.channelPostId && p.channelPostId === product.channelPostId) || 
        (p.id === product.id) ||
        (product.reference && p.reference && p.reference.toLowerCase() === product.reference.toLowerCase())
    );

    if (existingIdx >= 0) {
        catalog[existingIdx] = { ...catalog[existingIdx], ...product, updatedAt: Date.now() };
    } else {
        catalog.unshift(product);
    }

    await catRef.set({ compiledCatalog: catalog }, { merge: true });
}

async function extractChannelProducts(sock, channelJidOrInvite, count = 5, commerceId = '', areaName = '') {
    if (!sock) throw new Error('WhatsApp bot no está conectado');
    let targetJid = channelJidOrInvite.trim();
    let channelMetaName = '';

    if (targetJid.includes('whatsapp.com/channel/') || targetJid.includes('chat.whatsapp.com/')) {
        const inviteCode = targetJid.replace('https://whatsapp.com/channel/', '').replace('https://chat.whatsapp.com/', '').split('/')[0].split('?')[0].trim();
        try {
            if (typeof sock.newsletterMetadata === 'function') {
                const metadata = await sock.newsletterMetadata('invite', inviteCode);
                if (metadata?.id) {
                    targetJid = metadata.id;
                    channelMetaName = metadata.name || '';
                }
            }
        } catch (invErr) {
            console.warn('[WA Channel] Invite resolve fallback:', invErr.message);
        }
    }

    if (!targetJid.includes('@')) {
        targetJid = `${targetJid}@newsletter`;
    }

    // Auto-follow channel if not already followed
    try {
        if (typeof sock.newsletterFollow === 'function') {
            await sock.newsletterFollow(targetJid);
        }
    } catch (fErr) {
        // Normal if already followed
    }

    // Subscribe to live updates so WhatsApp delivers new channel messages in real time
    try {
        if (typeof sock.subscribeNewsletterUpdates === 'function') {
            await sock.subscribeNewsletterUpdates(targetJid);
        }
    } catch (sErr) {
        console.warn('[WA Channel Subscribe Warning]', sErr.message);
    }

    const finalArea = (areaName && areaName.trim()) ? areaName.trim() : (channelMetaName || 'Canal');

function findNodesByTag(node, tag) {
    let results = [];
    if (!node || typeof node !== 'object') return results;
    if (node.tag === tag) results.push(node);
    if (Array.isArray(node.content)) {
        for (const child of node.content) {
            results = results.concat(findNodesByTag(child, tag));
        }
    }
    return results;
}

    let rawMessages = [];
    try {
        let resNode = null;
        if (typeof sock.newsletterFetchMessages === 'function') {
            const fetchPromise = sock.newsletterFetchMessages(targetJid, Number(count) || 5);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), 8000));
            resNode = await Promise.race([fetchPromise, timeoutPromise]).catch(e => {
                console.warn('[WA Channel Fetch Race Notice]', e.message);
                return null;
            });
        }

        if (Array.isArray(resNode)) {
            rawMessages = resNode;
        } else if (resNode && typeof resNode === 'object') {
            const messageNodes = findNodesByTag(resNode, 'message');
            
            for (const mNode of messageNodes) {
                let msgProto = null;
                const plaintextNodes = findNodesByTag(mNode, 'plaintext');
                for (const pt of plaintextNodes) {
                    if (pt && pt.content) {
                        try {
                            const buf = Buffer.isBuffer(pt.content) ? pt.content : Buffer.from(pt.content);
                            msgProto = proto.Message.decode(buf);
                        } catch (decodeErr) {
                            console.warn('[Channel Proto Decode]', decodeErr.message);
                        }
                    }
                }

                rawMessages.push({
                    key: {
                        id: mNode.attrs?.id || mNode.attrs?.server_id || `post_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                        remoteJid: targetJid
                    },
                    messageTimestamp: Number(mNode.attrs?.t || Date.now() / 1000),
                    message: msgProto || mNode,
                    attrs: mNode.attrs || {},
                    content: mNode.content || []
                });
            }
        }
    } catch (fetchErr) {
        console.warn('[WA Channel Fetch Handled]', fetchErr.message);
    }

    const extractedProducts = [];
    for (const msg of rawMessages) {
        const prod = extractProductFromMessage(msg, finalArea);
        if (prod && prod.name) {
            extractedProducts.push(prod);
            if (commerceId) {
                await upsertChannelProduct(commerceId, prod);
            }
        }
    }

    if (commerceId && db) {
        try {
            await db.collection('comercios').doc(commerceId).set({
                channelJid: targetJid,
                channelName: finalArea,
                channelSync: true
            }, { merge: true });
        } catch (dbErr) {
            console.warn('[Channel DB Update Warning]', dbErr.message);
        }
    }

    return {
        channelJid: targetJid,
        area: finalArea,
        totalFetched: rawMessages.length,
        extractedCount: extractedProducts.length,
        products: extractedProducts
    };
}

// WhatsApp Channel Extraction endpoint
app.post('/api/channel/extract', async (req, res) => {
    if (!isReady || !globalSock) return res.status(503).json({ error: 'WhatsApp offline' });
    try {
        const { commerceId, channelJid, count = 5, areaName = '' } = req.body;
        if (!channelJid) return res.status(400).json({ error: 'channelJid is required' });

        const result = await extractChannelProducts(globalSock, channelJid, Number(count) || 5, commerceId, areaName);
        res.json({ ok: true, ...result });
    } catch (e) {
        console.error('[Channel Extract Route Error]', e);
        res.status(500).json({ error: e.message });
    }
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(port, '0.0.0.0', () => console.log(`[Server] API listening on port ${port}`));


