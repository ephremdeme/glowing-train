import { describe, expect, it, vi } from 'vitest';
import { buildPayoutLink } from '../src/modules/payout-link/index.js';

describe('payout-link', () => {
  it('forwards validated payload to orchestrator client', async () => {
    const initiate = vi.fn(async () => ({
      status: 'initiated' as const,
      payoutId: 'pay_1',
      transferId: 'tr_1'
    }));

    const link = buildPayoutLink({ initiate });

    const result = await link.initiate({
      transferId: 'tr_1',
      method: 'bank',
      recipientAccountRef: 'CBE-0001',
      amountEtb: 10000,
      idempotencyKey: 'idem-link-001'
    });

    expect(initiate).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('initiated');
  });

  it('rejects invalid payload before orchestrator call', async () => {
    const initiate = vi.fn();
    const link = buildPayoutLink({ initiate });

    await expect(
      link.initiate({
        transferId: '',
        method: 'bank',
        recipientAccountRef: 'x',
        amountEtb: -1,
        idempotencyKey: 'short'
      })
    ).rejects.toThrow();

    expect(initiate).not.toHaveBeenCalled();
  });
});
