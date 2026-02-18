import { NextResponse } from 'next/server';
import { mapToUiStatus } from '@/lib/status';
import { forwardCoreApi } from '@/lib/server-api';

interface TransferDetailResponse {
  transfer?: {
    transferId: string;
    status: string;
    createdAt: string;
  };
  payout?: {
    status: string;
  } | null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ transferId: string }> }
) {
  const { transferId } = await context.params;
  const authorization = request.headers.get('authorization') ?? '';

  const upstream = await forwardCoreApi({
    path: `/v1/transfers/${transferId}`,
    method: 'GET',
    authorization
  });

  const payload = (await upstream.json().catch(() => ({ error: { message: 'Invalid upstream response.' } }))) as
    | TransferDetailResponse
    | { error?: { message?: string } };

  if (!upstream.ok || !('transfer' in payload) || !payload.transfer?.status) {
    return NextResponse.json(payload, { status: upstream.status });
  }

  return NextResponse.json(
    {
      ...payload,
      backendStatus: payload.transfer.status,
      uiStatus: mapToUiStatus(payload.transfer.status, payload.payout?.status ?? null)
    },
    { status: upstream.status }
  );
}
