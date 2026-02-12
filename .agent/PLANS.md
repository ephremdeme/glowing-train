# Codex Planning Template

Use this template for every future task in this repository.

## 0. Ground Rules (Always Apply)
- Start with a plan.
- List files to modify.
- Then implement.
- Respect AGENTS.md legal boundary: Ethiopia services are crypto-free.
- Keep scope PR-sized and incremental.
- Add/update tests for new logic.
- Run tests before completion.

## 1. Task Summary
- Objective:
- Why now:
- In scope:
- Out of scope:

## 2. Constraints Checklist
- [ ] Ethiopia-side code has no crypto SDKs, no key handling, no chain RPC.
- [ ] Transfer cap (USD 2,000) enforced where relevant.
- [ ] Sender and receiver KYC requirements preserved.
- [ ] Receiver National ID handling is minimal and protected.
- [ ] Idempotency considered for all mutating flows.
- [ ] Retry behavior defined for external calls.
- [ ] Reconciliation impact identified.
- [ ] Audit logging added for sensitive actions.

## 3. Assumptions and Open Questions
- Assumptions:
- Open questions (only if blocking):
- Decision defaults if unanswered:

## 4. Files to Modify
List exact file paths before implementation.

1.
2.
3.

## 5. Implementation Plan
For each step include intent, interface impact, and risk.

### Step 1
- Purpose:
- Changes:
- Idempotency impact:
- Audit/Reconciliation impact:

### Step 2
- Purpose:
- Changes:
- Idempotency impact:
- Audit/Reconciliation impact:

### Step N
- Purpose:
- Changes:
- Idempotency impact:
- Audit/Reconciliation impact:

## 6. Commands to Run
List exact commands planned before execution.

```bash
# install

# test

# lint/typecheck

# targeted verification
```

## 7. Test Plan
- Unit tests:
- Integration tests:
- Contract/adapter tests:
- Failure-path tests (retry/idempotency/replay):
- Reconciliation tests:

## 8. Acceptance Criteria
- [ ] Behavior requirement met.
- [ ] Edge cases covered.
- [ ] Tests pass locally/CI.
- [ ] Docs/config updated.
- [ ] No secrets introduced.

## 9. Rollout and Safety
- Feature flags used:
- Backward compatibility:
- Rollback approach:
- Monitoring/alerts to watch:

## 10. Completion Notes
- What changed:
- What was intentionally deferred:
- Follow-up tasks:
