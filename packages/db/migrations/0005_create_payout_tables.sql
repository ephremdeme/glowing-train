create table if not exists payout_instruction (
  payout_id text primary key,
  transfer_id text not null unique references transfers(transfer_id),
  method text not null check (method in ('bank', 'telebirr')),
  recipient_account_ref text not null,
  amount_etb numeric(14, 2) not null check (amount_etb > 0),
  status text not null check (status in ('PENDING', 'PAYOUT_INITIATED', 'PAYOUT_REVIEW_REQUIRED')) default 'PENDING',
  provider_reference text,
  attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payout_status_event (
  id bigserial primary key,
  payout_id text not null references payout_instruction(payout_id) on delete cascade,
  transfer_id text not null,
  from_status text,
  to_status text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_payout_instruction_transfer on payout_instruction(transfer_id);
create index if not exists idx_payout_status_event_payout on payout_status_event(payout_id);
