interface ForwardParams {
  path: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  authorization?: string;
  idempotencyKey?: string;
  useOpsToken?: boolean;
}

function coreApiBaseUrl(): string {
  return process.env.WEB_CORE_API_URL ?? 'http://localhost:3001';
}

function opsReadToken(): string {
  return process.env.WEB_OPS_READ_TOKEN ?? '';
}

export async function forwardCoreApi(params: ForwardParams): Promise<Response> {
  const headers: Record<string, string> = {
    'content-type': 'application/json'
  };

  if (params.authorization) {
    headers.authorization = params.authorization;
  }

  if (params.idempotencyKey) {
    headers['idempotency-key'] = params.idempotencyKey;
  }

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
