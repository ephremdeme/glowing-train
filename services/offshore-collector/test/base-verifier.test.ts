import { describe, it, expect, vi, beforeEach } from 'vitest';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { BasePaymentVerificationService } from '../src/modules/base-payments/verifier.js';
import { BasePaymentVerificationError } from '../src/modules/base-payments/types.js';
import type { TransferRepositoryPort } from '../src/modules/transfers/types.js';

const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const MOCK_TX_HASH = '0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1';
const TRANSFER_ID = 'tr_test_1';

const FACTORY_ADDRESS = '0x1111111111111111111111111111111111111111';
const USDC_INIT_CODE_HASH = '0x' + '22'.repeat(32);
const USDT_INIT_CODE_HASH = '0x' + '33'.repeat(32);
const USDC_CONTRACT = '0x2222222222222222222222222222222222222222';
const USDT_CONTRACT = '0x3333333333333333333333333333333333333333';

function computeExpectedDepositAddress(transferId: string, initCodeHash: string): string {
  const salt = '0x' + Buffer.from(keccak_256(Buffer.from(transferId))).toString('hex');
  const payload = Buffer.concat([
    Buffer.from([0xff]),
    Buffer.from(FACTORY_ADDRESS.slice(2), 'hex'),
    Buffer.from(salt.slice(2), 'hex'),
    Buffer.from(initCodeHash.slice(2), 'hex')
  ]);

  const hash = Buffer.from(keccak_256(payload));
  return `0x${hash.subarray(12).toString('hex')}`;
}

function encodeAddressTopic(address: string): string {
  return `0x${'0'.repeat(24)}${address.toLowerCase().replace(/^0x/, '')}`;
}

const EXPECTED_USDC_DEPOSIT_ADDRESS = computeExpectedDepositAddress(TRANSFER_ID, USDC_INIT_CODE_HASH);

const MOCK_CONFIG = {
  rpcUrl: 'https://mock-rpc.example.com',
  tokenContracts: { USDC: USDC_CONTRACT, USDT: USDT_CONTRACT },
  factoryAddress: FACTORY_ADDRESS,
  initCodeHashUsdc: USDC_INIT_CODE_HASH,
  initCodeHashUsdt: USDT_INIT_CODE_HASH,
  treasuryAddress: '0x4444444444444444444444444444444444444444'
};

function createMockRepository(overrides?: Partial<{
  transfer: Record<string, unknown>;
  depositRoute: Record<string, unknown>;
  notFound: boolean;
}>): TransferRepositoryPort {
  return {
    findTransferWithRouteById: vi.fn().mockResolvedValue(
      overrides?.notFound
        ? null
        : {
            transfer: {
              transferId: TRANSFER_ID,
              quoteId: 'q_test_1',
              senderId: 's_1',
              receiverId: 'r_1',
              senderKycStatus: 'approved',
              chain: 'base',
              token: 'USDC',
              sendAmountUsd: 100,
              status: 'AWAITING_FUNDING',
              ...(overrides?.transfer ?? {})
            },
            depositRoute: {
              routeId: `route_${TRANSFER_ID}`,
              transferId: TRANSFER_ID,
              chain: 'base',
              token: 'USDC',
              depositAddress: EXPECTED_USDC_DEPOSIT_ADDRESS,
              routeKind: 'address_route',
              referenceHash: null,
              status: 'active',
              createdAt: new Date('2026-03-01T00:00:00.000Z'),
              ...(overrides?.depositRoute ?? {})
            }
          }
    )
  } as unknown as TransferRepositoryPort;
}

function mockRpcResponse(result: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  );
}

