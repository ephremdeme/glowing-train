# Security and Auth Model

## Scope
This document defines authentication, authorization, and trust boundaries for internal/admin operations in the MVP.
Customer auth is in scope for this phase using the dedicated `customer-auth` service directly (no `core-api` auth proxy).

## Token model
Three JWT token types are supported:
- `service`: service-to-service calls.
- `admin`: human or bot operator actions.
- `customer`: end-user authenticated sessions.

Required claims:
- `iss`, `aud`, `sub`, `exp`, `iat`, `tokenType`
- `role` for admin/ops access (`ops_viewer`, `ops_admin`, `compliance_viewer`, `compliance_admin`)
- `sessionId`, `amr`, `mfa` for customer sessions

Validation checks:
- Signature: HS256 using `AUTH_JWT_SECRET`
- Rotation window: optionally accept `AUTH_JWT_PREVIOUS_SECRET`
- Issuer: `AUTH_JWT_ISSUER`
- Audience: `AUTH_JWT_AUDIENCE`
- Expiry: `exp` must be in the future

## RBAC matrix
- `ops_viewer`: read-only ops endpoints
- `ops_admin`: read + write ops actions
- `compliance_viewer`: read-only ops/compliance data
- `compliance_admin`: reserved for compliance write paths (future)

Current write actions requiring `ops_admin`:
- `POST /internal/v1/ops/payouts/:transferId/retry`
- `POST /internal/v1/ops/transfers/:transferId/mark-reviewed`
- `POST /internal/v1/ops/reconciliation/run`

Customer session model:
- Cookie-backed auth session in `customer_auth_session`.
- Short-lived customer JWT (`exp = now + 300s`) is minted through `/auth/session/exchange`.
- `core-api` remains a resource server and validates exchanged customer JWTs.

## Signed watcher callback
`POST /internal/v1/funding-confirmed` requires:
- `Authorization: Bearer <service/admin JWT>`
- `x-callback-timestamp`
- `x-callback-signature`

Signature validation:
- HMAC-SHA256 over `${timestamp}.${payload}`
- Secret: `WATCHER_CALLBACK_SECRET`
- Replay window: `WATCHER_CALLBACK_MAX_AGE_MS`

## Audit requirements
All ops write actions must include:
- actor (`sub` claim and optional `x-ops-actor`)
- reason (request payload)
- command context (`x-ops-command`)

These actions are appended into `audit_log`.

## mTLS readiness (next)
Current MVP uses signed JWTs and signed callbacks. For production hardening, enforce mTLS between internal services and bind `aud` to per-service identities.
