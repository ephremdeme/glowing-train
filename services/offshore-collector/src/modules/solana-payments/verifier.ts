import type { SupportedToken } from '@cryptopay/domain';
import bs58 from 'bs58';
import { Connection, PublicKey } from '@solana/web3.js';
import { createHash } from 'node:crypto';
import type { TransferRepositoryPort } from '../transfers/types.js';
import {
  SolanaPaymentVerificationError,
  type VerifiedSolanaPayment,
  type VerifySolanaPaymentInput
} from './types.js';

const PAY_INSTRUCTION_DISCRIMINATOR = Uint8Array.from([119, 18, 216, 65, 192, 117, 122, 220]);
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

const DEVNET_DEFAULTS = {
  cluster: 'devnet',
  programId: '5i3vNJHo7Jkpg549uHtsKvGiEy77SmS5NKDZGwCo8Fwp',
  usdtMint: '2Seg9ZgkCyyqdEgTkNcxG2kszh9S2GrAzcY6XjPhtGJn',
  usdcMint: '6bDUveKHvCojQNt5VzsvLpScyQyDwScFVzw7mGTRP3Km',
  usdtTreasuryAta: 'FFn5nBjuZLj4WBxyzUvXTs185LxpAXt4wLSRqs6KabqR',
  usdcTreasuryAta: '89sfbTtBCGX3zCCooh4zGoxaATFEvZNWdkNjDGzCeqBu'
} as const;

interface SolanaVerificationConfig {
  rpcUrl: string;
  programId: string;
  mintByToken: Record<SupportedToken, string>;
  treasuryAtaByToken: Record<SupportedToken, string>;
}

interface DecodedPayInstruction {
  payerAddress: string;
  treasuryTokenAccount: string;
  mint: string;
  tokenProgram: string;
  systemProgram: string;
  paymentId: string;
  amountBaseUnits: bigint;
  externalRefHashHex: string;
}

type SolanaParsedTransaction = NonNullable<Awaited<ReturnType<Connection['getParsedTransaction']>>>;
type SolanaConnection = Pick<Connection, 'getParsedTransaction' | 'getBlockTime'>;
type SolanaConnectionFactory = (rpcUrl: string) => SolanaConnection;

function envOrDefault(name: string, fallback: string): string {
  const value = process.env[name];
  if (value && value.trim()) return value.trim();
  return fallback;
}

function firstEnv(names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return null;
}

