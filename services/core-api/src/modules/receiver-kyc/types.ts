import type { EncryptedField } from '@cryptopay/security';

export type KycStatus = 'approved' | 'pending' | 'rejected';

export interface ReceiverKycProfile {
  receiverId: string;
  kycStatus: KycStatus;
  nationalIdVerified: boolean;
  nationalIdHash: string | null;
  nationalIdEncrypted: EncryptedField | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertReceiverKycInput {
  receiverId: string;
  kycStatus: KycStatus;
  nationalIdVerified: boolean;
  nationalIdPlaintext?: string;
}

export interface ReceiverKycRepositoryPort {
  getByReceiverId(receiverId: string): Promise<ReceiverKycProfile | null>;
  upsert(input: {
    receiverId: string;
    kycStatus: KycStatus;
    nationalIdVerified: boolean;
    nationalIdHash: string | null;
    nationalIdEncrypted: EncryptedField | null;
  }): Promise<ReceiverKycProfile>;
}
