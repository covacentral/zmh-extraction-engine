import { NextResponse } from 'next/server';
import { db } from '../../../lib/firebaseAdmin';

const categories = [
    { name: 'Electrónica', icon: 'Cpu' },
    { name: 'Ropa', icon: 'Shirt' },
    { name: 'Hogar', icon: 'Home' },
    { name: 'Ferretería', icon: 'Wrench' },
    { name: 'Deportes', icon: 'Dumbbell' }
];

const brands = ['Samsung', 'Sony', 'LG', 'Nike', 'Adidas', 'Puma', 'DeWalt', 'Makita', 'Bosch', 'Apple'];

const richProducts: any[] = [];

for (let i = 1; i <= 200; i++) {
    const cat = categories[i % categories.length];
    const brand = brands[i % brands.length];
    const price = 50000 + (Math.floor(Math.random() * 50) * 10000);
    
    richProducts.push({
        name: `[TEST] Producto Prueba ${i} - ${brand}`,
        brand: brand,
        reference: `TEST-${brand.substring(0,3).toUpperCase()}-${i}`,
        description: `Este es un producto de prueba (TEST) número ${i} generado automáticamente para verificar el comportamiento de los carruseles. Categoría: ${cat.name}, Marca: ${brand}. Relación de aspecto 1:1 estricta.`,
        category: cat.name,
        categoryIcon: cat.icon,
        costPrice: price * 0.7,
        wholesalePrice: price * 0.85,
        normalPrice: price,
        distMargin: 15,
        shippingRules: 'Envío de prueba',
        provider: 'Proveedor Test',
        area: 'Test',
        imageUrl: `https://picsum.photos/seed/testprod${i}/400/400`,
        status: 'active',
        variations: [
            { name: 'Estándar', stock: 100, imageWebp: `https://picsum.photos/seed/testprod${i}/400/400` }
        ]
    });
}

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

        const createBatch = db.batch();
        let compiledCatalog: any[] = [];
        
        for (const prod of richProducts) {
            const docRef = productsRef.doc();
            const payload = {
                id: docRef.id,
                ...prod,
                createdAt: new Date().toISOString()
            };
            createBatch.set(docRef, payload);
            compiledCatalog.push(payload);
        }
        
        await createBatch.commit();

        await db.collection('comercios').doc(COMMERCE_ID).collection('_system').doc('catalog').set({
            compiledCatalog,
            updatedAt: new Date().toISOString()
        });

        return NextResponse.json({ success: true, message: `Seeded ${compiledCatalog.length} products.` });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
