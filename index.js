const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cors = require('cors');
const app = express(); app.use(cors());
const port = process.env.PORT || 3001;
const client = new Client({ authStrategy: new LocalAuth(), puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] } });
let isClientReady = false;
client.on('qr', (qr) => {
            console.log('===> ESCANEA EL CODIGO QR <===');
            qrcode.generate(qr, { small: true });
            console.log('\n -> COPIA Y PEGA ESTE ENLACE EN TU NAVEGADOR PARA VER EL QR: \nhttps://api.qrserver.com/v1/create-qr-code/?size=400x400&data=' + encodeURIComponent(qr) + '\n');
});
client.on('ready', () => { console.log('==== OBSERVADOR LISTO ===='); isClientReady = true; });
client.on('disconnected', () => { isClientReady = false; });
client.initialize();
app.get('/api/health', (req, res) => { res.json({ status: 'ok', ready: isClientReady }); });
app.get('/api/avatar/:jid', async (req, res) => {
            if (!isClientReady) return res.status(503).json({ error: 'Not ready' });
            try {
                            const pic = await client.getProfilePicUrl(req.params.jid);
                            if (!pic) return res.status(404).json({ error: 'No pic' });
                            const resp = await fetch(pic);
                            const buffer = await resp.arrayBuffer();
                            res.set('Content-Type', 'image/jpeg');
                            res.set('Cache-Control', 'public, max-age=3600');
                            res.send(Buffer.from(buffer));
            } catch (e) {
                            res.status(500).json({ error: 'Error' });
            }
});
app.listen(port, () => { console.log('Port ' + port); });
