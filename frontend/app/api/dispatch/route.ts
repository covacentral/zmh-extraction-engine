import { NextRequest, NextResponse } from 'next/server';
import { db, admin } from '../../../lib/firebaseAdmin';
import { resolveCommerce } from '../../../lib/commerceResolver';
import PDFDocument from 'pdfkit';

export const dynamic = 'force-dynamic';

interface OrderItem {
  id?: string;
  name: string;
  price: number;
  qty: number;
  refCode?: string;
  reference?: string;
  brand?: string;
  modifier?: string;
  variationName?: string;
}

interface DispatchRequestBody {
  commerceId: string;
  name?: string;
  phone?: string;
  datetime?: string;
  cart?: OrderItem[];
  total?: number;
  isWholesale?: boolean;
  isStoreSale?: boolean;
  asesorName?: string;
  asesorSection?: string;
  businessType?: string;
  orderContext?: any;
  token?: string; // Optional security token for POS sales
}

function generatePDFBuffer(orderData: any, facCode: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const {
      name,
      phone,
      cart = [],
      total = 0,
      isWholesale,
      isStoreSale,
      asesorName,
      businessType,
      orderContext,
      businessName = 'BODEGA MAYORISTA',
    } = orderData;

    const isRestaurant = businessType === 'RESTAURANTE';
    const isAsesor = !!asesorName;
    const isVip = isWholesale && !isAsesor;

    const doc = new PDFDocument({ size: [226, 800], margin: 10 });
    const buffers: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', (err: any) => reject(err));

    doc.font('Courier-Bold').fontSize(12).text(businessName.toUpperCase(), { align: 'center' });
    doc.moveDown(0.5);
    doc.font('Courier').fontSize(9);

    if (isRestaurant && orderContext && (orderContext.mode === 'mesa' || orderContext.mode === 'mesero')) {
      if (orderContext.mode === 'mesa') {
        doc.text(`Comanda de Mesa: ${facCode}`, { align: 'center' });
        doc.text(`Fecha: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`, { align: 'center' });
        doc.text(`Sede: ${orderContext.sede || 'N/A'}`, { align: 'center' });
        doc.text(`Mesa: ${orderContext.mesa}`, { align: 'center' });
        if (name) doc.text(`Cliente: ${name}`, { align: 'center' });
      } else {
        doc.text(`Comanda: ${facCode}`, { align: 'center' });
        doc.text(`Fecha: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`, { align: 'center' });
        doc.text(`Sede: ${orderContext.sede || 'N/A'}`, { align: 'center' });
        doc.text(`Mesa: ${orderContext.mesa}`, { align: 'center' });
        doc.text(`Mesero: ${orderContext.mesero || asesorName}`, { align: 'center' });
      }
    } else {
      const isDelivery = orderContext?.deliveryType === 'delivery';
      const isPickup = orderContext?.deliveryType === 'pickup';
      doc.text(isDelivery ? `Guía de Despacho: ${facCode}` : `Recibo de Caja: ${facCode}`, { align: 'center' });
      doc.text(`Fecha: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`, { align: 'center' });
      if (isAsesor) doc.text(`Asesor: ${asesorName}`, { align: 'center' });
      if (isDelivery) doc.text(`Tipo: DOMICILIO / ENCARGO`, { align: 'center' });
      else if (isPickup) doc.text(`Tipo: RECOGER / MOSTRADOR`, { align: 'center' });
      else doc.text(`Modalidad: ${isWholesale ? 'MAYORISTA' : 'MINORISTA'}`, { align: 'center' });
      if (name) doc.text(`Cliente: ${name}${isVip ? ' (VIP)' : ''}`, { align: 'center' });
      if (phone) doc.text(`Tel: ${phone.replace(/\D/g, '')}`, { align: 'center' });
      if (isDelivery && orderContext?.address) doc.text(`Dir: ${orderContext.address}`, { align: 'center' });
    }

    doc.moveDown(0.5);
    doc.font('Courier-Bold');
    doc.text('--------------------------------------', { align: 'center' });
    doc.text('CANT REF  PRODUCTO', { align: 'left' });
    doc.text('       V.UNIT           SUBTOTAL', { align: 'left' });
    doc.text('--------------------------------------', { align: 'center' });
    doc.font('Courier');

    cart.forEach((item: OrderItem) => {
      const ref = (item.refCode || item.reference || '').substring(0, 4).padEnd(4, ' ');
      const qty = String(item.qty).padStart(2, ' ') + 'x';
      const mod = isRestaurant && item.modifier ? (item.modifier === 'aqui' ? ' [AQ]' : ' [LL]') : '';
      const prodName = (item.name || '').substring(0, 27 - mod.length) + mod;
      doc.text(`${qty} ${ref} ${prodName}`, { align: 'left' });

      const unitPrice = `$${(item.price || 0).toLocaleString('es-CO')}`;
      const subTotal = `$${((item.qty || 1) * (item.price || 0)).toLocaleString('es-CO')}`;
      const line2Prefix = `       ${unitPrice}`;
      const paddingNeeded = Math.max(0, 38 - line2Prefix.length - subTotal.length);
      doc.text(line2Prefix + ' '.repeat(paddingNeeded) + subTotal, { align: 'left' });
      doc.moveDown(0.2);
    });

    doc.font('Courier-Bold');
    doc.text('--------------------------------------', { align: 'center' });
    doc.fontSize(11).text(`TOTAL: $${total.toLocaleString('es-CO')}`, { align: 'right' });
    doc.end();
  });
}

