export function makeIdempotencyKey(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}
