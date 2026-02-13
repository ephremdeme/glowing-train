import { clusterApiUrl } from '@solana/web3.js';

const validClusters = ['mainnet-beta', 'devnet', 'testnet'] as const;

type SolanaCluster = (typeof validClusters)[number];

export function getSolanaCluster(): SolanaCluster {
  const configured = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
  if (configured && validClusters.includes(configured as SolanaCluster)) {
    return configured as SolanaCluster;
  }
  return 'mainnet-beta';
}

export function getSolanaEndpoint(): string {
  return clusterApiUrl(getSolanaCluster());
}
