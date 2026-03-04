do $$
declare
  legacy_index_name text;
begin
  for legacy_index_name in
    select c.relname
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    join pg_class t on t.oid = i.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'deposit_routes'
      and i.indisunique
      and i.indpred is null
      and pg_get_indexdef(i.indexrelid) like '%(chain, token, deposit_address)%'
  loop
    execute format('drop index if exists public.%I', legacy_index_name);
  end loop;
end $$;

create unique index if not exists idx_deposit_routes_chain_token_address_route_unique
  on deposit_routes(chain, token, deposit_address)
  where route_kind = 'address_route' and status = 'active';

create unique index if not exists idx_deposit_routes_chain_token_reference_route_unique
  on deposit_routes(chain, token, reference_hash)
  where route_kind = 'solana_program_pay' and status = 'active' and reference_hash is not null;
