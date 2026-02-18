/**
 * Structured API Error Codes
 *
 * Centralized error code registry for consistent error responses
 * across all CryptoPay services. Each error has a unique code,
 * default HTTP status, and human-readable message.
 */

export interface ApiErrorDefinition {
    code: string;
    status: number;
    message: string;
}

/** Structured API error that can be thrown from any route handler. */
export class ApiError extends Error {
    readonly code: string;
    readonly status: number;
    readonly details?: unknown;

    constructor(def: ApiErrorDefinition, details?: unknown) {
        super(def.message);
        this.name = 'ApiError';
        this.code = def.code;
        this.status = def.status;
        this.details = details;
    }

    toJSON(): { error: { code: string; message: string; details?: unknown } } {
        const error: { code: string; message: string; details?: unknown } = {
            code: this.code,
            message: this.message
        };
        if (this.details !== undefined) {
            error.details = this.details;
        }
        return { error };
    }
}

// ── Authentication & Authorization ──

export const ERRORS = {
    UNAUTHORIZED: { code: 'UNAUTHORIZED', status: 401, message: 'Authentication required.' },
    FORBIDDEN: { code: 'FORBIDDEN', status: 403, message: 'Insufficient permissions.' },
    TOKEN_EXPIRED: { code: 'TOKEN_EXPIRED', status: 401, message: 'Access token has expired.' },
    INVALID_TOKEN: { code: 'INVALID_TOKEN', status: 401, message: 'Invalid or malformed token.' },
    CSRF_MISMATCH: { code: 'CSRF_MISMATCH', status: 403, message: 'CSRF token mismatch.' },

    // ── Rate Limiting ──
    RATE_LIMIT_EXCEEDED: { code: 'RATE_LIMIT_EXCEEDED', status: 429, message: 'Too many requests.' },

    // ── Validation ──
    INVALID_PAYLOAD: { code: 'INVALID_PAYLOAD', status: 400, message: 'Invalid request payload.' },
    MISSING_REQUIRED_FIELD: { code: 'MISSING_REQUIRED_FIELD', status: 400, message: 'A required field is missing.' },
    IDEMPOTENCY_CONFLICT: { code: 'IDEMPOTENCY_CONFLICT', status: 409, message: 'Idempotency key reused with different payload.' },
    MISSING_IDEMPOTENCY_KEY: { code: 'MISSING_IDEMPOTENCY_KEY', status: 400, message: 'Idempotency-Key header is required.' },

    // ── Resource ──
    NOT_FOUND: { code: 'NOT_FOUND', status: 404, message: 'Resource not found.' },
    CONFLICT: { code: 'CONFLICT', status: 409, message: 'Resource state conflict.' },

    // ── Quotes ──
    QUOTE_NOT_FOUND: { code: 'QUOTE_NOT_FOUND', status: 404, message: 'Quote not found.' },
    QUOTE_EXPIRED: { code: 'QUOTE_EXPIRED', status: 409, message: 'Quote has expired.' },

    // ── Transfers ──
    TRANSFER_NOT_FOUND: { code: 'TRANSFER_NOT_FOUND', status: 404, message: 'Transfer not found.' },
    TRANSFER_STATE_INVALID: { code: 'TRANSFER_STATE_INVALID', status: 409, message: 'Transfer is in an invalid state for this operation.' },
    TRANSFER_LIMIT_EXCEEDED: { code: 'TRANSFER_LIMIT_EXCEEDED', status: 400, message: 'Transfer amount exceeds allowed limit.' },

    // ── Payouts ──
    PAYOUT_NOT_FOUND: { code: 'PAYOUT_NOT_FOUND', status: 404, message: 'Payout instruction not found.' },
    PAYOUT_STATE_INVALID: { code: 'PAYOUT_STATE_INVALID', status: 409, message: 'Payout is in an invalid state for this operation.' },
    FEATURE_DISABLED: { code: 'FEATURE_DISABLED', status: 403, message: 'Feature is disabled.' },

    // ── Webhooks ──
    WEBHOOK_SIGNATURE_INVALID: { code: 'WEBHOOK_SIGNATURE_INVALID', status: 401, message: 'Invalid webhook signature.' },

    // ── KYC ──
    KYC_NOT_APPROVED: { code: 'KYC_NOT_APPROVED', status: 400, message: 'KYC status must be approved.' },
    NATIONAL_ID_NOT_VERIFIED: { code: 'NATIONAL_ID_NOT_VERIFIED', status: 400, message: 'National ID must be verified.' },

    // ── Internal ──
    INTERNAL_ERROR: { code: 'INTERNAL_ERROR', status: 500, message: 'An unexpected internal error occurred.' },
    SERVICE_UNAVAILABLE: { code: 'SERVICE_UNAVAILABLE', status: 503, message: 'Service temporarily unavailable.' }
} as const satisfies Record<string, ApiErrorDefinition>;
