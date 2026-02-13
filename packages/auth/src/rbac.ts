import type { AuthRole } from './types.js';

export function hasAnyRole(actual: AuthRole | undefined, allowed: readonly AuthRole[]): boolean {
  if (!actual) {
    return false;
  }

  return allowed.includes(actual);
}
