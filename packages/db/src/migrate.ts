import { loadRuntimeConfig } from '@cryptopay/config';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';

const scriptPath = process.argv[1] ? path.resolve(process.argv[1]) : process.cwd();
const scriptDir = path.dirname(scriptPath);

async function runMigrations(): Promise<void> {
  const config = loadRuntimeConfig();
  const pool = new Pool({ connectionString: config.DATABASE_URL });

  try {
    await pool.query(`
      create table if not exists schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const migrationDir = path.resolve(scriptDir, '../migrations');
    const migrationFiles = (await readdir(migrationDir))
      .filter((file) => file.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    for (const filename of migrationFiles) {
      const alreadyApplied = await pool.query(
        'select 1 from schema_migrations where version = $1 limit 1',
        [filename]
      );

      if (alreadyApplied.rowCount) {
        continue;
      }

      const sql = await readFile(path.join(migrationDir, filename), 'utf8');

      await pool.query('begin');
      try {
        await pool.query(sql);
        await pool.query('insert into schema_migrations(version) values ($1)', [filename]);
        await pool.query('commit');
        console.log(`Applied migration: ${filename}`);
      } catch (error) {
        await pool.query('rollback');
        throw error;
      }
    }

    console.log('Migration run complete.');
  } finally {
    await pool.end();
  }
}

runMigrations().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
