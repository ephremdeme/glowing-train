# Data Protection Policy (MVP)

## Principles
- Minimize stored PII.
- Encrypt sensitive fields at rest.
- Keep Ethiopia services crypto-free.
- Retain auditability without storing secrets.

## Sensitive data handling
- Receiver National ID: store tokenized/encrypted value only.
- KYC records: store status, provider reference, timestamps, and minimal metadata.
- Never store private keys or wallet seed material.
- Store receiver profile in `receiver_kyc_profile` with:
  - `national_id_encrypted` envelope
  - `national_id_hash` for deterministic lookup/dedupe
  - `national_id_verified` boolean gate for transfer eligibility

## Encryption model
- Use `@cryptopay/security` encrypted-field envelope:
  - `algo`, `keyId`, `keyVersion`, `ivB64`, `tagB64`, `ciphertextB64`
- Key management via `KeyProvider` abstraction:
  - `LocalDevKeyProvider` for development.
  - `ExternalKmsKeyProvider` adapter for production.

## Retention
- Audit logs: retain per policy window; archive/rotate without mutation of history.
- Reconciliation reports: retain for operational/compliance window.
- PII minimization: anonymize/purge data after legal retention period.

## Verification
- Run key verification job (encrypt/decrypt probe) on schedule.
- Alert if key probe fails or active key metadata drifts.

## Explicit non-goal
- Customer auth is in scope with minimal required data collection (name, country, email/phone) and encrypted MFA secret storage.
