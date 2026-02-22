import { PublicKey } from '@solana/web3.js';
import { getSolanaCluster, type SolanaCluster } from '@/lib/wallet/solana';
import devnetConfigJson from '../../../config/devnet.json';

export type SupportedToken = 'USDC' | 'USDT';

export interface RemittanceMintConfig {
  mint: PublicKey;
  treasuryAta: PublicKey;
  decimals: number;
}

export interface RemittanceAcceptorConfig {
  cluster: SolanaCluster;
  programId: PublicKey;
  usdc: RemittanceMintConfig;
  usdt: RemittanceMintConfig;
}

const DEVNET_DEFAULTS = devnetConfigJson as {
  programId: string;
  usdtMint: string;
  usdcMint: string;
  usdtTreasuryAta: string;
  usdcTreasuryAta: string;
};

const TOKEN_DECIMALS = 6;

function readRequiredPublicKey(value: string | undefined, envKey: string): PublicKey {
  if (!value || value.trim().length === 0) {
    throw new Error(`[remittance-config] Missing required Solana config value: ${envKey}.`);
  }

  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`[remittance-config] Invalid public key for ${envKey}.`);
  }
}

export function getRemittanceAcceptorConfig(): RemittanceAcceptorConfig {
  const cluster = getSolanaCluster();
  const defaults = cluster === 'devnet' ? DEVNET_DEFAULTS : undefined;

  const programId = readRequiredPublicKey(process.env.NEXT_PUBLIC_SOLANA_PROGRAM_ID ?? defaults?.programId, 'NEXT_PUBLIC_SOLANA_PROGRAM_ID');
  const usdcMint = readRequiredPublicKey(process.env.NEXT_PUBLIC_SOLANA_USDC_MINT ?? defaults?.usdcMint, 'NEXT_PUBLIC_SOLANA_USDC_MINT');
  const usdtMint = readRequiredPublicKey(process.env.NEXT_PUBLIC_SOLANA_USDT_MINT ?? defaults?.usdtMint, 'NEXT_PUBLIC_SOLANA_USDT_MINT');
  const usdcTreasuryAta = readRequiredPublicKey(
    process.env.NEXT_PUBLIC_SOLANA_USDC_TREASURY_ATA ?? defaults?.usdcTreasuryAta,
    'NEXT_PUBLIC_SOLANA_USDC_TREASURY_ATA'
  );
  const usdtTreasuryAta = readRequiredPublicKey(
    process.env.NEXT_PUBLIC_SOLANA_USDT_TREASURY_ATA ?? defaults?.usdtTreasuryAta,
    'NEXT_PUBLIC_SOLANA_USDT_TREASURY_ATA'
  );

  return {
    cluster,
    programId,
    usdc: {
      mint: usdcMint,
      treasuryAta: usdcTreasuryAta,
      decimals: TOKEN_DECIMALS
    },
    usdt: {
      mint: usdtMint,
      treasuryAta: usdtTreasuryAta,
      decimals: TOKEN_DECIMALS
    }
  };
}

export function getMintConfig(token: SupportedToken): RemittanceMintConfig {
  const config = getRemittanceAcceptorConfig();
  if (token === 'USDC') {
    return config.usdc;
  }
  return config.usdt;
}
