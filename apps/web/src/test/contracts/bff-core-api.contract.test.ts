import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as transferDetailGet } from '@/app/api/client/transfers/[transferId]/route';
import { GET as transfersListGet, POST as transfersCreatePost } from '@/app/api/client/transfers/route';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}

describe('BFF -> core-api contracts', () => {
  beforeEach(() => {
    process.env.WEB_CORE_API_URL = 'http://core-api.test';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards transfer create contract and keeps BFF response shape', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse(
        {
          transferId: 'tr_1',
          depositAddress: '0xabc123',
          status: 'AWAITING_FUNDING'
        },
        201
      )
    );

    const request = new Request('http://localhost/api/client/transfers', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer customer.jwt'
      },
      body: JSON.stringify({
        quoteId: 'q_1',
        recipientId: 'rcp_1',
        quote: {
          quoteId: 'q_1',
          chain: 'base',
          token: 'USDC',
          sendAmountUsd: 100,
          feeUsd: 1,
          fxRateUsdToEtb: 140,
          recipientAmountEtb: 13860,
          expiresAt: '2026-02-20T12:00:00.000Z'
        }
      })
    });

    const response = await transfersCreatePost(request);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toEqual({
      transferId: 'tr_1',
      depositAddress: '0xabc123',
      status: 'AWAITING_FUNDING',
      quote: {
        quoteId: 'q_1',
        chain: 'base',
        token: 'USDC',
        sendAmountUsd: 100,
        feeUsd: 1,
        fxRateUsdToEtb: 140,
        recipientAmountEtb: 13860,
        expiresAt: '2026-02-20T12:00:00.000Z'
      }
    });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://core-api.test/v1/transfers');
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer customer.jwt');
    expect(headers['idempotency-key']).toMatch(/^web-transfer:/);

    expect(JSON.parse(init.body as string)).toEqual({
      quoteId: 'q_1',
      recipientId: 'rcp_1'
    });
  });

  it('forwards transfer list query and auth contract', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({
        items: [],
        count: 0
      })
    );

    const request = new Request('http://localhost/api/client/transfers?status=AWAITING_FUNDING&limit=20', {
      method: 'GET',
      headers: {
        authorization: 'Bearer customer.jwt'
      }
    });

    const response = await transfersListGet(request);
    expect(response.status).toBe(200);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://core-api.test/v1/transfers?status=AWAITING_FUNDING&limit=20');
    expect(init.method).toBe('GET');

    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer customer.jwt');
  });

  it('forwards transfer detail contract and enriches UI status', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({
        transfer: {
          transferId: 'tr_2',
          status: 'PAYOUT_INITIATED',
          createdAt: '2026-02-20T12:00:00.000Z'
        },
        payout: {
          status: 'PAYOUT_INITIATED'
        }
      })
    );

    const request = new Request('http://localhost/api/client/transfers/tr_2', {
      method: 'GET',
      headers: {
        authorization: 'Bearer customer.jwt'
      }
    });

    const response = await transferDetailGet(request, {
      params: Promise.resolve({ transferId: 'tr_2' })
    });

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.backendStatus).toBe('PAYOUT_INITIATED');
    expect(payload.uiStatus).toBe('PAYOUT_PENDING');

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://core-api.test/v1/transfers/tr_2');
    expect(init.method).toBe('GET');
  });
});
