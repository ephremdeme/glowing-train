create table if not exists reconciliation_run (
  run_id text primary key,
  started_at timestamptz not null,
  finished_at timestamptz,
  total_transfers integer not null default 0,
  total_issues integer not null default 0,
  status text not null check (status in ('running', 'completed', 'failed')),
  error_message text
);

create table if not exists reconciliation_issue (
  id bigserial primary key,
  run_id text not null references reconciliation_run(run_id) on delete cascade,
  transfer_id text not null,
  issue_code text not null,
  details jsonb,
  detected_at timestamptz not null default now()
);

create index if not exists idx_reconciliation_issue_run on reconciliation_issue(run_id);
create index if not exists idx_reconciliation_issue_transfer on reconciliation_issue(transfer_id);
