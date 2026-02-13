import { createHmac, timingSafeEqual } from 'node:crypto';

export function createSignedPayloadSignature(payload: string, timestampMs: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestampMs}.${payload}`).digest('hex');
}

export function verifySignedPayloadSignature(params: {
  payload: string;
  timestampMs: string;
  signatureHex: string;
  secret: string;
  maxAgeMs: number;
  nowMs?: number;
}): boolean {
  const now = params.nowMs ?? Date.now();
  const timestamp = Number(params.timestampMs);
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  if (Math.abs(now - timestamp) > params.maxAgeMs) {
    return false;
  }

  const expected = createSignedPayloadSignature(params.payload, params.timestampMs, params.secret);
  const provided = Buffer.from(params.signatureHex, 'hex');
  const computed = Buffer.from(expected, 'hex');

  return provided.length === computed.length && timingSafeEqual(provided, computed);
}
