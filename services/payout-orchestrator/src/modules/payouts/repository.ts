import { getPool } from '@cryptopay/db';
import { randomUUID } from 'node:crypto';
import type {
  IdempotencySnapshot,
  InitiatePayoutInput,
  PayoutInstructionRecord,
  PayoutResult,
  TransferStatusSnapshot
} from './types.js';

type Pool = ReturnType<typeof getPool>;
type Row = Record<string, unknown>;

function mapInstruction(row: Row): PayoutInstructionRecord {
  return {
    payoutId: row.payout_id as string,
    transferId: row.transfer_id as string,
    method: row.method as PayoutInstructionRecord['method'],
    recipientAccountRef: row.recipient_account_ref as string,
    amountEtb: Number(row.amount_etb),
    status: row.status as PayoutInstructionRecord['status'],
    providerReference: (row.provider_reference as string | null) ?? null,
    attemptCount: Number(row.attempt_count),
    lastError: (row.last_error as string | null) ?? null
  };
}

export class PayoutRepository {
  constructor(private readonly pool: Pool = getPool()) {}

  async findTransferStatus(transferId: string): Promise<TransferStatusSnapshot | null> {
    const result = await this.pool.query('select transfer_id, status from transfers where transfer_id = $1', [transferId]);
    const row = result.rows[0] as Row | undefined;
    if (!row) {
      return null;
    }

    return {
      transferId: row.transfer_id as string,
      status: row.status as string
    };
  }

  async getOrCreateInstruction(input: InitiatePayoutInput): Promise<PayoutInstructionRecord> {
    const existing = await this.pool.query('select * from payout_instruction where transfer_id = $1 limit 1', [input.transferId]);
    const existingRow = existing.rows[0] as Row | undefined;
    if (existingRow) {
      return mapInstruction(existingRow);
    }

    const payoutId = `pay_${randomUUID()}`;

    const inserted = await this.pool.query(
      `
      insert into payout_instruction (
        payout_id,
        transfer_id,
        method,
        recipient_account_ref,
        amount_etb,
        status,
        attempt_count
      ) values ($1,$2,$3,$4,$5,'PENDING',0)
      returning *
      `,
      [payoutId, input.transferId, input.method, input.recipientAccountRef, input.amountEtb]
    );

    return mapInstruction(inserted.rows[0] as Row);
  }

  async findIdempotency(key: string): Promise<IdempotencySnapshot | null> {
    const result = await this.pool.query('select key, request_hash, response_body from idempotency_record where key = $1 limit 1', [key]);
    const row = result.rows[0] as Row | undefined;
    if (!row) {
      return null;
    }

    return {
      key: row.key as string,
      requestHash: row.request_hash as string,
      responseBody: row.response_body as PayoutResult
    };
  }

  async markInitiated(params: {
    instruction: PayoutInstructionRecord;
    providerReference: string;
    attempts: number;
  }): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('begin');

      await client.query(
        `
        update payout_instruction
        set status = 'PAYOUT_INITIATED',
            provider_reference = $2,
            attempt_count = $3,
            last_error = null,
            updated_at = now()
        where payout_id = $1
        `,
        [params.instruction.payoutId, params.providerReference, params.attempts]
      );

      await client.query(
        "update transfers set status = 'PAYOUT_INITIATED' where transfer_id = $1 and status = 'FUNDING_CONFIRMED'",
        [params.instruction.transferId]
      );

      await client.query(
        `
        insert into transfer_transition (transfer_id, from_state, to_state, metadata)
        values ($1, $2, $3, $4)
        `,
        [
          params.instruction.transferId,
          'FUNDING_CONFIRMED',
          'PAYOUT_INITIATED',
          {
            payoutId: params.instruction.payoutId,
            providerReference: params.providerReference,
            attempts: params.attempts
          }
        ]
      );

      await client.query(
        `
        insert into payout_status_event (payout_id, transfer_id, from_status, to_status, metadata)
        values ($1, $2, $3, $4, $5)
        `,
        [
          params.instruction.payoutId,
          params.instruction.transferId,
          params.instruction.status,
          'PAYOUT_INITIATED',
          {
            providerReference: params.providerReference,
            attempts: params.attempts
          }
        ]
      );

      await client.query(
        `
        insert into audit_log (actor_type, actor_id, action, entity_type, entity_id, reason, metadata)
        values ($1,$2,$3,$4,$5,$6,$7)
        `,
        [
          'system',
          'payout-orchestrator',
          'payout_initiated',
          'transfer',
          params.instruction.transferId,
          'Payout partner accepted payout request',
          {
            payoutId: params.instruction.payoutId,
            providerReference: params.providerReference,
            attempts: params.attempts
          }
        ]
      );

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async markReviewRequired(params: {
    instruction: PayoutInstructionRecord;
    attempts: number;
    errorMessage: string;
  }): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('begin');

      await client.query(
        `
        update payout_instruction
        set status = 'PAYOUT_REVIEW_REQUIRED',
            attempt_count = $2,
            last_error = $3,
            updated_at = now()
        where payout_id = $1
        `,
        [params.instruction.payoutId, params.attempts, params.errorMessage]
      );

      await client.query(
        "update transfers set status = 'PAYOUT_REVIEW_REQUIRED' where transfer_id = $1 and status in ('FUNDING_CONFIRMED', 'PAYOUT_INITIATED')",
        [params.instruction.transferId]
      );

      await client.query(
        `
        insert into transfer_transition (transfer_id, from_state, to_state, metadata)
        values ($1, $2, $3, $4)
        `,
        [
          params.instruction.transferId,
          'FUNDING_CONFIRMED',
          'PAYOUT_REVIEW_REQUIRED',
          {
            payoutId: params.instruction.payoutId,
            attempts: params.attempts,
            errorMessage: params.errorMessage
          }
        ]
      );

      await client.query(
        `
        insert into payout_status_event (payout_id, transfer_id, from_status, to_status, metadata)
        values ($1, $2, $3, $4, $5)
        `,
        [
          params.instruction.payoutId,
          params.instruction.transferId,
          params.instruction.status,
          'PAYOUT_REVIEW_REQUIRED',
          {
            attempts: params.attempts,
            errorMessage: params.errorMessage
          }
        ]
      );

      await client.query(
        `
        insert into audit_log (actor_type, actor_id, action, entity_type, entity_id, reason, metadata)
        values ($1,$2,$3,$4,$5,$6,$7)
        `,
        [
          'system',
          'payout-orchestrator',
          'payout_review_required',
          'transfer',
          params.instruction.transferId,
          'Payout partner call failed after retries',
          {
            payoutId: params.instruction.payoutId,
            attempts: params.attempts,
            errorMessage: params.errorMessage
          }
        ]
      );

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async saveIdempotency(params: { key: string; requestHash: string; result: PayoutResult; now: Date }): Promise<void> {
    const expiresAt = new Date(params.now.getTime() + 24 * 3600 * 1000);

    await this.pool.query(
      `
      insert into idempotency_record (key, request_hash, response_status, response_body, expires_at)
      values ($1, $2, 202, $3, $4)
      on conflict (key) do nothing
      `,
      [params.key, params.requestHash, params.result, expiresAt]
    );
  }
}
