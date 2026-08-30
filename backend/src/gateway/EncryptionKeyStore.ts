import fs from 'fs';
import path from 'path';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync
} from 'crypto';
import { logger } from '../utils/logger';

const STORE_VERSION_PLAINTEXT = 1;
const STORE_VERSION_ENCRYPTED = 2;

export interface EncryptionKeyStoreData {
  version: number;
  keys: Record<string, string>;
}

export interface EncryptedKeyStoreEnvelope {
  version: number;
  encrypted: true;
  iv: string;
  authTag: string;
  payload: string;
}

export type KeyStoreLoadStatus = 'missing' | 'recovered' | 'empty' | 'corrupted';

export interface KeyStoreLoadResult {
  status: KeyStoreLoadStatus;
  keys: Map<string, Buffer>;
  fileExists: boolean;
}

export interface EncryptionKeyStoreOptions {
  filePath?: string;
  masterKey?: string;
}

export class EncryptionKeyStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionKeyStoreError';
  }
}

export class EncryptionKeyStore {
  private readonly filePath: string;
  private readonly masterKey: Buffer;
  private lastPersistedMtimeMs = 0;

  constructor(options: EncryptionKeyStoreOptions = {}) {
    this.filePath =
      options.filePath ??
      process.env.REQUEST_TRANSFORMER_KEYS_PATH ??
      path.join(process.cwd(), 'data', 'gateway', 'encryption-keys.json');

    const configuredMasterKey =
      options.masterKey ??
      process.env.REQUEST_TRANSFORMER_MASTER_KEY ??
      process.env.STORAGE_MASTER_KEY;

    if (process.env.NODE_ENV === 'production' && !configuredMasterKey) {
      throw new EncryptionKeyStoreError(
        'REQUEST_TRANSFORMER_MASTER_KEY (or STORAGE_MASTER_KEY) is required in production'
      );
    }

    this.masterKey = this.deriveMasterKey(
      configuredMasterKey ?? 'development-only-request-transformer-master-key'
    );
  }

  getFilePath(): string {
    return this.filePath;
  }

  getLastModifiedMs(): number {
    if (!fs.existsSync(this.filePath)) {
      return 0;
    }

    return fs.statSync(this.filePath).mtimeMs;
  }

  getLastPersistedMtimeMs(): number {
    return this.lastPersistedMtimeMs;
  }

  load(): KeyStoreLoadResult {
    if (!fs.existsSync(this.filePath)) {
      return {
        status: 'missing',
        keys: new Map(),
        fileExists: false
      };
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as EncryptionKeyStoreData | EncryptedKeyStoreEnvelope;

      let keysPayload: EncryptionKeyStoreData;
      if (this.isEncryptedEnvelope(parsed)) {
        keysPayload = this.decryptEnvelope(parsed);
      } else if (parsed.version === STORE_VERSION_PLAINTEXT && 'keys' in parsed && parsed.keys) {
        logger.warn('Loaded legacy plaintext encryption key store; will migrate to encrypted format on next save', {
          filePath: this.filePath
        });
        keysPayload = parsed;
      } else {
        throw new Error('Invalid encryption key store format');
      }

      if (!keysPayload.keys || typeof keysPayload.keys !== 'object') {
        throw new Error('Invalid encryption key store format');
      }

      const keys = new Map<string, Buffer>();
      for (const [keyId, encodedKey] of Object.entries(keysPayload.keys)) {
        if (typeof encodedKey !== 'string' || encodedKey.length === 0) {
          logger.warn('Skipping invalid encryption key entry during load', { keyId });
          continue;
        }

        const keyMaterial = Buffer.from(encodedKey, 'base64');
        if (keyMaterial.length === 0) {
          logger.warn('Skipping empty encryption key entry during load', { keyId });
          continue;
        }

        keys.set(keyId, keyMaterial);
      }

      this.lastPersistedMtimeMs = this.getLastModifiedMs();

      if (keys.size === 0) {
        return {
          status: 'empty',
          keys,
          fileExists: true
        };
      }

      return {
        status: 'recovered',
        keys,
        fileExists: true
      };
    } catch (error) {
      logger.error('Failed to load encryption keys from durable store', {
        filePath: this.filePath,
        error: (error as Error).message
      });

      return {
        status: 'corrupted',
        keys: new Map(),
        fileExists: true
      };
    }
  }

  save(keys: Map<string, Buffer>): void {
    if (keys.size === 0) {
      throw new EncryptionKeyStoreError('Refusing to persist an empty encryption key store');
    }

    const payload: EncryptionKeyStoreData = {
      version: STORE_VERSION_PLAINTEXT,
      keys: Object.fromEntries(
        Array.from(keys.entries()).map(([keyId, keyMaterial]) => [
          keyId,
          keyMaterial.toString('base64')
        ])
      )
    };

    const envelope = this.encryptPayload(payload);
    const serialized = JSON.stringify(envelope, null, 2);

    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });

    const tempPath = `${this.filePath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;

    try {
      fs.writeFileSync(tempPath, serialized, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tempPath, this.filePath);
      this.lastPersistedMtimeMs = this.getLastModifiedMs();
    } catch (error) {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }

      throw new EncryptionKeyStoreError(
        `Failed to persist encryption keys to durable store: ${(error as Error).message}`
      );
    }
  }

  hasExternalChanges(lastKnownMtimeMs: number): boolean {
    return this.getLastModifiedMs() > lastKnownMtimeMs;
  }

  private isEncryptedEnvelope(
    value: EncryptionKeyStoreData | EncryptedKeyStoreEnvelope
  ): value is EncryptedKeyStoreEnvelope {
    return 'encrypted' in value && value.encrypted === true;
  }

  private deriveMasterKey(source: string): Buffer {
    if (/^[0-9a-fA-F]{64}$/.test(source)) {
      return Buffer.from(source, 'hex');
    }

    return scryptSync(source, 'stellar-request-transformer-key-store', 32);
  }

  private encryptPayload(payload: EncryptionKeyStoreData): EncryptedKeyStoreEnvelope {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    return {
      version: STORE_VERSION_ENCRYPTED,
      encrypted: true,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      payload: ciphertext.toString('base64')
    };
  }

  private decryptEnvelope(envelope: EncryptedKeyStoreEnvelope): EncryptionKeyStoreData {
    const iv = Buffer.from(envelope.iv, 'hex');
    const authTag = Buffer.from(envelope.authTag, 'hex');
    const ciphertext = Buffer.from(envelope.payload, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(plaintext) as EncryptionKeyStoreData;

    if (!parsed.keys || typeof parsed.keys !== 'object') {
      throw new Error('Decrypted encryption key store payload is invalid');
    }

    return parsed;
  }
}