function readVerificationConfig(): SolanaVerificationConfig {
  const rpcUrl = firstEnv(['SOLANA_RPC_URL']);
  if (!rpcUrl) {
    throw new SolanaPaymentVerificationError('Solana RPC is not configured.', {
      code: 'SOLANA_RPC_URL_MISSING',
      status: 503
    });
  }

  const cluster = envOrDefault('SOLANA_CLUSTER', envOrDefault('NEXT_PUBLIC_SOLANA_CLUSTER', DEVNET_DEFAULTS.cluster)).toLowerCase();
  const useDevnetDefaults = cluster === 'devnet';

  const programId = firstEnv(['SOLANA_PROGRAM_ID', 'NEXT_PUBLIC_SOLANA_PROGRAM_ID']) ?? (useDevnetDefaults ? DEVNET_DEFAULTS.programId : null);
  const usdcMint = firstEnv(['SOLANA_USDC_MINT', 'NEXT_PUBLIC_SOLANA_USDC_MINT']) ?? (useDevnetDefaults ? DEVNET_DEFAULTS.usdcMint : null);
  const usdtMint = firstEnv(['SOLANA_USDT_MINT', 'NEXT_PUBLIC_SOLANA_USDT_MINT']) ?? (useDevnetDefaults ? DEVNET_DEFAULTS.usdtMint : null);
  const usdcTreasuryAta =
    firstEnv(['SOLANA_USDC_TREASURY_ATA', 'NEXT_PUBLIC_SOLANA_USDC_TREASURY_ATA']) ?? (useDevnetDefaults ? DEVNET_DEFAULTS.usdcTreasuryAta : null);
  const usdtTreasuryAta =
    firstEnv(['SOLANA_USDT_TREASURY_ATA', 'NEXT_PUBLIC_SOLANA_USDT_TREASURY_ATA']) ?? (useDevnetDefaults ? DEVNET_DEFAULTS.usdtTreasuryAta : null);

  if (!programId || !usdcMint || !usdtMint || !usdcTreasuryAta || !usdtTreasuryAta) {
    throw new SolanaPaymentVerificationError('Solana payment verification config is incomplete.', {
      code: 'SOLANA_VERIFY_CONFIG_MISSING',
      status: 503
    });
  }

  return {
    rpcUrl,
    programId,
    mintByToken: { USDC: usdcMint, USDT: usdtMint },
    treasuryAtaByToken: { USDC: usdcTreasuryAta, USDT: usdtTreasuryAta }
  };
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function readU64Le(bytes: Uint8Array): bigint {
  if (bytes.length < 8) {
    throw new Error('u64 payload is truncated');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getBigUint64(0, true);
}

function decimalUsdToBaseUnits(amountUsd: number): bigint {
  // send_amount_usd is constrained to <= 2 decimals in current schema.
  const cents = Math.round(amountUsd * 100);
  return BigInt(cents) * 10_000n;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function toPubkeyString(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const candidate = value as { toBase58?: () => string; pubkey?: { toBase58?: () => string } | string };
    if (typeof candidate.toBase58 === 'function') return candidate.toBase58();
    if (typeof candidate.pubkey === 'string') return candidate.pubkey;
    if (candidate.pubkey && typeof candidate.pubkey === 'object' && typeof candidate.pubkey.toBase58 === 'function') {
      return candidate.pubkey.toBase58();
    }
  }
  return null;
}

function decodePayInstruction(instruction: unknown, expectedProgramId: string): DecodedPayInstruction | null {
  const typed = instruction as {
    programId?: PublicKey;
    data?: string;
    accounts?: PublicKey[];
  };

  const programId = typed.programId?.toBase58?.();
  if (!programId || programId !== expectedProgramId) {
    return null;
  }
  if (!typed.data || !Array.isArray(typed.accounts) || typed.accounts.length < 8) {
    return null;
  }

  const raw = bs58.decode(typed.data);
  if (raw.length < 56) {
    throw new SolanaPaymentVerificationError('Solana pay instruction payload is too short.', {
      code: 'SOLANA_PAY_INSTRUCTION_INVALID',
      status: 400
    });
  }

  if (!sameBytes(raw.slice(0, 8), PAY_INSTRUCTION_DISCRIMINATOR)) {
    return null;
  }

  const paymentId = readU64Le(raw.slice(8, 16)).toString();
  const amountBaseUnits = readU64Le(raw.slice(16, 24));
  const externalRefHashHex = Buffer.from(raw.slice(24, 56)).toString('hex');

  return {
    payerAddress: typed.accounts[0]!.toBase58(),
    treasuryTokenAccount: typed.accounts[4]!.toBase58(),
    mint: typed.accounts[5]!.toBase58(),
    tokenProgram: typed.accounts[6]!.toBase58(),
    systemProgram: typed.accounts[7]!.toBase58(),
    paymentId,
    amountBaseUnits,
    externalRefHashHex
  };
}

function isRetryableRpcError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    message.includes('429') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('fetch failed') ||
    message.includes('rate limit')
  );
}

export class SolanaPaymentVerificationService {
  constructor(
    private readonly repository: TransferRepositoryPort,
    private readonly configReader: () => SolanaVerificationConfig = readVerificationConfig,
    private readonly connectionFactory: SolanaConnectionFactory = (rpcUrl) => new Connection(rpcUrl, 'finalized')
  ) { }

