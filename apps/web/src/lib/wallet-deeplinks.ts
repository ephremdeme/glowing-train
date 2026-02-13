export interface DepositIntent {
  chain: 'base' | 'solana';
  token: 'USDC' | 'USDT';
  to: string;
  amountUsd: number;
}

const SOLANA_MINTS: Record<'USDC' | 'USDT', string> = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2tQeMgs6BvWvV6H1S4g9xq8a'
};

function toAmount(value: number): string {
  return Number(value.toFixed(6)).toString();
}

export function buildCoinbaseWalletDeepLink(intent: DepositIntent): string {
  const params = new URLSearchParams({
    address: intent.to,
    amount: toAmount(intent.amountUsd),
    asset: intent.token,
    network: intent.chain === 'base' ? 'base' : 'solana'
  });
  return `https://go.cb-w.com/send?${params.toString()}`;
}

export function buildPhantomDeepLink(intent: DepositIntent): string | null {
  if (intent.chain !== 'solana') {
    return null;
  }

  const params = new URLSearchParams({
    to: intent.to,
    amount: toAmount(intent.amountUsd),
    splToken: SOLANA_MINTS[intent.token]
  });
  return `https://phantom.app/ul/v1/transfer?${params.toString()}`;
}

export function getWalletDeepLinkPresets(intent: DepositIntent): Array<{ id: string; label: string; href: string }> {
  const presets = [
    {
      id: 'coinbase',
      label: 'Open Coinbase Wallet',
      href: buildCoinbaseWalletDeepLink(intent)
    }
  ];

  const phantom = buildPhantomDeepLink(intent);
  if (phantom) {
    presets.push({
      id: 'phantom',
      label: 'Open Phantom',
      href: phantom
    });
  }

  return presets;
}
