import { log } from '@cryptopay/observability';
import type { FxRate, FxRateProvider } from './types.js';

interface CacheEntry {
    rates: Record<string, number>;
    fetchedAt: Date;
}

/**
 * FX rate provider backed by ExchangeRate-API (free, no API key required).
 * Fetches from https://open.er-api.com/v6/latest/{base}
 * Rates update daily; cache avoids redundant network calls.
 */
export class ExchangeRateApiProvider implements FxRateProvider {
    private cache = new Map<string, CacheEntry>();
    private readonly cacheTtlMs: number;

    constructor(options?: { cacheTtlMs?: number }) {
        this.cacheTtlMs = options?.cacheTtlMs ?? 3_600_000; // default 1 hour
    }

    async getRate(from: string, to: string): Promise<FxRate> {
        const base = from.toUpperCase();
        const target = to.toUpperCase();
        const rates = await this.fetchRates(base);
        const rate = rates[target];

        if (rate === undefined) {
            throw new Error(`Currency ${target} not supported by ExchangeRate-API.`);
        }

        return {
            from: base,
            to: target,
            rate,
            fetchedAt: this.cache.get(base)?.fetchedAt ?? new Date(),
            source: 'exchangerate-api'
        };
    }

    private async fetchRates(base: string): Promise<Record<string, number>> {
        const cached = this.cache.get(base);
        if (cached && Date.now() - cached.fetchedAt.getTime() < this.cacheTtlMs) {
            return cached.rates;
        }

        try {
            const url = `https://open.er-api.com/v6/latest/${base}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`ExchangeRate-API responded with status ${response.status}`);
            }

            const data = (await response.json()) as {
                result: string;
                rates: Record<string, number>;
            };

            if (data.result !== 'success' || !data.rates) {
                throw new Error(`ExchangeRate-API returned unexpected payload: ${data.result}`);
            }

            const entry: CacheEntry = {
                rates: data.rates,
                fetchedAt: new Date()
            };

            this.cache.set(base, entry);
            log('info', 'FX rates fetched and cached', { base, currencyCount: Object.keys(data.rates).length });

            return data.rates;
        } catch (error) {
            // Fallback to stale cache if fetch fails and cache exists (even if expired)
            if (cached) {
                const staleness = Date.now() - cached.fetchedAt.getTime();
                if (staleness < 24 * 3_600_000) {
                    log('warn', 'FX rate fetch failed, using stale cache', {
                        base,
                        stalenessMs: staleness,
                        error: (error as Error).message
                    });
                    return cached.rates;
                }
            }

            throw new Error(`Failed to fetch FX rates for ${base}: ${(error as Error).message}`);
        }
    }

    /** Exposed for testing: clear internal cache. */
    clearCache(): void {
        this.cache.clear();
    }
}
