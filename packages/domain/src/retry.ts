/**
 * Retry utility with exponential backoff + jitter.
 *
 * Designed for adapter calls where transient failures are expected.
 * Separates retry-able from non-retry-able errors using a discriminator function.
 */

export interface RetryOptions {
    /** Maximum number of attempts (including the initial call). */
    maxAttempts: number;
    /** Base delay in ms before the first retry (default: 200). */
    baseDelayMs?: number;
    /** Maximum delay cap in ms (default: 30_000). */
    maxDelayMs?: number;
    /** Jitter factor 0–1 (default: 0.25 — adds up to 25% random jitter). */
    jitterFactor?: number;
    /** Return true if the error is retryable. All other errors are thrown immediately. */
    isRetryable: (error: unknown) => boolean;
    /** Optional callback fired before each retry wait. */
    onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

export interface RetryResult<T> {
    value: T;
    attempts: number;
}

/**
 * Calculate the delay for a given attempt using exponential backoff + jitter.
 * Formula:  min(baseDelay * 2^(attempt-1), maxDelay) * (1 + random * jitterFactor)
 */
export function calculateBackoff(attempt: number, baseDelayMs: number, maxDelayMs: number, jitterFactor: number): number {
    const exponential = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
    const jitter = 1 + Math.random() * jitterFactor;
    return Math.round(exponential * jitter);
}

/** Promise-based sleep. */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute `fn` with retry logic.
 *
 * @returns The result value and the number of attempts made.
 * @throws The last error if all attempts are exhausted, or any non-retryable error immediately.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<RetryResult<T>> {
    const {
        maxAttempts,
        baseDelayMs = 200,
        maxDelayMs = 30_000,
        jitterFactor = 0.25,
        isRetryable,
        onRetry
    } = options;

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const value = await fn();
            return { value, attempts: attempt };
        } catch (error) {
            lastError = error;

            if (!isRetryable(error)) {
                throw error;
            }

            if (attempt < maxAttempts) {
                const delay = calculateBackoff(attempt, baseDelayMs, maxDelayMs, jitterFactor);
                onRetry?.(attempt, error, delay);
                await sleep(delay);
            }
        }
    }

    // All attempts exhausted — throw the last retryable error
    throw lastError;
}
