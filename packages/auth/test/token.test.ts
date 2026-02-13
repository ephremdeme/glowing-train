import { describe, expect, it } from 'vitest';
import { createHs256Jwt } from '../src/jwt.js';
import { authenticateBearerToken } from '../src/token.js';

describe('authenticateBearerToken', () => {
  it('accepts token with primary secret', () => {
    const token = createHs256Jwt(
      {
        sub: 'svc_core',
        iss: 'cryptopay-internal',
        aud: 'cryptopay-services',
        exp: Math.floor(Date.now() / 1000) + 300,
        iat: Math.floor(Date.now() / 1000),
        tokenType: 'service'
      },
      'primary-secret'
    );

    const claims = authenticateBearerToken({
      authorizationHeader: `Bearer ${token}`,
      secret: 'primary-secret',
      issuer: 'cryptopay-internal',
      audience: 'cryptopay-services'
    });

    expect(claims.sub).toBe('svc_core');
  });

  it('accepts token signed by previous secret in rotation', () => {
    const token = createHs256Jwt(
      {
        sub: 'ops_admin_user',
        iss: 'cryptopay-internal',
        aud: 'cryptopay-services',
        exp: Math.floor(Date.now() / 1000) + 300,
        iat: Math.floor(Date.now() / 1000),
        tokenType: 'admin',
        role: 'ops_admin'
      },
      'previous-secret'
    );

    const claims = authenticateBearerToken({
      authorizationHeader: `Bearer ${token}`,
      secret: 'current-secret',
      secrets: ['previous-secret'],
      issuer: 'cryptopay-internal',
      audience: 'cryptopay-services'
    });

    expect(claims.role).toBe('ops_admin');
  });

  it('fails with no configured secret', () => {
    expect(() =>
      authenticateBearerToken({
        authorizationHeader: 'Bearer dummy',
        issuer: 'cryptopay-internal',
        audience: 'cryptopay-services'
      })
    ).toThrow(/No JWT secret configured/);
  });

  it('accepts customer token with session claims', () => {
    const token = createHs256Jwt(
      {
        sub: 'cust_123',
        iss: 'cryptopay-internal',
        aud: 'cryptopay-services',
        exp: Math.floor(Date.now() / 1000) + 300,
        iat: Math.floor(Date.now() / 1000),
        tokenType: 'customer',
        sessionId: 'csn_123',
        amr: ['pwd'],
        mfa: false
      },
      'customer-secret'
    );

    const claims = authenticateBearerToken({
      authorizationHeader: `Bearer ${token}`,
      secret: 'customer-secret',
      issuer: 'cryptopay-internal',
      audience: 'cryptopay-services'
    });

    expect(claims.tokenType).toBe('customer');
    expect(claims.sessionId).toBe('csn_123');
    expect(claims.amr).toEqual(['pwd']);
  });
});
