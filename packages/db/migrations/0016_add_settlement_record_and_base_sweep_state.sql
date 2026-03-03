create table if not exists settlement_record (
  transfer_id text primary key references transfers(transfer_id) on delete cascade,
  chain text not null check (chain in ('base', 'solana')),
  token text not null check (token in ('USDC', 'USDT')),
  deposit_address text not null,
  status text not null check (status in ('pending_sweep', 'sweeping', 'swept', 'review_required')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_sweep_tx_hash text,
  swept_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_settlement_record_status_next_attempt
  on settlement_record(status, next_attempt_at);

create index if not exists idx_settlement_record_chain_status
  on settlement_record(chain, status);
