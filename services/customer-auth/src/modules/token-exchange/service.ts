import { createHs256Jwt } from '@cryptopay/auth';

export function issueCustomerExchangeToken(params: {
  customerId: string;
  sessionId: string;
  amr: string[];
}): { token: string; expiresAt: string } {
  const now = Math.floor(Date.now() / 1000);
  const ttl = 300;

  const token = createHs256Jwt(
    {
      sub: params.customerId,
      iss: process.env.AUTH_JWT_ISSUER ?? 'cryptopay-internal',
      aud: process.env.AUTH_JWT_AUDIENCE ?? 'cryptopay-services',
      exp: now + ttl,
      iat: now,
      tokenType: 'customer',
      sessionId: params.sessionId,
      amr: params.amr,
      mfa: false
    },
    process.env.AUTH_JWT_SECRET ?? 'dev-jwt-secret-change-me'
  );

  return {
    token,
    expiresAt: new Date((now + ttl) * 1000).toISOString()
  };
}
