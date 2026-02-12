export function isTelebirrEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PAYOUT_TELEBIRR_ENABLED === 'true';
}
