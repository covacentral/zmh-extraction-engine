import { NextResponse } from 'next/server';
import { db } from '../../../lib/firebaseAdmin';

const richProducts = [
    // --- TELEVISORES (Category: Televisores, Icon: Tv) ---
    {
        name: 'Smart TV LG 55" 4K UHD',
        brand: 'LG',
        reference: 'LG-55UR8750',
        description: 'Televisor inteligente con procesador a5 Gen6 4K, webOS 23 y Filmmaker mode.',
        category: 'Televisores',
        categoryIcon: 'Tv',
        costPrice: 1200000,
        wholesalePrice: 1350000,
        normalPrice: 1800000,
        distMargin: 15,
        shippingRules: 'Envío gratis nacional',
        provider: 'LG Colombia',
        area: 'Tecnología',
        imageUrl: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=800&q=80',
        status: 'active',
        variations: [
            { name: '55 Pulgadas', stock: 15, imageWebp: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=800&q=80' },
            { name: '65 Pulgadas', stock: 5, imageWebp: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=800&q=80' }
        ]
    },
    {
        name: 'Samsung 50" Crystal UHD 4K',
        brand: 'Samsung',
        reference: 'UN50CU7000',
        description: 'Colores cristalinos y procesador Crystal 4K. Diseño sin bordes en 3 lados.',
        category: 'Televisores',
        categoryIcon: 'Tv',
        costPrice: 1000000,
        wholesalePrice: 1150000,
        normalPrice: 1500000,
        distMargin: 12,
        shippingRules: 'Cobro en destino',
        provider: 'Samsung Oficial',
        area: 'Tecnología',
        imageUrl: 'https://images.unsplash.com/photo-1601944177325-f8867652837f?auto=format&fit=crop&w=800&q=80',
        status: 'active',
        variations: [
            { name: '50 Pulgadas', stock: 20, imageWebp: 'https://images.unsplash.com/photo-1601944177325-f8867652837f?auto=format&fit=crop&w=800&q=80' }
        ]
    },
    {
        name: 'Sony Bravia XR 65" OLED',
        brand: 'Sony',
        reference: 'XR-65A80L',
        description: 'Contraste OLED puro, colores vibrantes con Cognitive Processor XR.',
        category: 'Televisores',
        categoryIcon: 'Tv',
        costPrice: 4500000,
        wholesalePrice: 5000000,
        normalPrice: 6500000,
        distMargin: 20,
        shippingRules: 'Envío asegurado gratis',
        provider: 'Sony Electronics',
        area: 'Tecnología',
        imageUrl: 'https://images.unsplash.com/photo-1593305841991-05c297ba4575?auto=format&fit=crop&w=800&q=80',
        status: 'active',
        variations: [
            { name: 'OLED 65"', stock: 3, imageWebp: 'https://images.unsplash.com/photo-1593305841991-05c297ba4575?auto=format&fit=crop&w=800&q=80' }
        ]
    },
    // --- CELULARES (Category: Celulares, Icon: Smartphone) ---
    {
        name: 'iPhone 15 Pro Max 256GB',
        brand: 'Apple',
        reference: 'IP15PM-256',
        description: 'Diseño en titanio, chip A17 Pro y la mejor cámara de un iPhone.',
        category: 'Celulares',
        categoryIcon: 'Smartphone',
        costPrice: 4800000,
        wholesalePrice: 5100000,
        normalPrice: 5800000,
        distMargin: 8,
        shippingRules: 'Envío express',
        provider: 'iShop',
        area: 'Tecnología',
        imageUrl: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=800&q=80',
        status: 'active',
        variations: [
            { name: 'Titanio Natural', stock: 10, imageWebp: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=800&q=80' },
            { name: 'Titanio Negro', stock: 5, imageWebp: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=800&q=80' }
        ]
    },
    {
        name: 'Samsung Galaxy S24 Ultra',
        brand: 'Samsung',
        reference: 'S24-ULTRA-512',
        description: 'Galaxy AI is here. 512GB, marco de titanio.',
        category: 'Celulares',
        categoryIcon: 'Smartphone',
        costPrice: 4500000,
        wholesalePrice: 4900000,
        normalPrice: 5600000,
        distMargin: 10,
        shippingRules: 'Envío express',
        provider: 'Samsung Oficial',
        area: 'Tecnología',
        imageUrl: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&w=800&q=80',
        status: 'active',
        variations: [
            { name: 'Titanium Gray', stock: 12, imageWebp: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&w=800&q=80' }
        ]
    },
    // --- FERRETERÍA (Category: Herramientas, Icon: Wrench) ---
    {
        name: 'Taladro Percutor Inalámbrico 20V',
        brand: 'DeWalt',
        reference: 'DCD778L1',
        description: 'Taladro atornillador sin carbones, incluye batería y cargador.',
        category: 'Herramientas',
        categoryIcon: 'Wrench',
        costPrice: 450000,
        wholesalePrice: 550000,
        normalPrice: 700000,
        distMargin: 20,
        shippingRules: 'Cobro en destino',
        provider: 'Ferretería Central',
        area: 'Ferretería',
        imageUrl: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=800&q=80',
        status: 'active',
        variations: [
            { name: 'Kit Completo', stock: 30, imageWebp: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=800&q=80' }
        ]
    },
    {
        name: 'Pulidora Angular 4-1/2"',
        brand: 'Makita',
        reference: 'M0901G',
        description: 'Esmeriladora angular de 540W. Alta resistencia al calor.',
        category: 'Herramientas',
        categoryIcon: 'Wrench',
        costPrice: 120000,
        wholesalePrice: 150000,
        normalPrice: 200000,
        distMargin: 25,
        shippingRules: 'Envío por transportadora',
        provider: 'Ferretería Central',
        area: 'Ferretería',
        imageUrl: 'https://images.unsplash.com/photo-1581147036324-c1081f211322?auto=format&fit=crop&w=800&q=80',
        status: 'active',
        variations: [
            { name: 'Estándar', stock: 50, imageWebp: 'https://images.unsplash.com/photo-1581147036324-c1081f211322?auto=format&fit=crop&w=800&q=80' }
        ]
    },
    // --- HOGAR (Category: Muebles, Icon: Sofa) ---
    {
        name: 'Sofá Cama Modular Tela Lino',
        brand: 'Muebles & Co',
        reference: 'SOFA-LINO-01',
        description: 'Sofá cama de 3 puestos, tela anti fluidos y patas de madera.',
        category: 'Muebles',
        categoryIcon: 'Sofa',
        costPrice: 800000,
        wholesalePrice: 950000,
        normalPrice: 1200000,
        distMargin: 18,
        shippingRules: 'Envío 5-7 días hábiles',
        provider: 'Fábrica Local',
        area: 'Hogar',
        imageUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80',
        status: 'active',
        variations: [
            { name: 'Gris Oscuro', stock: 5, imageWebp: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80' },
            { name: 'Beige', stock: 3, imageWebp: 'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&w=800&q=80' }
        ]
    },
    {
        name: 'Comedor 4 Puestos Madera Roble',
        brand: 'Muebles & Co',
        reference: 'COM-ROB-4',
        description: 'Mesa y 4 sillas en roble macizo con tapizado en ecocuero.',
        category: 'Muebles',
        categoryIcon: 'Sofa',
        costPrice: 1100000,
        wholesalePrice: 1300000,
        normalPrice: 1600000,
        distMargin: 15,
        shippingRules: 'Envío 5-7 días hábiles',
        provider: 'Fábrica Local',
        area: 'Hogar',
        imageUrl: 'https://images.unsplash.com/photo-1577140917170-285929fb55b7?auto=format&fit=crop&w=800&q=80',
        status: 'active',
        variations: [
            { name: 'Natural', stock: 2, imageWebp: 'https://images.unsplash.com/photo-1577140917170-285929fb55b7?auto=format&fit=crop&w=800&q=80' }
        ]
    }
];

export async function GET(request: Request) {
    if (!db) return NextResponse.json({ error: 'DB not initialized' }, { status: 500 });
    
    const COMMERCE_ID = 'cc-bodega-mayorista';
    
    try {
        const productsRef = db.collection('comercios').doc(COMMERCE_ID).collection('productos');
        const snapshot = await productsRef.get();
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();

        let compiledCatalog: any[] = [];
        for (const prod of richProducts) {
            const docRef = productsRef.doc();
            const payload = {
                id: docRef.id,
                ...prod,
                createdAt: new Date().toISOString()
            };
            await docRef.set(payload);
            compiledCatalog.push(payload);
        }

        await db.collection('comercios').doc(COMMERCE_ID).collection('_system').doc('catalog').set({
            compiledCatalog,
            updatedAt: new Date().toISOString()
        });

        return NextResponse.json({ success: true, message: `Seeded ${compiledCatalog.length} products.` });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
