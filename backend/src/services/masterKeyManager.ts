import { randomBytes, createHash, scrypt, timingSafeEqual } from 'crypto';
import { HSMService, WrappedKey, KeyMetadata } from './hsmService';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

export interface MasterKeyRecord {
  keyId: string;
  version: number;
  algorithm: string;
  createdAt: Date;
  lastUsed?: Date;
  status: 'active' | 'deprecated' | 'revoked';
  usageCount: number;
  maxUsage: number;
  wrappedDataKey?: WrappedKey;
}

export interface DataKeyRequest {
  purpose: string;
  userId?: string;
  context?: Record<string, any>;
  ttl?: number; // Time to live in seconds
}

export interface DataKeyResponse {
  plaintextKey: string;
  wrappedKey: WrappedKey;
  keyId: string;
  expiresAt?: Date;
}

export class MasterKeyManager extends EventEmitter {
  private hsmService: HSMService;
  private masterKeys: Map<string, MasterKeyRecord> = new Map();
  private activeMasterKeyId: string | null = null;
  private dataKeyCache: Map<string, { key: string; expires: Date }> = new Map();
  private maxCacheSize: number = 1000;
  private dataKeyTtl: number = 3600; // 1 hour default

  constructor(hsmService: HSMService) {
    super();
    this.hsmService = hsmService;
    this.startCacheCleanup();
  }

  async initializeMasterKey(): Promise<string> {
    try {
      // Generate a new master key that never leaves the HSM
      const masterKeyBytes = randomBytes(32); // 256-bit key
      
      // Wrap the master key in HSM
      const wrappedMasterKey = await this.hsmService.wrapKey(
        masterKeyBytes,
        undefined,
        'aes-256-gcm'
      );

      const masterKeyRecord: MasterKeyRecord = {
        keyId: wrappedMasterKey.keyId,
        version: wrappedMasterKey.version,
        algorithm: wrappedMasterKey.algorithm,
        createdAt: new Date(),
        status: 'active',
        usageCount: 0,
        maxUsage: 1000000, // Limit usage to prevent key exhaustion
        wrappedDataKey: wrappedMasterKey
      };

      this.masterKeys.set(wrappedMasterKey.keyId, masterKeyRecord);
      this.activeMasterKeyId = wrappedMasterKey.keyId;

      logger.info('Master key initialized', { keyId: wrappedMasterKey.keyId });
      this.emit('masterKeyInitialized', { keyId: wrappedMasterKey.keyId });

      return wrappedMasterKey.keyId;
    } catch (error) {
      logger.error('Failed to initialize master key:', error);
      throw new Error('Master key initialization failed');
    }
  }

  async generateDataKey(request: DataKeyRequest): Promise<DataKeyResponse> {
    if (!this.activeMasterKeyId) {
      throw new Error('No active master key available');
    }

    const masterKey = this.masterKeys.get(this.activeMasterKeyId);
    if (!masterKey || masterKey.status !== 'active') {
      throw new Error('Active master key is not available');
    }

    // Check usage limits
    if (masterKey.usageCount >= masterKey.maxUsage) {
      await this.rotateMasterKey();
      return this.generateDataKey(request);
    }

    try {
      // Generate data key
      const dataKeyBytes = randomBytes(32);
      const plaintextKey = dataKeyBytes.toString('base64');

      // Create cache key
      const cacheKey = this.createCacheKey(request);
      
      // Wrap data key with master key (via HSM)
      const wrappedDataKey = await this.hsmService.wrapKey(
        dataKeyBytes,
        this.activeMasterKeyId,
        'aes-256-gcm'
      );

      // Update usage count
      masterKey.usageCount++;
      masterKey.lastUsed = new Date();
      this.masterKeys.set(this.activeMasterKeyId, masterKey);

      // Cache the plaintext key temporarily for performance
      const expiresAt = new Date(Date.now() + (request.ttl || this.dataKeyTtl) * 1000);
      this.dataKeyCache.set(cacheKey, { key: plaintextKey, expires: expiresAt });

      const response: DataKeyResponse = {
        plaintextKey,
        wrappedKey: wrappedDataKey,
        keyId: this.activeMasterKeyId,
        expiresAt: request.ttl ? expiresAt : undefined
      };

      logger.debug('Data key generated', {
        keyId: this.activeMasterKeyId,
        purpose: request.purpose,
        userId: request.userId
      });

      this.emit('dataKeyGenerated', {
        masterKeyId: this.activeMasterKeyId,
        purpose: request.purpose,
        userId: request.userId
      });

      return response;
    } catch (error) {
      logger.error('Failed to generate data key:', error);
      throw new Error('Data key generation failed');
    }
  }

  async decryptDataKey(wrappedKey: WrappedKey, request: DataKeyRequest): Promise<string> {
    // Check cache first
    const cacheKey = this.createCacheKey(request);
    const cached = this.dataKeyCache.get(cacheKey);
    if (cached && cached.expires > new Date()) {
      return cached.key;
    }

    try {
      // Unwrap data key using HSM
      const dataKeyBytes = await this.hsmService.unwrapKey(wrappedKey);
      const plaintextKey = dataKeyBytes.toString('base64');

      // Cache for future use
      const expiresAt = new Date(Date.now() + (request.ttl || this.dataKeyTtl) * 1000);
      this.dataKeyCache.set(cacheKey, { key: plaintextKey, expires: expiresAt });

      logger.debug('Data key decrypted', { keyId: wrappedKey.keyId });
      return plaintextKey;
    } catch (error) {
      logger.error('Failed to decrypt data key:', error);
      throw new Error('Data key decryption failed');
    }
  }

