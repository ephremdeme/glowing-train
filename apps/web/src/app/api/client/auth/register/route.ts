import { NextResponse } from 'next/server';
import { authRegisterSchema } from '@/lib/contracts';
import { makeIdempotencyKey } from '@/lib/idempotency';
import { forwardCoreApi } from '@/lib/server-api';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = authRegisterSchema.safeParse(body);
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

  const upstream = await forwardCoreApi({
    path: '/v1/auth/register',
    method: 'POST',
    body: parsed.data,
    idempotencyKey: makeIdempotencyKey('web-register')
  });

  const payload = await upstream.json().catch(() => ({ error: { message: 'Invalid upstream response.' } }));
  const response = NextResponse.json(payload, { status: upstream.status });
  const setCookie = upstream.headers.get('set-cookie');
  if (setCookie) {
    response.headers.set('set-cookie', setCookie);
  }
  return response;
}
