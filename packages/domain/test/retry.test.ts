import { describe, expect, it } from 'vitest';
import { calculateBackoff, withRetry } from '../src/retry.js';

class RetryableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RetryableError';
    }
}

class NonRetryableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NonRetryableError';
    }
}

describe('calculateBackoff', () => {
    it('returns base delay for first attempt', () => {
        const delay = calculateBackoff(1, 200, 30000, 0);
        expect(delay).toBe(200);
    });

    it('doubles delay for each subsequent attempt', () => {
        const d1 = calculateBackoff(1, 200, 30000, 0);
        const d2 = calculateBackoff(2, 200, 30000, 0);
        const d3 = calculateBackoff(3, 200, 30000, 0);
        expect(d2).toBe(d1 * 2);
        expect(d3).toBe(d1 * 4);
    });

    it('caps delay at maxDelayMs', () => {
        const delay = calculateBackoff(20, 200, 5000, 0);
        expect(delay).toBe(5000);
    });

    it('adds jitter within expected range', () => {
        const base = calculateBackoff(1, 1000, 30000, 0);
        const delays = Array.from({ length: 100 }, () => calculateBackoff(1, 1000, 30000, 0.5));
        for (const d of delays) {
            expect(d).toBeGreaterThanOrEqual(base);
            expect(d).toBeLessThanOrEqual(base * 1.5);
        }
    });
});

describe('withRetry', () => {
    it('returns on first success', async () => {
        let calls = 0;
        const result = await withRetry(
            async () => {
                calls += 1;
                return 'ok';
            },
            { maxAttempts: 3, isRetryable: () => true, baseDelayMs: 1 }
        );

        expect(result.value).toBe('ok');
        expect(result.attempts).toBe(1);
        expect(calls).toBe(1);
    });

    it('retries on retryable error and succeeds', async () => {
        let calls = 0;
        const result = await withRetry(
            async () => {
                calls += 1;
                if (calls < 3) {
                    throw new RetryableError('transient');
                }
                return 'recovered';
            },
            { maxAttempts: 5, isRetryable: (e) => e instanceof RetryableError, baseDelayMs: 1 }
        );

        expect(result.value).toBe('recovered');
        expect(result.attempts).toBe(3);
    });

    it('throws immediately on non-retryable error', async () => {
        let calls = 0;
        await expect(
            withRetry(
                async () => {
                    calls += 1;
                    throw new NonRetryableError('permanent');
                },
                { maxAttempts: 5, isRetryable: (e) => e instanceof RetryableError, baseDelayMs: 1 }
            )
        ).rejects.toThrow('permanent');

        expect(calls).toBe(1);
    });

    it('throws last error when all attempts exhausted', async () => {
        let calls = 0;
        await expect(
            withRetry(
                async () => {
                    calls += 1;
                    throw new RetryableError(`fail-${calls}`);
                },
                { maxAttempts: 3, isRetryable: (e) => e instanceof RetryableError, baseDelayMs: 1 }
            )
        ).rejects.toThrow('fail-3');

        expect(calls).toBe(3);
    });

    it('calls onRetry callback before each retry wait', async () => {
        const retries: Array<{ attempt: number; error: string }> = [];
        let calls = 0;

        await withRetry(
            async () => {
                calls += 1;
                if (calls < 3) {
                    throw new RetryableError(`err-${calls}`);
                }
                return 'done';
            },
            {
                maxAttempts: 5,
                isRetryable: (e) => e instanceof RetryableError,
                baseDelayMs: 1,
                onRetry: (attempt, error) => {
                    retries.push({ attempt, error: (error as Error).message });
                }
            }
        );

        expect(retries).toHaveLength(2);
        expect(retries[0]?.attempt).toBe(1);
        expect(retries[0]?.error).toBe('err-1');
        expect(retries[1]?.attempt).toBe(2);
        expect(retries[1]?.error).toBe('err-2');
    });
});
