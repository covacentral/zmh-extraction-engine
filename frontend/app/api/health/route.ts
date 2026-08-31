import { NextResponse } from 'next/server';
import { db } from '../../../lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    mode: 'serverless',
    timestamp: new Date().toISOString(),
    database: db ? 'connected' : 'unavailable',
  });
}
