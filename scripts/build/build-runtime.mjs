#!/usr/bin/env node
import { readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';

function parseArgs(argv) {
  const args = {
    entry: 'src/server.ts',
    out: 'dist/server.cjs'
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--entry') {
      args.entry = argv[i + 1] ?? args.entry;
      i += 1;
    } else if (token === '--out') {
      args.out = argv[i + 1] ?? args.out;
      i += 1;
    }
  }

  return args;
}

function getExternalDeps() {
  const packageJsonPath = resolve(process.cwd(), 'package.json');
  const raw = readFileSync(packageJsonPath, 'utf8');
  const pkg = JSON.parse(raw);
  const dependencies = pkg.dependencies ?? {};

  return Object.keys(dependencies).filter((dep) => !dep.startsWith('@cryptopay/'));
}

async function main() {
  const { entry, out } = parseArgs(process.argv.slice(2));
  const outPath = resolve(process.cwd(), out);
  const outDir = dirname(outPath);

  rmSync(outDir, { recursive: true, force: true });

  await build({
    entryPoints: [resolve(process.cwd(), entry)],
    outfile: outPath,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node22',
    sourcemap: false,
    external: getExternalDeps(),
    legalComments: 'none'
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
