# Reconciliation Operations

## Purpose
The reconciliation worker compares transfer lifecycle records against:
- on-chain funding confirmations,
- payout instruction state,
- and ledger debit/credit parity.

It writes:
- `reconciliation_run` metadata,
- `reconciliation_issue` findings,
- and CSV output for operations/compliance review.

## Run Command
```bash
corepack pnpm --filter @cryptopay/reconciliation-worker test
```

## Issue Codes
- `MISSING_FUNDING_EVENT`: transfer is past funding stage but no on-chain funding event exists.
- `LEDGER_IMBALANCE`: debit and credit totals do not match for a transfer.
- `PAYOUT_STATUS_MISMATCH`: transfer status and payout instruction status conflict.
- `MISSING_PAYOUT_RECORD`: transfer is payout-initiated but payout instruction row is missing.

## CSV Columns
- transfer_id
- quote_id
- chain
- token
- funded_amount_usd
- expected_etb
- payout_status
- ledger_balanced
- issue_code
- detected_at
