import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';
import {
  EncryptionKeyStore,
  EncryptionKeyStoreError
} from '../EncryptionKeyStore';
import { EncryptionConfig, RequestTransformer } from '../RequestTransformer';
import { TransformationRule } from '../PrivacyApiGateway';
import { logger } from '../../utils/logger';

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

const TEST_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('EncryptionKeyStore', () => {
  let tempDir: string;
  let storePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'encryption-key-store-'));
    storePath = path.join(tempDir, 'encryption-keys.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const createStore = () =>
    new EncryptionKeyStore({ filePath: storePath, masterKey: TEST_MASTER_KEY });

  test('returns missing status when store file does not exist', () => {
    const result = createStore().load();

    expect(result.status).toBe('missing');
    expect(result.keys.size).toBe(0);
    expect(result.fileExists).toBe(false);
  });

  test('persists encrypted keys and reloads them', () => {
    const store = createStore();
    const keys = new Map<string, Buffer>([
      ['default', randomBytes(32)],
      ['tenant-a', randomBytes(32)]
    ]);

    store.save(keys);

    const raw = fs.readFileSync(storePath, 'utf8');
    expect(raw).toContain('"encrypted": true');
    expect(raw).not.toContain(keys.get('default')!.toString('base64'));

    const loaded = store.load();
    expect(loaded.status).toBe('recovered');
    expect(loaded.keys.size).toBe(2);
    expect(loaded.keys.get('default')?.equals(keys.get('default')!)).toBe(true);
    expect(loaded.keys.get('tenant-a')?.equals(keys.get('tenant-a')!)).toBe(true);
  });

  test('migrates legacy plaintext stores on save', () => {
    const legacyPayload = {
      version: 1,
      keys: {
        default: randomBytes(32).toString('base64')
      }
    };
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(legacyPayload), 'utf8');

    const store = createStore();
    const loaded = store.load();

    expect(loaded.status).toBe('recovered');
    expect(loaded.keys.size).toBe(1);

    store.save(loaded.keys);

    const raw = fs.readFileSync(storePath, 'utf8');
    expect(raw).toContain('"encrypted": true');
  });

  test('returns corrupted status for invalid store content', () => {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, '{ invalid json', 'utf8');

    const result = createStore().load();

    expect(result.status).toBe('corrupted');
    expect(result.keys.size).toBe(0);
    expect(logger.error).toHaveBeenCalled();
  });

  test('refuses to save an empty key set', () => {
    expect(() => createStore().save(new Map())).toThrow(EncryptionKeyStoreError);
  });

  test('throws when persistence fails', () => {
    const store = createStore();
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('disk full');
    });

    expect(() => store.save(new Map([['default', randomBytes(32)]]))).toThrow(
      /Failed to persist encryption keys/
    );

    writeSpy.mockRestore();
  });

  test('requires master key in production', () => {
    const previousEnv = process.env.NODE_ENV;
    const previousMasterKey = process.env.REQUEST_TRANSFORMER_MASTER_KEY;

    process.env.NODE_ENV = 'production';
    delete process.env.REQUEST_TRANSFORMER_MASTER_KEY;
    delete process.env.STORAGE_MASTER_KEY;

    expect(() => new EncryptionKeyStore({ filePath: storePath })).toThrow(
      /REQUEST_TRANSFORMER_MASTER_KEY/
    );

    process.env.NODE_ENV = previousEnv;
    if (previousMasterKey) {
      process.env.REQUEST_TRANSFORMER_MASTER_KEY = previousMasterKey;
    }
  });
});