  async verify(input: VerifySolanaPaymentInput): Promise<VerifiedSolanaPayment> {
    const transferWithRoute = await this.repository.findTransferWithRouteById(input.transferId);
    if (!transferWithRoute) {
      throw new SolanaPaymentVerificationError('Transfer not found.', {
        code: 'TRANSFER_NOT_FOUND',
        status: 404
      });
    }

    const { transfer, depositRoute } = transferWithRoute;
    if (transfer.chain !== 'solana') {
      throw new SolanaPaymentVerificationError('Transfer is not a Solana transfer.', {
        code: 'INVALID_TRANSFER_CHAIN',
        status: 400
      });
    }
    if (depositRoute.routeKind !== 'solana_program_pay') {
      throw new SolanaPaymentVerificationError('Transfer is not configured for Solana wallet-pay verification.', {
        code: 'INVALID_ROUTE_KIND',
        status: 409
      });
    }

    const config = this.configReader();
    const connection = this.connectionFactory(config.rpcUrl);

    let tx: Awaited<ReturnType<Connection['getParsedTransaction']>>;
    try {
      tx = await connection.getParsedTransaction(input.txHash, {
        commitment: 'finalized',
        maxSupportedTransactionVersion: 0
      });
    } catch (error) {
      throw new SolanaPaymentVerificationError('Failed to read Solana transaction from RPC.', {
        code: 'SOLANA_RPC_READ_FAILED',
        status: 502,
        retryable: isRetryableRpcError(error)
      });
    }

    if (!tx) {
      throw new SolanaPaymentVerificationError('Solana transaction is not available yet. Retry shortly.', {
        code: 'TX_NOT_FOUND',
        status: 409,
        retryable: true
      });
    }
    const parsedTx: SolanaParsedTransaction = tx;
    if (parsedTx.meta?.err) {
      throw new SolanaPaymentVerificationError('Solana transaction failed on-chain and cannot fund this transfer.', {
        code: 'TX_FAILED',
        status: 400
      });
    }

    const expectedReferenceHash = sha256Hex(transfer.transferId);
    if (depositRoute.referenceHash && depositRoute.referenceHash !== expectedReferenceHash) {
      throw new SolanaPaymentVerificationError('Stored transfer route reference hash does not match transfer ID.', {
        code: 'ROUTE_REFERENCE_HASH_MISMATCH',
        status: 409
      });
    }

    const expectedMint = config.mintByToken[transfer.token];
    const expectedTreasuryAta = config.treasuryAtaByToken[transfer.token];
    const expectedAmountBaseUnits = decimalUsdToBaseUnits(transfer.sendAmountUsd);
    const accountKeys = this.readAccountKeys(parsedTx);
    const decoded = this.findDecodedPayInstruction(parsedTx, config.programId);

    let referenceHash: string | undefined;
    let paymentId: string | undefined;
    let payerAddress: string | undefined;

    if (decoded) {
      if (decoded.externalRefHashHex !== expectedReferenceHash) {
        throw new SolanaPaymentVerificationError('Payment reference does not match this transfer.', {
          code: 'REFERENCE_HASH_MISMATCH',
          status: 400
        });
      }
      if (decoded.mint !== expectedMint) {
        throw new SolanaPaymentVerificationError('Payment token mint does not match transfer token.', {
          code: 'MINT_MISMATCH',
          status: 400
        });
      }
      if (decoded.treasuryTokenAccount !== expectedTreasuryAta) {
        throw new SolanaPaymentVerificationError('Payment treasury account does not match configured treasury ATA.', {
          code: 'TREASURY_ATA_MISMATCH',
          status: 400
        });
      }
      if (decoded.tokenProgram !== TOKEN_PROGRAM_ID || decoded.systemProgram !== SYSTEM_PROGRAM_ID) {
        throw new SolanaPaymentVerificationError('Payment instruction account set is invalid.', {
          code: 'PROGRAM_ACCOUNT_SET_INVALID',
          status: 400
        });
      }
      if (decoded.amountBaseUnits !== expectedAmountBaseUnits) {
        throw new SolanaPaymentVerificationError('Payment amount does not match the transfer funding amount.', {
          code: 'AMOUNT_MISMATCH',
          status: 400
        });
      }

      const signerAddress = this.resolveSignerAddress(accountKeys);
      if (!signerAddress || signerAddress !== decoded.payerAddress) {
        throw new SolanaPaymentVerificationError('Payer wallet signature is missing from transaction.', {
          code: 'PAYER_SIGNATURE_MISSING',
          status: 400
        });
      }

      referenceHash = expectedReferenceHash;
      paymentId = decoded.paymentId;
      payerAddress = decoded.payerAddress;
    } else {
      const fallbackPayerAddress = this.verifyDirectSplTransfer(parsedTx, {
        expectedMint,
        expectedTreasuryAta,
        expectedAmountBaseUnits
      });
      if (fallbackPayerAddress) {
        payerAddress = fallbackPayerAddress;
      }
    }

    let confirmedAtSeconds: number;
    try {
      confirmedAtSeconds = await this.resolveConfirmedAtSeconds(connection, parsedTx);
    } catch (error) {
      if (error instanceof SolanaPaymentVerificationError) {
        throw error;
      }
      throw new SolanaPaymentVerificationError('Failed to read Solana block timestamp from RPC.', {
        code: 'SOLANA_RPC_READ_FAILED',
        status: 502,
        retryable: isRetryableRpcError(error)
      });
    }

    const confirmedAt = new Date(confirmedAtSeconds * 1000).toISOString();

    const verified: VerifiedSolanaPayment = {
      verified: true,
      transferId: transfer.transferId,
      chain: 'solana',
      token: transfer.token,
      txHash: input.txHash,
      amountUsd: transfer.sendAmountUsd,
      depositAddress: expectedTreasuryAta,
      confirmedAt
    };
    if (referenceHash) {
      verified.referenceHash = referenceHash;
    }
    if (payerAddress) {
      verified.payerAddress = payerAddress;
    }
    if (paymentId) {
      verified.paymentId = paymentId;
    }
    return verified;
  }

