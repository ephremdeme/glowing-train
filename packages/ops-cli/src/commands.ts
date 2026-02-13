import { requestJson } from './client.js';
import type { CliOptions, ParsedCommand } from './types.js';

function queryString(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }

    query.set(key, String(value));
  }

  const encoded = query.toString();
  return encoded.length > 0 ? `?${encoded}` : '';
}

export async function executeCommand(command: ParsedCommand, options: CliOptions): Promise<unknown> {
  if (command.kind === 'transfers-list') {
    return requestJson({
      options,
      method: 'GET',
      path: `/internal/v1/ops/transfers${queryString({ status: command.status, limit: command.limit })}`
    });
  }

  if (command.kind === 'transfer-inspect') {
    return requestJson({
      options,
      method: 'GET',
      path: `/internal/v1/ops/transfers/${command.transferId}`
    });
  }

  if (command.kind === 'payout-retry') {
    return requestJson({
      options,
      method: 'POST',
      path: `/internal/v1/ops/payouts/${command.transferId}/retry`,
      body: {
        reason: command.reason
      }
    });
  }

  if (command.kind === 'transfer-mark-reviewed') {
    return requestJson({
      options,
      method: 'POST',
      path: `/internal/v1/ops/transfers/${command.transferId}/mark-reviewed`,
      body: {
        reason: command.reason
      }
    });
  }

  if (command.kind === 'recon-run') {
    const body: Record<string, unknown> = {
      reason: command.reason
    };
    if (command.outputPath) {
      body.outputPath = command.outputPath;
    }

    return requestJson({
      options,
      method: 'POST',
      path: '/internal/v1/ops/reconciliation/run',
      body
    });
  }

  if (command.kind === 'retention-run') {
    return requestJson({
      options,
      method: 'POST',
      path: '/internal/v1/ops/jobs/retention/run',
      body: {
        reason: command.reason
      }
    });
  }

  if (command.kind === 'key-verification-run') {
    return requestJson({
      options,
      method: 'POST',
      path: '/internal/v1/ops/jobs/key-verification/run',
      body: {
        reason: command.reason
      }
    });
  }

  return requestJson({
    options,
    method: 'GET',
    path: `/internal/v1/ops/reconciliation/issues${queryString({ since: command.since })}`
  });
}
