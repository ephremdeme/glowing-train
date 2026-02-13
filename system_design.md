# CryptoPay System Design (Fast Launch)

Customer login/auth is handled by the dedicated `customer-auth` service and exposed to clients through `core-api` public routes.

## 1) System Context
```mermaid
flowchart LR
    sender["Diaspora Sender (Own Wallet)"] --> collector["Offshore Collector API"]
    sender --> core["Core API"]
    core --> custAuth["Customer Auth Service"]
    collector --> baseWatcher["Base Watcher (Go)"]
    collector --> solWatcher["Solana Watcher (Go)"]
    baseWatcher --> core["Core API"]
    solWatcher --> core
    core --> payoutOrch["Payout Orchestrator"]
    payoutOrch --> bank["Bank Payout Adapter"]
    payoutOrch --> telebirr["Telebirr Adapter (Feature-flag off)"]
    bank --> partner["Ethiopia Payout Partner"]
    partner --> recipient["Recipient (ETB)"]
    core --> recon["Reconciliation Worker"]
    core --> ledger["Ledger Service"]
```

The sender funds with their own wallet (non-custodial). Watchers confirm funding and notify core API via signed callbacks. Ethiopia-side payout remains fiat-only through partner rails.

## 2) Service Responsibility Map
- `core-api`: quote lifecycle, funding confirmation intake, transfer ops API gateway, audit and SLA views.
- `customer-auth`: customer registration/login, session rotation, OTP/magic-link challenges, optional TOTP MFA.
- `offshore-collector`: transfer creation and unique deposit route assignment; enforces transfer preconditions.
- `payout-orchestrator`: payout initiation state machine with retry policy and adapter routing.
- `reconciliation-worker`: detects state mismatches, writes reconciliation issues, and outputs CSV reports.
- `ledger-service`: double-entry journal/entry write path and balance integrity checks.
- `base-watcher`: scans Base chain events, confirms by depth, dedupes, and calls signed funding callback.
- `solana-watcher`: scans Solana finalized signatures/transactions, dedupes, and calls signed funding callback.

Each service has a narrow ownership boundary to keep coupling low and deployment/testing straightforward.

## 3) Trust Boundaries
```mermaid
flowchart TB
    subgraph offshore["Offshore Crypto Zone"]
      collector["Offshore Collector"]
      baseWatcher["Base Watcher"]
      solWatcher["Solana Watcher"]
    end

    subgraph ethiopia["Ethiopia Fiat/Compliance Zone"]
      core["Core API"]
      custAuth["Customer Auth"]
      payoutOrch["Payout Orchestrator"]
      recon["Reconciliation Worker"]
      ledger["Ledger Service"]
    end

    chain["Base/Solana RPC"] --> offshore
    offshore -->|"Signed callback + legal settlement orchestration"| ethiopia
    ethiopia --> partner["Ethiopia Payout Partner"]
```

Crypto operations stay offshore. Ethiopia-side services are explicitly crypto-free and handle KYC state, payout orchestration, audit, and reconciliation only.

## 4) Happy-path Sequence
```mermaid
sequenceDiagram
    autonumber
    participant U as Sender
    participant C as Core API
    participant A as Customer Auth
    participant O as Offshore Collector
    participant W as Watcher
    participant P as Payout Orchestrator
    participant B as Bank Adapter

    U->>C: POST /v1/auth/register or /v1/auth/login/*
    C->>A: proxy auth request
    A-->>C: customer session
    U->>C: POST /v1/quotes
    C-->>U: quoteId + expiry
    U->>O: POST /v1/transfers (idempotency-key)
    O-->>U: transferId + depositAddress
    U->>W: On-chain transfer to deposit address
    W->>C: POST /internal/v1/funding-confirmed (signed)
    C->>P: POST /internal/v1/payouts/initiate
    P->>B: initiate payout
    B-->>P: providerReference
    P-->>C: PAYOUT_INITIATED
```

Funding confirmation time starts SLA tracking. The target is payout initiation within 10 minutes of on-chain confirmation.

## 5) Failure-path Sequence
```mermaid
sequenceDiagram
    autonumber
    participant W as Watcher
    participant C as Core API
    participant P as Payout Orchestrator
    participant O as Ops CLI/API

    W->>C: funding-confirmed callback (event A)
    C-->>W: accepted
    W->>C: replay callback (event A)
    C-->>W: idempotent no-op

    C->>P: initiate payout
    P-->>C: retryable failure
    C->>P: retry (bounded)
    P-->>C: terminal failure => REVIEW_REQUIRED

    O->>C: POST /internal/v1/ops/payouts/:id/retry (reason required)
    C->>P: manual retry
```

Duplicate funding callbacks are safely deduplicated. Exhausted payout retries transition to manual review with audited operator actions.

## 6) Data Model Snapshot
```mermaid
    flowchart LR
    ca["customer_account"] --> sa["sender_kyc_profile"]
    ca --> rec["recipient"]
    ca --> csi["customer_session"]
    ca --> cai["customer_auth_identity"]
    cai --> ach["auth_challenge"]
    ca --> mfa["customer_mfa_totp"]
    q["quotes"] --> t["transfers"]
    rec --> rkyc["receiver_kyc_profile"]
    t --> dr["deposit_routes"]
    t --> ofe["onchain_funding_event"]
    t --> pi["payout_instruction"]
    pi --> pse["payout_status_event"]
    t --> tt["transfer_transition"]
    t --> lj["ledger_journal"]
    lj --> le["ledger_entry"]
    rr["reconciliation_run"] --> ri["reconciliation_issue"]
    idem["idempotency_record"]
    audit["audit_log"]
    wc["watcher_checkpoint"]
    wd["watcher_event_dedupe"]
    rkyc["receiver_kyc_profile"]
```

Core integrity tables are transfer-centric with immutable transitions and audit history. Watcher checkpoint/dedupe tables guarantee safe resume and replay protection. `receiver_kyc_profile` stores minimal KYC state with encrypted/hash National ID fields.

## 7) Key Reliability Controls
- Idempotency on mutation endpoints and watcher callbacks.
- Bounded retry with jitter for payout provider failures.
- Reconciliation run + issue ledger for mismatch detection.
- Append-only audit logging for sensitive state changes.
- Signed callback verification with replay window.

These controls provide operational safety without adding dashboard complexity at this stage.
