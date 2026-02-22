import { describe, expect, it } from 'vitest';
import { normalizeQueryParams } from '../src/client.js';

describe('normalizeQueryParams', () => {
  it('converts Date params to ISO strings', () => {
    const value = new Date('2026-02-22T07:57:02.666Z');
    const [normalized] = normalizeQueryParams([value]);
    expect(normalized).toBe('2026-02-22T07:57:02.666Z');
  });

  it('leaves non-Date params unchanged', () => {
    const params = ['x', 1, true, null, { nested: 'value' }];
    expect(normalizeQueryParams(params)).toEqual(params);
  });
});
