'use client';

import '@solana/wallet-adapter-react-ui/styles.css';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { getSolanaEndpoint } from '@/lib/wallet/solana';
import { walletMode } from '@/lib/wallet/evm';

export function WalletProvider({ children }: { children: ReactNode }) {
  const mode = walletMode();

  const wallets = useMemo(() => {
    if (mode === 'mock') {
      return [];
    }
    return [new PhantomWalletAdapter(), new SolflareWalletAdapter()];
  }, [mode]);

  if (mode === 'mock') {
    return <>{children}</>;
  }

  return (
    <ConnectionProvider endpoint={getSolanaEndpoint()}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}
