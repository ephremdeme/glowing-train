import { query, withTransaction } from '@cryptopay/db';
import type { FundingConfirmedInput, FundingResult, RouteMatch } from './types.js';

type Row = Record<string, unknown>;

interface FundingAmountPolicy {
  toleranceUsd: number;
  overpayAutoAdjustEnabled: boolean;
  overpayMaxAutoUsd: number;
}

function parsePositiveNumber(input: string | undefined, fallback: number): number {
  const parsed = Number(input ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseBoolean(input: string | undefined, fallback: boolean): boolean {
  const value = (input ?? '').trim().toLowerCase();
  if (!value) {
    return fallback;
  }
  if (['1', 'true', 'yes', 'on'].includes(value)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(value)) {
    return false;
  }
  return fallback;
}

function readFundingAmountPolicy(): FundingAmountPolicy {
  return {
    toleranceUsd: parsePositiveNumber(process.env.FUNDING_AMOUNT_TOLERANCE_USD, 0.01),
    overpayAutoAdjustEnabled: parseBoolean(process.env.FUNDING_OVERPAY_AUTO_ADJUST_ENABLED, true),
    overpayMaxAutoUsd: parsePositiveNumber(process.env.FUNDING_OVERPAY_MAX_AUTO_USD, 2000)
  };
}

function roundUsd(value: number): number {
  return Number(value.toFixed(2));
}

export class FundingConfirmationRepository {
  async findTransferMatchById(transferId: string): Promise<RouteMatch | null> {
    const result = await query('select transfer_id, status from transfers where transfer_id = $1 limit 1', [transferId]);

    const row = result.rows[0] as Row | undefined;
    if (!row) {
      return null;
    }

    return {
      transferId: row.transfer_id as string,
      status: row.status as string
    };
  }

  async findRouteMatch(params: { chain: string; token: string; depositAddress: string }): Promise<RouteMatch | null> {
    const result = await query(
      `
      select t.transfer_id, t.status
      from deposit_routes dr
      join transfers t on t.transfer_id = dr.transfer_id
      where dr.chain = $1
        and dr.token = $2
        and dr.deposit_address = $3
        and coalesce(dr.route_kind, 'address_route') = 'address_route'
        and dr.status = 'active'
      limit 1
      `,
      [params.chain, params.token, params.depositAddress]
    );

    const row = result.rows[0] as Row | undefined;
    if (!row) {
      return null;
    }

    return {
      transferId: row.transfer_id as string,
      status: row.status as string
    };
  }

  async applyFundingConfirmation(params: { match: RouteMatch; event: FundingConfirmedInput }): Promise<FundingResult> {
    return withTransaction(async (tx) => {
      const transferState = await tx.query<{
        status: string;
        send_amount_usd: string;
      }>('select status, send_amount_usd::text from transfers where transfer_id = $1 for update', [params.match.transferId]);
      const status = transferState.rows[0]?.status as string | undefined;
      const expectedAmountUsd = Number(transferState.rows[0]?.send_amount_usd ?? 0);

      if (!status) {
        return { status: 'route_not_found' };
      }

      if (status === 'FUNDING_CONFIRMED') {
        return { status: 'duplicate', transferId: params.match.transferId };
      }

      if (status !== 'AWAITING_FUNDING') {
        return { status: 'invalid_state', transferId: params.match.transferId };
      }

      const policy = readFundingAmountPolicy();
      const receivedAmountUsdRaw = roundUsd(params.event.amountUsd);
      const tolerance = policy.toleranceUsd;

      if (receivedAmountUsdRaw > policy.overpayMaxAutoUsd + tolerance) {
        await tx.query(
          `
          update funding_submission_attempt
          set status = 'failed',
              updated_at = now()
          where transfer_id = $1
            and status = 'submitted'
          `,
          [params.match.transferId]
        );

        await tx.query(
          `
          insert into transfer_transition (transfer_id, from_state, to_state, metadata)
          values ($1, $2, $3, $4)
          `,
          [
            params.match.transferId,
            'AWAITING_FUNDING',
            'AWAITING_FUNDING',
            {
              chain: params.event.chain,
              token: params.event.token,
              txHash: params.event.txHash,
              eventId: params.event.eventId,
              amountDecision: 'over_limit_rejected',
              expectedAmountUsd,
              receivedAmountUsd: receivedAmountUsdRaw
            }
          ]
        );

        return {
          status: 'amount_over_limit',
          transferId: params.match.transferId,
          amountDecision: 'over_limit_rejected',
          expectedAmountUsd,
          receivedAmountUsd: receivedAmountUsdRaw
        };
      }

      if (receivedAmountUsdRaw+tolerance < expectedAmountUsd) {
        await tx.query(
          `
          update funding_submission_attempt
          set status = 'failed',
              updated_at = now()
          where transfer_id = $1
            and status = 'submitted'
          `,
          [params.match.transferId]
        );

        await tx.query(
          `
          insert into transfer_transition (transfer_id, from_state, to_state, metadata)
          values ($1, $2, $3, $4)
          `,
          [
            params.match.transferId,
            'AWAITING_FUNDING',
            'AWAITING_FUNDING',
            {
              chain: params.event.chain,
              token: params.event.token,
              txHash: params.event.txHash,
              eventId: params.event.eventId,
              amountDecision: 'underpay_rejected',
              expectedAmountUsd,
              receivedAmountUsd: receivedAmountUsdRaw
            }
          ]
        );

        return {
          status: 'amount_underpaid',
          transferId: params.match.transferId,
          amountDecision: 'underpay_rejected',
          expectedAmountUsd,
          receivedAmountUsd: receivedAmountUsdRaw
        };
      }

      let adjustedSendAmountUsd: number | undefined;
      let amountDecision: FundingResult['amountDecision'] = 'exact';
      const delta = receivedAmountUsdRaw - expectedAmountUsd;
      if (Math.abs(delta) <= tolerance && Math.abs(delta) > 0) {
        amountDecision = 'tolerance';
      }

      if (receivedAmountUsdRaw > expectedAmountUsd + tolerance) {
        if (!policy.overpayAutoAdjustEnabled) {
          await tx.query(
            `
            update funding_submission_attempt
            set status = 'failed',
                updated_at = now()
            where transfer_id = $1
              and status = 'submitted'
            `,
            [params.match.transferId]
          );

          await tx.query(
            `
            insert into transfer_transition (transfer_id, from_state, to_state, metadata)
            values ($1, $2, $3, $4)
            `,
            [
              params.match.transferId,
              'AWAITING_FUNDING',
              'AWAITING_FUNDING',
              {
                chain: params.event.chain,
                token: params.event.token,
                txHash: params.event.txHash,
                eventId: params.event.eventId,
                amountDecision: 'over_limit_rejected',
                expectedAmountUsd,
                receivedAmountUsd: receivedAmountUsdRaw
              }
            ]
          );

          return {
            status: 'amount_over_limit',
            transferId: params.match.transferId,
            amountDecision: 'over_limit_rejected',
            expectedAmountUsd,
            receivedAmountUsd: receivedAmountUsdRaw
          };
        }

        adjustedSendAmountUsd = receivedAmountUsdRaw;
        amountDecision = 'overpay_adjusted';
        await tx.query('update transfers set send_amount_usd = $2 where transfer_id = $1', [
          params.match.transferId,
          adjustedSendAmountUsd
        ]);
      }

      const insertEvent = await tx.query(
        `
        insert into onchain_funding_event (
          event_id,
          chain,
          token,
          tx_hash,
          log_index,
          transfer_id,
          deposit_address,
          amount_usd,
          confirmed_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        on conflict (chain, tx_hash, log_index) do nothing
        returning event_id
        `,
        [
          params.event.eventId,
          params.event.chain,
          params.event.token,
          params.event.txHash,
          params.event.logIndex,
          params.match.transferId,
          params.event.depositAddress,
          receivedAmountUsdRaw,
          params.event.confirmedAt
        ]
      );

      if (insertEvent.rowCount === 0) {
        return { status: 'duplicate', transferId: params.match.transferId };
      }

      await tx.query("update transfers set status = 'FUNDING_CONFIRMED' where transfer_id = $1", [params.match.transferId]);

      if (params.event.chain === 'base') {
        try {
          await tx.query(
            `
            insert into settlement_record (
              transfer_id,
              chain,
              token,
              deposit_address,
              status,
              attempt_count,
              next_attempt_at
            ) values ($1, 'base', $2, $3, 'pending_sweep', 0, now())
            on conflict (transfer_id)
            do update set
              token = excluded.token,
              deposit_address = excluded.deposit_address,
              status = case
                when settlement_record.status in ('pending_sweep', 'sweeping', 'review_required') then 'pending_sweep'
                else settlement_record.status
              end,
              next_attempt_at = case
                when settlement_record.status in ('pending_sweep', 'sweeping', 'review_required') then now()
                else settlement_record.next_attempt_at
              end,
              updated_at = now()
            `,
            [params.match.transferId, params.event.token, params.event.depositAddress]
          );
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code !== '42P01') {
            throw error;
          }
        }
      }

      await tx.query(
        `
        update funding_submission_attempt
        set status = 'confirmed',
            updated_at = now()
        where transfer_id = $1
          and status = 'submitted'
        `,
        [params.match.transferId]
      );

      await tx.query(
        `
        insert into transfer_transition (transfer_id, from_state, to_state, metadata)
        values ($1, $2, $3, $4)
        `,
        [
          params.match.transferId,
          'AWAITING_FUNDING',
          'FUNDING_CONFIRMED',
          {
            chain: params.event.chain,
            txHash: params.event.txHash,
            logIndex: params.event.logIndex,
            eventId: params.event.eventId,
            amountDecision,
            expectedAmountUsd,
            receivedAmountUsd: receivedAmountUsdRaw,
            adjustedSendAmountUsd: amountDecision === 'overpay_adjusted' ? adjustedSendAmountUsd : undefined,
            ...(params.event.metadata ?? {})
          }
        ]
      );

      const payoutContext = await tx.query<{
        amount_etb: string;
        bank_code: string | null;
        bank_account_number: string | null;
      }>(
        `
        select
          round(greatest(t.send_amount_usd - q.fee_usd, 0) * q.fx_rate_usd_to_etb, 2)::text as amount_etb,
          r.bank_code,
          r.bank_account_number
        from transfers t
        join quotes q on q.quote_id = t.quote_id
        left join recipient r on r.recipient_id = t.receiver_id
        where t.transfer_id = $1
        limit 1
        `,
        [params.match.transferId]
      );

      const payoutRow = payoutContext.rows[0];
      const recipientAccountRef =
        payoutRow?.bank_code && payoutRow?.bank_account_number
          ? `${payoutRow.bank_code}-${payoutRow.bank_account_number}`
          : null;

      const amountEtb = payoutRow?.amount_etb ? Number(payoutRow.amount_etb) : null;

      await tx.query(
        `
        insert into outbox_event (
          event_id,
          topic,
          aggregate_type,
          aggregate_id,
          payload,
          status,
          attempt_count,
          next_attempt_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8)
        on conflict (event_id) do nothing
        `,
        [
          `outbox_transfer_funding_confirmed_${params.match.transferId}`,
          'transfer.funding_confirmed',
          'transfer',
          params.match.transferId,
          {
            transferId: params.match.transferId,
            method: 'bank',
            recipientAccountRef,
            amountEtb,
            idempotencyKey: `auto-payout:${params.match.transferId}`,
            fundedEventId: params.event.eventId,
            chain: params.event.chain,
            token: params.event.token,
            amountDecision
          },
          'pending',
          0,
          new Date()
        ]
      );

      await tx.query(
        `
        insert into audit_log (actor_type, actor_id, action, entity_type, entity_id, reason, metadata)
        values ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          'system',
          'funding-confirmation-handler',
          'funding_confirmed',
          'transfer',
          params.match.transferId,
          'On-chain confirmation received',
          {
            chain: params.event.chain,
            token: params.event.token,
            txHash: params.event.txHash,
            amountUsd: receivedAmountUsdRaw,
            amountDecision,
            expectedAmountUsd,
            adjustedSendAmountUsd: amountDecision === 'overpay_adjusted' ? adjustedSendAmountUsd : undefined,
            ...(params.event.metadata ?? {})
          }
        ]
      );

      return {
        status: 'confirmed',
        transferId: params.match.transferId,
        amountDecision,
        expectedAmountUsd,
        receivedAmountUsd: receivedAmountUsdRaw,
        ...(adjustedSendAmountUsd !== undefined ? { adjustedSendAmountUsd } : {})
      };
    });
  }
}
