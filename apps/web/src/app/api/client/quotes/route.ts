import { NextResponse } from 'next/server';
import { quoteCreateSchema } from '@/lib/contracts';
import { makeIdempotencyKey } from '@/lib/idempotency';
import { forwardCoreApi } from '@/lib/server-api';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = quoteCreateSchema.safeParse(body);

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
    path: '/v1/quotes',
    method: 'POST',
    body: parsed.data,
    idempotencyKey: makeIdempotencyKey('web-quote')
  });

  const payload = (await upstream.json().catch(() => ({ error: { message: 'Invalid upstream response.' } }))) as
    | { quoteId?: string; expiresAt?: string }
    | { error?: { message?: string } };

  if (!upstream.ok || !('quoteId' in payload) || !payload.quoteId || !payload.expiresAt) {
    return NextResponse.json(payload, { status: upstream.status });
  }

  const recipientAmountEtb = Number(((parsed.data.sendAmountUsd - parsed.data.feeUsd) * parsed.data.fxRateUsdToEtb).toFixed(2));

  return NextResponse.json(
    {
      quoteId: payload.quoteId,
      chain: parsed.data.chain,
      token: parsed.data.token,
      sendAmountUsd: parsed.data.sendAmountUsd,
      feeUsd: parsed.data.feeUsd,
      fxRateUsdToEtb: parsed.data.fxRateUsdToEtb,
      recipientAmountEtb,
      expiresAt: payload.expiresAt
    },
    { status: upstream.status }
  );
}
