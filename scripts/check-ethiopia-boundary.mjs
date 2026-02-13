import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ETHIOPIA_SERVICE_DIRS = [
  'services/customer-auth',
  'services/core-api',
  'services/payout-orchestrator',
  'services/reconciliation-worker',
  'services/ledger-service'
];

const BANNED_IMPORT_PATTERNS = [
  /^ethers$/,
  /^viem$/,
  /^web3$/,
  /^@solana\//,
  /^solana-web3\.js$/,
  /^@coral-xyz\//,
  /^bitcoinjs-lib$/,
  /^@wagmi\//,
  /^alchemy-sdk$/,
  /^@ethereum\//,
  /^@base\//
];

const IMPORT_RE = /(?:import\s+(?:[^'";]+?\s+from\s+)?|export\s+[^'";]*?\s+from\s+|require\()\s*['"]([^'"]+)['"]/g;

async function listFilesRecursively(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const out = [];

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = join(root, entry.name);

    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursively(fullPath)));
      continue;
    }

    if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      out.push(fullPath);
    }
  }

  return out;
}

function isBannedImport(specifier) {
  return BANNED_IMPORT_PATTERNS.some((pattern) => pattern.test(specifier));
}

async function main() {
  const violations = [];

  for (const serviceDir of ETHIOPIA_SERVICE_DIRS) {
    const files = await listFilesRecursively(serviceDir);

    for (const file of files) {
      const content = await readFile(file, 'utf8');
      const matches = content.matchAll(IMPORT_RE);

      for (const match of matches) {
        const specifier = match[1];
        if (!specifier) {
          continue;
        }

        if (isBannedImport(specifier)) {
          violations.push({
            file: relative(process.cwd(), file),
            specifier
          });
        }
      }
    }
  }

  if (violations.length === 0) {
    console.log('Ethiopia boundary check passed: no banned crypto/chain imports detected.');
    return;
  }

  console.error('Ethiopia boundary check failed. Detected banned imports:');
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.specifier}`);
  }

  process.exit(1);
}

main().catch((error) => {
  console.error('Boundary check failed unexpectedly:', error.message);
  process.exit(1);
});
