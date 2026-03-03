-- Fix payout_instruction status constraint to include terminal states
-- that the payout-orchestrator writes during completion/failure callbacks.
alter table payout_instruction
  drop constraint if exists payout_instruction_status_check;

alter table payout_instruction
  add constraint payout_instruction_status_check
    check (status in (
      'PENDING',
      'PAYOUT_INITIATED',
      'PAYOUT_REVIEW_REQUIRED',
      'PAYOUT_COMPLETED',
      'PAYOUT_FAILED'
    ));
