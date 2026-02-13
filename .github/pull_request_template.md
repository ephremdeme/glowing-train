## Summary
- 

## Scope
- [ ] PR is scoped to one coherent outcome
- [ ] Ethiopia-side services remain crypto-free (no chain SDKs / wallet logic)

## Verification
- [ ] `corepack pnpm -w lint`
- [ ] `corepack pnpm -w typecheck`
- [ ] `corepack pnpm -w test`
- [ ] `go test ./workers/base-watcher/...`
- [ ] `go test ./workers/solana-watcher/...`
- [ ] `corepack pnpm check:ethiopia-boundary`

## AGENTS.md DoD
- [ ] Plan documented before implementation; files-to-change listed
- [ ] Idempotency implemented for new mutation paths/webhooks
- [ ] Retry policy applied for new external dependencies
- [ ] Reconciliation path added/updated for new state transitions
- [ ] Audit logging added for sensitive actions
- [ ] No hardcoded secrets; env vars used
- [ ] Docs updated (interfaces/events/runbooks)
