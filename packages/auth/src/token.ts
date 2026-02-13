import { hasAnyRole } from './rbac.js';
import { verifyHs256Jwt } from './jwt.js';
import type { AuthClaims, AuthRole } from './types.js';

export function extractBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader) {
    throw new Error('Missing Authorization header.');
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new Error('Invalid Authorization header format.');
  }

  return token;
}

export function authenticateBearerToken(params: {
  authorizationHeader: string | undefined;
  secret?: string;
  secrets?: string[];
  issuer: string;
  audience: string;
}): AuthClaims {
  const token = extractBearerToken(params.authorizationHeader);

  const configuredSecrets = [
    ...(params.secret ? [params.secret] : []),
    ...(params.secrets ?? [])
  ].filter((value, index, all) => all.indexOf(value) === index);

  if (configuredSecrets.length === 0) {
    throw new Error('No JWT secret configured.');
  }

  let lastError: Error | undefined;
  for (const secret of configuredSecrets) {
    try {
      return verifyHs256Jwt(token, secret, {
        issuer: params.issuer,
        audience: params.audience
      });
    } catch (error) {
      lastError = error as Error;
    }
  }

  throw lastError ?? new Error('Token verification failed.');
}

export function assertHasRole(claims: AuthClaims, allowedRoles: readonly AuthRole[]): void {
  if (!hasAnyRole(claims.role, allowedRoles)) {
    throw new Error('Forbidden: insufficient role.');
  }
}

export function assertTokenType(claims: AuthClaims, allowedTypes: ReadonlyArray<AuthClaims['tokenType']>): void {
  if (!allowedTypes.includes(claims.tokenType)) {
    throw new Error('Forbidden: invalid token type.');
  }
}
