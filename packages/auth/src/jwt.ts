import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { AuthClaims } from './types.js';

const claimsSchema = z.object({
  sub: z.string().min(1),
  iss: z.string().min(1),
  aud: z.string().min(1),
  exp: z.number().int().positive(),
  iat: z.number().int().positive(),
  tokenType: z.enum(['service', 'admin', 'customer']),
  role: z.enum(['ops_viewer', 'ops_admin', 'compliance_viewer', 'compliance_admin']).optional(),
  scope: z.array(z.string()).optional(),
  sessionId: z.string().min(1).optional(),
  amr: z.array(z.string().min(1)).optional(),
  mfa: z.boolean().optional()
});

function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function fromBase64Url(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function createHs256Jwt(claims: AuthClaims, secret: string): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const headerPart = toBase64Url(JSON.stringify(header));
  const payloadPart = toBase64Url(JSON.stringify(claims));
  const signingInput = `${headerPart}.${payloadPart}`;
  const signaturePart = sign(signingInput, secret);

  return `${signingInput}.${signaturePart}`;
}

export function verifyHs256Jwt(token: string, secret: string, expected: { issuer: string; audience: string }): AuthClaims {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format.');
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  if (!headerPart || !payloadPart || !signaturePart) {
    throw new Error('Invalid JWT parts.');
  }

  const computed = sign(`${headerPart}.${payloadPart}`, secret);
  const providedBuffer = fromBase64Url(signaturePart);
  const computedBuffer = fromBase64Url(computed);

  if (providedBuffer.length !== computedBuffer.length || !timingSafeEqual(providedBuffer, computedBuffer)) {
    throw new Error('JWT signature verification failed.');
  }

  const rawPayload = JSON.parse(fromBase64Url(payloadPart).toString('utf8'));
  const claims = claimsSchema.parse(rawPayload);

  if (claims.iss !== expected.issuer) {
    throw new Error('Invalid token issuer.');
  }

  if (claims.aud !== expected.audience) {
    throw new Error('Invalid token audience.');
  }

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp <= now) {
    throw new Error('Token expired.');
  }

  return claims;
}
