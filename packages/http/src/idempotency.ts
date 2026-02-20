import { createHash } from 'node:crypto';

export type IdempotentResponse = {
  status: number;
  body: unknown;
};

export interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>;
}

function hashPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export async function withIdempotency(params: {
  db: Queryable;
  scope: string;
  idempotencyKey: string;
  requestId: string;
  requestPayload: unknown;
  execute: () => Promise<IdempotentResponse>;
  ttlMs?: number;
  inFlightWaitMs?: number;
  pollIntervalMs?: number;
}): Promise<IdempotentResponse> {
  const key = `${params.scope}:${params.idempotencyKey}`;
  const requestHash = hashPayload(params.requestPayload);
  const expiresAt = new Date(Date.now() + (params.ttlMs ?? 24 * 3600 * 1000));
  const inFlightWaitMs = params.inFlightWaitMs ?? 5_000;
  const pollIntervalMs = params.pollIntervalMs ?? 50;

  const reservation = await params.db.query(
    `
    insert into idempotency_record (key, request_hash, response_status, response_body, expires_at)
    values ($1, $2, -1, '{}'::jsonb, $3)
    on conflict (key) do nothing
    returning key
    `,
    [key, requestHash, expiresAt]
  );

  if ((reservation.rowCount ?? reservation.rows.length) > 0) {
    try {
      const response = await params.execute();

      await params.db.query(
        `
        update idempotency_record
        set response_status = $2, response_body = $3::jsonb, expires_at = $4
        where key = $1 and request_hash = $5
        `,
        [key, response.status, JSON.stringify(response.body), expiresAt, requestHash]
      );

      return response;
    } catch (error) {
      await params.db.query('delete from idempotency_record where key = $1 and request_hash = $2 and response_status = -1', [
        key,
        requestHash
      ]);
      throw error;
    }
  }

  const waitUntil = Date.now() + inFlightWaitMs;
  // Another worker owns this idempotency key. Wait for completion or return deterministic conflict.
  while (true) {
    const existing = await params.db.query(
      'select request_hash, response_status, response_body from idempotency_record where key = $1',
      [key]
    );
    const row = existing.rows[0] as
      | {
          request_hash: string;
          response_status: number;
          response_body: unknown;
        }
      | undefined;

    if (!row) {
      return {
        status: 409,
        body: {
          error: {
            code: 'IDEMPOTENCY_IN_PROGRESS',
            message: 'Idempotent request is still processing. Retry shortly.',
            requestId: params.requestId
          }
        }
      };
    }

    if (row.request_hash !== requestHash) {
      return {
        status: 409,
        body: {
          error: {
            code: 'IDEMPOTENCY_CONFLICT',
            message: 'Idempotency key reused with a different payload.',
            requestId: params.requestId
          }
        }
      };
    }

    if (row.response_status !== -1) {
      return {
        status: row.response_status,
        body: row.response_body
      };
    }

    if (Date.now() >= waitUntil) {
      return {
        status: 409,
        body: {
          error: {
            code: 'IDEMPOTENCY_IN_PROGRESS',
            message: 'Idempotent request is still processing. Retry shortly.',
            requestId: params.requestId
          }
        }
      };
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}
