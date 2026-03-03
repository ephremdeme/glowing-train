alter table transfers
  drop column if exists receiver_kyc_status,
  drop column if exists receiver_national_id_verified;

drop table if exists receiver_kyc_profile cascade;