async function deductInventorySafe(commerceId: string, cart: OrderItem[]) {
  if (!db) return;
  try {
    const sysDocRef = db.collection('comercios').doc(commerceId).collection('_system').doc('catalog');
    const sysDoc = await sysDocRef.get();
    if (!sysDoc.exists) return;

    const compiled = sysDoc.data()?.compiledCatalog || [];
    let modified = false;
    const batch = db.batch();

    for (const item of cart) {
      if (!item.id) continue;
      const isVariation = String(item.id).includes('_');
      const parts = String(item.id).split('_');
      const actualDocId = isVariation ? parts[0] : item.id;
      const vIdx = isVariation ? parseInt(parts[1], 10) : 0;

      const cacheIndex = compiled.findIndex((p: any) => p.id === actualDocId);
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
    }
  } catch (err) {
    console.error('[Dispatch Inventory] Deduction error:', err);
  }
}

async function savePremiumMetricsSafe(commerceId: string, orderPayload: any) {
  if (!db || !admin) return;
  const { name, phone, datetime, cart, total, isWholesale, isStoreSale, asesorName, asesorSection, businessType, orderContext, facCode } = orderPayload;

  try {
    const FieldValue = admin.firestore.FieldValue;
    const todayDate = new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0];
    const statsRef = db.collection('comercios').doc(commerceId).collection('estadisticas').doc(todayDate);

    const modo = isWholesale ? 'Mayorista' : 'Minorista';
    const safeAsesor = asesorName ? asesorName.replace(/[./[\]*]/g, '').substring(0, 50) : `Web ${modo}`;
    const safeArea = asesorSection ? asesorSection.replace(/[./[\]*]/g, '').substring(0, 50) : `Web ${modo}`;

    const updateData: Record<string, any> = { updatedAt: new Date().toISOString() };

    if (isStoreSale) {
      updateData.totalSales = FieldValue.increment(total);
      updateData.totalOrders = FieldValue.increment(1);
      updateData[`salesByAsesor.${safeAsesor}`] = FieldValue.increment(total);
      updateData[`ordersByAsesor.${safeAsesor}`] = FieldValue.increment(1);
      updateData[`salesByModo.${modo}`] = FieldValue.increment(total);
      updateData[`ordersByModo.${modo}`] = FieldValue.increment(1);
      updateData[`salesByArea.${safeArea}`] = FieldValue.increment(total);
    } else {
      updateData.webPotentialValue = FieldValue.increment(total);
      updateData.webOrders = FieldValue.increment(1);
      updateData[`webLeadsByEntidad.${safeAsesor}`] = FieldValue.increment(1);
      updateData[`webOrdersByModo.${modo}`] = FieldValue.increment(1);
    }

    cart.forEach((item: OrderItem) => {
      const safeKey = (item.name || 'Desconocido').replace(/[./[\]*]/g, '').substring(0, 50);
      const safeBrand = item.brand ? item.brand.replace(/[./[\]*]/g, '').substring(0, 50) : null;

      if (isStoreSale) {
        if (safeBrand) updateData[`salesByBrand.${safeBrand}`] = FieldValue.increment(item.qty * item.price);
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
      datetime: datetime || new Date().toISOString(),
      cart,
      total,
      isWholesale: !!isWholesale,
      isStoreSale: !!isStoreSale,
      businessType: businessType || 'RETAIL',
      asesorName: asesorName || '',
      asesorSection: asesorSection || '',
      orderContext: orderContext || {},
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Dispatch Metrics] Error saving metrics:', err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: DispatchRequestBody = await request.json();
    const {
      commerceId,
      name = '',
      phone = '',
      datetime = new Date().toISOString(),
      cart = [],
      total = 0,
      isWholesale = false,
      isStoreSale = false,
      asesorName = '',
      asesorSection = '',
      businessType = 'RETAIL',
      orderContext,
      token,
    } = body;

    // Security & Data Validation
    if (!commerceId || typeof commerceId !== 'string') {
      return NextResponse.json({ ok: false, error: 'commerceId is required' }, { status: 400 });
    }

    if (!Array.isArray(cart)) {
      return NextResponse.json({ ok: false, error: 'cart must be an array' }, { status: 400 });
    }

    if (typeof total !== 'number' || total < 0 || isNaN(total)) {
      return NextResponse.json({ ok: false, error: 'invalid total amount' }, { status: 400 });
    }

    if (!db) {
      return NextResponse.json({ ok: false, error: 'Database service unavailable' }, { status: 500 });
    }

    const resolved = await resolveCommerce(commerceId);
    if (!resolved) {
      return NextResponse.json({ ok: false, error: 'Commerce not found' }, { status: 404 });
    }

    const actualCommerceId = resolved.commerceId;
    const commerceData = resolved.data || {};

    // POS Security check: if it's a store sale, optionally verify token
    if (isStoreSale && token) {
      const isMaster = commerceData.inventoryToken === token;
      if (!isMaster) {
        const areaSnap = await db.collection('comercios').doc(actualCommerceId).collection('areas').where('token', '==', token).get();
        if (areaSnap.empty) {
          return NextResponse.json({ ok: false, error: 'Unauthorized POS token' }, { status: 401 });
        }
      }
    }

    // Generate unique ticket code
    const now = new Date();
    const timeStr = now
      .toLocaleString('es-CO', {
        timeZone: 'America/Bogota',
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
      .replace(/\D/g, '');
    const facCode = `REC-${timeStr.slice(0, 10)}-${timeStr.slice(10)}${now.getMilliseconds().toString().padStart(3, '0')}`;

    const orderPayload = {
      name,
      phone,
      datetime,
      cart,
      total,
      isWholesale,
      isStoreSale,
      asesorName,
      asesorSection,
      businessType,
      orderContext,
      facCode,
      businessName: commerceData.businessName || 'Comercio',
    };

    // Deduct stock if store sale & Save metrics/order
    if (isStoreSale) {
      await deductInventorySafe(commerceId, cart);
    }
    if (commerceData.premiumMetrics === true || isStoreSale) {
      await savePremiumMetricsSafe(commerceId, orderPayload);
    }

    // Generate PDF Ticket Serverlessly
    let pdfBufferBase64 = '';
    try {
      const pdfBuffer = await generatePDFBuffer(orderPayload, facCode);
      pdfBufferBase64 = pdfBuffer.toString('base64');
    } catch (pdfErr) {
      console.warn('[Dispatch] PDF Generation warning:', pdfErr);
    }

    // If a Bot Server (Google Cloud Run / Worker) is configured, forward dispatch asynchronously
    const BOT_SERVER_URL = process.env.BOT_SERVER_URL || process.env.NEXT_PUBLIC_BOT_SERVER_URL;
    if (BOT_SERVER_URL) {
      try {
        fetch(`${BOT_SERVER_URL.replace(/\/$/, '')}/api/dispatch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).catch((e) => console.warn('[Dispatch Bot Forwarding Error]', e.message));
      } catch (e) {
        console.warn('[Dispatch] Bot forwarding skipped:', e);
      }
    }

    return NextResponse.json({
      ok: true,
      facCode,
      pdfBase64: pdfBufferBase64,
      msg: 'Ticket y Factura despachados exitosamente.',
    });
  } catch (error: any) {
    console.error('[Dispatch Route] Error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