describe('RequestTransformer encryption key persistence', () => {
  let tempDir: string;
  let storePath: string;
  const encryptionConfig: EncryptionConfig = {
    algorithm: 'aes-256-cbc',
    keyId: 'default',
    ivLength: 16
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'request-transformer-'));
    storePath = path.join(tempDir, 'encryption-keys.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const createStore = () =>
    new EncryptionKeyStore({ filePath: storePath, masterKey: TEST_MASTER_KEY });

  const createTransformer = () => new RequestTransformer(createStore());

  test('logs recovery when keys exist in durable store', () => {
    const seedKey = randomBytes(32);
    createStore().save(new Map([['default', seedKey]]));

    createTransformer();

    expect(logger.info).toHaveBeenCalledWith(
      'Recovered encryption keys from durable store on startup',
      expect.objectContaining({
        keyCount: 1,
        keyIds: ['default'],
        storePath
      })
    );
  });

  test('generates and persists default key when store is empty', () => {
    createTransformer();

    expect(fs.existsSync(storePath)).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      'No encryption keys found in durable store; generating fresh default key',
      expect.objectContaining({ storePath })
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Fresh default encryption key generated and persisted',
      expect.objectContaining({
        keyId: 'default',
        storePath,
        reason: 'missing'
      })
    );
  });

  test('survives simulated process restart for encrypt/decrypt round-trip', () => {
    const transformer = createTransformer();
    const plaintext = 'patient-record-12345';
    const ciphertext = transformer.encryptValue(plaintext, encryptionConfig);

    expect(ciphertext).not.toEqual(plaintext);

    const restartedTransformer = createTransformer();
    const decrypted = restartedTransformer.decryptValue(ciphertext, encryptionConfig);

    expect(decrypted).toBe(plaintext);
  });

  test('encrypt transform rule works after simulated restart', async () => {
    const transformer = createTransformer();
    const rule: TransformationRule = {
      type: 'encrypt',
      field: 'request.body.ssn',
      parameters: {
        algorithm: 'aes-256-cbc',
        keyId: 'default',
        ivLength: 16
      }
    };

    const req = {
      body: { ssn: '123-45-6789' },
      headers: {}
    } as any;

    const result = await transformer.applyRequestTransformations(req, [rule]);
    expect(result.success).toBe(true);
    expect(req.body.ssn).not.toBe('123-45-6789');

    const restartedTransformer = createTransformer();
    expect(restartedTransformer.decryptValue(req.body.ssn, encryptionConfig)).toBe('123-45-6789');
  });

  test('persists keys added via addEncryptionKey across restart', () => {
    const transformer = createTransformer();
    transformer.addEncryptionKey('tenant-key', randomBytes(32));

    const restartedTransformer = createTransformer();
    const customConfig: EncryptionConfig = {
      ...encryptionConfig,
      keyId: 'tenant-key'
    };

    const ciphertext = restartedTransformer.encryptValue('secret-value', customConfig);
    expect(restartedTransformer.decryptValue(ciphertext, customConfig)).toBe('secret-value');
  });

  test('synchronizes keys added by another transformer instance', () => {
    const transformerA = createTransformer();
    const transformerB = createTransformer();

    transformerA.addEncryptionKey('shared-key', randomBytes(32));

    const customConfig: EncryptionConfig = {
      ...encryptionConfig,
      keyId: 'shared-key'
    };

    const ciphertext = transformerB.encryptValue('shared-secret', customConfig);
    expect(transformerB.decryptValue(ciphertext, customConfig)).toBe('shared-secret');
    expect(logger.info).toHaveBeenCalledWith(
      'Synchronized encryption keys from durable store',
      expect.objectContaining({
        keyIds: expect.arrayContaining(['shared-key'])
      })
    );
  });

  test('removes non-default keys from durable store via removeEncryptionKey', () => {
    const transformer = createTransformer();
    transformer.addEncryptionKey('temporary', randomBytes(32));

    transformer.removeEncryptionKey('temporary');

    const restartedTransformer = createTransformer();
    expect(() =>
      restartedTransformer.encryptValue('value', { ...encryptionConfig, keyId: 'temporary' })
    ).toThrow('Encryption key not found: temporary');
  });

  test('prevents removing the last remaining encryption key', () => {
    const transformer = createTransformer();

    expect(() => transformer.removeEncryptionKey('default')).toThrow(
      'Cannot remove the last remaining encryption key'
    );
  });

  test('rejects invalid key material in addEncryptionKey', () => {
    const transformer = createTransformer();

    expect(() => transformer.addEncryptionKey('', Buffer.alloc(0))).toThrow(
      'Encryption key id and material are required'
    );
  });

  test('handles null and undefined values during decrypt', () => {
    const transformer = createTransformer();

    expect(transformer.decryptValue(null as unknown as string, encryptionConfig)).toBeNull();
    expect(transformer.decryptValue(undefined as unknown as string, encryptionConfig)).toBeUndefined();
  });

  test('throws when encryption key is absent after store reload', () => {
    const transformer = createTransformer();
    transformer.addEncryptionKey('ephemeral', randomBytes(32));

    const customConfig: EncryptionConfig = {
      ...encryptionConfig,
      keyId: 'ephemeral'
    };
    const ciphertext = transformer.encryptValue('data', customConfig);

    createStore().save(new Map([['default', randomBytes(32)]]));

    const restartedTransformer = createTransformer();
    expect(() => restartedTransformer.decryptValue(ciphertext, customConfig)).toThrow(
      'Encryption key not found: ephemeral'
    );
  });

  test('throws for malformed encrypted payload', () => {
    const transformer = createTransformer();

    expect(() => transformer.decryptValue('not-valid-ciphertext', encryptionConfig)).toThrow(
      'Invalid encrypted payload format'
    );
  });

  test('logs corruption-specific warning before regenerating keys', () => {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, '{ corrupted', 'utf8');

    createTransformer();

    expect(logger.warn).toHaveBeenCalledWith(
      'Encryption key store is corrupted; regenerating fresh default key',
      expect.objectContaining({ storePath })
    );
  });
});
