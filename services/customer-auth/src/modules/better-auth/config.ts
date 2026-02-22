import { getDb, schema } from '@cryptopay/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { z } from 'zod';

const signUpSchema = z.object({
  fullName: z.string().min(1),
  countryCode: z.string().min(2).max(3),
  email: z.string().email(),
  password: z.string().min(8).max(200)
});

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200)
});

const googleStartSchema = z.object({
  redirectUri: z.string().url().optional()
});

const tokenExchangeSchema = z.object({
  sessionId: z.string().min(1).optional()
});

function parseTrustedOrigins(): string[] {
  const defaults = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3100',
    'http://127.0.0.1:3100',
    'http://localhost:18080',
    'http://127.0.0.1:18080'
  ];
  const configured = (process.env.AUTH_TRUSTED_ORIGINS ?? process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return [...new Set([...defaults, ...configured])];
}

function authBaseUrl(): string {
  return (
    process.env.CUSTOMER_AUTH_PUBLIC_URL ??
    process.env.CUSTOMER_AUTH_BASE_URL ??
    `http://localhost:${process.env.CUSTOMER_AUTH_PORT ?? '3005'}`
  );
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function defaultGoogleRedirectUri(): string {
  return process.env.GOOGLE_OAUTH_REDIRECT_URL ?? 'http://localhost:3000/auth/google/callback';
}

let singletonAuth: ReturnType<typeof betterAuth> | undefined;

export function getBetterAuth(): ReturnType<typeof betterAuth> {
  if (singletonAuth) {
    return singletonAuth;
  }

  const googleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? 'mock-google-client-id';
  const googleClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? 'mock-google-client-secret';

  singletonAuth = betterAuth({
    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      schema: {
        user: schema.authUsers,
        account: schema.authAccounts,
        session: schema.authSessions,
        verification: schema.authVerifications
      }
    }),
    secret: process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_JWT_SECRET ?? 'dev-better-auth-secret-change-me',
    baseURL: authBaseUrl(),
    basePath: '/auth',
    trustedOrigins: parseTrustedOrigins(),
    emailAndPassword: {
      enabled: true
    },
    socialProviders: {
      google: {
        clientId: googleClientId,
        clientSecret: googleClientSecret
      }
    }
  });

  return singletonAuth;
}

export const schemas = {
  signUpSchema,
  signInSchema,
  googleStartSchema,
  tokenExchangeSchema
};
