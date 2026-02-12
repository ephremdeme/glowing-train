export interface ReconciliationCsvRow {
  transfer_id: string;
  quote_id: string | null;
  chain: string | null;
  token: string | null;
  funded_amount_usd: number | null;
  expected_etb: number | null;
  payout_status: string | null;
  ledger_balanced: boolean;
  issue_code: string;
  detected_at: string;
}

const HEADER =
  'transfer_id,quote_id,chain,token,funded_amount_usd,expected_etb,payout_status,ledger_balanced,issue_code,detected_at';

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

function formatNumeric(value: number | string | null): string {
  if (value === null) {
    return '';
  }

  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return '';
  }

  return numeric.toFixed(2);
}

export function buildReconciliationCsv(rows: ReconciliationCsvRow[]): string {
  const lines = rows.map((row) =>
    [
      row.transfer_id,
      row.quote_id ?? '',
      row.chain ?? '',
      row.token ?? '',
      formatNumeric(row.funded_amount_usd),
      formatNumeric(row.expected_etb),
      row.payout_status ?? '',
      row.ledger_balanced ? 'true' : 'false',
      row.issue_code,
      row.detected_at
    ]
      .map((value) => escapeCsv(String(value)))
      .join(',')
  );

  return [HEADER, ...lines].join('\n');
}
