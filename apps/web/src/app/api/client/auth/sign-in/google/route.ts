import { NextResponse } from 'next/server';
import { forwardCustomerAuth } from '@/lib/server-api';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectUri = url.searchParams.get('redirectUri');
  const query = new URLSearchParams();
  if (redirectUri) {
    query.set('redirectUri', redirectUri);
  }

  const upstream = await forwardCustomerAuth({
    path: `/auth/sign-in/google${query.toString() ? `?${query.toString()}` : ''}`,
    method: 'GET'
  });

  const payload = await upstream.json().catch(() => ({ error: { message: 'Invalid upstream response.' } }));
  const response = NextResponse.json(payload, { status: upstream.status });
  const setCookie = upstream.headers.get('set-cookie');
  if (setCookie) {
    response.headers.set('set-cookie', setCookie);
  }
  return response;
}
