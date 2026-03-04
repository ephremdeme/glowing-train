import { describe, expect, it, vi } from 'vitest';
import type { TransferRepositoryPort } from '../src/modules/transfers/types.js';
import { SolanaPaymentVerificationService } from '../src/modules/solana-payments/verifier.js';

const TRANSFER_ID = 'tr_4ad956ff-68dd-4b82-a9e7-8cc8da8f1e15';
const TX_HASH = '5W6Vw1Za2h3sT9Q2vQvJ4n4J2W5Kth3hYzqR4C3y2mQ5w8Gd6mR7fN9h2Gq4vX8b';
const PAYER_ADDRESS = '7xM2MwYF4cnSDdhAVM7y7gbV6Y1av6eyGkxfVv4P2HqW';
const TREASURY_ATA = '89sfbTtBCGX3zCCooh4zGoxaATFEvZNWdkNjDGzCeqBu';
const USDC_MINT = '6bDUveKHvCojQNt5VzsvLpScyQyDwScFVzw7mGTRP3Km';

function createMockRepository(sendAmountUsd = 3): TransferRepositoryPort {
  return {
    findQuoteById: vi.fn(),
    findIdempotency: vi.fn(),
    persistTransferWithRoute: vi.fn(),
    saveIdempotencyRecord: vi.fn(),
    findTransferWithRouteById: vi.fn().mockResolvedValue({
      transfer: {
        transferId: TRANSFER_ID,
        quoteId: 'q_1',
        senderId: 'sender_1',
        receiverId: 'recipient_1',
        senderKycStatus: 'approved',
        chain: 'solana',
        token: 'USDC',
        sendAmountUsd,
        status: 'AWAITING_FUNDING',
        createdAt: new Date('2026-03-03T00:00:00.000Z')
      },
      depositRoute: {
        routeId: 'route_1',
        transferId: TRANSFER_ID,
        chain: 'solana',
        token: 'USDC',
        depositAddress: TREASURY_ATA,
        depositMemo: TRANSFER_ID,
        routeKind: 'solana_program_pay',
        referenceHash: '159eb3435b0764a81a99348c240b802696d664bc0e85a7edff20649e6a9f904e',
        status: 'active',
        createdAt: new Date('2026-03-03T00:00:00.000Z')
      }
    })
  } as unknown as TransferRepositoryPort;
}

function createLegacyParsedTransaction(postAmount: string): any {
  return {
    slot: 123,
    blockTime: 1_709_500_000,
    meta: {
      err: null,
      preTokenBalances: [
        {
          accountIndex: 1,
          mint: USDC_MINT,
          uiTokenAmount: { amount: '1000000' }
        }
      ],
      postTokenBalances: [
        {
          accountIndex: 1,
          mint: USDC_MINT,
          uiTokenAmount: { amount: postAmount }
        }
      ]
    },
    transaction: {
      message: {
        instructions: [],
        accountKeys: [
          { pubkey: PAYER_ADDRESS, signer: true },
          { pubkey: TREASURY_ATA, signer: false }
        ]
      }
    }
  };
}

