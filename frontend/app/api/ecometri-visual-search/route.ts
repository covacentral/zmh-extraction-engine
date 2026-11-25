import { NextRequest, NextResponse } from 'next/server';
import { resolveCommerce } from '../../../lib/commerceResolver';
import { createCatalogIndexStore } from '../../../lib/ecometri/catalogIndex';
import { createHttpGeminiClient } from '../../../lib/ecometri/geminiClient';
import {
  createCircuitBreaker,
  createVisualRateLimiter,
  MAX_BODY_BYTES,
} from '../../../lib/ecometri/visualSearch';
import { createVisualSearchHandler } from '../../../lib/ecometri/visualSearchHandler';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const sharedRateLimiter = createVisualRateLimiter();
const sharedCircuitBreaker = createCircuitBreaker();
const sharedCatalogIndex = createCatalogIndexStore();

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim() || 'unknown';
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request);
  const deviceId = request.headers.get('x-device-id');
  const contentLengthHeader = request.headers.get('content-length');

  const peekQuota = () => {
    const q = sharedRateLimiter.peek(clientIp, deviceId);
    return {
      remaining: q.remaining,
      limit: q.limit,
      resetInSec: q.resetInSec,
      resetAt: q.resetAt,
    };
  };

  const declaredLen = Number(contentLengthHeader || '0');
  if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
    return NextResponse.json(
      {
        error: 'La solicitud supera el tamano maximo permitido.',
        quota: peekQuota(),
      },
      { status: 413 }
    );
  }

  let rawBody: unknown = null;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Cuerpo JSON invalido.', quota: peekQuota() },
      { status: 400 }
    );
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const geminiClient = apiKey ? createHttpGeminiClient(apiKey, fetch) : null;

  const execute = createVisualSearchHandler({
    resolveCommerceFn: resolveCommerce,
    geminiClient,
    fetchFn: fetch,
    catalogIndexStore: sharedCatalogIndex,
    rateLimiter: sharedRateLimiter,
    circuitBreaker: sharedCircuitBreaker,
  });

  const result = await execute({
    contentLengthHeader,
    rawBody,
    clientIp,
    deviceId,
  });

  return NextResponse.json(result.body, {
    status: result.status,
    headers: result.headers,
  });
}
