#!/usr/bin/env node
import { executeCommand } from './commands.js';
import { parseCommand } from './parser.js';

function readFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx < 0) {
    return undefined;
  }

  return args[idx + 1];
}

function stripGlobalOptions(args: string[]): string[] {
  const out: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const current = args[i];
    const next = args[i + 1];

    if (!current) {
      continue;
    }

    if (current === '--token' || current === '--actor' || current === '--api-url') {
      if (!next) {
        throw new Error(`Missing value for ${current}.`);
      }
      i += 1;
      continue;
    }

    out.push(current);
  }

  return out;
}

function usage(): string {
  return [
    'Usage:',
    '  ops-cli transfers list [--status <status>] [--limit <n>] [--api-url <url>] [--token <jwt>] [--actor <id>]',
    '  ops-cli transfer inspect <transferId> [--api-url <url>] [--token <jwt>] [--actor <id>]',
    '  ops-cli payout retry <transferId> --reason "<reason>" [--api-url <url>] [--token <jwt>] [--actor <id>]',
    '  ops-cli transfer mark-reviewed <transferId> --reason "<reason>" [--api-url <url>] [--token <jwt>] [--actor <id>]',
    '  ops-cli recon run --reason "<reason>" [--output <path>] [--api-url <url>] [--token <jwt>] [--actor <id>]',
    '  ops-cli recon issues [--since <iso-datetime>] [--api-url <url>] [--token <jwt>] [--actor <id>]',
    '  ops-cli jobs retention-run --reason "<reason>" [--api-url <url>] [--token <jwt>] [--actor <id>]',
    '  ops-cli jobs key-verification-run --reason "<reason>" [--api-url <url>] [--token <jwt>] [--actor <id>]'
  ].join('\n');
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.length === 0 || rawArgs.includes('--help') || rawArgs.includes('-h')) {
    console.log(usage());
    process.exit(0);
  }

  const token = readFlag(rawArgs, 'token') ?? process.env.OPS_AUTH_TOKEN;
  const actor = readFlag(rawArgs, 'actor') ?? process.env.OPS_ACTOR ?? 'ops-cli';
  const baseUrl = readFlag(rawArgs, 'api-url') ?? process.env.OPS_API_URL ?? 'http://localhost:3001';

  if (!token) {
    throw new Error('Missing auth token. Pass --token or set OPS_AUTH_TOKEN.');
  }

  const commandArgs = stripGlobalOptions(rawArgs);
  const command = parseCommand(commandArgs);
  const response = await executeCommand(command, {
    token,
    actor,
    baseUrl,
    commandText: commandArgs.join(' ')
  });

  console.log(JSON.stringify(response, null, 2));
}

main().catch((error) => {
  console.error(`ops-cli error: ${(error as Error).message}`);
  process.exit(1);
});
