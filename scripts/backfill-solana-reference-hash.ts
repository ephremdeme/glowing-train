import { closeDb, query } from '@cryptopay/db';
import { createHash } from 'node:crypto';

type RouteRow = {
  transfer_id: string;
  reference_hash: string | null;
};

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const rows = await query<RouteRow>(
    `
    select transfer_id, reference_hash
    from deposit_routes
    where chain = 'solana'
      and coalesce(route_kind, 'address_route') = 'solana_program_pay'
      and status = 'active'
    order by created_at asc
    `
  );

  const mismatches = rows.rows.filter((row) => row.reference_hash !== sha256Hex(row.transfer_id));

  if (!apply) {
    console.log(`[dry-run] active solana wallet-pay routes: ${rows.rowCount ?? rows.rows.length}`);
    console.log(`[dry-run] routes requiring backfill: ${mismatches.length}`);
    if (mismatches.length > 0) {
      console.log('run with --apply to update mismatched rows');
    }
    return;
  }

  let updated = 0;
  for (const row of mismatches) {
    const expectedHash = sha256Hex(row.transfer_id);
    const result = await query(
      `
      update deposit_routes
      set reference_hash = $2
      where transfer_id = $1
        and chain = 'solana'
        and coalesce(route_kind, 'address_route') = 'solana_program_pay'
        and status = 'active'
      `,
      [row.transfer_id, expectedHash]
    );
    updated += result.rowCount ?? 0;
  }

  console.log(`updated ${updated} solana wallet-pay route hashes`);
}

run()
  .catch((error) => {
    console.error('[backfill-solana-reference-hash] failed', (error as Error).message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
