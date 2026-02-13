import { getPool } from '@cryptopay/db';
import type { EncryptedField } from '@cryptopay/security';
import type { ReceiverKycProfile, ReceiverKycRepositoryPort } from './types.js';

type Pool = ReturnType<typeof getPool>;

type DbRow = {
  receiver_id: string;
  kyc_status: ReceiverKycProfile['kycStatus'];
  national_id_verified: boolean;
  national_id_hash: string | null;
  national_id_encrypted: EncryptedField | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: DbRow): ReceiverKycProfile {
  return {
    receiverId: row.receiver_id,
    kycStatus: row.kyc_status,
    nationalIdVerified: row.national_id_verified,
    nationalIdHash: row.national_id_hash,
    nationalIdEncrypted: row.national_id_encrypted,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

export class ReceiverKycRepository implements ReceiverKycRepositoryPort {
  constructor(private readonly pool: Pool = getPool()) {}

  async getByReceiverId(receiverId: string): Promise<ReceiverKycProfile | null> {
    const result = await this.pool.query('select * from receiver_kyc_profile where receiver_id = $1 limit 1', [receiverId]);
    const row = result.rows[0] as DbRow | undefined;
    return row ? mapRow(row) : null;
  }

  async upsert(input: {
    receiverId: string;
    kycStatus: ReceiverKycProfile['kycStatus'];
    nationalIdVerified: boolean;
    nationalIdHash: string | null;
    nationalIdEncrypted: EncryptedField | null;
  }): Promise<ReceiverKycProfile> {
    const result = await this.pool.query(
      `
      insert into receiver_kyc_profile (
        receiver_id,
        kyc_status,
        national_id_verified,
        national_id_hash,
        national_id_encrypted
      ) values ($1, $2, $3, $4, $5)
      on conflict (receiver_id)
      do update set
        kyc_status = excluded.kyc_status,
        national_id_verified = excluded.national_id_verified,
        national_id_hash = coalesce(excluded.national_id_hash, receiver_kyc_profile.national_id_hash),
        national_id_encrypted = coalesce(excluded.national_id_encrypted, receiver_kyc_profile.national_id_encrypted),
        updated_at = now()
      returning *
      `,
      [input.receiverId, input.kycStatus, input.nationalIdVerified, input.nationalIdHash, input.nationalIdEncrypted]
    );

    return mapRow(result.rows[0] as DbRow);
  }
}
