import { z } from 'zod';
import { NextResponse } from 'next/server';
import { makeIdempotencyKey } from '@/lib/idempotency';
import { mapToUiStatus } from '@/lib/status';
import { forwardCoreApi, parseUpstreamPayload } from '@/lib/server-api';

const requestSchema = z.object({
  signature: z.string().min(1)
});

interface CorePayload {
  result?: 'confirmed' | 'duplicate' | 'pending_verification';
  transferId?: string;
  txHash?: string;
  backendStatus?: string;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ transferId: string }> }
) {
  const { transferId } = await context.params;
  const authorization = request.headers.get('authorization') ?? '';
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

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

  console.info(`[solana-payment] transferId=${transferId} signature=${parsed.data.signature} → forwarding to core-api`);

  const upstream = await forwardCoreApi({
    path: `/v1/transfers/${transferId}/solana-payment`,
    method: 'POST',
    authorization,
    idempotencyKey: makeIdempotencyKey('web-solana-payment'),
    body: { txHash: parsed.data.signature }
  });

  console.info(`[solana-payment] transferId=${transferId} upstream.status=${upstream.status}`);

  const payload = (await parseUpstreamPayload(upstream)) as CorePayload | { error?: { message?: string } };
  if (
    !upstream.ok ||
    !('result' in payload) ||
    !payload.result ||
    !payload.transferId ||
    !payload.txHash ||
    !payload.backendStatus
  ) {
    return NextResponse.json(payload, { status: upstream.status });
  }

  return NextResponse.json(
    {
      ...payload,
      uiStatus: mapToUiStatus(
        payload.backendStatus,
        null,
        payload.result === 'pending_verification' ? { txHash: payload.txHash, submittedAt: new Date().toISOString() } : null
      )
    },
    { status: upstream.status }
  );
}