  private findDecodedPayInstruction(tx: SolanaParsedTransaction, expectedProgramId: string): DecodedPayInstruction | null {
    const instructions = ((tx?.transaction?.message as unknown as { instructions?: unknown[] })?.instructions ?? []) as unknown[];
    for (const instruction of instructions) {
      const decoded = decodePayInstruction(instruction, expectedProgramId);
      if (decoded) {
        return decoded;
      }
    }
    return null;
  }

  private readAccountKeys(tx: SolanaParsedTransaction): unknown[] {
    return ((tx?.transaction?.message as unknown as { accountKeys?: unknown[] })?.accountKeys ?? []) as unknown[];
  }

  private resolveSignerAddress(accountKeys: unknown[]): string | null {
    for (const key of accountKeys) {
      const typed = key as { signer?: boolean; pubkey?: unknown };
      if (typed.signer === true) {
        const signerAddress = toPubkeyString(typed.pubkey ?? key);
        if (signerAddress) {
          return signerAddress;
        }
      }
    }
    return null;
  }

  private findAccountIndex(accountKeys: unknown[], targetAddress: string): number {
    for (let i = 0; i < accountKeys.length; i += 1) {
      const key = accountKeys[i] as { pubkey?: unknown };
      const candidate = toPubkeyString(key.pubkey ?? accountKeys[i]);
      if (candidate === targetAddress) {
        return i;
      }
    }
    return -1;
  }

  private readTokenBalance(
    balances: unknown[] | undefined,
    accountIndex: number,
    mint: string
  ): bigint | null {
    if (!Array.isArray(balances) || accountIndex < 0) {
      return null;
    }

    for (const item of balances) {
      const typed = item as {
        accountIndex?: number;
        mint?: string;
        uiTokenAmount?: { amount?: string };
      };

      if (
        typed.accountIndex === accountIndex &&
        typeof typed.mint === 'string' &&
        typed.mint.toLowerCase() === mint.toLowerCase() &&
        typeof typed.uiTokenAmount?.amount === 'string'
      ) {
        try {
          return BigInt(typed.uiTokenAmount.amount);
        } catch {
          return null;
        }
      }
    }

    return null;
  }

  private verifyDirectSplTransfer(
    tx: SolanaParsedTransaction,
    params: {
      expectedMint: string;
      expectedTreasuryAta: string;
      expectedAmountBaseUnits: bigint;
    }
  ): string | null {
    const accountKeys = this.readAccountKeys(tx);
    const treasuryAccountIndex = this.findAccountIndex(accountKeys, params.expectedTreasuryAta);
    if (treasuryAccountIndex < 0) {
      throw new SolanaPaymentVerificationError(
        'Transaction does not fund the configured treasury account for this transfer.',
        {
          code: 'TREASURY_ATA_MISMATCH',
          status: 400
        }
      );
    }

    const preAmount =
      this.readTokenBalance(tx.meta?.preTokenBalances as unknown[] | undefined, treasuryAccountIndex, params.expectedMint) ?? 0n;
    const postAmount = this.readTokenBalance(
      tx.meta?.postTokenBalances as unknown[] | undefined,
      treasuryAccountIndex,
      params.expectedMint
    );

    if (postAmount === null) {
      throw new SolanaPaymentVerificationError('Transaction does not contain the expected token transfer.', {
        code: 'PAY_INSTRUCTION_NOT_FOUND',
        status: 400
      });
    }

    const creditedAmount = postAmount - preAmount;
    if (creditedAmount !== params.expectedAmountBaseUnits) {
      throw new SolanaPaymentVerificationError('Payment amount does not match the transfer funding amount.', {
        code: 'AMOUNT_MISMATCH',
        status: 400
      });
    }

    return this.resolveSignerAddress(accountKeys);
  }

  private async resolveConfirmedAtSeconds(
    connection: SolanaConnection,
    tx: SolanaParsedTransaction
  ): Promise<number> {
    if (typeof tx?.blockTime === 'number' && tx.blockTime > 0) {
      return tx.blockTime;
    }

    if (typeof tx?.slot === 'number') {
      const slotBlockTime = await connection.getBlockTime(tx.slot);
      if (typeof slotBlockTime === 'number' && slotBlockTime > 0) {
        return slotBlockTime;
      }
    }

    throw new SolanaPaymentVerificationError('Solana block timestamp is not available yet. Retry shortly.', {
      code: 'TX_NOT_FOUND',
      status: 409,
      retryable: true
    });
  }
}
