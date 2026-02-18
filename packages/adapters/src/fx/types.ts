export interface FxRate {
    from: string;
    to: string;
    rate: number;
    fetchedAt: Date;
    source: string;
}

export interface FxRateProvider {
    /** Get the exchange rate between two currencies. */
    getRate(from: string, to: string): Promise<FxRate>;
}
