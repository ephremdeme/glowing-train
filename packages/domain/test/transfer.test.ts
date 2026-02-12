import { describe, expect, it } from 'vitest';
import { canTransition } from '../src/transfer.js';

describe('transfer state transitions', () => {
  it('allows valid forward transitions', () => {
    expect(canTransition('AWAITING_FUNDING', 'FUNDING_CONFIRMED')).toBe(true);
    expect(canTransition('FUNDING_CONFIRMED', 'PAYOUT_INITIATED')).toBe(true);
  });

  it('blocks invalid transitions', () => {
    expect(canTransition('AWAITING_FUNDING', 'PAYOUT_COMPLETED')).toBe(false);
    expect(canTransition('PAYOUT_COMPLETED', 'PAYOUT_FAILED')).toBe(false);
  });
});
