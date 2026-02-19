# SLO and Alerts

## Core SLOs
- Payout latency SLO: payout initiated within 10 minutes after funding confirmation.
- Funding ingestion SLO: watcher-confirmed events processed idempotently.
- Reconciliation SLO: scheduled runs complete and publish issue artifacts.

## Guardrail for color switch
During deploy cutover, require a 10-minute observation window with:
- no sustained 5xx spike,
- no payout retry exhaustion increase,
- no readiness degradation.

## Key metrics
- `*_request_duration_ms`
- `*_request_total`
- `*_error_total`
- `*_build_info` (releaseId/gitSha/color/environment)
- payout latency and SLA breach counters
- reconciliation issue counters
- watcher lag metrics

## Alert policy groups
Defined in `infra/monitoring/alerts.yml`:
- API error and 5xx spikes
- payout retry exhaustion
- payout SLA breach
- reconciliation errors and issue spikes
- watcher lag
- missing build metadata

## Correlation and release metadata
All deployed services must expose:
- `RELEASE_ID`
- `GIT_SHA`
- `DEPLOY_COLOR`
- `ENVIRONMENT`

These must be visible via `/version` and `*_build_info` metrics.
