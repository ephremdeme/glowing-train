create table if not exists quotes (
  quote_id text primary key,
  chain text not null check (chain in ('base', 'solana')),
  token text not null check (token in ('USDC', 'USDT')),
  send_amount_usd numeric(12, 2) not null check (send_amount_usd > 0 and send_amount_usd <= 2000),
  fx_rate_usd_to_etb numeric(18, 6) not null check (fx_rate_usd_to_etb > 0),
  fee_usd numeric(12, 2) not null check (fee_usd >= 0),
  recipient_amount_etb numeric(14, 2) not null check (recipient_amount_etb >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_quotes_expires_at on quotes(expires_at);
