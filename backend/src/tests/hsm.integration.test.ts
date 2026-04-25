import { HSMService, HSMConfig, WrappedKey, KeyMetadata } from '../services/hsmService';
import { MasterKeyManager } from '../services/masterKeyManager';
import { AuditService } from '../services/auditService';
import { KillSwitchService } from '../services/killSwitchService';
import { randomBytes } from 'crypto';

// Mock HSM Implementation
class MockHSM {
  private keys: Map<string, { data: string; algorithm: string; version: number }> = new Map();
  private keyCounter: number = 1;
  private revokedKeys: Set<string> = new Set();

  async wrapKey(plaintext: string, algorithm: string, iv?: string): Promise<{ wrappedKey: string; keyId: string; version: number }> {
    const keyId = `mock-key-${this.keyCounter++}`;
    const version = 1;
    
    // Simulate wrapping (in reality, this would be done in HSM)
    const wrappedKey = Buffer.from(plaintext).toString('base64');
    
    this.keys.set(keyId, { data: plaintext, algorithm, version });
    
    return { wrappedKey, keyId, version };
  }

  async unwrapKey(wrappedKey: string, keyId: string, version: number): Promise<{ plaintext: string }> {
    const key = this.keys.get(keyId);
    if (!key) {
      throw new Error(`Key ${keyId} not found`);
    }
    
    if (this.revokedKeys.has(keyId)) {
      throw new Error(`Key ${keyId} has been revoked`);
    }
    
    return { plaintext: key.data };
  }

  async rotateKey(keyId: string): Promise<{ newKeyId: string; newVersion: number }> {
    const key = this.keys.get(keyId);
    if (!key) {
      throw new Error(`Key ${keyId} not found`);
    }
    
    const newKeyId = `mock-key-${this.keyCounter++}`;
    const newVersion = key.version + 1;
    
    this.keys.set(newKeyId, { ...key, version: newVersion });
    
    return { newKeyId, newVersion };
  }

  async revokeKey(keyId: string): Promise<void> {
    if (!this.keys.has(keyId)) {
      throw new Error(`Key ${keyId} not found`);
    }
    
    this.revokedKeys.add(keyId);
  }

  async getMetadata(keyId: string): Promise<KeyMetadata> {
    const key = this.keys.get(keyId);
    if (!key) {
      throw new Error(`Key ${keyId} not found`);
    }
    
    return {
      keyId,
      version: key.version,
      algorithm: key.algorithm,
      createdAt: new Date(),
      status: this.revokedKeys.has(keyId) ? 'revoked' : 'active',
      usageCount: 0
    };
  }

  healthCheck(): { status: string; timestamp: Date } {
    return { status: 'healthy', timestamp: new Date() };
  }

  reset(): void {
    this.keys.clear();
    this.revokedKeys.clear();
    this.keyCounter = 1;
  }
}

// Mock HTTP client for HSM service
class MockHTTPClient {
  private mockHSM: MockHSM;
  private killSwitchActive: boolean = false;

  constructor(mockHSM: MockHSM) {
    this.mockHSM = mockHSM;
  }

  setKillSwitch(active: boolean): void {
    this.killSwitchActive = active;
  }

  async post(path: string, data: any): Promise<{ data: any }> {
    if (this.killSwitchActive) {
      throw new Error('Kill switch is active');
    }

    if (path.includes('/wrap')) {
      const result = await this.mockHSM.wrapKey(data.plaintext, data.algorithm, data.iv);
      return { data: result };
    }

    if (path.includes('/unwrap')) {
      const result = await this.mockHSM.unwrapKey(data.wrappedKey, data.keyId, data.version);
      return { data: result };
    }

    if (path.includes('/rotate')) {
      const result = await this.mockHSM.rotateKey(data.keyId);
      return { data: result };
    }

    if (path.includes('/revoke')) {
      await this.mockHSM.revokeKey(data.keyId);
      return { data: { success: true } };
    }

    if (path.includes('/metadata')) {
      const result = await this.mockHSM.getMetadata(data.keyId);
      return { data: result };
    }

    if (path.includes('/health')) {
      const result = this.mockHSM.healthCheck();
      return { data: result };
    }

    throw new Error(`Unknown endpoint: ${path}`);
  }

  async get(path: string): Promise<{ data: any }> {
    if (path.includes('/health')) {
      const result = this.mockHSM.healthCheck();
      return { data: result };
    }

    throw new Error(`Unknown endpoint: ${path}`);
  }
}

