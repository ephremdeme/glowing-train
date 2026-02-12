import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_REGION: z.enum(['offshore', 'ethiopia']),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  ETHIOPIA_SERVICES_CRYPTO_DISABLED: z
    .string()
    .default('true')
    .transform((value) => value.toLowerCase() === 'true')
    .refine((enabled) => enabled, {
      message:
        'ETHIOPIA_SERVICES_CRYPTO_DISABLED must remain true to enforce AGENTS.md legal boundary.'
    }),
  MAX_TRANSFER_USD: z.coerce.number().int().positive().max(2000).default(2000),
  PAYOUT_SLA_MINUTES: z.coerce.number().int().positive().default(10)
});

export type RuntimeConfig = z.infer<typeof envSchema>;

export function loadRuntimeConfig(input: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return envSchema.parse(input);
}
