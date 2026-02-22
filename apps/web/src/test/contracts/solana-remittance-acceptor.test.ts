import { describe, expect, it } from 'vitest';
import {
  decimalToBaseUnits,
  getOrCreatePaymentId,
  mapRemittanceProgramError,
  sha256Bytes
} from '@/lib/solana/remittance-acceptor';

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();

  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(data.keys())[index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    }
  };
}

describe('solana remittance acceptor helpers', () => {
  it('converts decimal amount string to base units', () => {
    expect(decimalToBaseUnits('1', 6)).toBe(1_000_000n);
    expect(decimalToBaseUnits('1.5', 6)).toBe(1_500_000n);
    expect(decimalToBaseUnits('0.000001', 6)).toBe(1n);
  });

  it('rejects invalid amount input', () => {
    expect(() => decimalToBaseUnits('0', 6)).toThrow('greater than zero');
    expect(() => decimalToBaseUnits('-2', 6)).toThrow('valid positive decimal');
    expect(() => decimalToBaseUnits('1.1234567', 6)).toThrow('up to 6 decimal places');
  });

  it('creates exact 32-byte external reference hash', async () => {
    const first = await sha256Bytes('tr_123');
    const second = await sha256Bytes('tr_123');
    expect(first.length).toBe(32);
    expect(Array.from(second)).toEqual(Array.from(first));
  });

  it('reuses stored payment id for duplicate transfer retries', () => {
    const storage = createMemoryStorage();
    const first = getOrCreatePaymentId('tr_abc', storage);
    const second = getOrCreatePaymentId('tr_abc', storage);
    const other = getOrCreatePaymentId('tr_other', storage);

    expect(second).toBe(first);
    expect(other).not.toBe(first);
  });

  it('maps known on-chain errors to user-friendly messages', () => {
    const mapped = mapRemittanceProgramError({
      error: {
        errorCode: {
          code: 'PaymentAlreadyExists'
        }
      }
    });
    expect(mapped).toContain('already submitted');
  });

  it('keeps unknown error context in fallback message', () => {
    const mapped = mapRemittanceProgramError(new Error('rpc node timeout'));
    expect(mapped).toContain('rpc node timeout');
  });
});