describe('BasePaymentVerificationService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws TRANSFER_NOT_FOUND when transfer does not exist', async () => {
    const repo = createMockRepository({ notFound: true });
    const service = new BasePaymentVerificationService(repo, () => MOCK_CONFIG);

    await expect(service.verify({ transferId: 'tr_nonexistent', txHash: MOCK_TX_HASH })).rejects.toMatchObject({
      code: 'TRANSFER_NOT_FOUND',
      status: 404
    });
  });

  it('returns observed chain amount and chain timestamp for valid transfer log', async () => {
    const repo = createMockRepository();

    const payer = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const amountHex = '0x' + (3_500_000n).toString(16); // 3.5 USDC

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementationOnce(() =>
          mockRpcResponse({
            status: '0x1',
            transactionHash: MOCK_TX_HASH,
            blockNumber: '0x10',
            logs: [
              {
                address: USDC_CONTRACT,
                topics: [ERC20_TRANSFER_TOPIC, encodeAddressTopic(payer), encodeAddressTopic(EXPECTED_USDC_DEPOSIT_ADDRESS)],
                data: amountHex,
                transactionHash: MOCK_TX_HASH,
                logIndex: '0x0',
                blockNumber: '0x10'
              }
            ]
          })
        )
        .mockImplementationOnce(() =>
          mockRpcResponse({
            number: '0x10',
            timestamp: '0x65e9f140'
          })
        )
    );

    const service = new BasePaymentVerificationService(repo, () => MOCK_CONFIG);
    const result = await service.verify({ transferId: TRANSFER_ID, txHash: MOCK_TX_HASH });

    expect(result.verified).toBe(true);
    expect(result.amountUsd).toBe(3.5);
    expect(result.depositAddress).toBe(EXPECTED_USDC_DEPOSIT_ADDRESS);
    expect(result.payerAddress).toBe(payer);
    expect(result.confirmedAt).toBe(new Date(0x65e9f140 * 1000).toISOString());
  });

  it('throws TX_NOT_FOUND when receipt is missing', async () => {
    const repo = createMockRepository();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: null }), { status: 200 })));

    const service = new BasePaymentVerificationService(repo, () => MOCK_CONFIG);
    await expect(service.verify({ transferId: TRANSFER_ID, txHash: MOCK_TX_HASH })).rejects.toMatchObject({
      code: 'TX_NOT_FOUND',
      status: 409
    });
  });

  it('throws TRANSFER_LOG_NOT_FOUND when tx does not send expected token to deposit route', async () => {
    const repo = createMockRepository();

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementationOnce(() =>
          mockRpcResponse({
            status: '0x1',
            transactionHash: MOCK_TX_HASH,
            blockNumber: '0x10',
            logs: [
              {
                address: USDC_CONTRACT,
                topics: [
                  ERC20_TRANSFER_TOPIC,
                  encodeAddressTopic('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
                  encodeAddressTopic('0xcccccccccccccccccccccccccccccccccccccccc')
                ],
                data: '0x' + (1_000_000n).toString(16),
                transactionHash: MOCK_TX_HASH,
                logIndex: '0x0',
                blockNumber: '0x10'
              }
            ]
          })
        )
        .mockImplementationOnce(() =>
          mockRpcResponse({
            number: '0x10',
            timestamp: '0x65e9f140'
          })
        )
    );

    const service = new BasePaymentVerificationService(repo, () => MOCK_CONFIG);
    await expect(service.verify({ transferId: TRANSFER_ID, txHash: MOCK_TX_HASH })).rejects.toMatchObject({
      code: 'TRANSFER_LOG_NOT_FOUND',
      status: 400
    });
  });

  it('throws DEPOSIT_ADDRESS_MISMATCH when route address is not CREATE2 derived address', async () => {
    const repo = createMockRepository({
      depositRoute: {
        depositAddress: '0x1234567890abcdef1234567890abcdef12345678'
      }
    });

    const service = new BasePaymentVerificationService(repo, () => MOCK_CONFIG);
    await expect(service.verify({ transferId: TRANSFER_ID, txHash: MOCK_TX_HASH })).rejects.toMatchObject({
      code: 'DEPOSIT_ADDRESS_MISMATCH',
      status: 400
    });
  });

  it('throws TOKEN_CONTRACT_MISSING when transfer token is unsupported', async () => {
    const unsupportedTokenTransferId = 'tr_test_unsupported_token';
    const unsupportedAddress = computeExpectedDepositAddress(unsupportedTokenTransferId, USDT_INIT_CODE_HASH);
    const repo = createMockRepository({
      transfer: {
        transferId: unsupportedTokenTransferId,
        token: 'DAI'
      },
      depositRoute: {
        transferId: unsupportedTokenTransferId,
        depositAddress: unsupportedAddress
      }
    });

    vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() =>
      mockRpcResponse({
        status: '0x1',
        transactionHash: MOCK_TX_HASH,
        blockNumber: '0x10',
        logs: []
      })
    ).mockImplementationOnce(() =>
      mockRpcResponse({
        number: '0x10',
        timestamp: '0x65e9f140'
      })
    ));

    const service = new BasePaymentVerificationService(repo, () => MOCK_CONFIG);
    await expect(service.verify({ transferId: unsupportedTokenTransferId, txHash: MOCK_TX_HASH })).rejects.toMatchObject({
      code: 'TOKEN_CONTRACT_MISSING',
      status: 503
    });
  });

  it('marks BASE_RPC_READ_FAILED as retryable for timeout-like upstream errors', async () => {
    const repo = createMockRepository();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('request timeout while calling RPC')));

    const service = new BasePaymentVerificationService(repo, () => MOCK_CONFIG);
    await expect(service.verify({ transferId: TRANSFER_ID, txHash: MOCK_TX_HASH })).rejects.toMatchObject({
      code: 'BASE_RPC_READ_FAILED',
      status: 502,
      retryable: true
    });
  });
});
