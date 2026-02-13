import { createHash } from 'node:crypto';
import { encryptField, LocalDevKeyProvider, type KeyProvider } from '@cryptopay/security';
import type { ReceiverKycProfile, ReceiverKycRepositoryPort, UpsertReceiverKycInput } from './types.js';

function normalizeNationalId(input: string): string {
  return input.trim().replace(/\s+/g, '').toUpperCase();
}

function hashNationalId(normalizedNationalId: string): string {
  return createHash('sha256').update(normalizedNationalId).digest('hex');
}

function buildKeyProvider(): KeyProvider {
  const base64Key = process.env.DATA_KEY_B64;

  return new LocalDevKeyProvider({
    keyId: process.env.DATA_KEY_ID ?? 'dev-key',
    keyVersion: process.env.DATA_KEY_VERSION ?? 'v1',
    ...(base64Key ? { base64Key } : {})
  });
}

export class ReceiverKycService {
  constructor(
    private readonly repository: ReceiverKycRepositoryPort,
    private readonly provider: KeyProvider = buildKeyProvider()
  ) {}

  getByReceiverId(receiverId: string): Promise<ReceiverKycProfile | null> {
    return this.repository.getByReceiverId(receiverId);
  }

  async upsert(input: UpsertReceiverKycInput): Promise<ReceiverKycProfile> {
    const nationalId = input.nationalIdPlaintext ? normalizeNationalId(input.nationalIdPlaintext) : null;

    const nationalIdHash = nationalId ? hashNationalId(nationalId) : null;
    const nationalIdEncrypted = nationalId ? await encryptField(nationalId, this.provider) : null;

    return this.repository.upsert({
      receiverId: input.receiverId,
      kycStatus: input.kycStatus,
      nationalIdVerified: input.nationalIdVerified,
      nationalIdHash,
      nationalIdEncrypted
    });
  }
}
