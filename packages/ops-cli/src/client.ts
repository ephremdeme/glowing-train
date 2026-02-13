import type { CliOptions } from './types.js';

export async function requestJson(params: {
  options: CliOptions;
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${params.options.token}`,
    'x-ops-actor': params.options.actor,
    'x-ops-command': params.options.commandText
  };

  if (params.body) {
    headers['content-type'] = 'application/json';
    headers['idempotency-key'] = `ops-cli:${Date.now()}:${Math.random().toString(16).slice(2)}`;

    const reason = params.body.reason;
    if (typeof reason === 'string' && reason.trim().length > 0) {
      headers['x-ops-reason'] = reason;
    }
  }

  const init: RequestInit = {
    method: params.method,
    headers
  };

  if (params.body) {
    init.body = JSON.stringify(params.body);
  }

  const response = await fetch(`${params.options.baseUrl}${params.path}`, init);

  const text = await response.text();
  let parsed: unknown;

  try {
    parsed = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    parsed = {
      raw: text
    };
  }

  if (!response.ok) {
    const message = typeof parsed === 'object' && parsed !== null ? JSON.stringify(parsed) : String(parsed);
    throw new Error(`HTTP ${response.status}: ${message}`);
  }

  return parsed;
}
