/**
 * services/pdf.js
 * Generates 80mm thermal printer PDF tickets for POS orders.
 */
const PDFDocument = require('pdfkit');

/**
 * Generates a PDF buffer for a POS order.
 * @param {object} orderData - The full order payload from /api/dispatch
 * @returns {Promise<Buffer>} PDF buffer ready to send via WhatsApp
 */
async function generateOrderPDF(orderData) {
    const {
        name, phone, cart = [], total = 0,
        isWholesale, isStoreSale, asesorName, asesorSection,
        businessType, orderContext, facCode, businessName = 'ZMH'
    } = orderData;

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: [226, 800], margin: 10, autoFirstPage: true });
        const buffers = [];

        doc.on('data', chunk => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        const LINE_W = 206;
        const isRestaurant = businessType === 'RESTAURANTE';
        const isAsesor = !!asesorName && !isWholesale;
        const isVip = isWholesale && !isAsesor;

        // --- HEADER ---
        doc.fontSize(11).font('Courier-Bold').text(businessName.toUpperCase(), { align: 'center', width: LINE_W });
        doc.fontSize(7).font('Courier').text(`Ticket #${facCode || 'N/A'}`, { align: 'center', width: LINE_W });
        doc.text(new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }), { align: 'center', width: LINE_W });
        doc.moveDown(0.5);
        doc.moveTo(10, doc.y).lineTo(216, doc.y).dash(2, { space: 2 }).stroke().undash();
        doc.moveDown(0.3);

        // --- CLIENT INFO ---
        if (isRestaurant && orderContext?.mode === 'mesa') {
            doc.fontSize(8).font('Courier-Bold').text(`Mesa: ${orderContext.mesa}  Sede: ${orderContext.sede || 'N/A'}`);
        } else if (isRestaurant && orderContext?.mode === 'mesero') {
            doc.fontSize(8).font('Courier-Bold').text(`Mesa: ${orderContext.mesa}  Mesero: ${asesorName}`);
        }

        doc.fontSize(8).font('Courier').text(`Cliente: ${name || 'N/A'}`);
        if (phone) doc.text(`Tel: ${phone}`);
        if (asesorName && !isRestaurant) doc.text(`Asesor: ${asesorName}${asesorSection ? ` (${asesorSection})` : ''}`);
        if (isVip) doc.text('** PEDIDO MAYORISTA VIP **', { align: 'center', width: LINE_W });

        doc.moveDown(0.3);
        doc.moveTo(10, doc.y).lineTo(216, doc.y).dash(2, { space: 2 }).stroke().undash();
        doc.moveDown(0.3);

        // --- ITEMS ---
        doc.fontSize(7).font('Courier-Bold');
        doc.text('CANT  PRODUCTO                    TOTAL', { width: LINE_W });
        doc.font('Courier');

        cart.forEach(item => {
            const qty = item.qty || 1;
            const price = item.price || 0;
            const subtotal = qty * price;
            const nameLine = (item.name || '').substring(0, 22);
            const line1 = `${String(qty).padStart(3)}x  ${nameLine.padEnd(22)} $${subtotal.toLocaleString('es-CO')}`;
            doc.text(line1, { width: LINE_W });
            if (item.reference || item.refCode) {
                doc.fontSize(6).text(`      REF: ${item.reference || item.refCode}`, { width: LINE_W });
                doc.fontSize(7);
            }
        });

        doc.moveDown(0.3);
        doc.moveTo(10, doc.y).lineTo(216, doc.y).stroke();
        doc.moveDown(0.3);

        // --- TOTAL ---
        doc.fontSize(10).font('Courier-Bold').text(`TOTAL: $${total.toLocaleString('es-CO')}`, { align: 'right', width: LINE_W });
        doc.moveDown(0.5);
        doc.fontSize(7).font('Courier').text('¡Gracias por su compra!', { align: 'center', width: LINE_W });

        doc.end();
    });
}

module.exports = { generateOrderPDF };
