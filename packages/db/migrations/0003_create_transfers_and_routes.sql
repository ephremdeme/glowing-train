create table if not exists transfers (
  transfer_id text primary key,
  quote_id text not null references quotes(quote_id),
  sender_id text not null,
  receiver_id text not null,
  sender_kyc_status text not null check (sender_kyc_status in ('approved', 'pending', 'rejected')),
  receiver_kyc_status text not null check (receiver_kyc_status in ('approved', 'pending', 'rejected')),
  receiver_national_id_verified boolean not null default false,
  chain text not null check (chain in ('base', 'solana')),
  token text not null check (token in ('USDC', 'USDT')),
  send_amount_usd numeric(12, 2) not null check (send_amount_usd > 0 and send_amount_usd <= 2000),
  status text not null check (
    status in (
      'TRANSFER_CREATED',
      'AWAITING_FUNDING',
      'FUNDING_CONFIRMED',
      'PAYOUT_INITIATED',
      'PAYOUT_COMPLETED',
      'PAYOUT_FAILED',
      'PAYOUT_REVIEW_REQUIRED'
    )
  ) default 'AWAITING_FUNDING',
  created_at timestamptz not null default now()
);

create table if not exists deposit_routes (
  route_id text primary key,
  transfer_id text not null unique references transfers(transfer_id) on delete cascade,
  chain text not null check (chain in ('base', 'solana')),
  token text not null check (token in ('USDC', 'USDT')),
  deposit_address text not null,
  deposit_memo text,
  status text not null check (status in ('active', 'retired')) default 'active',
  created_at timestamptz not null default now()
);

create unique index if not exists idx_deposit_routes_chain_token_address
  on deposit_routes(chain, token, deposit_address);
