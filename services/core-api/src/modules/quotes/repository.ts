import { query } from '@cryptopay/db';
import type { QuoteRecord, QuoteRepositoryPort } from './types.js';

function toQuoteRecord(row: Record<string, unknown>): QuoteRecord {
  return {
    quoteId: row.quote_id as string,
    chain: row.chain as QuoteRecord['chain'],
    token: row.token as QuoteRecord['token'],
    sendAmountUsd: Number(row.send_amount_usd),
    fxRateUsdToEtb: Number(row.fx_rate_usd_to_etb),
    feeUsd: Number(row.fee_usd),
    recipientAmountEtb: Number(row.recipient_amount_etb),
    expiresAt: new Date(row.expires_at as string),
    createdAt: new Date(row.created_at as string)
  };
}

export class QuoteRepository implements QuoteRepositoryPort {
  async insert(input: QuoteRecord): Promise<void> {
    await query(
      `
      insert into quotes (
        quote_id,
        chain,
        token,
        send_amount_usd,
        fx_rate_usd_to_etb,
        fee_usd,
        recipient_amount_etb,
        expires_at,
        created_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        input.quoteId,
        input.chain,
        input.token,
        input.sendAmountUsd,
        input.fxRateUsdToEtb,
        input.feeUsd,
        input.recipientAmountEtb,
        input.expiresAt,
        input.createdAt
      ]
    );
  }

  async findById(quoteId: string): Promise<QuoteRecord | null> {
    const result = await query('select * from quotes where quote_id = $1 limit 1', [quoteId]);
    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return toQuoteRecord(row as Record<string, unknown>);
  }
}
