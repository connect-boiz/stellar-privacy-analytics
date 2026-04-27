import { EventEmitter } from 'events';
import { randomBytes, createCipheriv, createDecipheriv, createHash, scryptSync } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { HSMService, WrappedKey } from '../hsmService';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../../utils/errorHandler';
import type { KeyMetadata } from './KeyManagementService';

export interface BackupConfig {
  backupPath: string;
  encryptionPassword: string;
  compressionEnabled: boolean;
  redundancyLevel: number; // Number of backup copies
  remoteBackupEnabled: boolean;
  remoteBackupEndpoint?: string;
  retentionDays: number;
}

export interface BackupRecord {
  backupId: string;
  keyId: string;
  timestamp: Date;
  location: string;
  encrypted: boolean;
  compressed: boolean;
  size: number;
  checksum: string;
  metadata: KeyMetadata;
  status: 'pending' | 'completed' | 'failed' | 'expired';
}

/**
 * Key Backup and Disaster Recovery Service
 * Provides secure backup and restoration of cryptographic keys
 */
export class KeyBackupService extends EventEmitter {
  private hsmService: HSMService;
  private config: BackupConfig;
  private backupRegistry: Map<string, BackupRecord> = new Map();
  private backupQueue: string[] = [];
  private processing: boolean = false;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(hsmService: HSMService, config?: Partial<BackupConfig>) {
    super();
    this.hsmService = hsmService;
    
    this.config = {
      backupPath: process.env.KEY_BACKUP_PATH || './backups/keys',
      encryptionPassword: process.env.BACKUP_ENCRYPTION_PASSWORD || 'change-me-in-production',
      compressionEnabled: true,
      redundancyLevel: 3,
      remoteBackupEnabled: false,
      retentionDays: 90,
      ...config
    };
  }

