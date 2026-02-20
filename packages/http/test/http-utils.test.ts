import { describe, expect, it, vi } from 'vitest';
import { registerCors } from '../src/cors.js';
import { errorEnvelope } from '../src/errors.js';
import { withIdempotency } from '../src/idempotency.js';

describe('withIdempotency', () => {
  function createDbMock() {
    const rows = new Map<string, { request_hash: string; response_status: number; response_body: unknown }>();

    const db = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('insert into idempotency_record') && sql.includes('returning key')) {
          const key = String(params?.[0]);
          if (rows.has(key)) {
            return { rows: [], rowCount: 0 };
          }

          rows.set(key, {
            request_hash: String(params?.[1]),
            response_status: -1,
            response_body: {}
          });
          return { rows: [{ key }], rowCount: 1 };
        }

        if (sql.includes('select request_hash, response_status, response_body')) {
          const key = String(params?.[0]);
          const found = rows.get(key);
          return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
        }

        if (sql.includes('update idempotency_record')) {
          const key = String(params?.[0]);
          const found = rows.get(key);
          if (!found) {
            return { rows: [], rowCount: 0 };
          }

          found.response_status = Number(params?.[1]);
          try {
            found.response_body = JSON.parse(String(params?.[2]));
          } catch {
            found.response_body = params?.[2];
          }
          rows.set(key, found);
          return { rows: [], rowCount: 1 };
        }

        if (sql.includes('delete from idempotency_record')) {
          const key = String(params?.[0]);
          rows.delete(key);
          return { rows: [], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      })
    };

    return { db, rows };
  }

  it('returns prior response when same key+payload is replayed', async () => {
    const { db } = createDbMock();

    const execute = vi.fn(async () => ({ status: 201, body: { ok: true } }));

    const first = await withIdempotency({
      db,
      scope: 'test',
      idempotencyKey: 'k1',
      requestId: 'r1',
      requestPayload: { a: 1 },
      execute
    });

    const second = await withIdempotency({
      db,
      scope: 'test',
      idempotencyKey: 'k1',
      requestId: 'r2',
      requestPayload: { a: 1 },
      execute
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('returns conflict when same key is reused with different payload', async () => {
    const { db } = createDbMock();

    await withIdempotency({
      db,
      scope: 'test',
      idempotencyKey: 'k1',
      requestId: 'r1',
      requestPayload: { a: 1 },
      execute: async () => ({ status: 201, body: { ok: true } })
    });

    const conflict = await withIdempotency({
      db,
      scope: 'test',
      idempotencyKey: 'k1',
      requestId: 'r2',
      requestPayload: { a: 2 },
      execute: async () => ({ status: 201, body: { ok: true } })
    });

    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({
      error: {
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'Idempotency key reused with a different payload.',
        requestId: 'r2'
      }
    });
  });

  it('serializes concurrent same-key requests so execute runs once', async () => {
    const { db } = createDbMock();
    const execute = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { status: 201, body: { ok: true } };
    });

    const [first, second] = await Promise.all([
      withIdempotency({
        db,
        scope: 'test',
        idempotencyKey: 'k-concurrent',
        requestId: 'r1',
        requestPayload: { a: 1 },
        execute
      }),
      withIdempotency({
        db,
        scope: 'test',
        idempotencyKey: 'k-concurrent',
        requestId: 'r2',
        requestPayload: { a: 1 },
        execute
      })
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe('errorEnvelope', () => {
  it('includes request id and details payload', () => {
    const envelope = errorEnvelope({ id: 'req_1' } as never, 'INVALID_PAYLOAD', 'Invalid payload.', { field: 'email' });
    expect(envelope).toEqual({
      error: {
        code: 'INVALID_PAYLOAD',
        message: 'Invalid payload.',
        requestId: 'req_1',
        details: { field: 'email' }
      }
    });
  });
});

describe('registerCors fallback', () => {
  it('handles preflight requests when plugin import fails', async () => {
    const hooks: Array<(request: unknown, reply: unknown) => Promise<unknown>> = [];
    const app = {
      register: vi.fn(async () => {
        throw new Error('plugin unavailable');
      }),
      addHook: vi.fn((name: string, hook: (request: unknown, reply: unknown) => Promise<unknown>) => {
        if (name === 'onRequest') {
          hooks.push(hook);
        }
      })
    } as never;

    await registerCors(app, {
      allowedOrigins: ['https://web.cryptopay.test'],
      allowedMethods: ['GET', 'POST'],
      allowedHeaders: ['content-type', 'authorization'],
      exposedHeaders: ['x-request-id'],
      credentials: true,
      maxAge: 60
    });

    expect(hooks).toHaveLength(1);
    const onRequestHook = hooks[0];
    expect(onRequestHook).toBeDefined();

    const headers: Record<string, string> = {};
    const reply = {
      header: vi.fn((key: string, value: string) => {
        headers[key] = value;
        return reply;
      }),
      status: vi.fn(() => reply),
      send: vi.fn(() => undefined)
    };

    await onRequestHook!(
      {
        headers: { origin: 'https://web.cryptopay.test' },
        method: 'OPTIONS'
      },
      reply
    );

    expect(reply.status).toHaveBeenCalledWith(204);
    expect(reply.send).toHaveBeenCalled();
    expect(headers['access-control-allow-origin']).toBe('https://web.cryptopay.test');
    expect(headers['access-control-allow-methods']).toBe('GET, POST');
    expect(headers['access-control-allow-headers']).toBe('content-type, authorization');
    expect(headers['access-control-max-age']).toBe('60');
  });
});
