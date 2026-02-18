/**
 * Multi-Currency Foundation
 *
 * Defines the currency registry, payout corridors, and payout method
 * configuration for supporting multiple receive currencies beyond ETB.
 * This is the foundation — actual FX integration uses the existing
 * ExchangeRateApiProvider.
 */

export interface CurrencyDefinition {
    /** ISO 4217 currency code. */
    code: string;
    /** Human-readable name. */
    name: string;
    /** Decimal places (e.g. 2 for USD, 0 for JPY). */
    decimals: number;
    /** Symbol for display (e.g. '$', 'Br'). */
    symbol: string;
    /** Whether this currency is enabled for payouts. */
    payoutEnabled: boolean;
}

export interface PayoutCorridor {
    /** Unique corridor ID (e.g. 'USD_ETB'). */
    id: string;
    /** Source currency (what sender pays in stablecoin equivalent). */
    sendCurrency: string;
    /** Destination currency. */
    receiveCurrency: string;
    /** Supported payout methods for this corridor. */
    payoutMethods: string[];
    /** Whether this corridor is active. */
    active: boolean;
    /** Minimum send amount in source currency. */
    minSendAmount: number;
    /** Maximum send amount in source currency. */
    maxSendAmount: number;
}

// ── Currency Registry ──

export const CURRENCIES: Record<string, CurrencyDefinition> = {
    USD: { code: 'USD', name: 'US Dollar', decimals: 2, symbol: '$', payoutEnabled: false },
    ETB: { code: 'ETB', name: 'Ethiopian Birr', decimals: 2, symbol: 'Br', payoutEnabled: true },
    KES: { code: 'KES', name: 'Kenyan Shilling', decimals: 2, symbol: 'KSh', payoutEnabled: false },
    NGN: { code: 'NGN', name: 'Nigerian Naira', decimals: 2, symbol: '₦', payoutEnabled: false },
    GHS: { code: 'GHS', name: 'Ghanaian Cedi', decimals: 2, symbol: 'GH₵', payoutEnabled: false }
};

// ── Payout Corridors ──

export const PAYOUT_CORRIDORS: PayoutCorridor[] = [
    {
        id: 'USD_ETB',
        sendCurrency: 'USD',
        receiveCurrency: 'ETB',
        payoutMethods: ['bank_transfer', 'telebirr'],
        active: true,
        minSendAmount: 1,
        maxSendAmount: 10_000
    },
    {
        id: 'USD_KES',
        sendCurrency: 'USD',
        receiveCurrency: 'KES',
        payoutMethods: ['bank_transfer', 'mobile_money'],
        active: false, // Future
        minSendAmount: 1,
        maxSendAmount: 5_000
    },
    {
        id: 'USD_NGN',
        sendCurrency: 'USD',
        receiveCurrency: 'NGN',
        payoutMethods: ['bank_transfer'],
        active: false, // Future
        minSendAmount: 1,
        maxSendAmount: 5_000
    }
];

// ── Helpers ──

export function getCurrency(code: string): CurrencyDefinition | undefined {
    return CURRENCIES[code];
}

export function getActiveCorridor(sendCurrency: string, receiveCurrency: string): PayoutCorridor | undefined {
    return PAYOUT_CORRIDORS.find(
        (c) => c.sendCurrency === sendCurrency && c.receiveCurrency === receiveCurrency && c.active
    );
}

export function listActiveCorridors(): PayoutCorridor[] {
    return PAYOUT_CORRIDORS.filter((c) => c.active);
}

export function isPayoutEnabled(currency: string): boolean {
    return CURRENCIES[currency]?.payoutEnabled ?? false;
}
