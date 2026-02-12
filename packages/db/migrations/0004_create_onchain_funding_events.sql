create table if not exists onchain_funding_event (
  event_id text primary key,
  chain text not null check (chain in ('base', 'solana')),
  token text not null check (token in ('USDC', 'USDT')),
  tx_hash text not null,
  log_index integer not null,
  transfer_id text not null unique references transfers(transfer_id),
  deposit_address text not null,
  amount_usd numeric(12, 2) not null check (amount_usd > 0),
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(chain, tx_hash, log_index)
);

create index if not exists idx_onchain_funding_event_transfer on onchain_funding_event(transfer_id);
