import { NextResponse } from 'next/server';
import { forwardCoreApi } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export async function GET() {
  const upstream = await forwardCoreApi({
    path: '/v1/fx/usd-etb',
    method: 'GET'
  });

  const payload = (await upstream.json().catch(() => ({ error: { message: 'Invalid upstream response.' } }))) as
    | { base?: string; quote?: string; rate?: number; fetchedAt?: string; source?: string }
    | { error?: { message?: string } };

  if (!upstream.ok || !('rate' in payload) || typeof payload.rate !== 'number') {
    return NextResponse.json(payload, { status: upstream.status });
  }

  return NextResponse.json(
    {
      base: payload.base,
      quote: payload.quote,
      rate: payload.rate,
      fetchedAt: payload.fetchedAt,
      source: payload.source
    },
    { status: upstream.status }
  );
}
