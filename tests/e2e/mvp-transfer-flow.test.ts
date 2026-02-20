import { closePool, getPool } from '../../packages/db/src/index.js';
import { isWithinSlaMinutes } from '../../packages/observability/src/index.js';
import { FundingConfirmationRepository, FundingConfirmationService } from '../../services/core-api/src/modules/funding-confirmations/index.js';
import { QuoteRepository, QuoteService } from '../../services/core-api/src/modules/quotes/index.js';
import { TransferRepository, TransferService } from '../../services/offshore-collector/src/modules/transfers/index.js';
import { BankPayoutAdapter } from '../../packages/adapters/src/index.js';
import { PayoutRepository, PayoutService } from '../../services/payout-orchestrator/src/modules/payouts/index.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

describe('MVP e2e transfer flow', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.APP_REGION = 'offshore';
    process.env.DATABASE_URL = 'postgres://cryptopay:cryptopay@localhost:55432/cryptopay';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.ETHIOPIA_SERVICES_CRYPTO_DISABLED = 'true';
  });

  beforeEach(async () => {
    await getPool().query(
      'truncate table payout_status_event, payout_instruction, onchain_funding_event, deposit_routes, transfers, quotes, idempotency_record, transfer_transition, audit_log, ledger_entry, ledger_journal, reconciliation_issue, reconciliation_run restart identity cascade'
    );
  });

  afterAll(async () => {
    await closePool();
  });

  it('completes quote -> transfer -> funding -> payout initiation and stays within 10-minute SLA', async () => {
    const quoteService = new QuoteService(new QuoteRepository());
    const transferService = new TransferService(new TransferRepository());
    const fundingService = new FundingConfirmationService(new FundingConfirmationRepository());

    const payoutService = new PayoutService(new PayoutRepository(), {
      bank: new BankPayoutAdapter(async () => ({
        providerReference: 'bank_e2e_ref_1',
        acceptedAt: new Date()
      }))
    });

    const quote = await quoteService.createQuote({
      chain: 'base',
      token: 'USDC',
      sendAmountUsd: 500,
      fxRateUsdToEtb: 140,
      feeUsd: 5,
      expiresInSeconds: 600
    });

    const transfer = await transferService.createTransfer({
      quoteId: quote.quoteId,
      senderId: 'sender_e2e_1',
      receiverId: 'receiver_e2e_1',
      senderKycStatus: 'approved',
      receiverKycStatus: 'approved',
      receiverNationalIdVerified: true,
      idempotencyKey: 'idem-e2e-transfer-1'
    });

    const fundingConfirmedAt = new Date();

    const fundingResult = await fundingService.processFundingConfirmed({
      eventId: 'evt_e2e_1',
      chain: 'base',
      token: 'USDC',
      txHash: '0xe2ehash',
      logIndex: 1,
      depositAddress: transfer.depositRoute.depositAddress,
      amountUsd: 500,
      confirmedAt: fundingConfirmedAt
    });

    expect(fundingResult.status).toBe('confirmed');

    const payoutResult = await payoutService.initiatePayout({
      transferId: transfer.transfer.transferId,
      method: 'bank',
      recipientAccountRef: 'CBE-E2E-001',
      amountEtb: quote.recipientAmountEtb,
      idempotencyKey: 'idem-e2e-payout-1'
    });

    expect(payoutResult.status).toBe('initiated');

    const payoutEvent = await getPool().query(
      "select created_at from payout_status_event where payout_id = $1 and to_status = 'PAYOUT_INITIATED' order by created_at asc limit 1",
      [payoutResult.payoutId]
    );

    const payoutInitiatedAt = new Date(payoutEvent.rows[0]?.created_at as string);
    expect(isWithinSlaMinutes(fundingConfirmedAt, payoutInitiatedAt, 10)).toBe(true);

    const transferStatus = await getPool().query('select status from transfers where transfer_id = $1', [
      transfer.transfer.transferId
    ]);
    expect(transferStatus.rows[0]?.status).toBe('PAYOUT_INITIATED');
  });
});
