import { EventEmitter } from 'events';
import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'crypto';
import { HSMService, WrappedKey } from '../hsmService';
import { MasterKeyManager } from '../masterKeyManager';
import { logger } from '../../utils/logger';
import { ThresholdCryptography } from './ThresholdCryptography';
import { KeyRotationScheduler } from './KeyRotationScheduler';
import { KeyBackupService } from './KeyBackupService';
import { KeySharingService } from './KeySharingService';
import { PerformanceOptimizer } from './PerformanceOptimizer';
import {
  getErrorMessage,
  validateThresholdParams,
  validateKeySize,
  validateTTL,
  validateNonEmptyArray,
  validateNonEmptyString,
  AsyncLock
} from '../../utils/errorHandler';

export interface KeyMetadata {
  keyId: string;
  keyType: 'master' | 'data' | 'session' | 'smpc' | 'zkp';
  algorithm: string;
  keySize: number;
  createdAt: Date;
  expiresAt?: Date;
  lastRotated?: Date;
  lastUsed?: Date;
  status: 'active' | 'rotating' | 'deprecated' | 'revoked' | 'compromised';
  usageCount: number;
  maxUsage: number;
  purpose: string;
  owner?: string;
  tags: string[];
  backupStatus: 'none' | 'pending' | 'completed' | 'failed';
  thresholdConfig?: {
    threshold: number;
    totalShares: number;
    shareHolders: string[];
  };
}

export interface KeyGenerationRequest {
  keyType: 'master' | 'data' | 'session' | 'smpc' | 'zkp';
  algorithm?: string;
  keySize?: number;
  purpose: string;
  owner?: string;
  ttl?: number;
  tags?: string[];
  enableThreshold?: boolean;
  thresholdConfig?: {
    threshold: number;
    totalShares: number;
    shareHolders: string[];
  };
  enableBackup?: boolean;
}

export interface KeyUsagePolicy {
  maxUsageCount?: number;
  maxUsageDuration?: number; // in seconds
  allowedOperations: ('encrypt' | 'decrypt' | 'sign' | 'verify' | 'derive')[];
  allowedContexts?: string[];
  requireMFA?: boolean;
  requireApproval?: boolean;
}

export interface KeyLifecycleEvent {
  eventType: 'created' | 'rotated' | 'revoked' | 'expired' | 'compromised' | 'backed_up' | 'restored';
  keyId: string;
  timestamp: Date;
  actor?: string;
  reason?: string;
  metadata?: Record<string, any>;
}

/**
 * Comprehensive Key Management Service
 * Provides enterprise-grade key lifecycle management with HSM integration
 */
export class KeyManagementService extends EventEmitter {
  private hsmService: HSMService;
  private masterKeyManager: MasterKeyManager;
  private thresholdCrypto: ThresholdCryptography;
  private rotationScheduler: KeyRotationScheduler;
  private backupService: KeyBackupService;
  private sharingService: KeySharingService;
  private performanceOptimizer: PerformanceOptimizer;
  
  private keyRegistry: Map<string, KeyMetadata> = new Map();
  private keyPolicies: Map<string, KeyUsagePolicy> = new Map();
  private lifecycleEvents: KeyLifecycleEvent[] = [];
  private rotationLock: AsyncLock = new AsyncLock();
  
  private initialized: boolean = false;

