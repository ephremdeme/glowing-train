import { createHs256Jwt } from '@cryptopay/auth';
import { query, withTransaction } from '@cryptopay/db';
import { log } from '@cryptopay/observability';

const PROCESSING_RECLAIM_TIMEOUT_MS = 60_000;

interface ClaimedOutboxEvent {
  eventId: string;
  payload: unknown;
  attemptCount: number;
}

interface PayoutInitPayload {
  transferId: string;
  method: 'bank';
  recipientAccountRef: string;
  amountEtb: number;
  idempotencyKey: string;
}

function parseOutboxPayload(value: unknown): PayoutInitPayload | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Partial<PayoutInitPayload>;
  if (payload.method !== 'bank') return null;
  if (typeof payload.transferId !== 'string' || payload.transferId.length < 1) return null;
  if (typeof payload.recipientAccountRef !== 'string' || payload.recipientAccountRef.length < 3) return null;
  if (typeof payload.amountEtb !== 'number' || !Number.isFinite(payload.amountEtb) || payload.amountEtb <= 0) return null;
  if (typeof payload.idempotencyKey !== 'string' || payload.idempotencyKey.length < 8) return null;
  return payload as PayoutInitPayload;
}

function parseOutboxRowPayload(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function buildServiceToken(): string {
  const now = Math.floor(Date.now() / 1000);
  return createHs256Jwt(
    {
      sub: 'reconciliation-worker',
      iss: process.env.AUTH_JWT_ISSUER ?? 'cryptopay-internal',
      aud: process.env.AUTH_JWT_AUDIENCE ?? 'cryptopay-services',
      iat: now,
      exp: now + 60,
      tokenType: 'service'
    },
    process.env.AUTH_JWT_SECRET ?? 'dev-jwt-secret-change-me'
  );
}

function backoffMs(attemptCount: number, baseMs: number): number {
  const cappedExponent = Math.max(0, Math.min(attemptCount - 1, 6));
  const jitter = Math.floor(Math.random() * Math.max(250, Math.floor(baseMs / 2)));
  return baseMs * Math.pow(2, cappedExponent) + jitter;
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

export class PayoutOutboxDispatcher {
  constructor(
    private readonly config: {
      payoutOrchestratorUrl: string;
      batchSize: number;
      maxAttempts: number;
      retryBaseMs: number;
    }
  ) {}

  async runBatch(): Promise<{ processed: number; retried: number; deadLettered: number }> {
    let processed = 0;
    let retried = 0;
    let deadLettered = 0;

    for (let i = 0; i < this.config.batchSize; i += 1) {
      const claimed = await this.claimNext();
      if (!claimed) break;

      const outcome = await this.processClaimed(claimed);
      if (outcome === 'processed') processed += 1;
      if (outcome === 'retried') retried += 1;
      if (outcome === 'dead_letter') deadLettered += 1;
    }

    return { processed, retried, deadLettered };
  }

  private async claimNext(): Promise<ClaimedOutboxEvent | null> {
    return withTransaction(async (tx) => {
      const rows = await tx.query<{
        event_id: string;
        payload: unknown;
        attempt_count: number;
      }>(
        `
        with next_event as (
          select event_id
          from outbox_event
          where topic = 'transfer.funding_confirmed'
            and (
              (status = 'pending' and next_attempt_at <= now())
              or (status = 'processing' and updated_at <= now() - (${PROCESSING_RECLAIM_TIMEOUT_MS} * interval '1 millisecond'))
            )
          order by next_attempt_at asc, created_at asc
          limit 1
          for update skip locked
        )
        update outbox_event oe
        set status = 'processing',
            attempt_count = oe.attempt_count + 1,
            updated_at = now()
        from next_event
        where oe.event_id = next_event.event_id
        returning oe.event_id, oe.payload, oe.attempt_count
        `
      );

      const row = rows.rows[0];
      if (!row) return null;
      return {
        eventId: row.event_id,
        payload: parseOutboxRowPayload(row.payload),
        attemptCount: row.attempt_count
      };
    });
  }

  private async processClaimed(claimed: ClaimedOutboxEvent): Promise<'processed' | 'retried' | 'dead_letter'> {
    const payload = parseOutboxPayload(claimed.payload);
    if (!payload) {
      await this.markDeadLetter(claimed.eventId, 'Invalid outbox payout payload.');
      return 'dead_letter';
    }

    try {
      const response = await fetch(`${this.config.payoutOrchestratorUrl}/internal/v1/payouts/initiate`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${buildServiceToken()}`,
          'content-type': 'application/json',
          'idempotency-key': payload.idempotencyKey
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        await this.markProcessed(claimed.eventId);
        return 'processed';
      }

      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      const message = body.error?.message ?? `payout-orchestrator returned ${response.status}`;
      if (isRetryableHttpStatus(response.status) && claimed.attemptCount < this.config.maxAttempts) {
        await this.markRetry(claimed.eventId, message, claimed.attemptCount);
        return 'retried';
      }

      await this.markDeadLetter(claimed.eventId, message);
      return 'dead_letter';
    } catch (error) {
      const message = (error as Error).message;
      if (claimed.attemptCount < this.config.maxAttempts) {
        await this.markRetry(claimed.eventId, message, claimed.attemptCount);
        return 'retried';
      }
      await this.markDeadLetter(claimed.eventId, message);
      return 'dead_letter';
    }
  }

  private async markProcessed(eventId: string): Promise<void> {
    await query(
      `
      update outbox_event
      set status = 'processed',
          processed_at = now(),
          updated_at = now(),
          last_error = null
      where event_id = $1
      `,
      [eventId]
    );
  }

  private async markRetry(eventId: string, errorMessage: string, attemptCount: number): Promise<void> {
    const delayMs = backoffMs(attemptCount, this.config.retryBaseMs);
    await query(
      `
      update outbox_event
      set status = 'pending',
          next_attempt_at = now() + ($2 * interval '1 millisecond'),
          updated_at = now(),
          last_error = $3
      where event_id = $1
      `,
      [eventId, delayMs, errorMessage.slice(0, 500)]
    );
  }

  private async markDeadLetter(eventId: string, errorMessage: string): Promise<void> {
    await query(
      `
      update outbox_event
      set status = 'dead_letter',
          updated_at = now(),
          last_error = $2
      where event_id = $1
      `,
      [eventId, errorMessage.slice(0, 500)]
    );

    log('error', 'payout outbox event moved to dead-letter', {
      eventId,
      topic: 'transfer.funding_confirmed',
      error: errorMessage
    });
  }
}
