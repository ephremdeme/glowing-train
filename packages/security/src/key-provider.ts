import { createHash } from 'node:crypto';

export interface KeyMaterial {
  keyId: string;
  keyVersion: string;
  keyBytes: Buffer;
}

export interface KeyProvider {
  getActiveKey(): Promise<KeyMaterial>;
  getKeyByVersion(version: string): Promise<KeyMaterial>;
  healthcheck(): Promise<{ ok: boolean; details: string }>;
}

export class LocalDevKeyProvider implements KeyProvider {
  constructor(private readonly options: { keyId: string; keyVersion: string; base64Key?: string }) {}

  async getActiveKey(): Promise<KeyMaterial> {
    const keyBytes = this.options.base64Key
      ? Buffer.from(this.options.base64Key, 'base64')
      : createHash('sha256').update(`${this.options.keyId}:${this.options.keyVersion}`).digest().subarray(0, 32);
    if (keyBytes.length !== 32) {
      throw new Error('LocalDevKeyProvider key must be 32 bytes for AES-256-GCM.');
    }

    return {
      keyId: this.options.keyId,
      keyVersion: this.options.keyVersion,
      keyBytes
    };
  }

  async getKeyByVersion(version: string): Promise<KeyMaterial> {
    if (version !== this.options.keyVersion) {
      throw new Error(`Unknown key version: ${version}`);
    }

    return this.getActiveKey();
  }

  async healthcheck(): Promise<{ ok: boolean; details: string }> {
    try {
      await this.getActiveKey();
      return { ok: true, details: 'Local key material available.' };
    } catch (error) {
      return { ok: false, details: (error as Error).message };
    }
  }
}

export class ExternalKmsKeyProvider implements KeyProvider {
  constructor(
    private readonly resolver: {
      getActive: () => Promise<KeyMaterial>;
      getByVersion: (version: string) => Promise<KeyMaterial>;
      check: () => Promise<{ ok: boolean; details: string }>;
    }
  ) {}

  getActiveKey(): Promise<KeyMaterial> {
    return this.resolver.getActive();
  }

  getKeyByVersion(version: string): Promise<KeyMaterial> {
    return this.resolver.getByVersion(version);
  }

  healthcheck(): Promise<{ ok: boolean; details: string }> {
    return this.resolver.check();
  }
}
