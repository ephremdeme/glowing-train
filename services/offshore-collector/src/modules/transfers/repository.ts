import { getPool } from '@cryptopay/db';
import type {
  DepositRouteRecord,
  IdempotencyRecord,
  QuoteSnapshot,
  ReceiverKycProfileSnapshot,
  TransferRepositoryPort,
  TransferCreationResult,
  TransferRecord
} from './types.js';

const IDEMPOTENCY_TTL_HOURS = 24;

type Pool = ReturnType<typeof getPool>;
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
    receiverKycStatus: row.receiver_kyc_status as TransferRecord['receiverKycStatus'],
    receiverNationalIdVerified: row.receiver_national_id_verified as boolean,
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
    status: row.status as DepositRouteRecord['status'],
    createdAt: new Date(row.created_at as string)
  };
}

export class TransferRepository implements TransferRepositoryPort {
  constructor(private readonly pool: Pool = getPool()) {}

  async findQuoteById(quoteId: string): Promise<QuoteSnapshot | null> {
    const result = await this.pool.query('select quote_id, chain, token, send_amount_usd, expires_at from quotes where quote_id = $1', [
      quoteId
    ]);

    if (!result.rows[0]) {
      return null;
    }

    return mapQuote(result.rows[0] as DbRow);
  }

  async findReceiverKycProfile(receiverId: string): Promise<ReceiverKycProfileSnapshot | null> {
    try {
      const result = await this.pool.query(
        `
        select receiver_id, kyc_status, national_id_verified
        from receiver_kyc_profile
        where receiver_id = $1
        limit 1
        `,
        [receiverId]
      );

      const row = result.rows[0] as
        | {
            receiver_id: string;
            kyc_status: ReceiverKycProfileSnapshot['kycStatus'];
            national_id_verified: boolean;
          }
        | undefined;

      if (!row) {
        return null;
      }

      return {
        receiverId: row.receiver_id,
        kycStatus: row.kyc_status,
        nationalIdVerified: row.national_id_verified
      };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === '42P01') {
        return null;
      }

      throw error;
    }
  }

  async findIdempotency(key: string): Promise<IdempotencyRecord | null> {
    const result = await this.pool.query(
      'select key, request_hash, response_status, response_body, expires_at from idempotency_record where key = $1',
      [key]
    );

    const row = result.rows[0];
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

  async persistTransferWithRoute(params: {
    transfer: Omit<TransferRecord, 'createdAt'>;
    route: Omit<DepositRouteRecord, 'createdAt'>;
  }): Promise<TransferCreationResult> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');

      const transferInsert = await client.query(
        `
        insert into transfers (
          transfer_id,
          quote_id,
          sender_id,
          receiver_id,
          sender_kyc_status,
          receiver_kyc_status,
          receiver_national_id_verified,
          chain,
          token,
          send_amount_usd,
          status
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        returning *
        `,
        [
          params.transfer.transferId,
          params.transfer.quoteId,
          params.transfer.senderId,
          params.transfer.receiverId,
          params.transfer.senderKycStatus,
          params.transfer.receiverKycStatus,
          params.transfer.receiverNationalIdVerified,
          params.transfer.chain,
          params.transfer.token,
          params.transfer.sendAmountUsd,
          params.transfer.status
        ]
      );

      const routeInsert = await client.query(
        `
        insert into deposit_routes (
          route_id,
          transfer_id,
          chain,
          token,
          deposit_address,
          deposit_memo,
          status
        ) values ($1,$2,$3,$4,$5,$6,$7)
        returning *
        `,
        [
          params.route.routeId,
          params.route.transferId,
          params.route.chain,
          params.route.token,
          params.route.depositAddress,
          params.route.depositMemo,
          params.route.status
        ]
      );

      await client.query('commit');

      return {
        transfer: mapTransfer(transferInsert.rows[0] as DbRow),
        depositRoute: mapDepositRoute(routeInsert.rows[0] as DbRow)
      };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async saveIdempotencyRecord(params: {
    key: string;
    requestHash: string;
    responseStatus: number;
    responseBody: TransferCreationResult;
    now: Date;
  }): Promise<void> {
    const expiresAt = new Date(params.now.getTime() + IDEMPOTENCY_TTL_HOURS * 3600 * 1000);

    await this.pool.query(
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
    await this.pool.query('truncate table deposit_routes, transfers, idempotency_record cascade');
  }
}
