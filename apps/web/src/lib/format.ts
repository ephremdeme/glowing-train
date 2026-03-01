/**
 * Shared formatting utilities.
 */

const etbFormatter = new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' });

export function currencyEtb(value: number): string {
    return etbFormatter.format(value);
}

export function shortenAddress(address: string | null): string {
    if (!address) return 'Not connected';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
