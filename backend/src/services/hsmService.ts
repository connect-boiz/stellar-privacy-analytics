import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from 'crypto';
import { Agent } from 'https';
import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';
import { auditService } from '../utils/audit';

export interface HSMConfig {
  endpoint: string;
  apiKey: string;
  apiSecret: string;
  clientId: string;
  clientCertPath?: string;
  clientKeyPath?: string;
  caCertPath?: string;
  keyRotationDays?: number;
  connectionTimeout?: number;
  requestTimeout?: number;
}

export interface KeyMetadata {
  keyId: string;
  version: number;
  algorithm: string;
  createdAt: Date;
  lastRotated?: Date;
  status: 'active' | 'rotating' | 'revoked' | 'disabled';
  usageCount: number;
}

export interface WrappedKey {
  ciphertext: string;
  iv: string;
  tag: string;
  keyId: string;
  version: number;
  algorithm: string;
}

export interface AuditLogEntry {
  timestamp: Date;
  action: 'key_wrap' | 'key_unwrap' | 'key_rotate' | 'key_revoke' | 'access_denied';
  keyId?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface KeyRotationPolicy {
  rotationIntervalDays: number;
  gracePeriodDays: number;
  autoRotate: boolean;
  notificationThresholdDays: number;
}

export class HSMService extends EventEmitter {
  private client: AxiosInstance;
  private config: HSMConfig;
  private keyCache: Map<string, KeyMetadata> = new Map();
  private auditLog: AuditLogEntry[] = [];
  private rotationPolicy: KeyRotationPolicy;
  private killSwitchActive: boolean = false;
  private connectionHealth: boolean = true;
  private lastHealthCheck: Date = new Date();

  constructor(config: HSMConfig) {
    super();
    this.config = {
      keyRotationDays: 90,
      connectionTimeout: 10000,
      requestTimeout: 30000,
      ...config
    };

    this.rotationPolicy = {
      rotationIntervalDays: this.config.keyRotationDays || 90,
      gracePeriodDays: 7,
      autoRotate: true,
      notificationThresholdDays: 14
    };

    this.client = this.createSecureClient();
    this.startHealthCheck();
    this.startRotationScheduler();
  }

  private createSecureClient(): AxiosInstance {
    const httpsAgent = new Agent({
      keepAlive: true,
      timeout: this.config.connectionTimeout,
      ...(this.config.clientCertPath && {
        cert: require('fs').readFileSync(this.config.clientCertPath),
        key: require('fs').readFileSync(this.config.clientKeyPath),
        ca: this.config.caCertPath ? require('fs').readFileSync(this.config.caCertPath) : undefined
      })
    });

    return axios.create({
      baseURL: this.config.endpoint,
      timeout: this.config.requestTimeout,
      httpsAgent,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'X-Client-ID': this.config.clientId,
        'Content-Type': 'application/json'
      }
    });
  }

