import { 
  AESEncryption, 
  StreamingDecryption, 
  SimpleKeyManager 
} from '../aes';
import { 
  CIDVersionManager, 
  RetryManager, 
  IntegrityValidator, 
  StellarLedgerManager 
} from '../storage';
import { EncryptedBlobStorageAdapter } from '../blob-storage';

describe('Encrypted Blob Storage', () => {
  let keyManager: SimpleKeyManager;
  let storageAdapter: EncryptedBlobStorageAdapter;

  beforeEach(() => {
    keyManager = new SimpleKeyManager();
    storageAdapter = new EncryptedBlobStorageAdapter(
      {
        nodeUrl: 'http://localhost:5001',
        timeout: 5000
      },
      keyManager
    );
  });

  describe('AES Encryption', () => {
    test('should encrypt and decrypt data correctly', () => {
      const data = Buffer.from('Hello, World!');
      const key = AESEncryption.generateKey();
      
      const encrypted = AESEncryption.encrypt(data, key);
      const decrypted = AESEncryption.decrypt(
        encrypted.encryptedData,
        key,
        encrypted.iv,
        encrypted.authTag
      );
      
      expect(decrypted.integrityVerified).toBe(true);
      expect(decrypted.decryptedData.toString()).toBe('Hello, World!');
    });

    test('should fail decryption with wrong key', () => {
      const data = Buffer.from('Hello, World!');
      const key = AESEncryption.generateKey();
      const wrongKey = AESEncryption.generateKey();
      
      const encrypted = AESEncryption.encrypt(data, key);
      const decrypted = AESEncryption.decrypt(
        encrypted.encryptedData,
        wrongKey,
        encrypted.iv,
        encrypted.authTag
      );
      
      expect(decrypted.integrityVerified).toBe(false);
    });

    test('should generate and verify SHA-256 hashes', () => {
      const data = Buffer.from('Test data');
      const hash = AESEncryption.generateHash(data);
      
      expect(AESEncryption.verifyIntegrity(data, hash)).toBe(true);
      expect(AESEncryption.verifyIntegrity(Buffer.from('Different data'), hash)).toBe(false);
    });
  });

  describe('Streaming Decryption', () => {
    test('should decrypt data in chunks', async () => {
      const data = Buffer.from('This is a longer test message for streaming decryption');
      const key = AESEncryption.generateKey();
      
      const encrypted = AESEncryption.encrypt(data, key);
      
      // Combine IV, authTag, and encrypted data for streaming
      const combinedData = Buffer.concat([
        encrypted.iv,
        encrypted.authTag,
        encrypted.encryptedData
      ]);
      
      const decryption = new StreamingDecryption(
        key,
        encrypted.iv,
        encrypted.authTag
      );
      
      // Process in chunks
      const chunkSize = 16;
      for (let i = 0; i < encrypted.encryptedData.length; i += chunkSize) {
        const chunk = encrypted.encryptedData.slice(i, i + chunkSize);
        const decryptedChunk = decryption.processChunk(chunk);
        if (decryptedChunk) {
          decryption.addChunk(decryptedChunk);
        }
      }
      
      const finalResult = decryption.finalize();
      expect(finalResult.toString()).toBe(data.toString());
    });
  });

  describe('Key Management', () => {
    test('should generate, store, and retrieve keys', async () => {
      const keyId = 'test-key-1';
      const key = keyManager.generateKey();
      
      await keyManager.storeKey(keyId, key);
      const retrievedKey = await keyManager.retrieveKey(keyId);
      
      expect(retrievedKey).toEqual(key);
    });

    test('should rotate keys', async () => {
      const keyId = 'test-key-2';
      const originalKey = keyManager.generateKey();
      await keyManager.storeKey(keyId, originalKey);
      
      const newKey = await keyManager.rotateKey(keyId);
      const retrievedKey = await keyManager.retrieveKey(keyId);
      
      expect(newKey).not.toEqual(originalKey);
      expect(retrievedKey).toEqual(newKey);
    });
  });

  describe('CID Version Management', () => {
    test('should manage versions for datasets', () => {
      const versionManager = new CIDVersionManager();
      const datasetId = 'test-dataset';
      
      const cidInfo1 = {
        cid: 'QmTest1',
        size: 100,
        hash: 'hash1',
        timestamp: new Date(),
        version: 1
      };
      
      const cidInfo2 = {
        cid: 'QmTest2',
        size: 200,
        hash: 'hash2',
        timestamp: new Date(),
        version: 1
      };
      
      versionManager.addVersion(datasetId, cidInfo1);
      versionManager.addVersion(datasetId, cidInfo2);
      
      expect(versionManager.getLatestVersion(datasetId)?.cid).toBe('QmTest2');
      expect(versionManager.getVersion(datasetId, 1)?.cid).toBe('QmTest1');
      expect(versionManager.getAllVersions(datasetId)).toHaveLength(2);
    });
  });

  describe('Retry Mechanism', () => {
    test('should retry failed operations', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      };
      
      const config = RetryManager.defaultConfig();
      const result = await RetryManager.executeWithRetry(operation, config);
      
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    test('should fail after max retries', async () => {
      const operation = async () => {
        throw new Error('Persistent failure');
      };
      
      const config = { ...RetryManager.defaultConfig(), maxRetries: 2 };
      
      await expect(RetryManager.executeWithRetry(operation, config))
        .rejects.toThrow('Operation failed after 2 attempts');
    });
  });

  describe('Integrity Validation', () => {
    test('should validate data integrity', () => {
      const data = Buffer.from('Test data for integrity');
      const hash = IntegrityValidator.generateHash(data);
      
      const result = IntegrityValidator.verifyData(data, hash);
      
      expect(result.isValid).toBe(true);
      expect(result.actualHash).toBe(hash);
    });

    test('should detect integrity violations', () => {
      const data = Buffer.from('Original data');
      const modifiedData = Buffer.from('Modified data');
      const hash = IntegrityValidator.generateHash(data);
      
      const result = IntegrityValidator.verifyData(modifiedData, hash);
      
      expect(result.isValid).toBe(false);
      expect(result.actualHash).not.toBe(hash);
    });
  });

  describe('Stellar Ledger Integration', () => {
    test('should store and retrieve CID entries', async () => {
      const ledgerManager = new StellarLedgerManager();
      const entry = {
        id: 'entry-1',
        cid: 'QmTest123',
        hash: 'hash123',
        timestamp: new Date(),
        datasetId: 'dataset-1',
        version: 1,
        encryptionKeyId: 'key-1'
      };
      
      await ledgerManager.storeCID(entry);
      const retrievedEntry = await ledgerManager.retrieveCID('dataset-1');
      
      expect(retrievedEntry?.cid).toBe(entry.cid);
      expect(retrievedEntry?.version).toBe(1);
    });

    test('should verify CID existence', async () => {
      const ledgerManager = new StellarLedgerManager();
      const entry = {
        id: 'entry-2',
        cid: 'QmTest456',
        hash: 'hash456',
        timestamp: new Date(),
        datasetId: 'dataset-2',
        version: 1,
        encryptionKeyId: 'key-2'
      };
      
      await ledgerManager.storeCID(entry);
      
      expect(await ledgerManager.verifyCIDExists('QmTest456')).toBe(true);
      expect(await ledgerManager.verifyCIDExists('QmNonexistent')).toBe(false);
    });
  });

  describe('End-to-End Storage Flow', () => {
    test('should complete full encryption and storage flow', async () => {
      // Mock IPFS upload/download for testing
      const mockCid = 'QmMock123456';
      const mockUpload = jest.spyOn(storageAdapter as any, 'uploadToIPFS')
        .mockResolvedValue(mockCid);
      const mockDownload = jest.spyOn(storageAdapter as any, 'downloadFromIPFS')
        .mockResolvedValue(Buffer.from('mock encrypted data'));
      
      const testData = Buffer.from('End-to-end test data');
      const datasetId = 'test-dataset-e2e';
      
      // Upload encrypted data
      const uploadResult = await storageAdapter.uploadEncrypted(testData, {
        datasetId,
        storeOnLedger: true
      });
      
      expect(uploadResult.cid).toBe(mockCid);
      expect(uploadResult.integrityVerified).toBe(true);
      
      // Download and decrypt data
      const downloadResult = await storageAdapter.downloadEncrypted(
        mockCid,
        uploadResult.encryptionKeyId
      );
      
      expect(downloadResult.integrity.verified).toBe(true);
      
      mockUpload.mockRestore();
      mockDownload.mockRestore();
    });
  });
});
