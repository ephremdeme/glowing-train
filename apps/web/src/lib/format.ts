/**
 * Shared formatting utilities.
 */

const etbFormatter = new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' });
const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const stableFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

export function currencyEtb(value: number): string {
    return etbFormatter.format(value);
}

export function currencyUsd(value: number): string {
    return usdFormatter.format(value);
}

export function formatStableAmount(value: number, token: 'USDC' | 'USDT'): string {
    return `${stableFormatter.format(value)} ${token}`;
}

export function shortenAddress(address: string | null): string {
    if (!address) return 'Not connected';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
