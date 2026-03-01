export { shortenAddress } from '@/lib/format';

export function walletMode(): 'real' | 'mock' {
  return process.env.NEXT_PUBLIC_WALLET_MODE === 'mock' ? 'mock' : 'real';
}
