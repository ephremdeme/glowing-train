import { NextResponse } from 'next/server';
import { forwardCoreApi } from '@/lib/server-api';

export async function GET(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  const upstream = await forwardCoreApi({
    path: '/v1/kyc/sender/status',
    method: 'GET',
    authorization
  });

  const payload = await upstream.json().catch(() => ({ error: { message: 'Invalid upstream response.' } }));
  return NextResponse.json(payload, { status: upstream.status });
}
