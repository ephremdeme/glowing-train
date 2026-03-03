import { query, withTransaction } from '@cryptopay/db';
import type {
  DepositRouteRecord,
  IdempotencyRecord,
  QuoteSnapshot,
  TransferRepositoryPort,
  TransferCreationResult,
  TransferRecord
} from './types.js';

const IDEMPOTENCY_TTL_HOURS = 24;
type DbRow = Record<string, unknown>;

function mapQuote(row: DbRow): QuoteSnapshot {
  return {
    quoteId: row.quote_id as string,
    chain: row.chain as QuoteSnapshot['chain'],
    token: row.token as QuoteSnapshot['token'],
    sendAmountUsd: Number(row.send_amount_usd),
    expiresAt: new Date(row.expires_at as string)
  };
}

function mapTransfer(row: DbRow): TransferRecord {
  return {
    transferId: row.transfer_id as string,
    quoteId: row.quote_id as string,
    senderId: row.sender_id as string,
    receiverId: row.receiver_id as string,
    senderKycStatus: row.sender_kyc_status as TransferRecord['senderKycStatus'],
    chain: row.chain as TransferRecord['chain'],
    token: row.token as TransferRecord['token'],
    sendAmountUsd: Number(row.send_amount_usd),
    status: row.status as TransferRecord['status'],
    createdAt: new Date(row.created_at as string)
  };
}

function mapDepositRoute(row: DbRow): DepositRouteRecord {
  return {
    routeId: row.route_id as string,
    transferId: row.transfer_id as string,
    chain: row.chain as DepositRouteRecord['chain'],
    token: row.token as DepositRouteRecord['token'],
    depositAddress: row.deposit_address as string,
    depositMemo: (row.deposit_memo as string | null) ?? null,
    routeKind: ((row.route_kind as DepositRouteRecord['routeKind'] | null) ?? 'address_route'),
    referenceHash: (row.reference_hash as string | null) ?? null,
    status: row.status as DepositRouteRecord['status'],
    createdAt: new Date(row.created_at as string)
  };
}

export class TransferRepository implements TransferRepositoryPort {
  async findQuoteById(quoteId: string): Promise<QuoteSnapshot | null> {
    const result = await query('select quote_id, chain, token, send_amount_usd, expires_at from quotes where quote_id = $1', [
      quoteId
    ]);

    if (!result.rows[0]) {
      return null;
    }

    return mapQuote(result.rows[0] as DbRow);
  }

  async findIdempotency(key: string): Promise<IdempotencyRecord | null> {
    const result = await query(
      'select key, request_hash, response_status, response_body, expires_at from idempotency_record where key = $1',
      [key]
    );

    const row = result.rows[0] as
      | {
        key: string;
        request_hash: string;
        response_status: number;
        response_body: unknown;
        expires_at: string | Date;
      }
      | undefined;
    if (!row) {
      return null;
    }

    return {
      key: row.key,
      requestHash: row.request_hash,
      responseStatus: row.response_status,
      responseBody: row.response_body as TransferCreationResult,
      expiresAt: new Date(row.expires_at)
    };
  }

  async findTransferWithRouteById(transferId: string): Promise<{ transfer: TransferRecord; depositRoute: DepositRouteRecord } | null> {
    const result = await query(
      `
      select
        t.*,
        dr.route_id,
        dr.deposit_address,
        dr.deposit_memo,
        dr.route_kind,
        dr.reference_hash,
        dr.status as route_status,
        dr.created_at as route_created_at
      from transfers t
      join deposit_routes dr on dr.transfer_id = t.transfer_id
      where t.transfer_id = $1
      limit 1
      `,
      [transferId]
    );

    const row = result.rows[0] as DbRow | undefined;
    if (!row) {
      return null;
    }

    return {
      transfer: mapTransfer(row),
      depositRoute: {
        routeId: row.route_id as string,
        transferId: row.transfer_id as string,
        chain: row.chain as DepositRouteRecord['chain'],
        token: row.token as DepositRouteRecord['token'],
        depositAddress: row.deposit_address as string,
        depositMemo: (row.deposit_memo as string | null) ?? null,
        routeKind: ((row.route_kind as DepositRouteRecord['routeKind'] | null) ?? 'address_route'),
        referenceHash: (row.reference_hash as string | null) ?? null,
        status: row.route_status as DepositRouteRecord['status'],
        createdAt: new Date(row.route_created_at as string)
      }
    };
  }

  async persistTransferWithRoute(params: {
    transfer: Omit<TransferRecord, 'createdAt'>;
    route: Omit<DepositRouteRecord, 'createdAt'>;
  }): Promise<TransferCreationResult> {
    return withTransaction(async (tx) => {
      const transferInsert = await tx.query(
        `
        insert into transfers (
          transfer_id,
          quote_id,
          sender_id,
          receiver_id,
          sender_kyc_status,
          chain,
          token,
          send_amount_usd,
          status
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        returning *
        `,
        [
          params.transfer.transferId,
          params.transfer.quoteId,
          params.transfer.senderId,
          params.transfer.receiverId,
          params.transfer.senderKycStatus,
          params.transfer.chain,
          params.transfer.token,
          params.transfer.sendAmountUsd,
          params.transfer.status
        ]
      );

      const routeInsert = await tx.query(
        `
        insert into deposit_routes (
          route_id,
          transfer_id,
          chain,
          token,
          deposit_address,
          deposit_memo,
          route_kind,
          reference_hash,
          status
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        returning *
        `,
        [
          params.route.routeId,
          params.route.transferId,
          params.route.chain,
          params.route.token,
          params.route.depositAddress,
          params.route.depositMemo,
          params.route.routeKind,
          params.route.referenceHash,
          params.route.status
        ]
      );

      return {
        transfer: mapTransfer(transferInsert.rows[0] as DbRow),
        depositRoute: mapDepositRoute(routeInsert.rows[0] as DbRow)
      };
    });
  }

  async saveIdempotencyRecord(params: {
    key: string;
    requestHash: string;
    responseStatus: number;
    responseBody: TransferCreationResult;
    now: Date;
  }): Promise<void> {
    const expiresAt = new Date(params.now.getTime() + IDEMPOTENCY_TTL_HOURS * 3600 * 1000);

    await query(
      `
      insert into idempotency_record (
        key,
        request_hash,
        response_status,
        response_body,
        expires_at
      ) values ($1, $2, $3, $4, $5)
      on conflict (key) do nothing
      `,
      [params.key, params.requestHash, params.responseStatus, params.responseBody, expiresAt]
    );
  }

  async clearTransferDataForTests(): Promise<void> {
    await query('truncate table deposit_routes, transfers, idempotency_record cascade');
  }
}
