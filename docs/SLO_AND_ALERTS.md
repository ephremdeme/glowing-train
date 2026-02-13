# SLO and Alerts

## Core SLOs
- Payout latency SLO: recipient payout initiated within 10 minutes after on-chain confirmation.
- Funding ingestion SLO: watcher-confirmed events processed without duplicate transitions.
- Reconciliation SLO: scheduled run completes and reports issues.

## Key metrics
- `*_request_duration_ms` and `*_request_total` per service.
- Funding confirmation to payout initiation latency.
- Payout retry count and review-required count.
- Reconciliation issue rate per run.
- Retention job deletes by entity type.
- Key verification job health status (`ok`/`degraded`).

## Alert policies
- Payout retry exhaustion above threshold.
- Watcher lag above configured window.
- SLA breach count above threshold.
- Reconciliation issue spike above baseline.
- Key verification failures.

## Correlation
- Propagate request ID and actor metadata in internal calls.
- Include command/reason for ops write actions.
