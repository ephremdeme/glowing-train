import { query, withTransaction } from '@cryptopay/db';
import type { FundingConfirmedInput, FundingResult, RouteMatch } from './types.js';

type Row = Record<string, unknown>;

export class FundingConfirmationRepository {
  async findRouteMatch(params: { chain: string; token: string; depositAddress: string }): Promise<RouteMatch | null> {
    const result = await query(
      `
      select t.transfer_id, t.status
      from deposit_routes dr
      join transfers t on t.transfer_id = dr.transfer_id
      where dr.chain = $1
        and dr.token = $2
        and dr.deposit_address = $3
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
      const transferState = await tx.query('select status from transfers where transfer_id = $1 for update', [params.match.transferId]);
      const status = transferState.rows[0]?.status as string | undefined;

      if (!status) {
        return { status: 'route_not_found' };
      }

      if (status === 'FUNDING_CONFIRMED') {
        return { status: 'duplicate', transferId: params.match.transferId };
      }

      if (status !== 'AWAITING_FUNDING') {
        return { status: 'invalid_state', transferId: params.match.transferId };
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
          params.event.amountUsd,
          params.event.confirmedAt
        ]
      );

      if (insertEvent.rowCount === 0) {
        return { status: 'duplicate', transferId: params.match.transferId };
      }

      await tx.query("update transfers set status = 'FUNDING_CONFIRMED' where transfer_id = $1", [params.match.transferId]);

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
            eventId: params.event.eventId
          }
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
            amountUsd: params.event.amountUsd
          }
        ]
      );

      return { status: 'confirmed', transferId: params.match.transferId };
    });
  }
}
