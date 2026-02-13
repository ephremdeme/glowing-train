import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { KeyProvider } from './key-provider.js';

export interface EncryptedField {
  algo: 'aes-256-gcm';
  keyId: string;
  keyVersion: string;
  ivB64: string;
  tagB64: string;
  ciphertextB64: string;
}

export async function encryptField(plainText: string, provider: KeyProvider): Promise<EncryptedField> {
  const key = await provider.getActiveKey();
  const iv = randomBytes(12);

  const cipher = createCipheriv('aes-256-gcm', key.keyBytes, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plainText, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    algo: 'aes-256-gcm',
    keyId: key.keyId,
    keyVersion: key.keyVersion,
    ivB64: iv.toString('base64'),
    tagB64: tag.toString('base64'),
    ciphertextB64: encrypted.toString('base64')
  };
}

export async function decryptField(field: EncryptedField, provider: KeyProvider): Promise<string> {
  const key = await provider.getKeyByVersion(field.keyVersion);

  const decipher = createDecipheriv('aes-256-gcm', key.keyBytes, Buffer.from(field.ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(field.tagB64, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(field.ciphertextB64, 'base64')),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}
