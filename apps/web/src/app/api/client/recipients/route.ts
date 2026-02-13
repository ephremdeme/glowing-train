import { NextResponse } from 'next/server';
import { recipientCreateSchema } from '@/lib/contracts';
import { forwardCoreApi } from '@/lib/server-api';

export async function GET(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  const upstream = await forwardCoreApi({
    path: '/v1/recipients',
    method: 'GET',
    authorization
  });
  const payload = await upstream.json().catch(() => ({ error: { message: 'Invalid upstream response.' } }));
  return NextResponse.json(payload, { status: upstream.status });
}

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  const body = await request.json().catch(() => null);
  const parsed = recipientCreateSchema.safeParse(body);
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
    path: '/v1/recipients',
    method: 'POST',
    authorization,
    body: parsed.data
  });

  const payload = await upstream.json().catch(() => ({ error: { message: 'Invalid upstream response.' } }));
  return NextResponse.json(payload, { status: upstream.status });
}