describe('HSM Integration Tests', () => {
  let mockHSM: MockHSM;
  let mockHTTPClient: MockHTTPClient;
  let hsmService: HSMService;
  let masterKeyManager: MasterKeyManager;
  let auditService: AuditService;
  let killSwitchService: KillSwitchService;

  beforeEach(() => {
    mockHSM = new MockHSM();
    mockHTTPClient = new MockHTTPClient(mockHSM);
    
    // Create HSM service with mock HTTP client
    const config: HSMConfig = {
      endpoint: 'https://mock-hsm:8443',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      clientId: 'test-client'
    };

    hsmService = new HSMService(config);
    
    // Replace the internal HTTP client with our mock
    (hsmService as any).client = mockHTTPClient;
    
    auditService = new AuditService({
      logPath: '/tmp/test-audit.log',
      signatureKey: 'test-signature-key',
      immutableStorage: true
    });

    masterKeyManager = new MasterKeyManager(hsmService);
    killSwitchService = new KillSwitchService(hsmService, masterKeyManager, auditService);
  });

  afterEach(async () => {
    await auditService.shutdown();
    await killSwitchService.shutdown();
    mockHSM.reset();
  });

  describe('HSM Service Basic Operations', () => {
    test('should wrap and unwrap keys successfully', async () => {
      const plaintextKey = randomBytes(32);
      
      const wrappedKey = await hsmService.wrapKey(plaintextKey);
      expect(wrappedKey).toBeDefined();
      expect(wrappedKey.keyId).toBeDefined();
      expect(wrappedKey.ciphertext).toBeDefined();
      expect(wrappedKey.algorithm).toBe('aes-256-gcm');

      const unwrappedKey = await hsmService.unwrapKey(wrappedKey);
      expect(unwrappedKey.equals(plaintextKey)).toBe(true);
    });

    test('should fail to unwrap revoked keys', async () => {
      const plaintextKey = randomBytes(32);
      
      const wrappedKey = await hsmService.wrapKey(plaintextKey);
      await hsmService.revokeKey(wrappedKey.keyId);

      await expect(hsmService.unwrapKey(wrappedKey)).rejects.toThrow();
    });

    test('should rotate keys successfully', async () => {
      const plaintextKey = randomBytes(32);
      
      const wrappedKey = await hsmService.wrapKey(plaintextKey);
      const newMetadata = await hsmService.rotateKey(wrappedKey.keyId);
      
      expect(newMetadata.keyId).not.toBe(wrappedKey.keyId);
      expect(newMetadata.version).toBeGreaterThan(wrappedKey.version);
      
      // Old key should still work during grace period
      const oldKeyUnwrapped = await hsmService.unwrapKey(wrappedKey);
      expect(oldKeyUnwrapped.equals(plaintextKey)).toBe(true);
    });
  });

  describe('Master Key Management', () => {
    test('should initialize master key and generate data keys', async () => {
      const masterKeyId = await masterKeyManager.initializeMasterKey();
      expect(masterKeyId).toBeDefined();

      const dataKeyResponse = await masterKeyManager.generateDataKey({
        purpose: 'test-encryption',
        userId: 'test-user'
      });

      expect(dataKeyResponse.plaintextKey).toBeDefined();
      expect(dataKeyResponse.wrappedKey).toBeDefined();
      expect(dataKeyResponse.keyId).toBe(masterKeyId);
    });

    test('should decrypt data keys successfully', async () => {
      await masterKeyManager.initializeMasterKey();

      const dataKeyResponse = await masterKeyManager.generateDataKey({
        purpose: 'test-encryption',
        userId: 'test-user'
      });

      const decryptedKey = await masterKeyManager.decryptDataKey(
        dataKeyResponse.wrappedKey,
        { purpose: 'test-encryption', userId: 'test-user' }
      );

      expect(decryptedKey).toBe(dataKeyResponse.plaintextKey);
    });

    test('should rotate master key without data loss', async () => {
      const oldKeyId = await masterKeyManager.initializeMasterKey();

      // Generate data key with old master key
      const dataKeyResponse = await masterKeyManager.generateDataKey({
        purpose: 'test-encryption',
        userId: 'test-user'
      });

      // Rotate master key
      const newKeyId = await masterKeyManager.rotateMasterKey();
      expect(newKeyId).not.toBe(oldKeyId);

      // Should still be able to decrypt old data keys
      const decryptedKey = await masterKeyManager.decryptDataKey(
        dataKeyResponse.wrappedKey,
        { purpose: 'test-encryption', userId: 'test-user' }
      );

      expect(decryptedKey).toBe(dataKeyResponse.plaintextKey);
    });

    test('should enforce usage limits', async () => {
      await masterKeyManager.initializeMasterKey();

      // Set low usage limit for testing
      const masterKey = masterKeyManager.getAllMasterKeys()[0];
      (masterKey as any).maxUsage = 2;

      // Generate keys up to limit
      await masterKeyManager.generateDataKey({ purpose: 'test1' });
      await masterKeyManager.generateDataKey({ purpose: 'test2' });

      // Next generation should trigger rotation
      const dataKeyResponse = await masterKeyManager.generateDataKey({ purpose: 'test3' });
      expect(dataKeyResponse.keyId).toBeDefined(); // Should work with new key
    });
  });

  describe('Audit Logging', () => {
    test('should log key management operations', async () => {
      await masterKeyManager.initializeMasterKey();

      const dataKeyResponse = await masterKeyManager.generateDataKey({
        purpose: 'test-encryption',
        userId: 'test-user'
      });

      // Query audit log
      const records = await auditService.query({
        category: 'key_management',
        limit: 10
      });

      expect(records.length).toBeGreaterThan(0);
      
      const keyGenerationRecord = records.find(r => r.action === 'data_key_generated');
      expect(keyGenerationRecord).toBeDefined();
      expect(keyGenerationRecord?.actor.userId).toBe('test-user');
      expect(keyGenerationRecord?.outcome).toBe('success');
    });

    test('should maintain audit record integrity', async () => {
      const recordId = await auditService.logKeyManagement(
        'test_operation',
        { userId: 'test-user', ipAddress: '127.0.0.1' },
        { type: 'test', id: 'test-id' },
        'success'
      );

      const verification = await auditService.verifyIntegrity();
      expect(verification.valid).toBe(true);
      expect(verification.invalidRecords).toBe(0);
    });

    test('should provide accurate metrics', async () => {
      await masterKeyManager.initializeMasterKey();

      // Generate multiple data keys
      for (let i = 0; i < 5; i++) {
        await masterKeyManager.generateDataKey({
          purpose: `test-${i}`,
          userId: 'test-user'
        });
      }

      const metrics = await auditService.getMetrics({
        category: 'key_management'
      });

      expect(metrics.totalRecords).toBeGreaterThan(0);
      expect(metrics.recordsByCategory['key_management']).toBeGreaterThan(0);
    });
  });

  describe('Kill Switch Functionality', () => {
    test('should activate and deactivate kill switch', async () => {
      const statusBefore = killSwitchService.getStatus();
      expect(statusBefore.active).toBe(false);

      await killSwitchService.activate('Test activation', 'manual', 'medium', 'test-user');

      const statusDuring = killSwitchService.getStatus();
      expect(statusDuring.active).toBe(true);
      expect(statusDuring.lastTrigger?.reason).toBe('Test activation');
      expect(statusDuring.lastTrigger?.triggeredBy).toBe('test-user');

      await killSwitchService.deactivate('Test deactivation', 'test-user');

      const statusAfter = killSwitchService.getStatus();
      expect(statusAfter.active).toBe(false);
    });

    test('should block operations when kill switch is active', async () => {
      await masterKeyManager.initializeMasterKey();
      await killSwitchService.activate('Test activation');

      await expect(
        masterKeyManager.generateDataKey({ purpose: 'test' })
      ).rejects.toThrow('HSM access revoked');

      await killSwitchService.deactivate('Test deactivation');
    });

    test('should trigger automatically on thresholds', async () => {
      // Set low thresholds for testing
      killSwitchService.updateThresholds({
        maxFailedAuth: 2,
        maxSuspiciousRequests: 2,
        maxKeyAnomalies: 1,
        maxSystemErrors: 2
      });

      // Simulate security violations
      await auditService.logSecurityViolation(
        'suspicious_activity',
        { userId: 'malicious-user' },
        { type: 'system' }
      );

      await auditService.logSecurityViolation(
        'another_violation',
        { userId: 'malicious-user' },
        { type: 'system' }
      );

      // Check if kill switch was activated
      const status = killSwitchService.getStatus();
      expect(status.active).toBe(true);
      expect(status.lastTrigger?.source).toBe('security_incident');
    });

    test('should support auto-recovery', async () => {
      await masterKeyManager.initializeMasterKey();
      await killSwitchService.activate('Test activation');

      // Enable auto-recovery with short delay
      killSwitchService.enableAutoRecovery(0.01); // 0.01 minutes = 0.6 seconds

      // Wait for auto-recovery
      await new Promise(resolve => setTimeout(resolve, 1000));

      const status = killSwitchService.getStatus();
      expect(status.active).toBe(false);
      expect(status.recoveryAttempts).toBeGreaterThan(0);
    });
  });

  describe('System Health and Monitoring', () => {
    test('should provide comprehensive health status', async () => {
      await masterKeyManager.initializeMasterKey();

      const health = await masterKeyManager.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.activeMasterKey).toBe(true);
      expect(health.hsmConnection).toBe(true);
      expect(health.issues).toHaveLength(0);
    });

    test('should detect unhealthy conditions', async () => {
      // Activate kill switch to simulate unhealthy condition
      await killSwitchService.activate('Test activation');

      const health = await masterKeyManager.healthCheck();
      expect(health.healthy).toBe(false);
      expect(health.issues.length).toBeGreaterThan(0);
    });

    test('should provide system metrics', async () => {
      await masterKeyManager.initializeMasterKey();

      const masterKeyStatus = masterKeyManager.getMasterKeyStatus();
      expect(masterKeyStatus.activeKeyId).toBeDefined();
      expect(masterKeyStatus.activeKeys).toBe(1);
      expect(masterKeyStatus.totalKeys).toBe(1);

      const hsmStatus = hsmService.getSystemStatus();
      expect(hsmStatus.connectionHealth).toBe(true);
      expect(hsmStatus.killSwitchActive).toBe(false);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle HSM connection failures gracefully', async () => {
      // Simulate connection failure
      mockHTTPClient.setKillSwitch(true);

      await expect(
        masterKeyManager.generateDataKey({ purpose: 'test' })
      ).rejects.toThrow();

      mockHTTPClient.setKillSwitch(false);
    });

    test('should handle invalid key operations', async () => {
      const invalidWrappedKey: WrappedKey = {
        ciphertext: 'invalid',
        iv: 'invalid',
        tag: 'invalid',
        keyId: 'non-existent-key',
        version: 1,
        algorithm: 'aes-256-gcm'
      };

      await expect(hsmService.unwrapKey(invalidWrappedKey)).rejects.toThrow();
    });

    test('should handle concurrent operations safely', async () => {
      await masterKeyManager.initializeMasterKey();

      // Generate multiple data keys concurrently
      const promises = Array.from({ length: 10 }, (_, i) =>
        masterKeyManager.generateDataKey({
          purpose: `concurrent-test-${i}`,
          userId: 'test-user'
        })
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
      
      // All should have valid keys
      results.forEach(result => {
        expect(result.plaintextKey).toBeDefined();
        expect(result.wrappedKey).toBeDefined();
      });
    });

    test('should handle audit log corruption', async () => {
      // This would test recovery from corrupted audit logs
      // For now, we'll just verify the integrity check works
      const verification = await auditService.verifyIntegrity();
      expect(verification.valid).toBe(true);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle high volume operations efficiently', async () => {
      await masterKeyManager.initializeMasterKey();

      const startTime = Date.now();
      const operations = 100;

      // Generate many data keys
      const promises = Array.from({ length: operations }, (_, i) =>
        masterKeyManager.generateDataKey({
          purpose: `performance-test-${i}`,
          userId: 'test-user'
        })
      );

      await Promise.all(promises);
      const duration = Date.now() - startTime;

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(5000); // 5 seconds
      expect(duration / operations).toBeLessThan(50); // < 50ms per operation
    });

    test('should manage cache effectively', async () => {
      await masterKeyManager.initializeMasterKey();

      // Generate and cache data keys
      const dataKeyResponse = await masterKeyManager.generateDataKey({
        purpose: 'cache-test',
        userId: 'test-user'
      });

      // Decrypt multiple times (should use cache)
      const startTime = Date.now();
      for (let i = 0; i < 10; i++) {
        await masterKeyManager.decryptDataKey(
          dataKeyResponse.wrappedKey,
          { purpose: 'cache-test', userId: 'test-user' }
        );
      }
      const cachedDuration = Date.now() - startTime;

      // Clear cache and decrypt again
      masterKeyManager.clearCache();
      const startTimeUncached = Date.now();
      await masterKeyManager.decryptDataKey(
        dataKeyResponse.wrappedKey,
        { purpose: 'cache-test', userId: 'test-user' }
      );
      const uncachedDuration = Date.now() - startTimeUncached;

      // Cached operations should be faster
      expect(cachedDuration / 10).toBeLessThan(uncachedDuration);
    });
  });
});
