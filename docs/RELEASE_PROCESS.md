# Release Process

## Environments
- `dev`: active development and local integration.
- `staging`: pre-production validation with production-like config.
- `prod`: real traffic.

## Promotion flow
1. Open PR with scoped changes.
2. CI must pass (`lint`, `typecheck`, tests, watcher tests, Ethiopia boundary check).
3. Merge to `main`.
4. Deploy to `staging`.
5. Run staging checklist:
   - quote -> transfer -> funding-confirmed -> payout path
   - ops write actions audited
   - reconciliation run output generated
6. Manual approval by engineering + compliance owner.
7. Deploy to `prod`.

## Required gates
- No high/critical security findings.
- No Ethiopia boundary violations.
- Migration plan is additive and reversible.
- Feature flags verified (`PAYOUT_TELEBIRR_ENABLED=false` by default).
- Customer auth is in scope for this release line and is released through `core-api` as the single public entrypoint.

## Rollback
- Revert to previous release artifact.
- Disable risky feature flag(s).
- Run reconciliation after rollback and review unresolved issues.
