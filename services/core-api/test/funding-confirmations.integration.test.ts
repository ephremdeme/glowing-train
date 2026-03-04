import { closeDb, query } from '@cryptopay/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  FundingConfirmationRepository,
  FundingConfirmationService
} from '../src/modules/funding-confirmations/index.js';

async function ensureTables(): Promise<void> {

  await query(`
    create table if not exists quotes (
      quote_id text primary key,
      chain text not null check (chain in ('base', 'solana')),
      token text not null check (token in ('USDC', 'USDT')),
      send_amount_usd numeric(12, 2) not null check (send_amount_usd > 0 and send_amount_usd <= 2000),
      fx_rate_usd_to_etb numeric(18, 6) not null check (fx_rate_usd_to_etb > 0),
      fee_usd numeric(12, 2) not null check (fee_usd >= 0),
      recipient_amount_etb numeric(14, 2) not null check (recipient_amount_etb >= 0),
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    )
  `);

  await query(`
    create table if not exists transfers (
      transfer_id text primary key,
      quote_id text not null references quotes(quote_id),
      sender_id text not null,
      receiver_id text not null,
      sender_kyc_status text not null check (sender_kyc_status in ('approved', 'pending', 'rejected')),
      chain text not null check (chain in ('base', 'solana')),
      token text not null check (token in ('USDC', 'USDT')),
      send_amount_usd numeric(12, 2) not null check (send_amount_usd > 0 and send_amount_usd <= 2000),
      status text not null,
      created_at timestamptz not null default now()
    )
  `);

  await query(`
    create table if not exists deposit_routes (
      route_id text primary key,
      transfer_id text not null unique references transfers(transfer_id) on delete cascade,
      chain text not null,
      token text not null,
      deposit_address text not null,
      deposit_memo text,
      status text not null,
      created_at timestamptz not null default now()
    )
  `);

  await query(`
    create table if not exists onchain_funding_event (
      event_id text primary key,
      chain text not null,
      token text not null,
      tx_hash text not null,
      log_index integer not null,
      transfer_id text not null unique references transfers(transfer_id),
      deposit_address text not null,
      amount_usd numeric(12, 2) not null,
      confirmed_at timestamptz not null,
      created_at timestamptz not null default now(),
      unique(chain, tx_hash, log_index)
    )
  `);

  await query(`
    create table if not exists settlement_record (
      transfer_id text primary key references transfers(transfer_id) on delete cascade,
      chain text not null check (chain in ('base', 'solana')),
      token text not null check (token in ('USDC', 'USDT')),
      deposit_address text not null,
      status text not null check (status in ('pending_sweep', 'sweeping', 'swept', 'review_required')),
      attempt_count integer not null default 0,
      next_attempt_at timestamptz not null default now(),
      last_sweep_tx_hash text,
      swept_at timestamptz,
      last_error text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await query(`
    create table if not exists transfer_transition (
      id bigserial primary key,
      transfer_id text not null,
      from_state text,
      to_state text not null,
      occurred_at timestamptz not null default now(),
      metadata jsonb
    )
  `);

  await query(`
    create table if not exists audit_log (
      id bigserial primary key,
      actor_type text not null,
      actor_id text not null,
      action text not null,
      entity_type text not null,
      entity_id text not null,
      reason text,
      metadata jsonb,
      created_at timestamptz not null default now()
    )
  `);
}

async function seedTransfer(routeAddress: string): Promise<string> {
  const quoteId = `q_fc_${Math.random().toString(36).slice(2, 10)}`;
  const transferId = `tr_fc_${Math.random().toString(36).slice(2, 10)}`;

  await query(
    `
    insert into quotes (
      quote_id, chain, token, send_amount_usd, fx_rate_usd_to_etb, fee_usd, recipient_amount_etb, expires_at
    ) values ($1,'base','USDC',100,140,1,13860,'2027-01-01T00:00:00.000Z')
    `,
    [quoteId]
  );

  await query(
    `
    insert into transfers (
      transfer_id, quote_id, sender_id, receiver_id,
      sender_kyc_status,
      chain, token, send_amount_usd, status
    ) values (
      $1,$2,'sender_1','receiver_1','approved',
      'base','USDC',100,'AWAITING_FUNDING'
    )
    `,
    [transferId, quoteId]
  );

  await query(
    `
    insert into deposit_routes (
      route_id, transfer_id, chain, token, deposit_address, deposit_memo, status
    ) values ($1,$2,'base','USDC',$3,null,'active')
    `,
    [`route_${transferId}`, transferId, routeAddress]
  );

  return transferId;
}

describe('funding confirmation integration', () => {
  let service: FundingConfirmationService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_REGION = 'offshore';
    process.env.DATABASE_URL ??= 'postgres://cryptopay:cryptopay@localhost:55432/cryptopay';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    process.env.ETHIOPIA_SERVICES_CRYPTO_DISABLED = 'true';
    process.env.FUNDING_AMOUNT_TOLERANCE_USD = '0.01';
    process.env.FUNDING_OVERPAY_AUTO_ADJUST_ENABLED = 'true';
    process.env.FUNDING_OVERPAY_MAX_AUTO_USD = '2000';

    await ensureTables();

    const repository = new FundingConfirmationRepository();
    service = new FundingConfirmationService(repository);
  });

  beforeEach(async () => {
    await query(
      'truncate table settlement_record, onchain_funding_event, transfer_transition, audit_log, deposit_routes, transfers, quotes cascade'
    );
  });

  afterAll(async () => {
    await closeDb();
  });

  it('confirms transfer once and persists transition + audit + event', async () => {
    const transferId = await seedTransfer('dep_confirm_once');

    const result = await service.processFundingConfirmed({
      eventId: 'evt_1',
      chain: 'base',
      token: 'USDC',
      txHash: '0xtxhash1',
      logIndex: 1,
      depositAddress: 'dep_confirm_once',
      amountUsd: 100,
      confirmedAt: new Date('2026-02-12T00:00:00.000Z')
    });

    expect(result.status).toBe('confirmed');
    expect(result.transferId).toBe(transferId);

    const statusRow = await query('select status from transfers where transfer_id = $1', [transferId]);
    expect(statusRow.rows[0]?.status).toBe('FUNDING_CONFIRMED');

    const transitionCount = await query(
      "select count(*)::int as count from transfer_transition where transfer_id = $1 and to_state = 'FUNDING_CONFIRMED'",
      [transferId]
    );
    expect(transitionCount.rows[0]?.count).toBe(1);

    const eventCount = await query('select count(*)::int as count from onchain_funding_event where transfer_id = $1', [transferId]);
    expect(eventCount.rows[0]?.count).toBe(1);

    const settlement = await query(
      'select chain, token, deposit_address, status from settlement_record where transfer_id = $1',
      [transferId]
    );
    expect(settlement.rows[0]?.chain).toBe('base');
    expect(settlement.rows[0]?.token).toBe('USDC');
    expect(settlement.rows[0]?.deposit_address).toBe('dep_confirm_once');
    expect(settlement.rows[0]?.status).toBe('pending_sweep');
  });

  it('deduplicates duplicate chain events safely', async () => {
    const transferId = await seedTransfer('dep_dup');

    const first = await service.processFundingConfirmed({
      eventId: 'evt_dup_1',
      chain: 'base',
      token: 'USDC',
      txHash: '0xtxhashdup',
      logIndex: 7,
      depositAddress: 'dep_dup',
      amountUsd: 100,
      confirmedAt: new Date('2026-02-12T00:00:00.000Z')
    });

    const second = await service.processFundingConfirmed({
      eventId: 'evt_dup_2',
      chain: 'base',
      token: 'USDC',
      txHash: '0xtxhashdup',
      logIndex: 7,
      depositAddress: 'dep_dup',
      amountUsd: 100,
      confirmedAt: new Date('2026-02-12T00:00:01.000Z')
    });

    expect(first.status).toBe('confirmed');
    expect(second.status).toBe('duplicate');
    expect(second.transferId).toBe(transferId);

    const transitionCount = await query(
      "select count(*)::int as count from transfer_transition where transfer_id = $1 and to_state = 'FUNDING_CONFIRMED'",
      [transferId]
    );
    expect(transitionCount.rows[0]?.count).toBe(1);
  });

  it('returns route_not_found when deposit route does not exist', async () => {
    const result = await service.processFundingConfirmed({
      eventId: 'evt_missing_route',
      chain: 'base',
      token: 'USDC',
      txHash: '0xnone',
      logIndex: 3,
      depositAddress: 'dep_missing',
      amountUsd: 10,
      confirmedAt: new Date('2026-02-12T00:00:00.000Z')
    });

    expect(result.status).toBe('route_not_found');
  });

  it('rejects underpaid watcher/manual events without confirming transfer', async () => {
    const transferId = await seedTransfer('dep_underpaid');

    const result = await service.processFundingConfirmed({
      eventId: 'evt_underpaid',
      chain: 'base',
      token: 'USDC',
      txHash: '0xunderpaid',
      logIndex: 8,
      depositAddress: 'dep_underpaid',
      amountUsd: 99.5,
      confirmedAt: new Date('2026-02-12T00:00:00.000Z')
    });

    expect(result.status).toBe('amount_underpaid');
    expect(result.amountDecision).toBe('underpay_rejected');

    const transfer = await query('select status from transfers where transfer_id = $1', [transferId]);
    expect(transfer.rows[0]?.status).toBe('AWAITING_FUNDING');

    const fundingEvents = await query('select count(*)::int as count from onchain_funding_event where transfer_id = $1', [transferId]);
    expect(fundingEvents.rows[0]?.count).toBe(0);
  });

  it('auto-adjusts overpay amount and confirms transfer', async () => {
    const transferId = await seedTransfer('dep_overpay');

    const result = await service.processFundingConfirmed({
      eventId: 'evt_overpay',
      chain: 'base',
      token: 'USDC',
      txHash: '0xoverpay',
      logIndex: 9,
      depositAddress: 'dep_overpay',
      amountUsd: 120,
      confirmedAt: new Date('2026-02-12T00:00:00.000Z')
    });

    expect(result.status).toBe('confirmed');
    expect(result.amountDecision).toBe('overpay_adjusted');
    expect(result.adjustedSendAmountUsd).toBe(120);

    const transfer = await query('select status, send_amount_usd::text as amount from transfers where transfer_id = $1', [transferId]);
    expect(transfer.rows[0]?.status).toBe('FUNDING_CONFIRMED');
    expect(Number(transfer.rows[0]?.amount)).toBe(120);

    const fundingEvent = await query('select amount_usd::text as amount from onchain_funding_event where transfer_id = $1', [transferId]);
    expect(Number(fundingEvent.rows[0]?.amount)).toBe(120);
  });

  it('rejects payments above automatic overpay limit', async () => {
    const transferId = await seedTransfer('dep_over_limit');

    const result = await service.processFundingConfirmed({
      eventId: 'evt_over_limit',
      chain: 'base',
      token: 'USDC',
      txHash: '0xoverlimit',
      logIndex: 10,
      depositAddress: 'dep_over_limit',
      amountUsd: 2100,
      confirmedAt: new Date('2026-02-12T00:00:00.000Z')
    });

    expect(result.status).toBe('amount_over_limit');
    expect(result.amountDecision).toBe('over_limit_rejected');

    const transfer = await query('select status from transfers where transfer_id = $1', [transferId]);
    expect(transfer.rows[0]?.status).toBe('AWAITING_FUNDING');
  });

  it('accepts later exact payment after an underpay rejection', async () => {
    const transferId = await seedTransfer('dep_underpay_then_exact');

    const underpay = await service.processFundingConfirmed({
      eventId: 'evt_underpay_first',
      chain: 'base',
      token: 'USDC',
      txHash: '0xunderpay-first',
      logIndex: 11,
      depositAddress: 'dep_underpay_then_exact',
      amountUsd: 90,
      confirmedAt: new Date('2026-02-12T00:00:00.000Z')
    });

    expect(underpay.status).toBe('amount_underpaid');

    const secondAttempt = await service.processFundingConfirmed({
      eventId: 'evt_underpay_second',
      chain: 'base',
      token: 'USDC',
      txHash: '0xunderpay-second',
      logIndex: 12,
      depositAddress: 'dep_underpay_then_exact',
      amountUsd: 100,
      confirmedAt: new Date('2026-02-12T00:01:00.000Z')
    });

    expect(secondAttempt.status).toBe('confirmed');
    expect(secondAttempt.amountDecision).toBe('exact');

    const transfer = await query('select status from transfers where transfer_id = $1', [transferId]);
    expect(transfer.rows[0]?.status).toBe('FUNDING_CONFIRMED');

    const fundingEvents = await query('select count(*)::int as count from onchain_funding_event where transfer_id = $1', [transferId]);
    expect(fundingEvents.rows[0]?.count).toBe(1);
  });

  it('treats small shortfall within tolerance as confirmed', async () => {
    const transferId = await seedTransfer('dep_tolerance');
    const originalTolerance = process.env.FUNDING_AMOUNT_TOLERANCE_USD;
    process.env.FUNDING_AMOUNT_TOLERANCE_USD = '0.02';

    try {
      const result = await service.processFundingConfirmed({
        eventId: 'evt_tolerance',
        chain: 'base',
        token: 'USDC',
        txHash: '0xtolerance',
        logIndex: 13,
        depositAddress: 'dep_tolerance',
        amountUsd: 99.99,
        confirmedAt: new Date('2026-02-12T00:00:00.000Z')
      });

      expect(result.status).toBe('confirmed');
      expect(result.amountDecision).toBe('tolerance');

      const transfer = await query('select status, send_amount_usd::text as amount from transfers where transfer_id = $1', [transferId]);
      expect(transfer.rows[0]?.status).toBe('FUNDING_CONFIRMED');
      expect(Number(transfer.rows[0]?.amount)).toBe(100);
    } finally {
      if (originalTolerance === undefined) {
        delete process.env.FUNDING_AMOUNT_TOLERANCE_USD;
      } else {
        process.env.FUNDING_AMOUNT_TOLERANCE_USD = originalTolerance;
      }
    }
  });

  it('rejects overpay when auto-adjust is disabled', async () => {
    const transferId = await seedTransfer('dep_overpay_disabled');
    const originalAutoAdjust = process.env.FUNDING_OVERPAY_AUTO_ADJUST_ENABLED;
    process.env.FUNDING_OVERPAY_AUTO_ADJUST_ENABLED = 'false';

    try {
      const result = await service.processFundingConfirmed({
        eventId: 'evt_overpay_disabled',
        chain: 'base',
        token: 'USDC',
        txHash: '0xoverpay-disabled',
        logIndex: 14,
        depositAddress: 'dep_overpay_disabled',
        amountUsd: 120,
        confirmedAt: new Date('2026-02-12T00:00:00.000Z')
      });

      expect(result.status).toBe('amount_over_limit');
      expect(result.amountDecision).toBe('over_limit_rejected');

      const transfer = await query('select status, send_amount_usd::text as amount from transfers where transfer_id = $1', [transferId]);
      expect(transfer.rows[0]?.status).toBe('AWAITING_FUNDING');
      expect(Number(transfer.rows[0]?.amount)).toBe(100);
    } finally {
      if (originalAutoAdjust === undefined) {
        delete process.env.FUNDING_OVERPAY_AUTO_ADJUST_ENABLED;
      } else {
        process.env.FUNDING_OVERPAY_AUTO_ADJUST_ENABLED = originalAutoAdjust;
      }
    }
  });
});
