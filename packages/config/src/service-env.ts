import { z } from 'zod';

function emptyStringToUndefined(value: unknown): unknown {
  if (typeof value === 'string' && value.length === 0) {
    return undefined;
  }
  return value;
}

const optionalString = z.preprocess(emptyStringToUndefined, z.string().optional());
const optionalNonEmptyString = z.preprocess(emptyStringToUndefined, z.string().min(1).optional());

const boolFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const optionalUrl = z.preprocess(emptyStringToUndefined, z.string().url().optional());

const jwtSchema = z.object({
  AUTH_JWT_SECRET: z.string().min(1).default('dev-jwt-secret-change-me'),
  AUTH_JWT_PREVIOUS_SECRET: optionalNonEmptyString,
  AUTH_JWT_ISSUER: z.string().min(1).default('cryptopay-internal'),
  AUTH_JWT_AUDIENCE: z.string().min(1).default('cryptopay-services')
});

const coreApiSchema = jwtSchema.extend({
  RECONCILIATION_WORKER_URL: z.string().url().default('http://localhost:3004'),
  OFFSHORE_COLLECTOR_URL: z.string().url().default('http://localhost:3002'),
  PAYOUT_ORCHESTRATOR_URL: z.string().url().default('http://localhost:3003'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(200),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  FX_RATE_CACHE_TTL_MS: z.coerce.number().int().positive().default(3_600_000),
  FX_RATE_TOLERANCE_PERCENT: z.coerce.number().min(0).max(100).default(2),
  WATCHER_CALLBACK_SECRET: z.string().min(1).default('dev-callback-secret-change-me'),
  WATCHER_CALLBACK_MAX_AGE_MS: z.coerce.number().int().positive().default(300_000),
  SUMSUB_WEBHOOK_SECRET: optionalNonEmptyString,
  SUMSUB_WEBHOOK_MAX_AGE_MS: z.coerce.number().int().positive().default(300_000),
  PAYOUT_SLA_MINUTES: z.coerce.number().int().positive().default(10),
  DATA_KEY_B64: optionalNonEmptyString,
  DATA_KEY_ID: z.string().min(1).default('dev-key'),
  DATA_KEY_VERSION: z.string().min(1).default('v1')
});

const customerAuthSchema = jwtSchema.extend({
  BETTER_AUTH_SECRET: optionalNonEmptyString,
  AUTH_TRUSTED_ORIGINS: optionalString,
  CORS_ALLOWED_ORIGINS: optionalString,
  CUSTOMER_AUTH_PUBLIC_URL: optionalUrl,
  CUSTOMER_AUTH_BASE_URL: optionalUrl,
  CUSTOMER_AUTH_PORT: z.coerce.number().int().min(1).max(65_535).default(3005),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).default('mock-google-client-id'),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).default('mock-google-client-secret'),
  GOOGLE_OAUTH_REDIRECT_URL: z.string().url().default('http://localhost:3000/auth/google/callback'),
  SESSION_CLEANUP_GRACE_MINUTES: z.coerce.number().int().positive().default(1440),
  SESSION_CLEANUP_BATCH_SIZE: z.coerce.number().int().positive().default(5000)
});

const offshoreCollectorSchema = jwtSchema.extend({
  DEPOSIT_MASTER_SEED: z.string().min(1).default('dev-master-seed')
});

const payoutOrchestratorSchema = jwtSchema
  .extend({
    BANK_WEBHOOK_SIGNATURE_ENABLED: boolFromString,
    BANK_WEBHOOK_SECRET: optionalString,
    BANK_WEBHOOK_MAX_AGE_MS: z.coerce.number().int().positive().default(300_000),
    BANK_WEBHOOK_SIG_HEADER: z.string().min(1).default('x-webhook-signature'),
    BANK_WEBHOOK_TS_HEADER: z.string().min(1).default('x-webhook-timestamp')
  })
  .superRefine((value, context) => {
    if (value.BANK_WEBHOOK_SIGNATURE_ENABLED && (!value.BANK_WEBHOOK_SECRET || value.BANK_WEBHOOK_SECRET.length === 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BANK_WEBHOOK_SECRET'],
        message: 'BANK_WEBHOOK_SECRET is required when BANK_WEBHOOK_SIGNATURE_ENABLED=true.'
      });
    }
  });

const reconciliationWorkerSchema = jwtSchema.extend({
  RECONCILIATION_LOOKBACK_DAYS: z.coerce.number().int().positive().default(14),
  RECONCILIATION_PAGE_SIZE: z.coerce.number().int().positive().max(2_000).default(500),
  RECONCILIATION_INTERVAL_MS: z.coerce.number().int().positive().default(5 * 60 * 1000),
  RETENTION_JOB_INTERVAL_MS: z.coerce.number().int().positive().default(60 * 60 * 1000),
  KEY_VERIFICATION_INTERVAL_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RECONCILIATION_SCHEDULER_ENABLED: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  RETENTION_SCHEDULER_ENABLED: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  KEY_VERIFICATION_SCHEDULER_ENABLED: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  RECONCILIATION_SCHEDULED_OUTPUT_PATH: optionalString
});

export type CoreApiServiceEnv = z.infer<typeof coreApiSchema>;
export type CustomerAuthServiceEnv = z.infer<typeof customerAuthSchema>;
export type OffshoreCollectorServiceEnv = z.infer<typeof offshoreCollectorSchema>;
export type PayoutOrchestratorServiceEnv = z.infer<typeof payoutOrchestratorSchema>;
export type ReconciliationWorkerServiceEnv = z.infer<typeof reconciliationWorkerSchema>;

export function loadCoreApiServiceEnv(input: NodeJS.ProcessEnv = process.env): CoreApiServiceEnv {
  return coreApiSchema.parse(input);
}

export function loadCustomerAuthServiceEnv(input: NodeJS.ProcessEnv = process.env): CustomerAuthServiceEnv {
  const parsed = customerAuthSchema.parse(input);
  return {
    ...parsed,
    BETTER_AUTH_SECRET: parsed.BETTER_AUTH_SECRET ?? parsed.AUTH_JWT_SECRET
  };
}

export function loadOffshoreCollectorServiceEnv(input: NodeJS.ProcessEnv = process.env): OffshoreCollectorServiceEnv {
  return offshoreCollectorSchema.parse(input);
}

export function loadPayoutOrchestratorServiceEnv(input: NodeJS.ProcessEnv = process.env): PayoutOrchestratorServiceEnv {
  return payoutOrchestratorSchema.parse(input);
}

export function loadReconciliationWorkerServiceEnv(
  input: NodeJS.ProcessEnv = process.env
): ReconciliationWorkerServiceEnv {
  return reconciliationWorkerSchema.parse(input);
}
