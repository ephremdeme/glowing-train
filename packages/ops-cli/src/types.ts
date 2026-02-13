export type ReadCommand =
  | { kind: 'transfers-list'; status?: string; limit?: number }
  | { kind: 'transfer-inspect'; transferId: string }
  | { kind: 'recon-issues'; since?: string };

export type WriteCommand =
  | { kind: 'payout-retry'; transferId: string; reason: string }
  | { kind: 'transfer-mark-reviewed'; transferId: string; reason: string }
  | { kind: 'recon-run'; reason: string; outputPath?: string }
  | { kind: 'retention-run'; reason: string }
  | { kind: 'key-verification-run'; reason: string };

export type ParsedCommand = ReadCommand | WriteCommand;

export type CliOptions = {
  token: string;
  actor: string;
  baseUrl: string;
  commandText: string;
};
