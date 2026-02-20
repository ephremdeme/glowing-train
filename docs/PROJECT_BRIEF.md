# CryptoPay MVP Project Brief

## 1. Purpose
CryptoPay enables diaspora-funded remittances to Ethiopia using a legal-first model:
- Funding is done by senders from their own wallets using USDC/USDT.
- Recipient payout is in ETB through legal Ethiopia payout rails.
- Ethiopia-side systems remain fiat/compliance only and never perform crypto operations.

## 2. Business Model
1. Sender (diaspora) creates a quote and transfer request.
2. Sender funds transfer non-custodially from their own wallet.
3. Offshore entity receives USDC/USDT on Base or Solana.
4. Offshore entity converts to USD and settles with Ethiopia payout partner through legal rails.
5. Ethiopia payout partner sends ETB to recipient bank account.

Revenue model (MVP assumption): FX spread + service fee embedded in quote.

## 3. Legal and Operational Boundary (Non-Negotiable)
- Ethiopia-side services must never touch crypto, stablecoins, private keys, wallets, or chain RPC operations.
- All on-chain and stablecoin handling is offshore only.
- v1 is non-custodial only: no customer key custody, no stored customer crypto balances.
- KYC is mandatory for sender and receiver.
- Receiver verification must include Ethiopian National ID support.
- Transfer cap is USD 2,000 per transfer.
- SLA is payout completion within 10 minutes after on-chain confirmation.

## 4. MVP Scope (In)
- Quote creation with rate lock and expiry.
- Transfer creation with unique deposit route/address per transfer.
- Confirmation detection on Base and Solana via dedicated watchers.
- Payout orchestration using adapter interface:
  - Bank payout enabled.
- Double-entry ledger for money movement accounting.
- Audit logging for sensitive actions and state transitions.
- Reconciliation job with CSV output for operations/compliance review.

## 5. MVP Scope (Out)
- Custodial wallets or managed private keys.
- Ethiopia-side crypto SDK integration.
- Advanced risk scoring beyond baseline KYC status checks.
- v2 phone-wallet UX.
- Multi-country payout coverage.

## 6. Compliance Data Principle (Minimal but Real)
Store only what is required for execution and audit:
- Sender KYC: status, provider reference, decision timestamps.
- Receiver KYC: legal name, National ID token/hash, verification status, verification timestamp.
- Avoid storing unnecessary raw documents or excess PII in core services.
- Encrypt sensitive PII at rest and restrict read access by role.

## 7. Product and Operational Success Criteria
- Functional:
  - End-to-end transfer from quote to ETB payout completion.
  - Enforcement of USD 2,000 transfer cap.
  - Duplicate API requests and webhook events handled idempotently.
- Operational:
  - On-chain confirmation to payout complete <= 10 minutes (p95 target for MVP operations).
  - Reconciliation report generated on schedule with mismatch visibility.
  - Full audit trail for KYC decisions, transfer transitions, and payout actions.

## 8. Delivery Principles
- Plan-first execution: plan, list files to modify, then implement.
- PR-sized, incremental milestones.
- Clear interfaces and minimal coupling.
- Environment-driven configuration only (no hardcoded secrets).
- Tests required for new logic before completion.
