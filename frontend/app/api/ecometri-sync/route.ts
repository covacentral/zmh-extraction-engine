import { NextRequest, NextResponse } from 'next/server';
import { resolveCommerce } from '../../../lib/commerceResolver';
import { createEcometriSyncHandler } from '../../../lib/ecometri/semantic/syncHandler';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const executeSync = createEcometriSyncHandler({
  resolveCommerceFn: resolveCommerce,
  fetchFn: fetch,
});

async function handleSyncRequest(request: NextRequest): Promise<NextResponse> {
  let commerce = request.nextUrl.searchParams.get('commerce') || request.nextUrl.searchParams.get('c');
  const enableParam = request.nextUrl.searchParams.get('enableSemantic');
  let enableSemantic: boolean | null =
    enableParam === 'true' || enableParam === '1'
      ? true
      : enableParam === 'false' || enableParam === '0'
        ? false
        : null;

  if (request.method === 'POST') {
    try {
      const body = (await request.json()) as {
        commerce?: string;
        commerceId?: string;
        enableSemantic?: boolean;
      } | null;
      if (!commerce) {
        commerce = body?.commerce || body?.commerceId || null;
      }
      if (enableSemantic === null && typeof body?.enableSemantic === 'boolean') {
        enableSemantic = body.enableSemantic;
      }
    } catch {
      // Allow empty POST body when query param is used
    }
  }

  const result = await executeSync({
    authorizationHeader: request.headers.get('authorization'),
    commerce,
    enableSemantic,
  });

  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleSyncRequest(request);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleSyncRequest(request);
}
