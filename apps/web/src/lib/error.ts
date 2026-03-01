/**
 * Shared error message extraction.
 */

const SESSION_EXPIRED_PATTERN = /token expired|jwt expired|session expired/i;

export function errorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof Error)) return fallback;
    const message = error.message.trim();
    if (SESSION_EXPIRED_PATTERN.test(message)) {
        return 'Session expired. Sign in again.';
    }
    return message || fallback;
}
