import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ExchangeRateApiProvider } from '../src/fx/exchange-rate-api.js';

function mockFetchSuccess(rates: Record<string, number>) {
    return vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: 'success', rates })
    });
}

function mockFetchFailure(status = 500) {
    return vi.fn().mockResolvedValue({
        ok: false,
        status
    });
}

describe('ExchangeRateApiProvider', () => {
    let provider: ExchangeRateApiProvider;

    beforeEach(() => {
        provider = new ExchangeRateApiProvider({ cacheTtlMs: 60_000 });
        provider.clearCache();
    });

    it('fetches and returns the correct rate', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mockFetchSuccess({ ETB: 140.5, EUR: 0.92 }) as unknown as typeof fetch;

        try {
            const rate = await provider.getRate('USD', 'ETB');
            expect(rate.from).toBe('USD');
            expect(rate.to).toBe('ETB');
            expect(rate.rate).toBe(140.5);
            expect(rate.source).toBe('exchangerate-api');
            expect(rate.fetchedAt).toBeInstanceOf(Date);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('caches results and does not re-fetch within TTL', async () => {
        const fetchMock = mockFetchSuccess({ ETB: 140.5 });
        const originalFetch = globalThis.fetch;
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        try {
            await provider.getRate('USD', 'ETB');
            await provider.getRate('USD', 'ETB');
            expect(fetchMock).toHaveBeenCalledTimes(1);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('throws on unsupported currency', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mockFetchSuccess({ ETB: 140.5 }) as unknown as typeof fetch;

        try {
            await expect(provider.getRate('USD', 'INVALID')).rejects.toThrow('Currency INVALID not supported');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('uses stale cache when fetch fails and cache is < 24h old', async () => {
        const originalFetch = globalThis.fetch;

        // First, populate the cache
        globalThis.fetch = mockFetchSuccess({ ETB: 139.0 }) as unknown as typeof fetch;
        await provider.getRate('USD', 'ETB');

        // Now make cache "expired" by creating a new provider with 0ms TTL, but keep the same cache
        // Instead: re-create provider with tiny TTL so next fetch triggers a network call
        const shortProvider = new ExchangeRateApiProvider({ cacheTtlMs: 0 });
        // Manually warm its cache by calling once
        globalThis.fetch = mockFetchSuccess({ ETB: 139.0 }) as unknown as typeof fetch;
        await shortProvider.getRate('USD', 'ETB');

        // Now fail the network
        globalThis.fetch = mockFetchFailure() as unknown as typeof fetch;

        try {
            const rate = await shortProvider.getRate('USD', 'ETB');
            expect(rate.rate).toBe(139.0);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('throws when fetch fails and no cache exists', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mockFetchFailure() as unknown as typeof fetch;

        try {
            await expect(provider.getRate('USD', 'ETB')).rejects.toThrow('Failed to fetch FX rates');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
