# Reconciliation Operations

## Purpose
The reconciliation worker compares:
- transfer state machine lifecycle,
- on-chain funding records,
- payout instruction status,
- ledger debit/credit parity.

It writes:
- `reconciliation_run`
- `reconciliation_issue`
- CSV report artifacts.

## Scheduled cadence
- Active transfer sweep: every 5 minutes (default).
- Daily operations run for reporting and exception review.

## Manual command
```bash
ops-cli recon run --reason "daily reconciliation" --output /tmp/recon.csv
```

## Issue codes
- `MISSING_FUNDING_EVENT`
- `LEDGER_IMBALANCE`
- `PAYOUT_STATUS_MISMATCH`
- `MISSING_PAYOUT_RECORD`

## Run evidence requirements
For each scheduled/manual run, keep:
1. run id
2. start/end time
3. issue counts by code
4. CSV output path and checksum
5. exception stack (if failed)

## Post-rollback requirement
After any rollback, run reconciliation immediately and triage all open issues before closing the incident.
