import type { ParsedCommand } from './types.js';

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  if (index < 0) {
    return undefined;
  }

  return args[index + 1];
}

function parseReason(args: string[]): string {
  const reason = readFlag(args, 'reason');
  if (!reason || reason.trim().length < 3) {
    throw new Error('Missing required --reason for write action (minimum 3 characters).');
  }

  return reason.trim();
}

export function parseCommand(argv: string[]): ParsedCommand {
  const [scope, action, third] = argv;

  if (scope === 'transfers' && action === 'list') {
    const status = readFlag(argv, 'status');
    const limitRaw = readFlag(argv, 'limit');
    const limit = limitRaw ? Number(limitRaw) : undefined;

    if (limitRaw && (!Number.isInteger(limit) || (limit ?? 0) <= 0)) {
      throw new Error('Invalid --limit value. It must be a positive integer.');
    }

    return {
      kind: 'transfers-list',
      ...(status ? { status } : {}),
      ...(limit !== undefined ? { limit } : {})
    };
  }

  if (scope === 'transfer' && action === 'inspect') {
    if (!third) {
      throw new Error('Usage: ops-cli transfer inspect <transferId>');
    }

    return {
      kind: 'transfer-inspect',
      transferId: third
    };
  }

  if (scope === 'payout' && action === 'retry') {
    if (!third) {
      throw new Error('Usage: ops-cli payout retry <transferId> --reason "..."');
    }

    return {
      kind: 'payout-retry',
      transferId: third,
      reason: parseReason(argv)
    };
  }

  if (scope === 'transfer' && action === 'mark-reviewed') {
    if (!third) {
      throw new Error('Usage: ops-cli transfer mark-reviewed <transferId> --reason "..."');
    }

    return {
      kind: 'transfer-mark-reviewed',
      transferId: third,
      reason: parseReason(argv)
    };
  }

  if (scope === 'recon' && action === 'run') {
    const outputPath = readFlag(argv, 'output');
    return {
      kind: 'recon-run',
      reason: parseReason(argv),
      ...(outputPath ? { outputPath } : {})
    };
  }

  if (scope === 'recon' && action === 'issues') {
    const since = readFlag(argv, 'since');
    return {
      kind: 'recon-issues',
      ...(since ? { since } : {})
    };
  }

  if (scope === 'jobs' && action === 'retention-run') {
    return {
      kind: 'retention-run',
      reason: parseReason(argv)
    };
  }

  if (scope === 'jobs' && action === 'key-verification-run') {
    return {
      kind: 'key-verification-run',
      reason: parseReason(argv)
    };
  }

  throw new Error(
    'Unknown command. Supported: transfers list, transfer inspect, payout retry, transfer mark-reviewed, recon run, recon issues, jobs retention-run, jobs key-verification-run.'
  );
}
