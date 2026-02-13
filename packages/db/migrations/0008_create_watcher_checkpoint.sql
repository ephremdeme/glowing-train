create table if not exists watcher_checkpoint (
  watcher_name text primary key,
  chain text not null check (chain in ('base', 'solana')),
  cursor text not null,
  updated_at timestamptz not null default now()
);

create table if not exists watcher_event_dedupe (
  event_key text primary key,
  watcher_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_watcher_event_dedupe_watcher_created
  on watcher_event_dedupe(watcher_name, created_at);
