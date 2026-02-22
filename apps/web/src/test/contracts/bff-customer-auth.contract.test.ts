import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as googleSignInGet } from '@/app/api/client/auth/sign-in/google/route';
import { POST as signOutPost } from '@/app/api/client/auth/sign-out/route';
import { POST as sessionExchangePost } from '@/app/api/client/auth/session/exchange/route';
import { POST as signInEmailPost } from '@/app/api/client/auth/sign-in/email/route';
import { POST as signUpEmailPost } from '@/app/api/client/auth/sign-up/email/route';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...headers
    }
  });
}

describe('BFF -> customer-auth contracts', () => {
  beforeEach(() => {
    process.env.WEB_CUSTOMER_AUTH_URL = 'http://customer-auth.test';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards sign-up email request contract', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse(
        {
          customer: {
            customerId: 'cust_1'
          }
        },
        201,
        { 'set-cookie': 'session=abc; Path=/; HttpOnly' }
      )
    );

    const request = new Request('http://localhost/api/client/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        fullName: 'Alice Customer',
        countryCode: 'ET',
        email: 'alice@example.com',
        password: 'Password123!'
      })
    });

    const response = await signUpEmailPost(request);
    const payload = (await response.json()) as { customer: { customerId: string } };

    expect(response.status).toBe(201);
    expect(response.headers.get('set-cookie')).toContain('session=abc');
    expect(payload.customer.customerId).toBe('cust_1');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://customer-auth.test/auth/sign-up/email');
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(headers.origin).toBe('http://localhost');
    expect(headers['idempotency-key']).toMatch(/^web-register:/);

    expect(JSON.parse(init.body as string)).toEqual({
      fullName: 'Alice Customer',
      countryCode: 'ET',
      email: 'alice@example.com',
      password: 'Password123!'
    });
  });

  it('forwards sign-in email request contract', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse(
        {
          customer: {
            customerId: 'cust_2'
          }
        },
        200,
        { 'set-cookie': 'session=def; Path=/; HttpOnly' }
      )
    );

    const request = new Request('http://localhost/api/client/auth/sign-in/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        email: 'alice@example.com',
        password: 'Password123!'
      })
    });

    const response = await signInEmailPost(request);
    expect(response.status).toBe(200);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://customer-auth.test/auth/sign-in/email');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.origin).toBe('http://localhost');
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'alice@example.com',
      password: 'Password123!'
    });
  });

  it('forwards google sign-in request contract', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({
        authUrl: 'https://accounts.google.com/o/oauth2/auth?state=abc123'
      })
    );

    const request = new Request('http://localhost/api/client/auth/sign-in/google?redirectUri=http%3A%2F%2Flocalhost%3A3000%2Fcb', {
      method: 'GET'
    });

    const response = await googleSignInGet(request);
    expect(response.status).toBe(200);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'http://customer-auth.test/auth/sign-in/google?redirectUri=http%3A%2F%2Flocalhost%3A3000%2Fcb'
    );
    expect(init.method).toBe('GET');
    const headers = init.headers as Record<string, string>;
    expect(headers.origin).toBe('http://localhost');
  });

  it('forwards session exchange request contract including cookie passthrough', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse(
        {
          token: 'jwt.value',
          customerId: 'cust_3',
          sessionId: 'sess_1',
          expiresAt: '2026-02-20T10:00:00.000Z'
        },
        200,
        { 'set-cookie': 'session=rotated; Path=/; HttpOnly' }
      )
    );

    const request = new Request('http://localhost/api/client/auth/session/exchange', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=abc'
      },
      body: '{}'
    });

    const response = await sessionExchangePost(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('session=rotated');

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://customer-auth.test/auth/session/exchange');
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers.cookie).toBe('session=abc');
    expect(headers.origin).toBe('http://localhost');
    expect(JSON.parse(init.body as string)).toEqual({});
  });

  it('surfaces non-json upstream auth errors instead of generic parse failures', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('Upstream exploded', {
        status: 500,
        headers: {
          'content-type': 'text/plain'
        }
      })
    );

    const request = new Request('http://localhost/api/client/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        fullName: 'Alice Customer',
        countryCode: 'ET',
        email: 'alice@example.com',
        password: 'Password123!'
      })
    });

    const response = await signUpEmailPost(request);
    const payload = (await response.json()) as { error?: { message?: string } };

    expect(response.status).toBe(500);
    expect(payload.error?.message).toBe('Upstream exploded');
  });

  it('forwards sign-out request contract with cookie and idempotency', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse(
        { ok: true },
        200,
        { 'set-cookie': 'session=; Path=/; Max-Age=0; HttpOnly' }
      )
    );

    const request = new Request('http://localhost/api/client/auth/sign-out', {
      method: 'POST',
      headers: {
        cookie: 'session=abc'
      }
    });

    const response = await signOutPost(request);
    const payload = (await response.json()) as { ok?: boolean };

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(payload.ok).toBe(true);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://customer-auth.test/auth/sign-out');
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers.cookie).toBe('session=abc');
    expect(headers.origin).toBe('http://localhost');
    expect(headers['idempotency-key']).toMatch(/^web-signout:/);
  });
});
