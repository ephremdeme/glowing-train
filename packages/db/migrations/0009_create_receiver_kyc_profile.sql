create table if not exists receiver_kyc_profile (
  receiver_id text primary key,
  kyc_status text not null check (kyc_status in ('approved', 'pending', 'rejected')),
  national_id_verified boolean not null default false,
  national_id_hash text,
  national_id_encrypted jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_receiver_kyc_profile_kyc_status on receiver_kyc_profile(kyc_status);
create index if not exists idx_receiver_kyc_profile_national_id_hash on receiver_kyc_profile(national_id_hash);
