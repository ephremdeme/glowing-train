import { clusterApiUrl } from '@solana/web3.js';

const validClusters = ['mainnet-beta', 'devnet', 'testnet'] as const;

export type SolanaCluster = (typeof validClusters)[number];

export function getSolanaCluster(): SolanaCluster {
  const configured = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
  if (configured && validClusters.includes(configured as SolanaCluster)) {
    return configured as SolanaCluster;
  }
  return 'devnet';
}

export function getSolanaEndpoint(): string {
  return clusterApiUrl(getSolanaCluster());
}

export function getSolanaExplorerTxUrl(signature: string, cluster: SolanaCluster = getSolanaCluster()): string {
  const base = `https://explorer.solana.com/tx/${signature}`;
  if (cluster === 'mainnet-beta') {
    return base;
  }
  return `${base}?cluster=${cluster}`;
}
