import { describe, expect, it } from 'vitest';
import { normalizeQueryParams } from '../src/client.js';

describe('normalizeQueryParams', () => {
  it('converts Date params to ISO strings', () => {
    const value = new Date('2026-02-22T07:57:02.666Z');
    const [normalized] = normalizeQueryParams([value]);
    expect(normalized).toBe('2026-02-22T07:57:02.666Z');
  });

  it('serializes object-like params for json/jsonb bindings', () => {
    const params = ['x', 1, true, null, { nested: 'value' }, ['a', 'b']];
    expect(normalizeQueryParams(params)).toEqual(['x', 1, true, null, '{"nested":"value"}', '["a","b"]']);
  });
});
