import { NextRequest, NextResponse } from 'next/server';
import { resolveCommerce } from '../../../lib/commerceResolver';
import { createEcometriSearchHandler } from '../../../lib/ecometri/searchHandler';

export const dynamic = 'force-dynamic';

const executeSearch = createEcometriSearchHandler({
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
  const result = await executeSearch({
    commerce: sp.get('c'),
    term: sp.get('term'),
    page: sp.get('page'),
    clientIp: getClientIp(request),
  });

  return NextResponse.json(result.body, {
    status: result.status,
    headers: result.headers,
  });
}
