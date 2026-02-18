import { verifySignedPayloadSignature } from '@cryptopay/auth';
import { log } from '@cryptopay/observability';

export interface WebhookVerifierConfig {
    /** HMAC secret shared with the bank partner. */
    secret: string;
    /** Maximum age of webhook signature in ms (default: 300_000 = 5 min). */
    maxAgeMs?: number;
    /** Header name containing the HMAC signature (default: x-webhook-signature). */
    signatureHeader?: string;
    /** Header name containing the timestamp (default: x-webhook-timestamp). */
    timestampHeader?: string;
}

export interface WebhookVerificationResult {
    valid: boolean;
    reason?: string;
}

/**
 * Verify a bank webhook callback signature.
 * Uses the same HMAC-SHA256 signed-payload pattern from @cryptopay/auth.
 */
export function verifyWebhookSignature(params: {
    body: string;
    headers: Record<string, string | string[] | undefined>;
    config: WebhookVerifierConfig;
}): WebhookVerificationResult {
    const { body, headers, config } = params;
    const sigHeader = config.signatureHeader ?? 'x-webhook-signature';
    const tsHeader = config.timestampHeader ?? 'x-webhook-timestamp';
    const maxAge = config.maxAgeMs ?? 300_000;

    const signature = headers[sigHeader];
    const timestamp = headers[tsHeader];

    if (!signature || typeof signature !== 'string') {
        return { valid: false, reason: `Missing or invalid ${sigHeader} header` };
    }

    if (!timestamp || typeof timestamp !== 'string') {
        return { valid: false, reason: `Missing or invalid ${tsHeader} header` };
    }

    try {
        const valid = verifySignedPayloadSignature({
            payload: body,
            timestampMs: timestamp,
            signatureHex: signature,
            secret: config.secret,
            maxAgeMs: maxAge
        });

        if (!valid) {
            return { valid: false, reason: 'Signature mismatch or timestamp expired' };
        }

        return { valid: true };
    } catch (error) {
        log('error', 'Webhook signature verification error', {
            error: (error as Error).message
        });
        return { valid: false, reason: 'Signature verification failed' };
    }
}
