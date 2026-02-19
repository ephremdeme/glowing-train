# Release Process

## Environments
- `dev`: local development and integration.
- `staging`: production-like AWS VM deployment with blue/green slots.
- `prod`: live traffic on AWS VM deployment with blue/green.

## CI/CD workflows
- PR/branch validation: `.github/workflows/ci.yml`
- Image build/sign/scan: `.github/workflows/build-images.yml`
- Staging deployment: `.github/workflows/deploy-staging.yml`
- Production deployment: `.github/workflows/deploy-prod.yml`
- Nightly integration suite: `.github/workflows/nightly-integration.yml`

## Promotion flow
1. Open PR with scoped changes.
2. CI must pass:
   - Ethiopia boundary check
   - lint + typecheck
   - unit tests
   - DB integration tests
   - e2e MVP flow
   - Go watcher tests
3. Merge to `main`.
4. Build and publish images (with SBOM, scan, and signature).
5. Deploy inactive color to `staging` for both domains.
6. Run smoke checks + staging dress rehearsal.
7. Switch edge to new staging color.
8. Manual approval by engineering + compliance.
9. Deploy inactive color to `prod`.
10. Run smoke checks + 10-minute guarded observation window.
11. Switch edge to new prod color.

## Required release gates
- No high/critical unresolved security findings.
- No Ethiopia boundary violations.
- DB migration path is additive and reversible.
- `ETHIOPIA_SERVICES_CRYPTO_DISABLED=true` for Ethiopia stacks.
- `PAYOUT_TELEBIRR_ENABLED=false` unless explicitly approved.
- `/readyz` healthy and `/version` exposes deploy metadata.

## Deployment commands (on target VM)
```bash
./scripts/deploy/deploy_color.sh --domain ethiopia --color green --environment staging --image-tag <sha>
./scripts/deploy/deploy_color.sh --domain offshore --color green --environment staging --image-tag <sha>
./scripts/deploy/switch_color.sh --color green --environment staging
```

## Rollback
```bash
./scripts/deploy/rollback.sh --environment production
```

Rollback checklist:
1. Confirm edge switched to previous color.
2. Run smoke checks on active color.
3. Trigger reconciliation run and review issues.
4. Record rollback reason and impacted release id.
