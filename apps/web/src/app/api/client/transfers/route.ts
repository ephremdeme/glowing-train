import { z } from 'zod';
import { NextResponse } from 'next/server';
import { makeIdempotencyKey } from '@/lib/idempotency';
import { forwardCoreApi, parseUpstreamPayload } from '@/lib/server-api';

const transferRequestSchema = z.object({
  quoteId: z.string().min(1),
  recipientId: z.string().min(1),
  quote: z.object({
    quoteId: z.string().min(1),
    chain: z.enum(['base', 'solana']),
    token: z.enum(['USDC', 'USDT']),
    sendAmountUsd: z.number().positive().max(2000),
    feeUsd: z.number().min(0),
    fxRateUsdToEtb: z.number().positive(),
    recipientAmountEtb: z.number().positive(),
    expiresAt: z.string().min(1)
  })
});

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  const body = await request.json().catch(() => null);
  const parsed = transferRequestSchema.safeParse(body);
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
    path: '/v1/transfers',
    method: 'POST',
    authorization,
    idempotencyKey: makeIdempotencyKey('web-transfer'),
    body: {
      quoteId: parsed.data.quoteId,
      recipientId: parsed.data.recipientId
    }
  });

  const payload = (await parseUpstreamPayload(upstream)) as
    | {
        transferId?: string;
        depositAddress?: string;
        status?: string;
        routeKind?: 'address_route' | 'solana_program_pay';
        fundingMode?: 'copy_address_auto' | 'program_pay_legacy';
      }
    | { error?: { message?: string } };

  if (!upstream.ok || !('transferId' in payload) || !payload.transferId || !payload.depositAddress || !payload.status) {
    return NextResponse.json(payload, { status: upstream.status });
  }

  const routeKind = payload.routeKind === 'solana_program_pay' ? 'solana_program_pay' : 'address_route';
  const fundingMode = payload.fundingMode === 'program_pay_legacy' ? 'program_pay_legacy' : 'copy_address_auto';

  return NextResponse.json(
    {
      transferId: payload.transferId,
      depositAddress: payload.depositAddress,
      status: payload.status,
      routeKind,
      fundingMode,
      quote: parsed.data.quote
    },
    { status: upstream.status }
  );
}

export async function GET(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  const url = new URL(request.url);
  const params = new URLSearchParams();
  const status = url.searchParams.get('status');
  const limit = url.searchParams.get('limit');
  if (status) {
    params.set('status', status);
  }
  if (limit) {
    params.set('limit', limit);
  }

  const upstream = await forwardCoreApi({
    path: `/v1/transfers${params.toString() ? `?${params.toString()}` : ''}`,
    method: 'GET',
    authorization
  });

  const payload = await parseUpstreamPayload(upstream);
  return NextResponse.json(payload, { status: upstream.status });
}