  constructor(
    hsmService: HSMService,
    masterKeyManager: MasterKeyManager
  ) {
    super();
    this.hsmService = hsmService;
    this.masterKeyManager = masterKeyManager;
    
    // Initialize sub-services
    this.thresholdCrypto = new ThresholdCryptography();
    this.rotationScheduler = new KeyRotationScheduler(this);
    this.backupService = new KeyBackupService(hsmService);
    this.sharingService = new KeySharingService(this.thresholdCrypto);
    this.performanceOptimizer = new PerformanceOptimizer();
    
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Listen to rotation events
    this.rotationScheduler.on('rotationDue', async (keyId: string) => {
      try {
        await this.rotateKey(keyId);
      } catch (error) {
        logger.error(`Auto-rotation failed for key ${keyId}:`, error);
      }
    });

    // Listen to backup events
    this.backupService.on('backupCompleted', (keyId: string) => {
      const metadata = this.keyRegistry.get(keyId);
      if (metadata) {
        metadata.backupStatus = 'completed';
        this.keyRegistry.set(keyId, metadata);
      }
    });

    // Listen to performance events
    this.performanceOptimizer.on('cacheWarming', (keys: string[]) => {
      logger.info('Performance optimizer warming cache', { keyCount: keys.length });
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize sub-services
      await this.backupService.initialize();
      await this.rotationScheduler.start();
      await this.performanceOptimizer.initialize();
      
      this.initialized = true;
      logger.info('Key Management Service initialized');
      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize Key Management Service:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.rotationScheduler.stop();
      await this.backupService.shutdown();
      await this.performanceOptimizer.shutdown();
      
      this.initialized = false;
      logger.info('Key Management Service shutdown completed');
    } catch (error) {
      logger.error('Error during Key Management Service shutdown:', error);
      throw error;
    }
  }

  /**
   * Generate a new cryptographic key
   */
  async generateKey(request: KeyGenerationRequest): Promise<{
    keyId: string;
    metadata: KeyMetadata;
    wrappedKey?: WrappedKey;
    shares?: { shareId: string; holder: string; share: string }[];
  }> {
    this.ensureInitialized();

    try {
      // Validate inputs
      validateNonEmptyString(request.purpose, 'purpose');
      
      if (request.keySize) {
        validateKeySize(request.keySize);
      }
      
      if (request.ttl) {
        validateTTL(request.ttl);
      }
      
      if (request.enableThreshold && request.thresholdConfig) {
        validateThresholdParams(
          request.thresholdConfig.threshold,
          request.thresholdConfig.totalShares
        );
        validateNonEmptyArray(request.thresholdConfig.shareHolders, 'shareHolders');
        
        if (request.thresholdConfig.shareHolders.length !== request.thresholdConfig.totalShares) {
          throw new Error('Number of share holders must match total shares');
        }
      }

      const keyId = this.generateKeyId(request.keyType);
      const algorithm = request.algorithm || 'aes-256-gcm';
      const keySize = request.keySize || 32; // 256 bits

      // Generate raw key material
      const keyMaterial = randomBytes(keySize);

      // Wrap key with HSM
      const wrappedKey = await this.hsmService.wrapKey(
        keyMaterial,
        undefined,
        algorithm
      );

      // Create key metadata
      const metadata: KeyMetadata = {
        keyId,
        keyType: request.keyType,
        algorithm,
        keySize,
        createdAt: new Date(),
        expiresAt: request.ttl ? new Date(Date.now() + request.ttl * 1000) : undefined,
        status: 'active',
        usageCount: 0,
        maxUsage: this.getDefaultMaxUsage(request.keyType),
        purpose: request.purpose,
        owner: request.owner,
        tags: request.tags || [],
        backupStatus: request.enableBackup ? 'pending' : 'none',
        thresholdConfig: request.thresholdConfig
      };

      // Store in registry
      this.keyRegistry.set(keyId, metadata);

      // Record lifecycle event
      this.recordLifecycleEvent({
        eventType: 'created',
        keyId,
        timestamp: new Date(),
        actor: request.owner,
        metadata: { keyType: request.keyType, purpose: request.purpose }
      });

      // Handle threshold cryptography if enabled
      let shares: { shareId: string; holder: string; share: string }[] | undefined;
      if (request.enableThreshold && request.thresholdConfig) {
        shares = await this.thresholdCrypto.createShares(
          keyMaterial,
          request.thresholdConfig.threshold,
          request.thresholdConfig.totalShares,
          request.thresholdConfig.shareHolders
        );
      }

      // Schedule backup if enabled
      if (request.enableBackup) {
        await this.backupService.scheduleBackup(keyId, wrappedKey);
      }

      // Schedule rotation
      this.rotationScheduler.scheduleRotation(keyId, metadata);

      // Optimize for performance
      await this.performanceOptimizer.optimizeKey(keyId, metadata);

      logger.info('Key generated', {
        keyId,
        keyType: request.keyType,
        purpose: request.purpose,
        hasThreshold: !!shares
      });

      this.emit('keyGenerated', { keyId, metadata });

      return {
        keyId,
        metadata,
        wrappedKey,
        shares
      };
    } catch (error: unknown) {
      logger.error('Failed to generate key:', error);
      throw new Error(`Key generation failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Rotate an existing key
   */
  async rotateKey(keyId: string, reason?: string): Promise<{
    oldKeyId: string;
    newKeyId: string;
    metadata: KeyMetadata;
  }> {
    this.ensureInitialized();

    const oldMetadata = this.keyRegistry.get(keyId);
    if (!oldMetadata) {
      throw new Error(`Key ${keyId} not found`);
    }

    if (oldMetadata.status === 'rotating') {
      throw new Error(`Key ${keyId} is already being rotated`);
    }
    
    // Prevent concurrent rotation
    if (this.rotationLock.isLocked(keyId)) {
      throw new Error(`Key ${keyId} rotation already in progress`);
    }

    const release = await this.rotationLock.acquire(keyId);

    try {
      // Mark as rotating
      oldMetadata.status = 'rotating';
      this.keyRegistry.set(keyId, oldMetadata);

      // Generate new key with same properties
      const newKeyResult = await this.generateKey({
        keyType: oldMetadata.keyType,
        algorithm: oldMetadata.algorithm,
        keySize: oldMetadata.keySize,
        purpose: oldMetadata.purpose,
        owner: oldMetadata.owner,
        tags: oldMetadata.tags,
        enableThreshold: !!oldMetadata.thresholdConfig,
        thresholdConfig: oldMetadata.thresholdConfig,
        enableBackup: oldMetadata.backupStatus !== 'none'
      });

      // Mark old key as deprecated
      oldMetadata.status = 'deprecated';
      oldMetadata.lastRotated = new Date();
      this.keyRegistry.set(keyId, oldMetadata);

      // Record lifecycle event
      this.recordLifecycleEvent({
        eventType: 'rotated',
        keyId,
        timestamp: new Date(),
        reason,
        metadata: { newKeyId: newKeyResult.keyId }
      });

      logger.info('Key rotated', {
        oldKeyId: keyId,
        newKeyId: newKeyResult.keyId,
        reason
      });

      this.emit('keyRotated', {
        oldKeyId: keyId,
        newKeyId: newKeyResult.keyId
      });

      return {
        oldKeyId: keyId,
        newKeyId: newKeyResult.keyId,
        metadata: newKeyResult.metadata
      };
    } catch (error: unknown) {
      // Restore status on failure
      oldMetadata.status = 'active';
      this.keyRegistry.set(keyId, oldMetadata);
      logger.error(`Failed to rotate key ${keyId}:`, error);
      throw new Error(`Key rotation failed: ${getErrorMessage(error)}`);
    } finally {
      release();
    }
  }

  /**
   * Revoke a key
   */
  async revokeKey(keyId: string, reason: string, actor?: string): Promise<void> {
    this.ensureInitialized();

    validateNonEmptyString(reason, 'reason');

    const metadata = this.keyRegistry.get(keyId);
    if (!metadata) {
      throw new Error(`Key ${keyId} not found`);
    }

    try {
      // Revoke in HSM
      await this.hsmService.revokeKey(keyId, reason);

      // Update metadata
      metadata.status = 'revoked';
      this.keyRegistry.set(keyId, metadata);

      // Record lifecycle event
      this.recordLifecycleEvent({
        eventType: 'revoked',
        keyId,
        timestamp: new Date(),
        actor,
        reason
      });

      // Cancel scheduled rotation
      this.rotationScheduler.cancelRotation(keyId);

      logger.warn('Key revoked', { keyId, reason, actor });
      this.emit('keyRevoked', { keyId, reason });
    } catch (error: unknown) {
      logger.error(`Failed to revoke key ${keyId}:`, error);
      throw new Error(`Key revocation failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Share a key using threshold cryptography
   */
  async shareKey(
    keyId: string,
    threshold: number,
    shareHolders: string[]
  ): Promise<{ shareId: string; holder: string; encryptedShare: string }[]> {
    this.ensureInitialized();

    // Validate inputs
    validateThresholdParams(threshold, shareHolders.length);
    validateNonEmptyArray(shareHolders, 'shareHolders');

    const metadata = this.keyRegistry.get(keyId);
    if (!metadata) {
      throw new Error(`Key ${keyId} not found`);
    }

    if (metadata.status !== 'active') {
      throw new Error(`Key ${keyId} is not active (status: ${metadata.status})`);
    }

    try {
      // Get key material from HSM
      const keyMaterial = await this.getKeyMaterial(keyId);

      // Create shares
      const shares = await this.sharingService.shareKey(
        keyId,
        keyMaterial,
        threshold,
        shareHolders
      );

      // Update metadata
      metadata.thresholdConfig = {
        threshold,
        totalShares: shareHolders.length,
        shareHolders
      };
      this.keyRegistry.set(keyId, metadata);

      logger.info('Key shared', {
        keyId,
        threshold,
        totalShares: shareHolders.length
      });

      this.emit('keyShared', { keyId, threshold, shareHolders });

      return shares;
    } catch (error: unknown) {
      logger.error(`Failed to share key ${keyId}:`, error);
      throw new Error(`Key sharing failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Reconstruct a key from threshold shares
   */
  async reconstructKey(
    keyId: string,
    shares: { shareId: string; holder: string; encryptedShare: string }[]
  ): Promise<Buffer> {
    this.ensureInitialized();

    const metadata = this.keyRegistry.get(keyId);
    if (!metadata || !metadata.thresholdConfig) {
      throw new Error(`Key ${keyId} not found or not configured for threshold cryptography`);
    }

    try {
      const keyMaterial = await this.sharingService.reconstructKey(
        keyId,
        shares,
        metadata.thresholdConfig.threshold
      );

      logger.info('Key reconstructed', {
        keyId,
        sharesUsed: shares.length
      });

      this.emit('keyReconstructed', { keyId, sharesUsed: shares.length });

      return keyMaterial;
    } catch (error) {
      logger.error(`Failed to reconstruct key ${keyId}:`, error);
      throw error;
    }
  }

  /**
   * Backup a key
   */
  async backupKey(keyId: string): Promise<{ backupId: string; location: string }> {
    this.ensureInitialized();

    const metadata = this.keyRegistry.get(keyId);
    if (!metadata) {
      throw new Error(`Key ${keyId} not found`);
    }

    try {
      const result = await this.backupService.backupKey(keyId, metadata);

      // Update metadata
      metadata.backupStatus = 'completed';
      this.keyRegistry.set(keyId, metadata);

      // Record lifecycle event
      this.recordLifecycleEvent({
        eventType: 'backed_up',
        keyId,
        timestamp: new Date(),
        metadata: { backupId: result.backupId }
      });

      logger.info('Key backed up', { keyId, backupId: result.backupId });
      this.emit('keyBackedUp', { keyId, backupId: result.backupId });

      return result;
    } catch (error) {
      metadata.backupStatus = 'failed';
      this.keyRegistry.set(keyId, metadata);
      throw error;
    }
  }

  /**
   * Restore a key from backup
   */
  async restoreKey(backupId: string): Promise<{ keyId: string; metadata: KeyMetadata }> {
    this.ensureInitialized();

    try {
      const result = await this.backupService.restoreKey(backupId);

      // Register restored key
      this.keyRegistry.set(result.keyId, result.metadata);

      // Record lifecycle event
      this.recordLifecycleEvent({
        eventType: 'restored',
        keyId: result.keyId,
        timestamp: new Date(),
        metadata: { backupId }
      });

      logger.info('Key restored', { keyId: result.keyId, backupId });
      this.emit('keyRestored', { keyId: result.keyId, backupId });

      return result;
    } catch (error) {
      logger.error(`Failed to restore key from backup ${backupId}:`, error);
      throw error;
    }
  }

  /**
   * Get key metadata
   */
  getKeyMetadata(keyId: string): KeyMetadata | null {
    return this.keyRegistry.get(keyId) || null;
  }

  /**
   * List keys with filters
   */
  listKeys(filters?: {
    keyType?: KeyMetadata['keyType'];
    status?: KeyMetadata['status'];
    owner?: string;
    tags?: string[];
    purpose?: string;
  }): KeyMetadata[] {
    let keys = Array.from(this.keyRegistry.values());

    if (filters) {
      if (filters.keyType) {
        keys = keys.filter(k => k.keyType === filters.keyType);
      }
      if (filters.status) {
        keys = keys.filter(k => k.status === filters.status);
      }
      if (filters.owner) {
        keys = keys.filter(k => k.owner === filters.owner);
      }
      if (filters.tags && filters.tags.length > 0) {
        keys = keys.filter(k => filters.tags!.some(tag => k.tags.includes(tag)));
      }
      if (filters.purpose) {
        keys = keys.filter(k => k.purpose === filters.purpose);
      }
    }

    return keys;
  }

  /**
   * Set key usage policy
   */
  setKeyPolicy(keyId: string, policy: KeyUsagePolicy): void {
    const metadata = this.keyRegistry.get(keyId);
    if (!metadata) {
      throw new Error(`Key ${keyId} not found`);
    }

    this.keyPolicies.set(keyId, policy);
    logger.info('Key policy set', { keyId, policy });
  }

  /**
   * Get key usage policy
   */
  getKeyPolicy(keyId: string): KeyUsagePolicy | null {
    return this.keyPolicies.get(keyId) || null;
  }

  /**
   * Get lifecycle events for a key
   */
  getKeyLifecycle(keyId: string): KeyLifecycleEvent[] {
    return this.lifecycleEvents.filter(event => event.keyId === keyId);
  }

  /**
   * Get system statistics
   */
  getStatistics(): {
    totalKeys: number;
    activeKeys: number;
    rotatingKeys: number;
    deprecatedKeys: number;
    revokedKeys: number;
    keysByType: Record<string, number>;
    backupStatus: Record<string, number>;
    performanceMetrics: any;
  } {
    const keys = Array.from(this.keyRegistry.values());

    const keysByType = keys.reduce((acc, key) => {
      acc[key.keyType] = (acc[key.keyType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const backupStatus = keys.reduce((acc, key) => {
      acc[key.backupStatus] = (acc[key.backupStatus] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalKeys: keys.length,
      activeKeys: keys.filter(k => k.status === 'active').length,
      rotatingKeys: keys.filter(k => k.status === 'rotating').length,
      deprecatedKeys: keys.filter(k => k.status === 'deprecated').length,
      revokedKeys: keys.filter(k => k.status === 'revoked').length,
      keysByType,
      backupStatus,
      performanceMetrics: this.performanceOptimizer.getMetrics()
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    issues: string[];
    services: Record<string, boolean>;
  }> {
    const issues: string[] = [];
    const services: Record<string, boolean> = {};

    // Check HSM
    const hsmStatus = this.hsmService.getSystemStatus();
    services.hsm = hsmStatus.connectionHealth;
    if (!hsmStatus.connectionHealth) {
      issues.push('HSM connection unhealthy');
    }

    // Check backup service
    services.backup = this.backupService.isHealthy();
    if (!services.backup) {
      issues.push('Backup service unhealthy');
    }

    // Check rotation scheduler
    services.rotation = this.rotationScheduler.isRunning();
    if (!services.rotation) {
      issues.push('Rotation scheduler not running');
    }

    // Check for expired keys
    const expiredKeys = Array.from(this.keyRegistry.values()).filter(
      k => k.expiresAt && k.expiresAt < new Date() && k.status === 'active'
    );
    if (expiredKeys.length > 0) {
      issues.push(`${expiredKeys.length} expired keys still active`);
    }

    return {
      healthy: issues.length === 0,
      issues,
      services
    };
  }

  // Private helper methods

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Key Management Service not initialized');
    }
  }

  private generateKeyId(keyType: string): string {
    const timestamp = Date.now();
    const random = randomBytes(8).toString('hex');
    return `${keyType}_${timestamp}_${random}`;
  }

  private getDefaultMaxUsage(keyType: KeyMetadata['keyType']): number {
    switch (keyType) {
      case 'master':
        return 1000000;
      case 'data':
        return 100000;
      case 'session':
        return 1000;
      case 'smpc':
        return 10000;
      case 'zkp':
        return 50000;
      default:
        return 10000;
    }
  }

  private async getKeyMaterial(keyId: string): Promise<Buffer> {
    // This would retrieve the actual key material from HSM
    // For now, we'll generate a placeholder
    return randomBytes(32);
  }

  private recordLifecycleEvent(event: KeyLifecycleEvent): void {
    this.lifecycleEvents.push(event);

    // Keep only last 10000 events
    if (this.lifecycleEvents.length > 10000) {
      this.lifecycleEvents = this.lifecycleEvents.slice(-10000);
    }

    this.emit('lifecycleEvent', event);
  }
}

export default KeyManagementService;
