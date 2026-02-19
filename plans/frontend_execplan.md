# Frontend ExecPlan

## Objective
Ship a sender-facing frontend MVP under `apps/web` for the non-custodial remittance flow using existing backend contracts.

## Constraints and Guardrails
- Respect AGENTS.md legal boundary: frontend must never imply custody or key handling.
- Ethiopia-side remains crypto-free in backend; frontend only shows deposit instructions.
- Transfer cap is USD 2,000 and must be validated in UI.
- Bank payout is primary rail for MVP. Telebirr stays behind a UI feature flag.

## Milestone 1: Vertical Slice (Implement Now)
### Scope
- Basic auth/register sign-in entry (using `core-api` `/v1/auth/*`).
- Sender profile + sender KYC status read (using `/v1/me`).
- Recipient select/create (using `/v1/recipients`).
- Quote creation (using `/v1/quotes`).
- Transfer creation + deposit instructions (using `/v1/transfers`).
- Transfer status page with polling via server proxy route.
- Local dev setup + frontend quickstart docs.
- Playwright happy-path browser test.

### Files
- `apps/web/**` (new app)
- `plans/frontend_execplan.md`
- `pnpm-workspace.yaml`
- `package.json`
- `.env.example`
- `docker-compose.yml`
- `docs/README_DEV.md`
- `README.md`

### Commands
```bash
pnpm install
pnpm --filter @cryptopay/web typecheck
pnpm --filter @cryptopay/web test:e2e
```

### Acceptance Criteria
- `@cryptopay/web` runs locally and renders sender flow.
- User can complete quote -> transfer and view deposit instructions.
- Status page polls and renders mapped state timeline.
- Amount > 2000 is blocked in UI and backend errors are surfaced.
- Telebirr option is hidden unless `NEXT_PUBLIC_TELEBIRR_ENABLED=true`.
- Playwright happy-path test passes.

## Milestone 2: Transfer History and Receipt UX
### Scope
- Sender transfer list page and receipt view.
- Persist and render transfer records with clear statuses and timestamps.
- Add customer-scoped transfer history/detail APIs in core-api.
- Add Playwright MCP-first validation workflow and fallback CLI test flow.

### Files
- `apps/web/src/app/history/**`
- `apps/web/src/app/receipts/**`
- `apps/web/src/lib/history/**`
- `services/core-api/src/app.ts`
- `services/core-api/test/*.test.ts`
- `docs/openapi/core-api.yaml`

### Acceptance Criteria
- User can revisit previous transfers and open a printable receipt view.
- History and detail endpoints enforce sender ownership.

## Milestone 3: KYC UX + Reliability Hardening
### Scope
- Sender KYC status UX refinements and blocked-state guidance.
- Better empty/loading/error states and accessibility polish.
- Integration-style tests for BFF proxy routes.

### Files
- `apps/web/src/components/**`
- `apps/web/src/lib/**`
- `apps/web/test/**`

### Acceptance Criteria
- Clear KYC-blocked messaging.
- No blocking console errors in happy-path flow.
- Keyboard and screen-reader basics are satisfied.

## Milestone 4: Operational Polish
### Scope
- README and runbook improvements.
- Optional dockerized `web` service.
- Frontend observability hooks (request logging and error boundaries).

### Acceptance Criteria
- Frontend quickstart is complete and reproducible.
- Frontend local stack works with existing backend services.
