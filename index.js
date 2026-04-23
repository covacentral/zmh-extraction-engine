const express = require('express');
const { default: makeWASocket, fetchLatestBaileysVersion, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const cors = require('cors');
const admin = require('firebase-admin');

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

const syncCatalogs = async () => {
    if (!isReady || !globalSock || !db) return;
    try {
        const snapshot = await db.collection('comercios').get();
        for (const doc of snapshot.docs) {
            const data = doc.data();
            const sourceJid = data.catalogJid || data.avatarJid;
            
            if (sourceJid) {
                 const targetJid = sourceJid.includes('@') ? sourceJid : `${sourceJid}@s.whatsapp.net`;
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
                         // Basic fallback parsing if getCatalog is missing
                         products = result?.content || [];
                     }
                     
                     if (products.length > 0) {
                         // Firestore crashes if there are undefined values in the array (like retailerId: undefined)
                         // We serialize to JSON and back to strip all undefined values cleanly.
                         const sanitizedProducts = JSON.parse(JSON.stringify(products));
                         
                         // Store catalog in separate collection to prevent bloating the commerce document
                         await db.collection('catalogos').doc(doc.id).set({
                             whatsappCatalog: sanitizedProducts,
                             updatedAt: admin.firestore.FieldValue.serverTimestamp()
                         });
                         
                         // Remove legacy field from main document if it exists to clean up Read payloads
                         if (data.whatsappCatalog) {
                             await doc.ref.update({ whatsappCatalog: admin.firestore.FieldValue.delete() });
                         }
                         
                         console.log(`Catálogo sincronizado para ${data.businessName}: ${products.length} productos guardados en /catalogos/${doc.id}.`);
                     }
                 } catch(err) {
                     console.error('Error sincronizando catálogo para', targetJid, err.message);
                 }
            }
        }
    } catch(e) { console.error('Cron error:', e.message); }
};

// Cronjob: Sincronizar cada 30 minutos
setInterval(syncCatalogs, 30 * 60 * 1000);

app.get('/api/force-sync', async (req, res) => {
    if (!isReady || !globalSock) return res.status(503).json({ error: 'WhatsApp offline' });
    await syncCatalogs();
    res.json({ ok: true, msg: 'Sincronización forzada completada' });
});

app.post('/api/dispatch', async (req, res) => {
    if (!isReady || !globalSock) return res.status(503).json({ error: 'WhatsApp offline' });
    try {
        const { commerceId, name, phone, datetime, cart = [], total = 0, isWholesale = false } = req.body;
        if (!name || !phone || !datetime) return res.status(400).json({ error: 'Missing mandatory fields' });

        const doc = await db.collection('comercios').doc(commerceId).get();
        if (!doc.exists) return res.status(404).json({ error: 'Commerce not found' });
        
        let dispatchJid = doc.data().dispatchJid;
        if (!dispatchJid) return res.status(400).json({ error: 'Este comercio aún no ha configurado su dispatchJid (Grupo Privado) en Firestore.' });
        
        // Auto-resolve group invite links to actual JIDs
        if (dispatchJid.includes('chat.whatsapp.com/')) {
            const inviteCode = dispatchJid.replace('https://chat.whatsapp.com/', '').trim();
            try {
                const groupInfo = await globalSock.groupGetInviteInfo(inviteCode);
                if (groupInfo && groupInfo.id) {
                    dispatchJid = groupInfo.id;
                    // Auto-update Firestore so we don't have to resolve it again next time
                    await doc.ref.update({ dispatchJid: dispatchJid });
                }
            } catch(e) {
                console.error("Failed to resolve group invite link", e);
            }
        }
        
        let msg = `🔔 *NUEVO PEDIDO / CITA*\n\n`;
        msg += `👤 *Cliente:* ${name}\n`;
        msg += `📱 *Teléfono:* +${phone.replace(/\D/g,'')}\n`;
        msg += `🕒 *Fecha sugerida:* ${datetime}\n`;
        msg += `🏢 *Modo:* ${isWholesale ? 'Mayorista' : 'Minorista'}\n\n`;
        
        if (cart.length > 0) {
            msg += `🛒 *CARRITO:*\n`;
            cart.forEach(item => {
                msg += `- ${item.qty}x ${item.name} ($${item.price})\n`;
            });
            msg += `\n💰 *Total Estimado:* $${total}\n\n`;
        } else {
            msg += `🛒 *CARRITO:* Vacío (Solo Agendamiento)\n\n`;
        }
        
        msg += `Para atender esta solicitud, responde a este ticket. Toca el número arriba para abrir el chat con el cliente.`;
        
        await globalSock.sendMessage(dispatchJid, { text: msg });
        res.json({ ok: true, msg: 'Ticket despachado exitosamente.' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
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
