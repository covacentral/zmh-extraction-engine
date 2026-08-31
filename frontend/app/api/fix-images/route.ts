import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

const reliableTestImages = [
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80', // Nike Red Sneaker
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80', // Watch
  'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80', // Headphones
  'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=600&q=80', // Tech Headphones
  'https://images.unsplash.com/photo-1560343090-f0409e92791a?auto=format&fit=crop&w=600&q=80', // Shoes
  'https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=600&q=80', // Sunglasses
  'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=600&q=80', // Camera
  'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=600&q=80', // Smartwatch
  'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?auto=format&fit=crop&w=600&q=80', // Perfume
  'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80', // Smartphone
  'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=600&q=80', // Shirt
  'https://images.unsplash.com/photo-1578932750294-f5075e85f44a?auto=format&fit=crop&w=600&q=80', // Backpack
  'https://images.unsplash.com/photo-1608231387042-66d1773070a5?auto=format&fit=crop&w=600&q=80', // Puma shoe
  'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=600&q=80', // Handbag
  'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=600&q=80', // Mouse
  'https://images.unsplash.com/photo-1507764923504-cd90bf7da772?auto=format&fit=crop&w=600&q=80', // Laptop
];

export async function GET(req: NextRequest) {
  if (!db) return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });

  const searchParams = req.nextUrl.searchParams;
  const comercio = searchParams.get('comercio') || 'cc-bodega-mayorista';

  const sysRef = db.collection('comercios').doc(comercio).collection('_system').doc('catalog');
  const sysDoc = await sysRef.get();

  if (!sysDoc.exists) {
    return NextResponse.json({ error: 'Catalog document not found' }, { status: 404 });
  }

  const catalog = sysDoc.data()?.compiledCatalog || [];
  let updatedCount = 0;

  const updatedCatalog = catalog.map((prod: any, idx: number) => {
    const fallbackUrl = reliableTestImages[idx % reliableTestImages.length];
    const currentImg = typeof prod.imageUrl === 'string' ? prod.imageUrl : (typeof prod.image === 'string' ? prod.image : '');
    
    if (!currentImg || currentImg.includes('picsum.photos')) {
      updatedCount++;
      return {
        ...prod,
        imageUrl: fallbackUrl,
        imageUrls: fallbackUrl,
        image: fallbackUrl,
        imageWebp: fallbackUrl
      };
    }
    return prod;
  });

  if (updatedCount > 0) {
    await sysRef.update({ compiledCatalog: updatedCatalog });
  }

  return NextResponse.json({
    success: true,
    comercio,
    totalProducts: catalog.length,
    updatedImagesCount: updatedCount
  });
}
