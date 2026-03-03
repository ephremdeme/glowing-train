# Base Sweeper Runbook

## Purpose
`base-sweeper-worker` is the dedicated offshore worker that sweeps funded Base deposit addresses into treasury by calling `DepositFactory.sweep(bytes32,address)` one transfer per transaction.

Payout dispatch for Base transfers can be gated on sweep completion via `BASE_SWEEP_REQUIRED_FOR_PAYOUT`.

## Preconditions
- `settlement_record` migration is applied.
- `base-sweeper-worker` is deployed and healthy.
- `BASE_SWEEP_OWNER_PRIVATE_KEY` is injected from secret manager (never committed).
- DepositFactory/token contract addresses are configured.

## Required env
- `BASE_RPC_URL`
- `BASE_NETWORK` (`mainnet` or `sepolia`)
- `BASE_DEPOSIT_FACTORY_ADDRESS`
- `BASE_USDC_CONTRACT`
- `BASE_USDT_CONTRACT`
- `BASE_SWEEP_OWNER_PRIVATE_KEY`
- `BASE_SWEEP_POLL_INTERVAL_MS`
- `BASE_SWEEP_BATCH_SIZE`
- `BASE_SWEEP_MAX_ATTEMPTS`
- `BASE_SWEEP_RETRY_BASE_MS`
- `BASE_SWEEP_RECLAIM_TIMEOUT_MS`
- `BASE_SWEEP_REQUIRED_FOR_PAYOUT` (set in reconciliation-worker)

## Rollout
1. Deploy schema + worker with `BASE_SWEEP_REQUIRED_FOR_PAYOUT=false`.
2. Verify worker health endpoint and sweep activity logs.
3. Verify settlement progression:
   - `pending_sweep` -> `sweeping` -> `swept`
   - failed retries eventually become `review_required`.
4. Enable `BASE_SWEEP_REQUIRED_FOR_PAYOUT=true`.
5. Verify Base payouts are blocked until corresponding settlement rows are `swept`.

## Operational checks
```sql
-- settlement status overview
select chain, status, count(*) from settlement_record group by chain, status order by chain, status;

-- stale sweeping claims
select transfer_id, updated_at, attempt_count
from settlement_record
where status = 'sweeping'
  and updated_at < now() - interval '10 minutes'
order by updated_at asc;

-- review-required queue
select transfer_id, attempt_count, last_error, updated_at
from settlement_record
where status = 'review_required'
order by updated_at desc;
```

## Failure handling
- For `review_required` rows:
  1. verify token transfer event and deposit address,
  2. verify factory/token config,
  3. verify owner key has gas and permissions,
  4. requeue by setting status back to `pending_sweep` and `next_attempt_at=now()` after issue is fixed.

## Security notes
- Rotate any leaked sweep key immediately.
- Keep owner key in secrets manager only.
- Never print private keys in logs.