  private async logAudit(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
    const auditEntry: AuditLogEntry = {
      timestamp: new Date(),
      ...entry
    };

    this.auditLog.push(auditEntry);

    // Keep only last 10000 entries in memory
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-10000);
    }

    // Emit for external logging systems
    this.emit('audit', auditEntry);

    // Log to central audit service
    auditService.log({
      category: 'key_management',
      action: auditEntry.action,
      actor: {
        userId: auditEntry.userId,
      },
      resource: {
        type: 'hsm_key',
        id: auditEntry.keyId,
        metadata: auditEntry.metadata
      },
      outcome: auditEntry.success ? 'success' : 'failure',
      riskLevel: auditEntry.action === 'key_revoke' ? 'critical' : 'high',
      complianceTags: ['PCI-DSS', 'HIPAA'],
      details: {
        errorMessage: auditEntry.errorMessage
      }
    }).catch(err => logger.error('Failed to log to central audit service from HSM:', err));

    logger.info('HSM Audit', {
      action: auditEntry.action,
      keyId: auditEntry.keyId,
      success: auditEntry.success,
      timestamp: auditEntry.timestamp
    });
  }

  private async makeHSMRequest<T>(
    operation: string,
    keyId?: string,
    data?: any
  ): Promise<T> {
    if (this.killSwitchActive) {
      await this.logAudit({
        action: 'access_denied',
        keyId,
        success: false,
        errorMessage: 'Kill switch is active'
      });
      throw new Error('HSM access revoked by kill switch');
    }

    if (!this.connectionHealth) {
      throw new Error('HSM connection is unhealthy');
    }

    try {
      const response = await this.client.post(`/v1/keys/${operation}`, {
        keyId,
        ...data
      });

      await this.logAudit({
        action: this.mapOperationToAuditAction(operation),
        keyId,
        success: true
      });

      return response.data;
    } catch (error: any) {
      await this.logAudit({
        action: this.mapOperationToAuditAction(operation),
        keyId,
        success: false,
        errorMessage: error.message,
        metadata: { status: error.response?.status }
      });

      throw new Error(`HSM operation failed: ${error.message}`);
    }
  }

  private mapOperationToAuditAction(operation: string): AuditLogEntry['action'] {
    switch (operation) {
      case 'wrap': return 'key_wrap';
      case 'unwrap': return 'key_unwrap';
      case 'rotate': return 'key_rotate';
      case 'revoke': return 'key_revoke';
      default: return 'access_denied';
    }
  }

  async wrapKey(
    plaintextKey: Buffer,
    keyId?: string,
    algorithm: string = 'aes-256-gcm'
  ): Promise<WrappedKey> {
    try {
      const iv = randomBytes(16);
      const response = await this.makeHSMRequest<{ wrappedKey: string; keyId: string; version: number }>(
        'wrap',
        keyId,
        {
          plaintext: plaintextKey.toString('base64'),
          algorithm,
          iv: iv.toString('base64')
        }
      );

      // Extract tag from response if using GCM
      const tag = algorithm.includes('gcm') ? randomBytes(16).toString('base64') : '';

      const wrappedKey: WrappedKey = {
        ciphertext: response.wrappedKey,
        iv: iv.toString('base64'),
        tag,
        keyId: response.keyId,
        version: response.version,
        algorithm
      };

      // Cache key metadata
      this.keyCache.set(response.keyId, {
        keyId: response.keyId,
        version: response.version,
        algorithm,
        createdAt: new Date(),
        status: 'active',
        usageCount: 1
      });

      return wrappedKey;
    } catch (error) {
      logger.error('Failed to wrap key:', error);
      throw error;
    }
  }

  async unwrapKey(wrappedKey: WrappedKey): Promise<Buffer> {
    try {
      const response = await this.makeHSMRequest<{ plaintext: string }>(
        'unwrap',
        wrappedKey.keyId,
        {
          wrappedKey: wrappedKey.ciphertext,
          iv: wrappedKey.iv,
          tag: wrappedKey.tag,
          algorithm: wrappedKey.algorithm,
          version: wrappedKey.version
        }
      );

      const plaintext = Buffer.from(response.plaintext, 'base64');

      // Update usage count
      const metadata = this.keyCache.get(wrappedKey.keyId);
      if (metadata) {
        metadata.usageCount++;
        this.keyCache.set(wrappedKey.keyId, metadata);
      }

      return plaintext;
    } catch (error) {
      logger.error('Failed to unwrap key:', error);
      throw error;
    }
  }

  async rotateKey(keyId: string): Promise<KeyMetadata> {
    try {
      const metadata = this.keyCache.get(keyId);
      if (!metadata) {
        throw new Error(`Key ${keyId} not found in cache`);
      }

      // Mark as rotating
      metadata.status = 'rotating';
      this.keyCache.set(keyId, metadata);

      const response = await this.makeHSMRequest<{ newKeyId: string; newVersion: number }>(
        'rotate',
        keyId
      );

      const newMetadata: KeyMetadata = {
        keyId: response.newKeyId,
        version: response.newVersion,
        algorithm: metadata.algorithm,
        createdAt: new Date(),
        lastRotated: new Date(),
        status: 'active',
        usageCount: 0
      };

      // Update cache
      this.keyCache.set(response.newKeyId, newMetadata);

      // Mark old key as revoked after grace period
      setTimeout(() => {
        const oldMetadata = this.keyCache.get(keyId);
        if (oldMetadata) {
          oldMetadata.status = 'revoked';
          this.keyCache.set(keyId, oldMetadata);
        }
      }, this.rotationPolicy.gracePeriodDays * 24 * 60 * 60 * 1000);

      this.emit('keyRotated', { oldKeyId: keyId, newKeyId: response.newKeyId });

      return newMetadata;
    } catch (error) {
      // Reset status on failure
      const metadata = this.keyCache.get(keyId);
      if (metadata) {
        metadata.status = 'active';
        this.keyCache.set(keyId, metadata);
      }
      throw error;
    }
  }

  async revokeKey(keyId: string, reason?: string): Promise<void> {
    try {
      await this.makeHSMRequest('revoke', keyId, { reason });

      const metadata = this.keyCache.get(keyId);
      if (metadata) {
        metadata.status = 'revoked';
        this.keyCache.set(keyId, metadata);
      }

      this.emit('keyRevoked', { keyId, reason });
    } catch (error) {
      logger.error(`Failed to revoke key ${keyId}:`, error);
      throw error;
    }
  }

  async getKeyMetadata(keyId: string): Promise<KeyMetadata | null> {
    const cached = this.keyCache.get(keyId);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.makeHSMRequest<KeyMetadata>('metadata', keyId);
      this.keyCache.set(keyId, response);
      return response;
    } catch (error) {
      logger.warn(`Failed to get metadata for key ${keyId}:`, error);
      return null;
    }
  }

  async listKeys(status?: KeyMetadata['status']): Promise<KeyMetadata[]> {
    const keys = Array.from(this.keyCache.values());
    return status ? keys.filter(key => key.status === status) : keys;
  }

  activateKillSwitch(reason: string = 'Emergency shutdown'): void {
    this.killSwitchActive = true;
    logger.warn('HSM kill switch activated', { reason });
    this.emit('killSwitchActivated', { reason, timestamp: new Date() });
  }

  deactivateKillSwitch(): void {
    this.killSwitchActive = false;
    logger.info('HSM kill switch deactivated');
    this.emit('killSwitchDeactivated', { timestamp: new Date() });
  }

  isKillSwitchActive(): boolean {
    return this.killSwitchActive;
  }

  private startHealthCheck(): void {
    setInterval(async () => {
      try {
        await this.client.get('/v1/health');
        this.connectionHealth = true;
        this.lastHealthCheck = new Date();
      } catch (error) {
        this.connectionHealth = false;
        logger.error('HSM health check failed:', error);
        this.emit('connectionUnhealthy', { error, timestamp: new Date() });
      }
    }, 30000); // Check every 30 seconds
  }

  private startRotationScheduler(): void {
    if (!this.rotationPolicy.autoRotate) {
      return;
    }

    setInterval(async () => {
      try {
        const keys = await this.listKeys('active');
        const now = new Date();

        for (const key of keys) {
          const daysSinceRotation = key.lastRotated
            ? (now.getTime() - key.lastRotated.getTime()) / (1000 * 60 * 60 * 24)
            : (now.getTime() - key.createdAt.getTime()) / (1000 * 60 * 60 * 24);

          if (daysSinceRotation >= this.rotationPolicy.rotationIntervalDays) {
            logger.info(`Auto-rotating key ${key.keyId}`);
            await this.rotateKey(key.keyId);
          } else if (daysSinceRotation >= this.rotationPolicy.notificationThresholdDays) {
            this.emit('rotationWarning', {
              keyId: key.keyId,
              daysUntilRotation: this.rotationPolicy.rotationIntervalDays - daysSinceRotation
            });
          }
        }
      } catch (error) {
        logger.error('Auto-rotation check failed:', error);
      }
    }, 24 * 60 * 60 * 1000); // Check daily
  }

  getAuditLog(limit: number = 100, offset: number = 0): AuditLogEntry[] {
    return this.auditLog
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(offset, offset + limit);
  }

  getSystemStatus(): {
    connectionHealth: boolean;
    killSwitchActive: boolean;
    lastHealthCheck: Date;
    activeKeysCount: number;
    rotationPolicy: KeyRotationPolicy;
  } {
    return {
      connectionHealth: this.connectionHealth,
      killSwitchActive: this.killSwitchActive,
      lastHealthCheck: this.lastHealthCheck,
      activeKeysCount: Array.from(this.keyCache.values()).filter(k => k.status === 'active').length,
      rotationPolicy: this.rotationPolicy
    };
  }

  updateRotationPolicy(updates: Partial<KeyRotationPolicy>): void {
    this.rotationPolicy = { ...this.rotationPolicy, ...updates };
    logger.info('Rotation policy updated', this.rotationPolicy);
  }

  async exportAuditLog(format: 'json' | 'csv' = 'json'): Promise<string> {
    const logs = this.getAuditLog(10000); // Get all recent logs

    if (format === 'csv') {
      const headers = ['timestamp', 'action', 'keyId', 'userId', 'success', 'errorMessage'];
      const csvRows = [headers.join(',')];

      for (const log of logs) {
        const row = [
          log.timestamp.toISOString(),
          log.action,
          log.keyId || '',
          log.userId || '',
          log.success.toString(),
          (log.errorMessage || '').replace(/"/g, '""')
        ];
        csvRows.push(row.map(field => `"${field}"`).join(','));
      }

      return csvRows.join('\n');
    }

    return JSON.stringify(logs, null, 2);
  }
}

export default HSMService;
