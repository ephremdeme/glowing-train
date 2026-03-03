# Data Protection Policy (MVP)

## Principles
- Minimize stored PII.
- Encrypt sensitive fields at rest.
- Keep Ethiopia services crypto-free.
- Retain auditability without storing secrets.

## Sensitive data handling
- Sender KYC records: store status, provider reference, timestamps, and minimal metadata.
- Recipient payout profile: store only fields required for bank payout execution.
- Never store private keys or wallet seed material.
- Receiver KYC/National ID records are not part of v1 runtime data model.

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
