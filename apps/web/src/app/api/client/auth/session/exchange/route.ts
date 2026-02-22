import { NextResponse } from 'next/server';
import { forwardCustomerAuth, parseUpstreamPayload } from '@/lib/server-api';

export async function POST(request: Request) {
  const origin = request.headers.get('origin') ?? new URL(request.url).origin;
  const cookie = request.headers.get('cookie') ?? '';

  const upstream = await forwardCustomerAuth({
    path: '/auth/session/exchange',
    method: 'POST',
    body: {},
    cookie,
    origin
  });

  const payload = await parseUpstreamPayload(upstream);
  const response = NextResponse.json(payload, { status: upstream.status });
  const setCookie = upstream.headers.get('set-cookie');
  if (setCookie) {
    response.headers.set('set-cookie', setCookie);
  }

  return response;
}
