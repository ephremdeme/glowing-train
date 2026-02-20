import { NextResponse } from 'next/server';
import { forwardCustomerAuth } from '@/lib/server-api';

export async function POST(request: Request) {
  const cookie = request.headers.get('cookie') ?? '';

  const upstream = await forwardCustomerAuth({
    path: '/auth/session/exchange',
    method: 'POST',
    body: {},
    cookie
  });

  const payload = await upstream.json().catch(() => ({ error: { message: 'Invalid upstream response.' } }));
  const response = NextResponse.json(payload, { status: upstream.status });
  const setCookie = upstream.headers.get('set-cookie');
  if (setCookie) {
    response.headers.set('set-cookie', setCookie);
  }

  return response;
}
