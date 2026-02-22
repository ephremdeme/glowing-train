import { NextResponse } from 'next/server';
import { authLoginSchema } from '@/lib/contracts';
import { forwardCustomerAuth, parseUpstreamPayload } from '@/lib/server-api';

export async function POST(request: Request) {
  const origin = request.headers.get('origin') ?? new URL(request.url).origin;
  const body = await request.json().catch(() => null);
  const parsed = authLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_PAYLOAD',
          message: parsed.error.issues[0]?.message ?? 'Invalid payload.'
        }
      },
      { status: 400 }
    );
  }

  const upstream = await forwardCustomerAuth({
    path: '/auth/sign-in/email',
    method: 'POST',
    body: parsed.data,
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
