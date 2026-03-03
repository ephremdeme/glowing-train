import { keccak_256 } from '@noble/hashes/sha3.js';
import { log } from '@cryptopay/observability';
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  type Chain,
  type Hex
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import { SettlementSweeperRepository, type SweepClaim } from './repository.js';

const DEPOSIT_FACTORY_ABI = [
  {
    name: 'sweep',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'salt', type: 'bytes32' },
      { name: 'token', type: 'address' }
    ],
    outputs: [{ name: 'proxy', type: 'address' }]
  }
] as const;

function toHexPrivateKey(raw: string): Hex {
  const value = raw.startsWith('0x') ? raw : `0x${raw}`;
  return value as Hex;
}

function resolveChain(network: 'mainnet' | 'sepolia'): Chain {
  return network === 'mainnet' ? base : baseSepolia;
}

function computeSweepSalt(transferId: string): Hex {
  return (`0x${Buffer.from(keccak_256(Buffer.from(transferId))).toString('hex')}`) as Hex;
}

function backoffMs(attemptCount: number, baseMs: number): number {
  const cappedExponent = Math.max(0, Math.min(attemptCount - 1, 6));
  const jitter = Math.floor(Math.random() * Math.max(250, Math.floor(baseMs / 2)));
  return baseMs * Math.pow(2, cappedExponent) + jitter;
}

export class BaseSweepService {
  private readonly account: ReturnType<typeof privateKeyToAccount>;
  private readonly walletClient: ReturnType<typeof createWalletClient>;
  private readonly publicClient: ReturnType<typeof createPublicClient>;
  private readonly chain: Chain;

  constructor(
    private readonly repository: SettlementSweeperRepository,
    private readonly config: {
      rpcUrl: string;
      network: 'mainnet' | 'sepolia';
      factoryAddress: Hex;
      ownerPrivateKey: string;
      tokenContracts: Record<'USDC' | 'USDT', Hex>;
      batchSize: number;
      maxAttempts: number;
      retryBaseMs: number;
    }
  ) {
    this.chain = resolveChain(config.network);
    this.account = privateKeyToAccount(toHexPrivateKey(config.ownerPrivateKey));
    this.walletClient = createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: http(config.rpcUrl)
    });
    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(config.rpcUrl)
    });
  }

  async runBatch(): Promise<{ swept: number; retried: number; reviewRequired: number }> {
    let swept = 0;
    let retried = 0;
    let reviewRequired = 0;

    for (let i = 0; i < this.config.batchSize; i += 1) {
      const claim = await this.repository.claimNext();
      if (!claim) break;

      const result = await this.processClaim(claim);
      if (result === 'swept') swept += 1;
      if (result === 'retried') retried += 1;
      if (result === 'review_required') reviewRequired += 1;
    }

    return { swept, retried, reviewRequired };
  }

  private async processClaim(claim: SweepClaim): Promise<'swept' | 'retried' | 'review_required'> {
    try {
      const tokenContract = this.config.tokenContracts[claim.token];
      const txHash = await this.sweepTransfer(claim.transferId, tokenContract);
      await this.repository.markSwept({
        transferId: claim.transferId,
        txHash,
        attemptCount: claim.attemptCount
      });
      return 'swept';
    } catch (error) {
      const errorMessage = (error as Error).message;
      if (claim.attemptCount < this.config.maxAttempts) {
        const retryDelayMs = backoffMs(claim.attemptCount, this.config.retryBaseMs);
        await this.repository.markRetry({
          transferId: claim.transferId,
          attemptCount: claim.attemptCount,
          retryDelayMs,
          errorMessage
        });
        return 'retried';
      }

      await this.repository.markReviewRequired({
        transferId: claim.transferId,
        attemptCount: claim.attemptCount,
        errorMessage
      });
      return 'review_required';
    }
  }

  private async sweepTransfer(transferId: string, tokenContract: Hex): Promise<string> {
    const salt = computeSweepSalt(transferId);
    const data = encodeFunctionData({
      abi: DEPOSIT_FACTORY_ABI,
      functionName: 'sweep',
      args: [salt, tokenContract]
    });

    log('info', 'base sweep attempt', {
      transferId,
      salt,
      factoryAddress: this.config.factoryAddress,
      tokenContract
    });

    const txHash = await this.walletClient.sendTransaction({
      to: this.config.factoryAddress,
      data,
      chain: this.chain,
      account: this.account
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== 'success') {
      throw new Error(`sweep transaction reverted (${txHash})`);
    }

    return txHash;
  }
}
