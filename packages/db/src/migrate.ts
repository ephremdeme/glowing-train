import { loadRuntimeConfig } from '@cryptopay/config';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations(): Promise<void> {
  const config = loadRuntimeConfig();
  const sql = postgres(config.DATABASE_URL, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
    prepare: false
  });

  try {
    await sql.unsafe(`
      create table if not exists schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const migrationDir = path.resolve(__dirname, '../migrations');
    const migrationFiles = (await readdir(migrationDir))
      .filter((file) => file.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    for (const filename of migrationFiles) {
      const alreadyApplied = await sql.unsafe<{ version: string }[]>(
        'select 1 from schema_migrations where version = $1 limit 1',
        [filename]
      );

      if (alreadyApplied.length > 0) {
        continue;
      }

      const migrationSql = await readFile(path.join(migrationDir, filename), 'utf8');
      await sql.begin(async (transaction) => {
        await transaction.unsafe(migrationSql);
        await transaction.unsafe('insert into schema_migrations(version) values ($1)', [filename]);
      });
      console.log(`Applied migration: ${filename}`);
    }

    console.log('Migration run complete.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

runMigrations().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
