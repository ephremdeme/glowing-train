# Logging Quickstart

This project emits structured JSON logs. For payment debugging, always track by:

- `transferId`
- `txHash`
- `chain`
- `depositAddress`

## Fast local commands

Use prod-sim compose stack:

```bash
APP_ENV_FILE=.env.prod.local docker compose --env-file .env.prod.local -p cryptopay-prod-sim -f docker-compose.prod.yml -f docker-compose.prod.sim.yml logs -f core-api offshore-collector base-watcher solana-watcher reconciliation-worker
```

Filter by transfer:

```bash
docker logs cryptopay-core-api --since 30m | rg "tr_"
```

Filter by tx hash:

```bash
docker logs cryptopay-offshore-collector --since 30m | rg "0x|[1-9A-HJ-NP-Za-km-z]{32,}"
```

## Copy-address payment flow checks

## Base
1. Confirm transfer submission hit core-api:
   - event: `transfer.payment.pending_verification` or `transfer.payment.verification_result`
2. Confirm offshore verifier accepted tx:
   - look for Base verification logs with matching `transferId`/`txHash`
3. Confirm watcher route resolution:
   - event: `route resolution outcome` with `outcome=confirmed` or `route_not_found`

## Solana
1. For copy-address payments, user must submit signature manually.
2. Confirm core-api submission recorded with `submissionSource=manual_copy_address`.
3. Confirm offshore verifier checks:
   - mint / treasury ATA / amount mismatch messages are explicit.
4. If no submission exists, reconciliation emits:
   - `SOLANA_MANUAL_SUBMISSION_MISSING`

## Common environment mistakes

If compose warns that vars are blank, verify you started with the correct env file:

```bash
APP_ENV_FILE=.env.prod.local docker compose --env-file .env.prod.local -p cryptopay-prod-sim -f docker-compose.prod.yml -f docker-compose.prod.sim.yml config
```

Critical Base vars:

- `BASE_RPC_URL`
- `BASE_USDC_CONTRACT`
- `BASE_USDT_CONTRACT`
- `BASE_DEPOSIT_FACTORY_ADDRESS`
- `BASE_USDC_PROXY_INIT_CODE_HASH`
- `BASE_USDT_PROXY_INIT_CODE_HASH`

Critical Solana vars:

- `SOLANA_RPC_URL`
- `SOLANA_USDC_MINT`
- `SOLANA_USDT_MINT`
- `SOLANA_USDC_TREASURY_ATA` or `NEXT_PUBLIC_SOLANA_USDC_TREASURY_ATA`
- `SOLANA_USDT_TREASURY_ATA` or `NEXT_PUBLIC_SOLANA_USDT_TREASURY_ATA`