  async rotateMasterKey(): Promise<string> {
    if (!this.activeMasterKeyId) {
      return this.initializeMasterKey();
    }

    const currentMasterKey = this.masterKeys.get(this.activeMasterKeyId);
    if (!currentMasterKey) {
      throw new Error('Current master key not found');
    }

    try {
      // Mark current key as deprecated
      currentMasterKey.status = 'deprecated';
      this.masterKeys.set(this.activeMasterKeyId, currentMasterKey);

      // Create new master key
      const newKeyId = await this.initializeMasterKey();

      // Clear data key cache to force re-encryption with new master key
      this.dataKeyCache.clear();

      logger.info('Master key rotated', {
        oldKeyId: this.activeMasterKeyId,
        newKeyId
      });

      this.emit('masterKeyRotated', {
        oldKeyId: this.activeMasterKeyId,
        newKeyId
      });

      return newKeyId;
    } catch (error) {
      // Restore status on failure
      currentMasterKey.status = 'active';
      this.masterKeys.set(this.activeMasterKeyId, currentMasterKey);
      throw error;
    }
  }

  async revokeMasterKey(keyId: string, reason: string = 'Manual revocation'): Promise<void> {
    const masterKey = this.masterKeys.get(keyId);
    if (!masterKey) {
      throw new Error(`Master key ${keyId} not found`);
    }

    try {
      // Revoke in HSM
      await this.hsmService.revokeKey(keyId, reason);

      // Update local status
      masterKey.status = 'revoked';
      this.masterKeys.set(keyId, masterKey);

      // Clear cache if this was the active key
      if (this.activeMasterKeyId === keyId) {
        this.activeMasterKeyId = null;
        this.dataKeyCache.clear();
      }

      logger.warn('Master key revoked', { keyId, reason });
      this.emit('masterKeyRevoked', { keyId, reason });
    } catch (error) {
      logger.error(`Failed to revoke master key ${keyId}:`, error);
      throw error;
    }
  }

  private createCacheKey(request: DataKeyRequest): string {
    const keyData = {
      purpose: request.purpose,
      userId: request.userId || 'anonymous',
      context: request.context || {}
    };
    return createHash('sha256')
      .update(JSON.stringify(keyData))
      .digest('hex');
  }

  private startCacheCleanup(): void {
    setInterval(() => {
      const now = new Date();
      let cleanedCount = 0;

      for (const [key, value] of this.dataKeyCache.entries()) {
        if (value.expires <= now) {
          this.dataKeyCache.delete(key);
          cleanedCount++;
        }
      }

      // Enforce cache size limit
      if (this.dataKeyCache.size > this.maxCacheSize) {
        const entries = Array.from(this.dataKeyCache.entries())
          .sort((a, b) => a[1].expires.getTime() - b[1].expires.getTime());
        
        const toDelete = entries.slice(0, this.dataKeyCache.size - this.maxCacheSize);
        toDelete.forEach(([key]) => this.dataKeyCache.delete(key));
        cleanedCount += toDelete.length;
      }

      if (cleanedCount > 0) {
        logger.debug('Cache cleanup completed', { cleanedCount, cacheSize: this.dataKeyCache.size });
      }
    }, 5 * 60 * 1000); // Run every 5 minutes
  }

  getMasterKeyStatus(): {
    activeKeyId: string | null;
    totalKeys: number;
    activeKeys: number;
    deprecatedKeys: number;
    revokedKeys: number;
    cacheSize: number;
  } {
    const keys = Array.from(this.masterKeys.values());
    
    return {
      activeKeyId: this.activeMasterKeyId,
      totalKeys: keys.length,
      activeKeys: keys.filter(k => k.status === 'active').length,
      deprecatedKeys: keys.filter(k => k.status === 'deprecated').length,
      revokedKeys: keys.filter(k => k.status === 'revoked').length,
      cacheSize: this.dataKeyCache.size
    };
  }

  getMasterKeyDetails(keyId: string): MasterKeyRecord | null {
    return this.masterKeys.get(keyId) || null;
  }

  getAllMasterKeys(): MasterKeyRecord[] {
    return Array.from(this.masterKeys.values());
  }

  clearCache(): void {
    this.dataKeyCache.clear();
    logger.info('Data key cache cleared');
  }

  setCacheSettings(maxSize: number, ttl: number): void {
    this.maxCacheSize = maxSize;
    this.dataKeyTtl = ttl;
    logger.info('Cache settings updated', { maxSize, ttl });
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    activeMasterKey: boolean;
    hsmConnection: boolean;
    cacheSize: number;
    issues: string[];
  }> {
    const issues: string[] = [];
    
    if (!this.activeMasterKeyId) {
      issues.push('No active master key');
    }

    const hsmStatus = this.hsmService.getSystemStatus();
    if (!hsmStatus.connectionHealth) {
      issues.push('HSM connection unhealthy');
    }

    if (this.hsmService.isKillSwitchActive()) {
      issues.push('HSM kill switch is active');
    }

    return {
      healthy: issues.length === 0,
      activeMasterKey: !!this.activeMasterKeyId,
      hsmConnection: hsmStatus.connectionHealth,
      cacheSize: this.dataKeyCache.size,
      issues
    };
  }
}

export default MasterKeyManager;
