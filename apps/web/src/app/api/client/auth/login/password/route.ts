import { NextResponse } from 'next/server';
import { authLoginSchema } from '@/lib/contracts';
import { forwardCoreApi } from '@/lib/server-api';

export async function POST(request: Request) {
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

  const upstream = await forwardCoreApi({
    path: '/v1/auth/login/password',
    method: 'POST',
    body: parsed.data
  });

  const payload = await upstream.json().catch(() => ({ error: { message: 'Invalid upstream response.' } }));
  const response = NextResponse.json(payload, { status: upstream.status });
  const setCookie = upstream.headers.get('set-cookie');
  if (setCookie) {
    response.headers.set('set-cookie', setCookie);
  }
  return response;
}
