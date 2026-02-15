'use client';

import { useEffect, useState } from 'react';
import { Loader2, Wallet } from 'lucide-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { shortenAddress, walletMode } from '@/lib/wallet/evm';
import type { WalletConnectionState } from '@/lib/contracts';

interface WalletConnectPanelProps {
  chain: 'base' | 'solana';
  onStateChange?: ((state: WalletConnectionState) => void) | undefined;
}

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
}

function getEthereumProvider(): EthereumProvider | null {
  if (typeof window === 'undefined') return null;
  const provider = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  return provider ?? null;
}

function MockWalletPanel({ chain, onStateChange }: WalletConnectPanelProps) {
  const [connected, setConnected] = useState(false);

  const address = connected
    ? chain === 'base'
      ? '0x42B7D4f716f46B3099B1e802f341f3E61F9AC5AB'
      : '3H4xN7w6mQWmR5c94UyhSxq9A7PRhJ6Yh8M9r1X2cQ3P'
    : null;

  useEffect(() => {
    onStateChange?.({
      chain,
      connected,
      address,
      connectorName: connected ? 'Mock Connector' : null
    });
  }, [address, chain, connected, onStateChange]);

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-primary" />
          Wallet (Mock Mode)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Alert>
          <AlertDescription>
            `NEXT_PUBLIC_WALLET_MODE=mock` is enabled. Connection state is simulated for testing and demos.
          </AlertDescription>
        </Alert>
        <div className="flex items-center justify-between rounded-2xl border border-border/80 bg-muted/40 px-3 py-2">
          <span className="text-sm text-muted-foreground">{shortenAddress(address)}</span>
          <Badge variant={connected ? 'success' : 'outline'}>{connected ? 'Connected' : 'Disconnected'}</Badge>
        </div>
        <Button variant={connected ? 'outline' : 'default'} onClick={() => setConnected((prev) => !prev)}>
          {connected ? 'Disconnect' : `Connect ${chain === 'base' ? 'Base' : 'Solana'} Wallet`}
        </Button>
      </CardContent>
    </Card>
  );
}

function RealBaseWalletPanel({ onStateChange }: Pick<WalletConnectPanelProps, 'onStateChange'>) {
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [providerReady, setProviderReady] = useState(false);

  useEffect(() => {
    const provider = getEthereumProvider();
    setProviderReady(Boolean(provider));
    if (!provider) return;
    const activeProvider = provider;

    let active = true;

    async function hydrate(): Promise<void> {
      try {
        const accounts = (await activeProvider.request({ method: 'eth_accounts' })) as string[];
        if (!active) return;
        setAddress(accounts[0] ?? null);
      } catch {
        if (!active) return;
        setAddress(null);
      }
    }

    const onAccountsChanged = (nextAccounts: unknown) => {
      const accounts = Array.isArray(nextAccounts) ? (nextAccounts as string[]) : [];
      setAddress(accounts[0] ?? null);
    };

    void hydrate();
    activeProvider.on?.('accountsChanged', onAccountsChanged);

    return () => {
      active = false;
      activeProvider.removeListener?.('accountsChanged', onAccountsChanged);
    };
  }, []);

  useEffect(() => {
    onStateChange?.({
      chain: 'base',
      connected: Boolean(address),
      address,
      connectorName: providerReady ? 'Injected EVM Wallet' : null
    });
  }, [address, onStateChange, providerReady]);

  async function connect(): Promise<void> {
    const provider = getEthereumProvider();
    if (!provider) return;

    setBusy(true);
    try {
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
      setAddress(accounts[0] ?? null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-primary" />
          Base Wallet
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!providerReady ? (
          <Alert>
            <AlertDescription>No injected EVM wallet detected. Install Coinbase Wallet or MetaMask to connect.</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex items-center justify-between rounded-2xl border border-border/80 bg-muted/40 px-3 py-2">
          <span className="text-sm text-muted-foreground">{shortenAddress(address)}</span>
          <Badge variant={address ? 'success' : 'outline'}>{address ? 'Connected' : 'Disconnected'}</Badge>
        </div>

        {address ? (
          <Button variant="outline" onClick={() => setAddress(null)}>
            Disconnect
          </Button>
        ) : (
          <Button onClick={connect} disabled={!providerReady || busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Connect EVM Wallet
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function RealSolanaWalletPanel({ onStateChange }: Pick<WalletConnectPanelProps, 'onStateChange'>) {
  const { connected, publicKey, wallet } = useWallet();

  useEffect(() => {
    onStateChange?.({
      chain: 'solana',
      connected,
      address: publicKey?.toBase58() ?? null,
      connectorName: wallet?.adapter?.name ?? null
    });
  }, [connected, onStateChange, publicKey, wallet?.adapter?.name]);

  return (
    <Card className="border-secondary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-secondary" />
          Solana Wallet
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-2xl border border-border/80 bg-muted/40 px-3 py-2">
          <span className="text-sm text-muted-foreground">{shortenAddress(publicKey?.toBase58() ?? null)}</span>
          <Badge variant={connected ? 'success' : 'outline'}>{connected ? 'Connected' : 'Disconnected'}</Badge>
        </div>
        <WalletMultiButton className={cn('!h-11 !rounded-2xl !px-5 !text-sm !font-semibold')} />
      </CardContent>
    </Card>
  );
}

export function WalletConnectPanel({ chain, onStateChange }: WalletConnectPanelProps) {
  if (walletMode() === 'mock') {
    return <MockWalletPanel chain={chain} onStateChange={onStateChange} />;
  }

  if (chain === 'base') {
    return <RealBaseWalletPanel onStateChange={onStateChange} />;
  }

  return <RealSolanaWalletPanel onStateChange={onStateChange} />;
}
