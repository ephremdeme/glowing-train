import { query, withTransaction } from '@cryptopay/db';

type SweepClaimRow = {
  transfer_id: string;
  token: 'USDC' | 'USDT';
  deposit_address: string;
  attempt_count: number;
};

function truncateError(input: string): string {
  return input.slice(0, 500);
}

export type SweepClaim = {
  transferId: string;
  token: 'USDC' | 'USDT';
  depositAddress: string;
  attemptCount: number;
};

export class SettlementSweeperRepository {
  constructor(private readonly reclaimTimeoutMs: number) {}

  async claimNext(): Promise<SweepClaim | null> {
    return withTransaction(async (tx) => {
      const result = await tx.query<SweepClaimRow>(
        `
        with next_settlement as (
          select transfer_id
          from settlement_record
          where chain = 'base'
            and (
              (status = 'pending_sweep' and next_attempt_at <= now())
              or (status = 'sweeping' and updated_at <= now() - ($1 * interval '1 millisecond'))
            )
          order by next_attempt_at asc, created_at asc
          limit 1
          for update skip locked
        )
        update settlement_record sr
        set status = 'sweeping',
            attempt_count = sr.attempt_count + 1,
            updated_at = now(),
            last_error = null
        from next_settlement
        where sr.transfer_id = next_settlement.transfer_id
        returning sr.transfer_id, sr.token, sr.deposit_address, sr.attempt_count
        `,
        [this.reclaimTimeoutMs]
      );

      const row = result.rows[0];
      if (!row) return null;

      return {
        transferId: row.transfer_id,
        token: row.token,
        depositAddress: row.deposit_address,
        attemptCount: row.attempt_count
      };
    });
  }

  async markSwept(params: { transferId: string; txHash: string; attemptCount: number }): Promise<void> {
    await query(
      `
      update settlement_record
      set status = 'swept',
          last_sweep_tx_hash = $2,
          swept_at = now(),
          updated_at = now(),
          last_error = null
      where transfer_id = $1
      `,
      [params.transferId, params.txHash]
    );

    await this.appendAudit({
      action: 'base_sweep_succeeded',
      transferId: params.transferId,
      reason: 'Base settlement sweep completed.',
      metadata: {
        txHash: params.txHash,
        attemptCount: params.attemptCount
      }
    });
  }

  async markRetry(params: {
    transferId: string;
    attemptCount: number;
    retryDelayMs: number;
    errorMessage: string;
  }): Promise<void> {
    const errorMessage = truncateError(params.errorMessage);

    await query(
      `
      update settlement_record
      set status = 'pending_sweep',
          next_attempt_at = now() + ($2 * interval '1 millisecond'),
          updated_at = now(),
          last_error = $3
      where transfer_id = $1
      `,
      [params.transferId, params.retryDelayMs, errorMessage]
    );

    await this.appendAudit({
      action: 'base_sweep_retry_scheduled',
      transferId: params.transferId,
      reason: 'Base settlement sweep failed and will be retried.',
      metadata: {
        attemptCount: params.attemptCount,
        retryDelayMs: params.retryDelayMs,
        error: errorMessage
      }
    });
  }

  async markReviewRequired(params: { transferId: string; attemptCount: number; errorMessage: string }): Promise<void> {
    const errorMessage = truncateError(params.errorMessage);

    await query(
      `
      update settlement_record
      set status = 'review_required',
          updated_at = now(),
          last_error = $2
      where transfer_id = $1
      `,
      [params.transferId, errorMessage]
    );

    await this.appendAudit({
      action: 'base_sweep_review_required',
      transferId: params.transferId,
      reason: 'Base settlement sweep exhausted retries.',
      metadata: {
        attemptCount: params.attemptCount,
        error: errorMessage
      }
    });
  }

  private async appendAudit(params: {
    action: string;
    transferId: string;
    reason: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await query(
      `
      insert into audit_log (actor_type, actor_id, action, entity_type, entity_id, reason, metadata)
      values ($1, $2, $3, $4, $5, $6, $7)
      `,
      ['system', 'base-sweeper-worker', params.action, 'settlement_record', params.transferId, params.reason, params.metadata]
    );
  }
}
