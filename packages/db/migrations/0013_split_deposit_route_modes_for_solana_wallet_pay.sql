alter table deposit_routes
  add column if not exists route_kind text not null default 'address_route';

alter table deposit_routes
  add column if not exists reference_hash text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'deposit_routes_route_kind_check'
  ) then
    alter table deposit_routes
      add constraint deposit_routes_route_kind_check
      check (route_kind in ('address_route', 'solana_program_pay'));
  end if;
end $$;

drop index if exists idx_deposit_routes_chain_token_address;

create unique index if not exists idx_deposit_routes_chain_token_address_route_unique
  on deposit_routes(chain, token, deposit_address)
  where route_kind = 'address_route' and status = 'active';

create unique index if not exists idx_deposit_routes_chain_token_reference_route_unique
  on deposit_routes(chain, token, reference_hash)
  where route_kind = 'solana_program_pay' and status = 'active' and reference_hash is not null;

create index if not exists idx_deposit_routes_chain_kind_status
  on deposit_routes(chain, route_kind, status);

