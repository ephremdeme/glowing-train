import type { WalletContextState } from '@solana/wallet-adapter-react';
import {
  TOKEN_PROGRAM_ID,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync
} from '@solana/spl-token';
import {
  PublicKey,
  SendTransactionError,
  Transaction,
  type Connection
} from '@solana/web3.js';
import { decimalToBaseUnits } from '@/lib/solana/remittance-acceptor';
import { getMintConfig, getRemittanceAcceptorConfig, type SupportedToken } from '@/lib/solana/remittance-config';
import { getSolanaExplorerTxUrl } from '@/lib/wallet/solana';

export interface SubmitDirectTransferInput {
  connection: Connection;
  wallet: WalletContextState;
  token: SupportedToken;
  amountDecimal: string;
  destinationTokenAccount: string;
}

export interface SubmitDirectTransferResult {
  signature: string;
  explorerUrl: string;
}

function mapDirectTransferError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';

  if (message.includes('invalid destination token account')) {
    return 'Destination token account is invalid for this transfer. Use copy-address flow from an external wallet instead.';
  }
  if (message.includes('destination mint does not match')) {
    return 'Destination token account mint does not match this transfer token.';
  }
  if (message.includes('payer token account not found')) {
    return 'Your wallet does not have a token account for this asset yet.';
  }
  if (message.includes('insufficient token balance')) {
    return 'Insufficient token balance for this transfer amount.';
  }
  if (message.includes('User rejected') || message.includes('rejected the request')) {
    return 'Transaction was cancelled in wallet.';
  }
  if (message.toLowerCase().includes('blockhash')) {
    return 'Network is busy. Please retry the transfer.';
  }
  return message || 'Solana direct transfer failed unexpectedly.';
}

export async function submitDirectTokenTransfer(input: SubmitDirectTransferInput): Promise<SubmitDirectTransferResult> {
  const { connection, wallet, token, amountDecimal, destinationTokenAccount } = input;

  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Connect a Solana wallet before submitting payment.');
  }

  const payer = wallet.publicKey;
  const mintConfig = getMintConfig(token);
  const destination = new PublicKey(destinationTokenAccount);
  const amountBaseUnits = decimalToBaseUnits(amountDecimal, mintConfig.decimals);

  let destinationAccount;
  try {
    destinationAccount = await getAccount(connection, destination, 'confirmed', TOKEN_PROGRAM_ID);
  } catch {
    throw new Error('invalid destination token account');
  }

  if (!destinationAccount.mint.equals(mintConfig.mint)) {
    throw new Error('destination mint does not match');
  }

  const payerTokenAccount = getAssociatedTokenAddressSync(mintConfig.mint, payer, false, TOKEN_PROGRAM_ID);
  let payerAccount;
  try {
    payerAccount = await getAccount(connection, payerTokenAccount, 'confirmed', TOKEN_PROGRAM_ID);
  } catch {
    throw new Error('payer token account not found');
  }

  if (payerAccount.amount < amountBaseUnits) {
    throw new Error('insufficient token balance');
  }

  const instruction = createTransferCheckedInstruction(
    payerTokenAccount,
    mintConfig.mint,
    destination,
    payer,
    amountBaseUnits,
    mintConfig.decimals,
    [],
    TOKEN_PROGRAM_ID
  );

  const tx = new Transaction().add(instruction);
  tx.feePayer = payer;

  try {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;

    const signed = await wallet.signTransaction(tx);
    const signature = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: 'confirmed'
    });

    const confirmation = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed'
    );
    if (confirmation.value.err) {
      throw new Error('transaction failed on-chain');
    }

    const cluster = getRemittanceAcceptorConfig().cluster;
    return {
      signature,
      explorerUrl: getSolanaExplorerTxUrl(signature, cluster)
    };
  } catch (error) {
    throw new Error(mapDirectTransferError(error));
  }
}

