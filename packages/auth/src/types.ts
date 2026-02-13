export type AuthRole = 'ops_viewer' | 'ops_admin' | 'compliance_viewer' | 'compliance_admin';

export type AuthTokenType = 'service' | 'admin' | 'customer';

export interface AuthClaims {
  sub: string;
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  tokenType: AuthTokenType;
  role?: AuthRole | undefined;
  scope?: string[] | undefined;
  sessionId?: string | undefined;
  amr?: string[] | undefined;
  mfa?: boolean | undefined;
}
