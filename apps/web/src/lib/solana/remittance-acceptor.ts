import { AnchorProvider, BN, Program, type Idl } from '@coral-xyz/anchor';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PublicKey, SystemProgram, type Connection, type Transaction, type VersionedTransaction } from '@solana/web3.js';
import remittanceAcceptorIdlJson from '../../../config/remittance_acceptor.json';
import { getMintConfig, getRemittanceAcceptorConfig, type SupportedToken } from '@/lib/solana/remittance-config';
import { getSolanaExplorerTxUrl } from '@/lib/wallet/solana';

const PAYMENT_ID_STORAGE_PREFIX = 'cryptopay:web:solana-payment-id:';
const U64_MAX = 18_446_744_073_709_551_615n;

const ERROR_MESSAGES: Record<string, string> = {
  InvalidMint: 'Selected token mint is not supported by the remittance program.',
  InvalidTreasuryAccount: 'Treasury account configuration does not match the selected token.',
  AmountMustBePositive: 'Payment amount must be greater than zero.',
  PaymentAlreadyExists: 'This payment was already submitted. Please use the existing transaction signature.',
  Unauthorized: 'Connected wallet is not authorized for this action.'
};

export interface SubmitPayTransactionInput {
  connection: Connection;
  wallet: WalletContextState;
  token: SupportedToken;
  amountDecimal: string;
  transferId: string;
  externalReference: string;
}

export interface SubmitPayTransactionResult {
  signature: string;
  explorerUrl: string;
  paymentId: string;
}

interface AnchorCompatibleWallet {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.sessionStorage;
}

function getPaymentIdStorageKey(transferId: string): string {
  return `${PAYMENT_ID_STORAGE_PREFIX}${transferId}`;
}

export function generatePaymentId(nowMs = Date.now(), randomInt = Math.floor(Math.random() * 1_000_000)): bigint {
  const next = BigInt(nowMs) * 1_000_000n + BigInt(randomInt);
  if (next <= 0n || next > U64_MAX) {
    throw new Error('Generated payment id is out of u64 range.');
  }
  return next;
}

export function getOrCreatePaymentId(transferId: string, storage: Storage | null = getSessionStorage()): bigint {
  const key = getPaymentIdStorageKey(transferId);
  const existing = storage?.getItem(key);
  if (existing) {
    const existingValue = BigInt(existing);
    if (existingValue > 0n && existingValue <= U64_MAX) {
      return existingValue;
    }
  }

  const paymentId = generatePaymentId();
  storage?.setItem(key, paymentId.toString());
  return paymentId;
}

export function toU64LeBytes(value: bigint): Uint8Array {
  if (value < 0n || value > U64_MAX) {
    throw new Error('Value is outside u64 range.');
  }

  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0, value, true);
  return bytes;
}

export function decimalToBaseUnits(value: string, decimals: number): bigint {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error('Amount must be a valid positive decimal value.');
  }

  const [whole = '0', fraction = ''] = normalized.split('.');
  if (fraction.length > decimals) {
    throw new Error(`Amount supports up to ${decimals} decimal places.`);
  }

  const base = 10n ** BigInt(decimals);
  const wholeUnits = BigInt(whole) * base;
  const fractionUnits = BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals));
  const units = wholeUnits + fractionUnits;

  if (units <= 0n) {
    throw new Error(ERROR_MESSAGES.AmountMustBePositive);
  }

  return units;
}

export async function sha256Bytes(value: string): Promise<Uint8Array> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

function extractAnchorErrorCode(error: unknown): string | null {
  const candidate = error as
    | { error?: { errorCode?: { code?: string } }; errorCode?: { code?: string }; message?: string }
    | undefined;

  if (candidate?.error?.errorCode?.code) {
    return candidate.error.errorCode.code;
  }
  if (candidate?.errorCode?.code) {
    return candidate.errorCode.code;
  }

  const message = candidate?.message ?? '';
  for (const code of Object.keys(ERROR_MESSAGES)) {
    if (message.includes(code)) {
      return code;
    }
  }
  return null;
}

export function mapRemittanceProgramError(error: unknown): string {
  const code = extractAnchorErrorCode(error);
  if (code && ERROR_MESSAGES[code]) {
    return ERROR_MESSAGES[code];
  }

  const message = error instanceof Error ? error.message : null;
  return message ? `Solana payment failed: ${message}` : 'Solana payment failed due to an unexpected error.';
}

function toAnchorWallet(wallet: WalletContextState): AnchorCompatibleWallet {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Connect a Solana wallet before submitting payment.');
  }

  const signTransaction = wallet.signTransaction;

  return {
    publicKey: wallet.publicKey,
    signTransaction,
    signAllTransactions:
      wallet.signAllTransactions ??
      (async (transactions) => Promise.all(transactions.map((tx) => signTransaction(tx))))
  };
}

function createProgram(connection: Connection, wallet: WalletContextState): Program {
  const config = getRemittanceAcceptorConfig();
  const provider = new AnchorProvider(connection, toAnchorWallet(wallet), {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed'
  });

  const idl = { ...remittanceAcceptorIdlJson, address: config.programId.toBase58() } as Idl;
  return new Program(idl, provider);
}

export async function submitPayTransaction(input: SubmitPayTransactionInput): Promise<SubmitPayTransactionResult> {
  const { connection, wallet, token, amountDecimal, transferId, externalReference } = input;
  const config = getRemittanceAcceptorConfig();
  const mintConfig = getMintConfig(token);
  const program = createProgram(connection, wallet);

  if (!wallet.publicKey) {
    throw new Error('Connect a Solana wallet before submitting payment.');
  }

  const externalRefHash = await sha256Bytes(externalReference);
  const paymentId = getOrCreatePaymentId(transferId);
  const amountBaseUnits = decimalToBaseUnits(amountDecimal, mintConfig.decimals);

  const [configPda] = PublicKey.findProgramAddressSync([new TextEncoder().encode('config')], config.programId);
  const [paymentPda] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode('payment'), toU64LeBytes(paymentId)],
    config.programId
  );

  const payer = wallet.publicKey;
  const payerTokenAccount = getAssociatedTokenAddressSync(mintConfig.mint, payer, false);

  try {
    const signature = await (program.methods as unknown as {
      pay: (paymentId: BN, amount: BN, externalRefHash: number[]) => {
        accounts: (accounts: {
          payer: PublicKey;
          config: PublicKey;
          payment: PublicKey;
          payerTokenAccount: PublicKey;
          treasuryTokenAccount: PublicKey;
          mint: PublicKey;
          tokenProgram: PublicKey;
          systemProgram: PublicKey;
        }) => {
          rpc: () => Promise<string>;
        };
      };
    })
      .pay(new BN(paymentId.toString()), new BN(amountBaseUnits.toString()), Array.from(externalRefHash))
      .accounts({
        payer,
        config: configPda,
        payment: paymentPda,
        payerTokenAccount,
        treasuryTokenAccount: mintConfig.treasuryAta,
        mint: mintConfig.mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId
      })
      .rpc();

    return {
      signature,
      explorerUrl: getSolanaExplorerTxUrl(signature, config.cluster),
      paymentId: paymentId.toString()
    };
  } catch (error) {
    throw new Error(mapRemittanceProgramError(error));
  }
}
