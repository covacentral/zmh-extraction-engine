import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!db) return NextResponse.json({ error: 'No DB' }, { status: 500 });
  const doc = await db.collection('comercios').doc('cc-bodega-mayorista').get();
  const data = doc.data() || {};
  
  // Check fields in data
  const keys = Object.keys(data);
  const sysDoc = await db.collection('comercios').doc('cc-bodega-mayorista').collection('_system').doc('catalog').get();
  const sysData = sysDoc.data() || {};

  return NextResponse.json({
    docKeys: keys,
    catalogs: data.catalogs,
    catalogJid: data.catalogJid,
    avatarJid: data.avatarJid,
    hasCompiledInDoc: !!data.compiledCatalog,
    compiledCountInDoc: data.compiledCatalog?.length || 0,
    compiledCountInSys: sysData.compiledCatalog?.length || 0,
    sampleInDoc: data.compiledCatalog?.slice(0, 2),
    sampleInSys: sysData.compiledCatalog?.slice(0, 2)
  });
}
