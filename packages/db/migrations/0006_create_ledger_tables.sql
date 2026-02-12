create table if not exists ledger_journal (
  journal_id text primary key,
  transfer_id text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists ledger_entry (
  id bigserial primary key,
  journal_id text not null references ledger_journal(journal_id) on delete cascade,
  transfer_id text not null,
  account_code text not null,
  entry_type text not null check (entry_type in ('debit', 'credit')),
  amount_usd numeric(12, 2) not null check (amount_usd > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_ledger_entry_transfer on ledger_entry(transfer_id);
create index if not exists idx_ledger_entry_journal on ledger_entry(journal_id);
