import { NextRequest, NextResponse } from 'next/server';
import { resolveCommerce } from '../../../lib/commerceResolver';
import { createEcometriProductHandler } from '../../../lib/ecometri/productDetail';

export const dynamic = 'force-dynamic';

const executeProductDetail = createEcometriProductHandler({
  resolveCommerceFn: resolveCommerce,
  fetchFn: fetch,
});

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim() || 'unknown';
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sp = request.nextUrl.searchParams;
  const result = await executeProductDetail({
    commerce: sp.get('c'),
    slug: sp.get('slug'),
    clientIp: getClientIp(request),
  });

  return NextResponse.json(result.body, {
    status: result.status,
    headers: result.headers,
  });
}
