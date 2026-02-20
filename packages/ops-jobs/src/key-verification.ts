import { decryptField, encryptField, LocalDevKeyProvider, type KeyProvider } from '@cryptopay/security';

export interface KeyVerificationResult {
  ok: boolean;
  keyVersion: string;
  details: string;
}

function buildDefaultProvider(): KeyProvider {
  const base64Key = process.env.DATA_KEY_B64;

  return new LocalDevKeyProvider({
    keyId: process.env.DATA_KEY_ID ?? 'dev-key',
    keyVersion: process.env.DATA_KEY_VERSION ?? 'v1',
    ...(base64Key ? { base64Key } : {})
  });
}

export async function runKeyVerification(provider: KeyProvider = buildDefaultProvider()): Promise<KeyVerificationResult> {
  const health = await provider.healthcheck();
  if (!health.ok) {
    return {
      ok: false,
      keyVersion: process.env.DATA_KEY_VERSION ?? 'unknown',
      details: `Key provider healthcheck failed: ${health.details}`
    };
  }

  const probeText = `probe_${Date.now()}`;
  const encrypted = await encryptField(probeText, provider);
  const decrypted = await decryptField(encrypted, provider);

  if (decrypted != probeText) {
    return {
      ok: false,
      keyVersion: encrypted.keyVersion,
      details: 'Encryption probe mismatch detected.'
    };
  }

  return {
    ok: true,
    keyVersion: encrypted.keyVersion,
    details: 'Key verification probe succeeded.'
  };
}
