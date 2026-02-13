create table if not exists customer_account (
  customer_id text primary key,
  full_name text not null,
  country_code text not null,
  status text not null check (status in ('active', 'disabled')) default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customer_auth_identity (
  id bigserial primary key,
  customer_id text not null references customer_account(customer_id) on delete cascade,
  provider text not null check (provider in ('email_password', 'email_magic', 'phone_otp', 'google')),
  provider_subject text,
  email text,
  phone_e164 text,
  password_hash text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subject)
);

create unique index if not exists idx_customer_auth_identity_verified_email_unique
  on customer_auth_identity (lower(email))
  where email is not null and verified_at is not null;

create unique index if not exists idx_customer_auth_identity_verified_phone_unique
  on customer_auth_identity (phone_e164)
  where phone_e164 is not null and verified_at is not null;

create table if not exists customer_session (
  session_id text primary key,
  customer_id text not null references customer_account(customer_id) on delete cascade,
  refresh_token_hash text not null unique,
  csrf_token_hash text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  rotated_from text references customer_session(session_id),
  revoked_at timestamptz,
  ip text,
  user_agent text
);

create index if not exists idx_customer_session_customer_id on customer_session(customer_id);
create index if not exists idx_customer_session_expires_at on customer_session(expires_at);

create table if not exists auth_challenge (
  challenge_id text primary key,
  type text not null check (type in ('email_magic', 'phone_otp', 'google_oauth_state')),
  target text not null,
  code_hash text,
  token_hash text,
  expires_at timestamptz not null,
  attempt_count integer not null default 0,
  consumed_at timestamptz,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_auth_challenge_type_target on auth_challenge(type, target);
create index if not exists idx_auth_challenge_expires_at on auth_challenge(expires_at);

create table if not exists customer_mfa_totp (
  customer_id text primary key references customer_account(customer_id) on delete cascade,
  secret_encrypted jsonb not null,
  recovery_codes_hash jsonb not null default '[]'::jsonb,
  enabled_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sender_kyc_profile (
  customer_id text primary key references customer_account(customer_id) on delete cascade,
  provider text not null default 'sumsub' check (provider in ('sumsub')),
  applicant_id text,
  kyc_status text not null check (kyc_status in ('pending', 'approved', 'rejected')) default 'pending',
  reason_code text,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sender_kyc_profile_status on sender_kyc_profile(kyc_status);

create table if not exists recipient (
  recipient_id text primary key,
  customer_id text not null references customer_account(customer_id) on delete cascade,
  full_name text not null,
  bank_account_name text not null,
  bank_account_number text not null,
  bank_code text not null,
  phone_e164 text,
  country_code text not null,
  status text not null check (status in ('active', 'deleted')) default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_recipient_customer_id on recipient(customer_id);

alter table if exists receiver_kyc_profile
  add column if not exists recipient_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'receiver_kyc_profile_recipient_id_fk'
  ) then
    alter table receiver_kyc_profile
      add constraint receiver_kyc_profile_recipient_id_fk
      foreign key (recipient_id)
      references recipient(recipient_id)
      on delete set null;
  end if;
end
$$;

create unique index if not exists idx_receiver_kyc_profile_recipient_id
  on receiver_kyc_profile(recipient_id)
  where recipient_id is not null;
