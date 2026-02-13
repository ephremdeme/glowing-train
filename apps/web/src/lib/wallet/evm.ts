export function shortenAddress(address: string | null): string {
  if (!address) return 'Not connected';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function walletMode(): 'real' | 'mock' {
  return process.env.NEXT_PUBLIC_WALLET_MODE === 'mock' ? 'mock' : 'real';
}
