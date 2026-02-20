# AGENTS.md

## Mission
Build a legal-first, crypto-funded remittance platform for Ethiopia.  
Primary goal: fast, compliant ETB payout to recipients in Ethiopia, funded by diaspora senders using their own crypto wallets.

## Non-Negotiable Business and Legal Constraints
1. Ethiopia-side services must never touch crypto assets, stablecoins, private keys, wallets, or on-chain operations.
2. All crypto activity is offshore only.
3. v1 is strictly non-custodial:
   - Sender uses their own wallet.
   - We do not hold customer wallet keys.
   - We do not maintain customer crypto balances.
4. Transfer flow must remain:
   - Sender acquires and sends USDC/USDT from own wallet.
   - Offshore entity receives funds on Base or Solana.
   - Offshore entity converts to USD and settles to Ethiopia payout partner through legal rails.
   - Ethiopia payout partner disburses recipient in ETB.
5. Ethiopia payout methods:
   - v1: bank transfer only.
   - Telebirr support: later phase.
6. KYC is required for both sender and receiver.
   - Receiver verification must support Ethiopian National ID.
7. Maximum transfer amount: USD 2,000 per transfer.
8. SLA: recipient payout within 10 minutes after on-chain confirmation.
9. Do not design for v2 “phone wallet” in current implementation planning.

## Product Scope (v1)
- Supported stablecoins: USDC, USDT
- Supported chains: Base, Solana
- Funding model: non-custodial inbound transfer from sender wallet
- Payout currency: ETB
- Primary recipient rail: bank transfer

## Architecture Boundaries
### Offshore domain (crypto-permitted)
- On-chain address monitoring and confirmation (Base/Solana)
- Stablecoin receipt validation
- Conversion and treasury/settlement handling
- Fiat settlement initiation to Ethiopia payout partner
- Offshore compliance screening tied to funding event

### Ethiopia domain (crypto-prohibited)
- Sender/receiver onboarding and KYC orchestration
- Receiver National ID verification
- Transfer intake/orchestration metadata (no crypto custody)
- Payout instruction and status tracking with partner
- Recipient communication and support workflows
- Compliance, audit, reconciliation, and reporting

### Boundary rule
- Ethiopia-side code, services, workers, and data stores must never require crypto SDKs, wallet tooling, key management, or chain RPC dependencies.

## Engineering Standards for Every Task
1. Execution protocol:
   - Start with a plan.
   - List files to modify.
   - Then implement.
2. Keep architecture maintainable:
   - Clear service boundaries
   - Minimal coupling
   - Explicit interfaces
3. Build reliability from day 1:
   - Idempotency
   - Retry strategy
   - Reconciliation jobs
4. Audit logging is mandatory for sensitive actions.
5. Local development story is required (Docker Compose or equivalent).
6. Use environment variables for configuration.
   - Never hardcode secrets.
7. Add tests for all new logic and run tests before finishing.
8. Keep changes incremental and PR-sized.

## Technical Stack Preferences
- API and business logic services: Node.js + TypeScript
- Chain watchers (Base watcher and Solana watcher): Go
- Primary datastore: Postgres
- Redis: optional for queueing/caching
- Preferred integration style: event-driven
- If no broker is used, use DB outbox pattern

## Repository Defaults (Post-Refactor)
- Customer auth ownership is `services/customer-auth` only; `core-api` must not proxy or own customer auth routes.
- Better Auth is the canonical customer session/auth store, with explicit bridge table `customer_auth_link` to `customer_account`.
- DB standard for Node services is `postgres.js` + Drizzle via `@cryptopay/db`; do not introduce new `pg` dependencies.
- Shared HTTP primitives (CORS, errors, idempotency, metrics, bootstrap) must come from `@cryptopay/http` instead of service-local copies.
- Service entrypoints should use shared bootstrap (`runService`/`runServiceAndExit`) rather than per-service duplicated shutdown wiring.
- `services/core-api/src/app.ts` is composition-only; grouped route modules belong under `services/core-api/src/routes/*`.
- v1 payout rail is bank-only implementation; do not re-introduce Telebirr runtime paths or feature flags in v1 scope.

## Reliability Requirements
### Idempotency
- All state-changing API routes and webhook handlers must enforce idempotency keys.
- Persist idempotency key, request fingerprint, first response, and expiry.
- Duplicate requests must return consistent prior result.

### Retry Strategy
- External calls (payout partner, KYC providers, settlement rails) must use bounded retries with exponential backoff and jitter.
- Classify errors into retryable vs non-retryable.
- Route terminal failures to manual-review queue/state.

### Reconciliation
- Implement scheduled reconciliation across:
   - On-chain confirmations
   - Offshore settlement records
   - Ethiopia payout partner statuses
- Reconciliation must detect and surface mismatches, missing callbacks, and stuck states.
- Reconciliation runs must be auditable (run id, start/end time, result counts, exceptions).

## Audit and Compliance Logging
- Log sensitive actions in append-only audit records:
   - KYC decisions/updates
   - Transfer status transitions
   - Payout initiation/cancellation/failure
   - Admin overrides/manual interventions
- Audit logs must include actor, action, timestamp, entity references, and reason/context.
- Do not log secrets or private key material (private keys should never exist in Ethiopia-side systems).

## Data and State Modeling Guidelines
- Use explicit transfer state machine with immutable transition history.
- Suggested core entities:
   - sender_kyc_profile
   - receiver_kyc_profile
   - remittance_transfer
   - onchain_funding_event (offshore domain)
   - settlement_record (offshore domain)
   - payout_instruction (ethiopia domain)
   - payout_status_event
   - idempotency_record
   - outbox_event
   - audit_log
   - reconciliation_run / reconciliation_issue
- Enforce USD 2,000 limit at validation layer and persistence constraints where applicable.

## Security and Secrets
- Secrets only via environment variables or secret manager wiring.
- Never commit credentials, keys, or tokens.
- Principle of least privilege for service credentials.
- Encrypt sensitive PII at rest and enforce transport security in transit.

## Local Development Requirements
- Provide a reproducible local stack using Docker Compose (or equivalent) for:
   - Postgres
   - Optional Redis
   - Node.js services
   - Go watcher services (or deterministic mocks where appropriate)
- Include seed/test fixtures for happy path and failure path.
- Provide clear startup and test commands in README.

## Testing Requirements
- Minimum expectations for new logic:
   - Unit tests for core domain rules and edge cases
   - Integration tests for DB interactions and idempotency behavior
   - Contract/integration tests for payout partner adapters and webhook handling
- Include scenario tests for:
   - Duplicate requests and webhook replays
   - Retryable partner failures
   - Timeout and late callback reconciliation
   - SLA tracking from on-chain confirmation to payout completion
   - Enforcement of transfer limit and KYC prerequisites

## Definition of Done (PR Checklist)
- [ ] Plan documented before implementation; files-to-change listed.
- [ ] Changes are PR-sized and scoped to a single coherent outcome.
- [ ] Legal boundary respected: Ethiopia-side touches no crypto/private-key/on-chain logic.
- [ ] Idempotency implemented for all new mutation paths and webhooks.
- [ ] Retry policy defined for external dependencies; terminal failures handled safely.
- [ ] Reconciliation path added/updated for new state transitions.
- [ ] Audit logs added for sensitive actions and state changes.
- [ ] No secrets hardcoded; configuration uses environment variables.
- [ ] Local dev flow updated (Docker Compose/services/docs as needed).
- [ ] Tests added/updated and executed successfully.
- [ ] Observability updated (logs/metrics) for new critical paths.
- [ ] Documentation updated for any new interfaces, events, or operational runbooks.