describe('SolanaPaymentVerificationService', () => {
  it('verifies direct SPL transfer to treasury ATA and returns observed amount', async () => {
    const repo = createMockRepository(3);
    const parsedTransaction = createLegacyParsedTransaction('4000000'); // +3 USDC
    const connection = {
      getParsedTransaction: vi.fn().mockResolvedValue(parsedTransaction),
      getBlockTime: vi.fn().mockResolvedValue(1_709_500_000)
    };
    const service = new SolanaPaymentVerificationService(
      repo,
      () => ({
        rpcUrl: 'https://mock-solana-rpc.example.com',
        programId: '5i3vNJHo7Jkpg549uHtsKvGiEy77SmS5NKDZGwCo8Fwp',
        mintByToken: { USDC: USDC_MINT, USDT: '2Seg9ZgkCyyqdEgTkNcxG2kszh9S2GrAzcY6XjPhtGJn' },
        treasuryAtaByToken: { USDC: TREASURY_ATA, USDT: 'FFn5nBjuZLj4WBxyzUvXTs185LxpAXt4wLSRqs6KabqR' }
      }),
      () => connection as any
    );

    const result = await service.verify({ transferId: TRANSFER_ID, txHash: TX_HASH });

    expect(result.verified).toBe(true);
    expect(result.transferId).toBe(TRANSFER_ID);
    expect(result.depositAddress).toBe(TREASURY_ATA);
    expect(result.amountUsd).toBe(3);
    expect(result.payerAddress).toBe(PAYER_ADDRESS);
    expect(result.referenceHash).toBeUndefined();
    expect(result.paymentId).toBeUndefined();
  });

  it('accepts slight direct-transfer amount drift and reports observed amount for core policy handling', async () => {
    const repo = createMockRepository(3);
    const parsedTransaction = createLegacyParsedTransaction('3999999'); // +2.999999 USDC
    const connection = {
      getParsedTransaction: vi.fn().mockResolvedValue(parsedTransaction),
      getBlockTime: vi.fn().mockResolvedValue(1_709_500_000)
    };
    const service = new SolanaPaymentVerificationService(
      repo,
      () => ({
        rpcUrl: 'https://mock-solana-rpc.example.com',
        programId: '5i3vNJHo7Jkpg549uHtsKvGiEy77SmS5NKDZGwCo8Fwp',
        mintByToken: { USDC: USDC_MINT, USDT: '2Seg9ZgkCyyqdEgTkNcxG2kszh9S2GrAzcY6XjPhtGJn' },
        treasuryAtaByToken: { USDC: TREASURY_ATA, USDT: 'FFn5nBjuZLj4WBxyzUvXTs185LxpAXt4wLSRqs6KabqR' }
      }),
      () => connection as any
    );

    const result = await service.verify({ transferId: TRANSFER_ID, txHash: TX_HASH });
    expect(result.verified).toBe(true);
    expect(result.amountUsd).toBe(3);
  });

  it('verifies unique-address solana routes (address_route) without requiring legacy program route kind', async () => {
    const repo = createMockRepository(3);
    (repo.findTransferWithRouteById as ReturnType<typeof vi.fn>).mockResolvedValue({
      transfer: {
        transferId: TRANSFER_ID,
        quoteId: 'q_1',
        senderId: 'sender_1',
        receiverId: 'recipient_1',
        senderKycStatus: 'approved',
        chain: 'solana',
        token: 'USDC',
        sendAmountUsd: 3,
        status: 'AWAITING_FUNDING',
        createdAt: new Date('2026-03-03T00:00:00.000Z')
      },
      depositRoute: {
        routeId: 'route_2',
        transferId: TRANSFER_ID,
        chain: 'solana',
        token: 'USDC',
        depositAddress: '7m6mGJbhg5R4N6DNpQJe2rJTu2vD8ac9yTn8b2Wy3kYB',
        depositMemo: TRANSFER_ID,
        routeKind: 'address_route',
        referenceHash: null,
        status: 'active',
        createdAt: new Date('2026-03-03T00:00:00.000Z')
      }
    });

    const parsedTransaction = {
      slot: 123,
      blockTime: 1_709_500_000,
      meta: {
        err: null,
        preTokenBalances: [
          {
            accountIndex: 1,
            mint: USDC_MINT,
            uiTokenAmount: { amount: '0' }
          }
        ],
        postTokenBalances: [
          {
            accountIndex: 1,
            mint: USDC_MINT,
            uiTokenAmount: { amount: '2500000' }
          }
        ]
      },
      transaction: {
        message: {
          instructions: [],
          accountKeys: [
            { pubkey: PAYER_ADDRESS, signer: true },
            { pubkey: '7m6mGJbhg5R4N6DNpQJe2rJTu2vD8ac9yTn8b2Wy3kYB', signer: false }
          ]
        }
      }
    };

    const connection = {
      getParsedTransaction: vi.fn().mockResolvedValue(parsedTransaction),
      getBlockTime: vi.fn().mockResolvedValue(1_709_500_000)
    };

    const service = new SolanaPaymentVerificationService(
      repo,
      () => ({
        rpcUrl: 'https://mock-solana-rpc.example.com',
        programId: '5i3vNJHo7Jkpg549uHtsKvGiEy77SmS5NKDZGwCo8Fwp',
        mintByToken: { USDC: USDC_MINT, USDT: '2Seg9ZgkCyyqdEgTkNcxG2kszh9S2GrAzcY6XjPhtGJn' },
        treasuryAtaByToken: { USDC: TREASURY_ATA, USDT: 'FFn5nBjuZLj4WBxyzUvXTs185LxpAXt4wLSRqs6KabqR' }
      }),
      () => connection as any
    );

    const result = await service.verify({ transferId: TRANSFER_ID, txHash: TX_HASH });
    expect(result.verified).toBe(true);
    expect(result.depositAddress).toBe('7m6mGJbhg5R4N6DNpQJe2rJTu2vD8ac9yTn8b2Wy3kYB');
    expect(result.amountUsd).toBe(2.5);
    expect(result.referenceHash).toBeUndefined();
    expect(result.paymentId).toBeUndefined();
  });
});
