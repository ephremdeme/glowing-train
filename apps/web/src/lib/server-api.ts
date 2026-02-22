interface ForwardParams {
  path: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  authorization?: string;
  idempotencyKey?: string;
  cookie?: string;
  origin?: string;
  useOpsToken?: boolean;
}

function coreApiBaseUrl(): string {
  return process.env.WEB_CORE_API_URL ?? 'http://localhost:3001';
}

function customerAuthBaseUrl(): string {
  return process.env.WEB_CUSTOMER_AUTH_URL ?? 'http://localhost:3005';
}

function opsReadToken(): string {
  return process.env.WEB_OPS_READ_TOKEN ?? '';
}

function buildHeaders(params: ForwardParams): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json'
  };

  if (params.authorization) {
    headers.authorization = params.authorization;
  }

  if (params.idempotencyKey) {
    headers['idempotency-key'] = params.idempotencyKey;
  }

  if (params.cookie) {
    headers.cookie = params.cookie;
  }

  if (params.origin) {
    headers.origin = params.origin;
  }

  return headers;
}

export async function forwardCoreApi(params: ForwardParams): Promise<Response> {
  const headers = buildHeaders(params);

  if (params.useOpsToken) {
    const token = opsReadToken();
    if (!token) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'MISSING_OPS_TOKEN',
            message: 'WEB_OPS_READ_TOKEN is required for transfer status polling.'
          }
        }),
        { status: 503, headers: { 'content-type': 'application/json' } }
      );
    }
    headers.authorization = `Bearer ${token}`;
  }

  return fetch(`${coreApiBaseUrl()}${params.path}`, {
    method: params.method,
    headers,
    body: params.body ? JSON.stringify(params.body) : null,
    cache: 'no-store'
  });
}

export async function forwardCustomerAuth(params: ForwardParams): Promise<Response> {
  const headers = buildHeaders(params);

  return fetch(`${customerAuthBaseUrl()}${params.path}`, {
    method: params.method,
    headers,
    body: params.body ? JSON.stringify(params.body) : null,
    cache: 'no-store'
  });
}

export async function parseUpstreamPayload(upstream: Response): Promise<unknown> {
  const contentType = upstream.headers.get('content-type')?.toLowerCase() ?? '';

  if (contentType.includes('application/json')) {
    try {
      return await upstream.json();
    } catch {
      // Fall through to text parser so callers get a useful error payload.
    }
  }

  const raw = await upstream.text().catch(() => '');
  const text = raw.trim();

  if (text.length === 0) {
    return upstream.ok ? {} : { error: { message: 'Upstream returned an empty error response.' } };
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Upstream returned plain text or HTML.
  }

  if (!upstream.ok) {
    if (contentType.includes('text/html')) {
      return {
        error: {
          message: 'Upstream returned an HTML error response.',
          details: text.slice(0, 240)
        }
      };
    }

    return { error: { message: text } };
  }

  return { message: text };
}