  async initialize(): Promise<void> {
    try {
      // Create backup directory if it doesn't exist
      await fs.mkdir(this.config.backupPath, { recursive: true });

      // Load existing backup records
      await this.loadBackupRegistry();

      // Start cleanup scheduler
      this.startCleanupScheduler();

      logger.info('Key Backup Service initialized', {
        backupPath: this.config.backupPath,
        redundancyLevel: this.config.redundancyLevel
      });

      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize Key Backup Service:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Save backup registry
    await this.saveBackupRegistry();

    logger.info('Key Backup Service shutdown completed');
  }

  /**
   * Schedule a key for backup
   */
  async scheduleBackup(keyId: string, wrappedKey: WrappedKey): Promise<void> {
    if (!this.backupQueue.includes(keyId)) {
      this.backupQueue.push(keyId);
      logger.info('Backup scheduled', { keyId });
    }

    // Start processing if not already running
    if (!this.processing) {
      await this.processBackupQueue();
    }
  }

  /**
   * Backup a key immediately
   */
  async backupKey(
    keyId: string,
    metadata: KeyMetadata
  ): Promise<{ backupId: string; location: string }> {
    try {
      const backupId = this.generateBackupId(keyId);

      // Create backup record
      const record: BackupRecord = {
        backupId,
        keyId,
        timestamp: new Date(),
        location: '',
        encrypted: true,
        compressed: this.config.compressionEnabled,
        size: 0,
        checksum: '',
        metadata,
        status: 'pending'
      };

      // Serialize key data
      const keyData = {
        keyId,
        metadata,
        timestamp: new Date().toISOString()
      };

      const serialized = JSON.stringify(keyData);

      // Compress if enabled
      let data = Buffer.from(serialized);
      if (this.config.compressionEnabled) {
        data = await this.compress(data);
      }

      // Encrypt backup
      const encrypted = await this.encryptBackup(data);

      // Calculate checksum
      const checksum = createHash('sha256').update(encrypted).digest('hex');

      // Save to disk with redundancy
      const locations: string[] = [];
      for (let i = 0; i < this.config.redundancyLevel; i++) {
        const location = path.join(
          this.config.backupPath,
          `${backupId}_copy${i}.bak`
        );
        await fs.writeFile(location, encrypted);
        locations.push(location);
      }

      // Update record
      record.location = locations[0];
      record.size = encrypted.length;
      record.checksum = checksum;
      record.status = 'completed';

      this.backupRegistry.set(backupId, record);

      // Save registry
      await this.saveBackupRegistry();

      logger.info('Key backed up', {
        keyId,
        backupId,
        size: record.size,
        redundancy: this.config.redundancyLevel
      });

      this.emit('backupCompleted', keyId);

      // Backup to remote if enabled
      if (this.config.remoteBackupEnabled && this.config.remoteBackupEndpoint) {
        await this.backupToRemote(backupId, encrypted);
      }

      return { backupId, location: record.location };
    } catch (error: unknown) {
      logger.error(`Failed to backup key ${keyId}:`, error);
      throw new Error(`Backup failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Restore a key from backup
   */
  async restoreKey(backupId: string): Promise<{ keyId: string; metadata: KeyMetadata }> {
    const record = this.backupRegistry.get(backupId);
    if (!record) {
      throw new Error(`Backup ${backupId} not found`);
    }

    if (record.status !== 'completed') {
      throw new Error(`Backup ${backupId} is not in completed state`);
    }

    try {
      // Try to read from primary location
      let encrypted: Buffer;
      try {
        encrypted = await fs.readFile(record.location);
      } catch (error) {
        // Try redundant copies
        encrypted = await this.readFromRedundantCopy(backupId);
      }

      // Verify checksum
      const checksum = createHash('sha256').update(encrypted).digest('hex');
      if (checksum !== record.checksum) {
        throw new Error('Backup checksum mismatch - data may be corrupted');
      }

      // Decrypt backup
      const decrypted = await this.decryptBackup(encrypted);

      // Decompress if needed
      let data = decrypted;
      if (record.compressed) {
        data = await this.decompress(data);
      }

      // Parse key data
      const keyData = JSON.parse(data.toString());

      logger.info('Key restored from backup', {
        keyId: keyData.keyId,
        backupId
      });

      this.emit('keyRestored', keyData.keyId);

      return {
        keyId: keyData.keyId,
        metadata: keyData.metadata
      };
    } catch (error: unknown) {
      logger.error(`Failed to restore key from backup ${backupId}:`, error);
      throw new Error(`Restore failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * List all backups
   */
  listBackups(filters?: {
    keyId?: string;
    status?: BackupRecord['status'];
    startDate?: Date;
    endDate?: Date;
  }): BackupRecord[] {
    let backups = Array.from(this.backupRegistry.values());

    if (filters) {
      if (filters.keyId) {
        backups = backups.filter(b => b.keyId === filters.keyId);
      }
      if (filters.status) {
        backups = backups.filter(b => b.status === filters.status);
      }
      if (filters.startDate) {
        backups = backups.filter(b => b.timestamp >= filters.startDate!);
      }
      if (filters.endDate) {
        backups = backups.filter(b => b.timestamp <= filters.endDate!);
      }
    }

    return backups;
  }

  /**
   * Delete a backup
   */
  async deleteBackup(backupId: string): Promise<void> {
    const record = this.backupRegistry.get(backupId);
    if (!record) {
      throw new Error(`Backup ${backupId} not found`);
    }

    try {
      // Delete all redundant copies
      for (let i = 0; i < this.config.redundancyLevel; i++) {
        const location = path.join(
          this.config.backupPath,
          `${backupId}_copy${i}.bak`
        );
        try {
          await fs.unlink(location);
        } catch (error) {
          logger.warn(`Failed to delete backup copy: ${location}`);
        }
      }

      // Remove from registry
      this.backupRegistry.delete(backupId);
      await this.saveBackupRegistry();

      logger.info('Backup deleted', { backupId });
      this.emit('backupDeleted', backupId);
    } catch (error) {
      logger.error(`Failed to delete backup ${backupId}:`, error);
      throw error;
    }
  }

  /**
   * Verify backup integrity
   */
  async verifyBackup(backupId: string): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const record = this.backupRegistry.get(backupId);
    if (!record) {
      return { valid: false, issues: ['Backup not found'] };
    }

    const issues: string[] = [];

    try {
      // Check if file exists
      try {
        await fs.access(record.location);
      } catch {
        issues.push('Primary backup file not found');
      }

      // Verify checksum
      try {
        const data = await fs.readFile(record.location);
        const checksum = createHash('sha256').update(data).digest('hex');
        if (checksum !== record.checksum) {
          issues.push('Checksum mismatch');
        }
      } catch (error: unknown) {
        issues.push(`Failed to verify checksum: ${getErrorMessage(error)}`);
      }

      // Check redundant copies
      let validCopies = 0;
      for (let i = 0; i < this.config.redundancyLevel; i++) {
        const location = path.join(
          this.config.backupPath,
          `${backupId}_copy${i}.bak`
        );
        try {
          await fs.access(location);
          validCopies++;
        } catch {
          // Copy not found
        }
      }

      if (validCopies < this.config.redundancyLevel) {
        issues.push(`Only ${validCopies}/${this.config.redundancyLevel} redundant copies available`);
      }

      return {
        valid: issues.length === 0,
        issues
      };
    } catch (error: unknown) {
      issues.push(`Verification failed: ${getErrorMessage(error)}`);
      return { valid: false, issues };
    }
  }

  /**
   * Check if service is healthy
   */
  isHealthy(): boolean {
    // Check if backup directory is accessible
    try {
      require('fs').accessSync(this.config.backupPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalBackups: number;
    completedBackups: number;
    failedBackups: number;
    totalSize: number;
    queueSize: number;
  } {
    const backups = Array.from(this.backupRegistry.values());

    return {
      totalBackups: backups.length,
      completedBackups: backups.filter(b => b.status === 'completed').length,
      failedBackups: backups.filter(b => b.status === 'failed').length,
      totalSize: backups.reduce((sum, b) => sum + b.size, 0),
      queueSize: this.backupQueue.length
    };
  }

  // Private methods

  private async processBackupQueue(): Promise<void> {
    if (this.processing || this.backupQueue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.backupQueue.length > 0) {
      const keyId = this.backupQueue.shift()!;
      
      try {
        // Get key metadata (would come from key management service)
        // For now, we'll skip the actual backup
        logger.info('Processing backup from queue', { keyId });
      } catch (error) {
        logger.error(`Failed to process backup for ${keyId}:`, error);
      }
    }

    this.processing = false;
  }

  private async encryptBackup(data: Buffer): Promise<Buffer> {
    const algorithm = 'aes-256-gcm';
    const salt = randomBytes(32);
    const key = scryptSync(this.config.encryptionPassword, salt, 32);
    const iv = randomBytes(16);
    
    const cipher = createCipheriv(algorithm, key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Combine salt, iv, tag, and encrypted data
    return Buffer.concat([salt, iv, tag, encrypted]);
  }

  private async decryptBackup(data: Buffer): Promise<Buffer> {
    const algorithm = 'aes-256-gcm';
    
    // Extract components
    const salt = data.slice(0, 32);
    const iv = data.slice(32, 48);
    const tag = data.slice(48, 64);
    const encrypted = data.slice(64);

    const key = scryptSync(this.config.encryptionPassword, salt, 32);
    
    const decipher = createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(tag);
    
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  private async compress(data: Buffer): Promise<Buffer> {
    // Simple compression using zlib
    const zlib = require('zlib');
    return new Promise((resolve, reject) => {
      zlib.gzip(data, (err: Error, result: Buffer) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  private async decompress(data: Buffer): Promise<Buffer> {
    const zlib = require('zlib');
    return new Promise((resolve, reject) => {
      zlib.gunzip(data, (err: Error, result: Buffer) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  private async readFromRedundantCopy(backupId: string): Promise<Buffer> {
    for (let i = 0; i < this.config.redundancyLevel; i++) {
      const location = path.join(
        this.config.backupPath,
        `${backupId}_copy${i}.bak`
      );
      try {
        return await fs.readFile(location);
      } catch {
        // Try next copy
      }
    }
    throw new Error('All redundant copies failed');
  }

  private async backupToRemote(backupId: string, data: Buffer): Promise<void> {
    // Implement remote backup (S3, Azure Blob, etc.)
    logger.info('Remote backup not yet implemented', { backupId });
  }

  private generateBackupId(keyId: string): string {
    const timestamp = Date.now();
    const random = randomBytes(8).toString('hex');
    return `backup_${keyId}_${timestamp}_${random}`;
  }

  private async loadBackupRegistry(): Promise<void> {
    const registryPath = path.join(this.config.backupPath, 'registry.json');
    try {
      const data = await fs.readFile(registryPath, 'utf-8');
      const records = JSON.parse(data);
      this.backupRegistry = new Map(Object.entries(records));
      logger.info('Backup registry loaded', { count: this.backupRegistry.size });
    } catch (error) {
      logger.info('No existing backup registry found, starting fresh');
    }
  }

  private async saveBackupRegistry(): Promise<void> {
    const registryPath = path.join(this.config.backupPath, 'registry.json');
    const records = Object.fromEntries(this.backupRegistry);
    await fs.writeFile(registryPath, JSON.stringify(records, null, 2));
  }

  private startCleanupScheduler(): void {
    // Run cleanup daily
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupExpiredBackups();
    }, 24 * 60 * 60 * 1000);
  }

  private async cleanupExpiredBackups(): Promise<void> {
    const now = new Date();
    const retentionMs = this.config.retentionDays * 24 * 60 * 60 * 1000;

    let deletedCount = 0;

    for (const [backupId, record] of this.backupRegistry.entries()) {
      const age = now.getTime() - record.timestamp.getTime();
      
      if (age > retentionMs) {
        try {
          await this.deleteBackup(backupId);
          deletedCount++;
        } catch (error) {
          logger.error(`Failed to cleanup backup ${backupId}:`, error);
        }
      }
    }

    if (deletedCount > 0) {
      logger.info('Expired backups cleaned up', { deletedCount });
    }
  }
}

export default KeyBackupService;
