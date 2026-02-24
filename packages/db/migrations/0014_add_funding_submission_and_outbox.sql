create table if not exists funding_submission_attempt (
  submission_id text primary key,
  transfer_id text not null references transfers(transfer_id) on delete cascade,
  chain text not null check (chain in ('base', 'solana')),
  tx_hash text not null,
  status text not null check (status in ('submitted', 'confirmed', 'failed')) default 'submitted',
  observed_confirmations integer not null default 0,
  metadata jsonb,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transfer_id, tx_hash)
);

create index if not exists idx_funding_submission_attempt_transfer_submitted
  on funding_submission_attempt(transfer_id, submitted_at desc);

create index if not exists idx_funding_submission_attempt_status_updated
  on funding_submission_attempt(status, updated_at desc);

create table if not exists outbox_event (
  event_id text primary key,
  topic text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  payload jsonb not null,
  status text not null check (status in ('pending', 'processing', 'processed', 'dead_letter')) default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_outbox_event_status_next_attempt
  on outbox_event(status, next_attempt_at);

create index if not exists idx_outbox_event_topic_status
  on outbox_event(topic, status);

create index if not exists idx_outbox_event_aggregate
  on outbox_event(aggregate_type, aggregate_id);

