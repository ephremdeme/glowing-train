create table if not exists idempotency_record (
  key text primary key,
  request_hash text not null,
  response_status integer not null,
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists audit_log (
  id bigserial primary key,
  actor_type text not null,
  actor_id text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  reason text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists transfer_transition (
  id bigserial primary key,
  transfer_id text not null,
  from_state text,
  to_state text not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb
);
