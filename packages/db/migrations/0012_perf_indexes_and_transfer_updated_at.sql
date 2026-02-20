alter table transfers
  add column if not exists updated_at timestamptz not null default now();

create or replace function set_transfers_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_transfers_updated_at on transfers;
create trigger trg_transfers_updated_at
before update on transfers
for each row
execute function set_transfers_updated_at();

alter table payout_instruction
  drop constraint if exists payout_instruction_method_check;

alter table payout_instruction
  add constraint payout_instruction_method_check
  check (method in ('bank'));

create index if not exists idx_idempotency_record_expires_at on idempotency_record(expires_at);
create index if not exists idx_audit_log_created_at on audit_log(created_at);
create index if not exists idx_audit_log_entity_created on audit_log(entity_type, entity_id, created_at desc);
create index if not exists idx_audit_log_action_created on audit_log(action, created_at desc);
create index if not exists idx_transfer_transition_transfer_occurred on transfer_transition(transfer_id, occurred_at);
create index if not exists idx_transfers_sender_created on transfers(sender_id, created_at desc);
create index if not exists idx_transfers_status_created on transfers(status, created_at desc);
create index if not exists idx_reconciliation_run_started_at on reconciliation_run(started_at desc);
create index if not exists idx_reconciliation_issue_detected_at on reconciliation_issue(detected_at desc);
