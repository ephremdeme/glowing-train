import { z } from 'zod';
import { NextResponse } from 'next/server';
import { forwardCoreApi } from '@/lib/server-api';

const callbackSchema = z.object({
  state: z.string().min(1),
  code: z.string().min(1)
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = callbackSchema.safeParse({
    state: url.searchParams.get('state') ?? '',
    code: url.searchParams.get('code') ?? ''
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_QUERY',
          message: parsed.error.issues[0]?.message ?? 'Invalid query.'
        }
      },
      { status: 400 }
    );
  }

  const query = new URLSearchParams({
    state: parsed.data.state,
    code: parsed.data.code
  });

  const upstream = await forwardCoreApi({
    path: `/v1/auth/oauth/google/callback?${query.toString()}`,
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
