import { describe, expect, it } from 'vitest';
import { parseCommand } from '../src/parser.js';

describe('parseCommand', () => {
  it('parses transfer list', () => {
    expect(parseCommand(['transfers', 'list', '--status', 'AWAITING_FUNDING', '--limit', '20'])).toEqual({
      kind: 'transfers-list',
      status: 'AWAITING_FUNDING',
      limit: 20
    });
  });

  it('requires reason for payout retry', () => {
    expect(() => parseCommand(['payout', 'retry', 'tr_1'])).toThrow(/Missing required --reason/);
  });

  it('parses mark-reviewed command', () => {
    expect(parseCommand(['transfer', 'mark-reviewed', 'tr_1', '--reason', 'manual verification'])).toEqual({
      kind: 'transfer-mark-reviewed',
      transferId: 'tr_1',
      reason: 'manual verification'
    });
  });

  it('parses reconciliation run with output', () => {
    expect(parseCommand(['recon', 'run', '--reason', 'nightly validation', '--output', '/tmp/out.csv'])).toEqual({
      kind: 'recon-run',
      reason: 'nightly validation',
      outputPath: '/tmp/out.csv'
    });
  });

  it('parses retention job run', () => {
    expect(parseCommand(['jobs', 'retention-run', '--reason', 'scheduled cleanup'])).toEqual({
      kind: 'retention-run',
      reason: 'scheduled cleanup'
    });
  });
});
