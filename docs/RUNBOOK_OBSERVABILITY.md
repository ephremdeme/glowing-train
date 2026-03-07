# Runbook: Observability for Funding Issues

This runbook is focused on copy-address funding flows.

## 1. Triage entry points

Start with one of:

- `transferId`
- `txHash` / Solana signature

Then inspect, in order:

1. `core-api`
2. `offshore-collector`
3. chain watcher (`base-watcher` or `solana-watcher`)
4. `reconciliation-worker` issues

## 2. Base copy-address flow

Expected path:

1. User submits tx hash to `/v1/transfers/:id/base-payment`
2. Core API records funding submission attempt (`submissionSource`)
3. Offshore verifier validates:
   - expected CREATE2 deposit address
   - token contract
   - transfer amount
4. Core API transitions funding
5. Base watcher can also independently confirm route (safety path)

Failure hints:

- `TX_NOT_FOUND`: chain node not caught up or wrong tx hash
- `DEPOSIT_ADDRESS_MISMATCH`: tx sent to wrong address
- `AMOUNT_MISMATCH`: funding amount differs from transfer amount

## 3. Solana copy-address flow

Expected path:

1. User copies treasury ATA and sends token transfer
2. User must submit signature manually via Solana payment panel
3. Offshore verifier validates:
   - treasury ATA
   - mint
   - credited amount
4. Core API confirms funding

Failure hints:

- no signature submitted: transfer can stay `AWAITING_FUNDING`
- `TREASURY_ATA_MISMATCH`: wrong token account destination
- `AMOUNT_MISMATCH`: credited amount mismatch
- `TX_NOT_FOUND`: not yet finalized or wrong signature

Reconciliation signal:

- `SOLANA_MANUAL_SUBMISSION_MISSING`: stale Solana transfer with no manual submission beyond threshold.

## 4. Key log events to search

Core API:

- `transfer.payment.pending_verification`
- `transfer.payment.verification_failed`
- `transfer.payment.verification_result`

Watchers:

- `route resolution outcome` with `outcome=confirmed|route_not_found`

Reconciliation:

- run completion logs + issues endpoint containing `SOLANA_MANUAL_SUBMISSION_MISSING`

## 5. Operator checklist

1. Validate env file loaded (`docker compose ... config`).
2. Confirm required chain vars are present.
3. Verify submission source and tx hash/signature were recorded.
4. Verify chain-specific verifier error code.
5. If unresolved, open reconciliation issue with transfer + tx details.

