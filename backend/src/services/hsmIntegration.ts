import { HSMService } from './hsmService';
import { MasterKeyManager } from './masterKeyManager';
import { AuditService } from './auditService';
import { KillSwitchService } from './killSwitchService';
import { HSMConfigManager } from '../config/hsmConfig';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

export interface HSMIntegrationConfig {
  autoInitializeMasterKey?: boolean;
  enableAutoRecovery?: boolean;
  autoRecoveryDelayMinutes?: number;
  auditRetentionDays?: number;
  killSwitchThresholds?: {
    maxFailedAuth?: number;
    maxSuspiciousRequests?: number;
    maxKeyAnomalies?: number;
    maxSystemErrors?: number;
    metricsWindow?: number;
  };
}

export interface SystemStatus {
  hsm: {
    connected: boolean;
    healthy: boolean;
    killSwitchActive: boolean;
    lastHealthCheck: Date;
  };
  masterKey: {
    initialized: boolean;
    activeKeyId: string | null;
    totalKeys: number;
    cacheSize: number;
  };
  audit: {
    totalRecords: number;
    integrityValid: boolean;
    lastCleanup?: Date;
  };
  killSwitch: {
    active: boolean;
    autoRecoveryEnabled: boolean;
    totalActivations: number;
    securityMetrics: any;
  };
  overall: 'healthy' | 'degraded' | 'critical';
}

export class HSMIntegration extends EventEmitter {
  private hsmService: HSMService;
  private masterKeyManager: MasterKeyManager;
  private auditService: AuditService;
  private killSwitchService: KillSwitchService;
  private config: HSMIntegrationConfig;
  private initialized: boolean = false;

  constructor(config: HSMIntegrationConfig = {}) {
    super();
    
    this.config = {
      autoInitializeMasterKey: true,
      enableAutoRecovery: false,
      autoRecoveryDelayMinutes: 30,
      auditRetentionDays: 90,
      killSwitchThresholds: {
        maxFailedAuth: 10,
        maxSuspiciousRequests: 5,
        maxKeyAnomalies: 3,
        maxSystemErrors: 15,
        metricsWindow: 5
      },
      ...config
    };

    this.initializeServices();
  }

  private initializeServices(): void {
    try {
      // Initialize HSM service
      const hsmConfig = HSMConfigManager.getInstance().getConfig();
      this.hsmService = new HSMService(hsmConfig);

      // Initialize audit service
      this.auditService = new AuditService({
        logPath: process.env.AUDIT_LOG_PATH || './logs/audit.log',
        signatureKey: process.env.AUDIT_SIGNATURE_KEY || 'default-signature-key',
        immutableStorage: true,
        batchSize: 100
      });

      // Initialize master key manager
      this.masterKeyManager = new MasterKeyManager(this.hsmService);

      // Initialize kill switch service
      this.killSwitchService = new KillSwitchService(
        this.hsmService,
        this.masterKeyManager,
        this.auditService,
        {
          autoRecoveryEnabled: this.config.enableAutoRecovery,
          autoRecoveryDelay: this.config.autoRecoveryDelayMinutes,
          thresholds: this.config.killSwitchThresholds
        }
      );

      this.setupEventListeners();
      logger.info('HSM integration services initialized');
    } catch (error) {
      logger.error('Failed to initialize HSM integration services:', error);
      throw error;
    }
  }

  private setupEventListeners(): void {
    // Forward HSM events
    this.hsmService.on('connectionUnhealthy', (data) => {
      this.emit('hsmConnectionUnhealthy', data);
      logger.warn('HSM connection unhealthy', data);
    });

    this.hsmService.on('keyRotated', (data) => {
      this.emit('keyRotated', data);
      logger.info('Key rotated', data);
    });

    // Forward master key events
    this.masterKeyManager.on('masterKeyInitialized', (data) => {
      this.emit('masterKeyInitialized', data);
      logger.info('Master key initialized', data);
    });

    this.masterKeyManager.on('masterKeyRotated', (data) => {
      this.emit('masterKeyRotated', data);
      logger.info('Master key rotated', data);
    });

    // Forward kill switch events
    this.killSwitchService.on('activated', (data) => {
      this.emit('killSwitchActivated', data);
      logger.error('Kill switch activated', data);
    });

    this.killSwitchService.on('deactivated', (data) => {
      this.emit('killSwitchDeactivated', data);
      logger.info('Kill switch deactivated', data);
    });

    this.killSwitchService.on('autoRecovered', (data) => {
      this.emit('autoRecovered', data);
      logger.info('Auto-recovery completed', data);
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('HSM integration already initialized');
      return;
    }

    try {
      // Verify HSM connection
      const hsmStatus = this.hsmService.getSystemStatus();
      if (!hsmStatus.connectionHealth) {
        throw new Error('HSM connection is not healthy');
      }

      // Initialize master key if configured
      if (this.config.autoInitializeMasterKey) {
        const masterKeyId = await this.masterKeyManager.initializeMasterKey();
        logger.info('Master key auto-initialized', { keyId: masterKeyId });
      }

      // Setup audit log cleanup
      if (this.config.auditRetentionDays) {
        this.scheduleAuditCleanup(this.config.auditRetentionDays);
      }

      this.initialized = true;
      logger.info('HSM integration initialized successfully');

      this.emit('initialized', { timestamp: new Date() });
    } catch (error) {
      logger.error('Failed to initialize HSM integration:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.auditService.shutdown();
      await this.killSwitchService.shutdown();
      
      this.initialized = false;
      logger.info('HSM integration shutdown completed');
    } catch (error) {
      logger.error('Error during HSM integration shutdown:', error);
      throw error;
    }
  }

  // Convenience methods for common operations
  async generateDataKey(purpose: string, userId?: string, context?: Record<string, any>) {
    this.ensureInitialized();
    return this.masterKeyManager.generateDataKey({ purpose, userId, context });
  }

  async decryptDataKey(wrappedKey: any, purpose: string, userId?: string, context?: Record<string, any>) {
    this.ensureInitialized();
    return this.masterKeyManager.decryptDataKey(wrappedKey, { purpose, userId, context });
  }

  async rotateMasterKey(): Promise<string> {
    this.ensureInitialized();
    return this.masterKeyManager.rotateMasterKey();
  }

  async activateKillSwitch(reason: string, triggeredBy?: string): Promise<void> {
    return this.killSwitchService.activate(reason, 'manual', 'critical', triggeredBy);
  }

  async deactivateKillSwitch(reason: string, triggeredBy?: string): Promise<void> {
    return this.killSwitchService.deactivate(reason, triggeredBy);
  }

  // Monitoring and status methods
  async getSystemStatus(): Promise<SystemStatus> {
    const hsmStatus = this.hsmService.getSystemStatus();
    const masterKeyStatus = this.masterKeyManager.getMasterKeyStatus();
    const auditMetrics = await this.auditService.getMetrics();
    const auditIntegrity = await this.auditService.verifyIntegrity();
    const killSwitchStatus = this.killSwitchService.getStatus();
    const securityMetrics = this.killSwitchService.getSecurityMetrics();

    // Determine overall health
    let overall: SystemStatus['overall'] = 'healthy';
    
    if (!hsmStatus.connectionHealth || killSwitchStatus.active) {
      overall = 'critical';
    } else if (!masterKeyStatus.activeKeyId || !auditIntegrity.valid) {
      overall = 'degraded';
    }

    return {
      hsm: {
        connected: hsmStatus.connectionHealth,
        healthy: hsmStatus.connectionHealth,
        killSwitchActive: hsmStatus.killSwitchActive,
        lastHealthCheck: hsmStatus.lastHealthCheck
      },
      masterKey: {
        initialized: !!masterKeyStatus.activeKeyId,
        activeKeyId: masterKeyStatus.activeKeyId,
        totalKeys: masterKeyStatus.totalKeys,
        cacheSize: masterKeyStatus.cacheSize
      },
      audit: {
        totalRecords: auditMetrics.totalRecords,
        integrityValid: auditIntegrity.valid
      },
      killSwitch: {
        active: killSwitchStatus.active,
        autoRecoveryEnabled: killSwitchStatus.autoRecoveryEnabled,
        totalActivations: killSwitchStatus.totalActivations,
        securityMetrics
      },
      overall
    };
  }

  async getHealthReport(): Promise<{
    status: SystemStatus;
    issues: string[];
    recommendations: string[];
    metrics: Record<string, any>;
  }> {
    const status = await this.getSystemStatus();
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check HSM
    if (!status.hsm.connected) {
      issues.push('HSM connection lost');
      recommendations.push('Check HSM endpoint and network connectivity');
    }

    if (status.hsm.killSwitchActive) {
      issues.push('HSM kill switch is active');
      recommendations.push('Investigate security incident and deactivate when safe');
    }

    // Check master key
    if (!status.masterKey.initialized) {
      issues.push('Master key not initialized');
      recommendations.push('Initialize master key to enable encryption operations');
    }

    // Check audit integrity
    if (!status.audit.integrityValid) {
      issues.push('Audit log integrity compromised');
      recommendations.push('Investigate audit log tampering and restore from backup');
    }

    // Check kill switch
    if (status.killSwitch.active) {
      issues.push('System kill switch is active');
      recommendations.push('Review security metrics and deactivate when appropriate');
    }

    // Get detailed metrics
    const metrics = {
      hsm: this.hsmService.getSystemStatus(),
      masterKey: this.masterKeyManager.getMasterKeyStatus(),
      audit: await this.auditService.getMetrics(),
      killSwitch: {
        status: this.killSwitchService.getStatus(),
        metrics: this.killSwitchService.getSecurityMetrics(),
        thresholds: this.killSwitchService.getThresholds()
      }
    };

    return {
      status,
      issues,
      recommendations,
      metrics
    };
  }

  // Configuration methods
  updateConfig(updates: Partial<HSMIntegrationConfig>): void {
    this.config = { ...this.config, ...updates };

    if (updates.killSwitchThresholds) {
      this.killSwitchService.updateThresholds(updates.killSwitchThresholds);
    }

    if (updates.enableAutoRecovery !== undefined) {
      if (updates.enableAutoRecovery) {
        this.killSwitchService.enableAutoRecovery(updates.autoRecoveryDelayMinutes || 30);
      } else {
        this.killSwitchService.disableAutoRecovery();
      }
    }

    logger.info('HSM integration configuration updated', updates);
  }

  // Audit and compliance methods
  async exportAuditLog(query?: any, format: 'json' | 'csv' = 'json'): Promise<string> {
    return this.auditService.exportAuditLog(query || {}, format);
  }

  async getAuditMetrics(query?: any): Promise<any> {
    return this.auditService.getMetrics(query);
  }

  async verifyAuditIntegrity(): Promise<any> {
    return this.auditService.verifyIntegrity();
  }

  // Emergency procedures
  async emergencyShutdown(reason: string, triggeredBy?: string): Promise<void> {
    logger.error('Emergency shutdown initiated', { reason, triggeredBy });

    try {
      // Activate kill switch
      await this.activateKillSwitch(`Emergency shutdown: ${reason}`, triggeredBy);

      // Clear all caches
      this.masterKeyManager.clearCache();

      // Log emergency action
      await this.auditService.logSecurityViolation(
        'emergency_shutdown',
        {
          userId: triggeredBy || 'system',
          ipAddress: 'system',
          userAgent: 'hsm-integration'
        },
        {
          type: 'system',
          id: 'emergency-shutdown'
        },
        {
          reason,
          timestamp: new Date(),
          systemStatus: await this.getSystemStatus()
        }
      );

      this.emit('emergencyShutdown', { reason, triggeredBy, timestamp: new Date() });
    } catch (error) {
      logger.error('Emergency shutdown failed:', error);
      throw error;
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('HSM integration not initialized. Call initialize() first.');
    }
  }

  private scheduleAuditCleanup(retentionDays: number): void {
    // Run cleanup daily at 2 AM
    const scheduleCleanup = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(2, 0, 0, 0);

      const delay = tomorrow.getTime() - now.getTime();

      setTimeout(async () => {
        try {
          const deletedCount = await this.auditService.cleanup(retentionDays);
          logger.info('Audit cleanup completed', { deletedCount, retentionDays });
        } catch (error) {
          logger.error('Audit cleanup failed:', error);
        }

        // Schedule next cleanup
        scheduleCleanup();
      }, delay);
    };

    scheduleCleanup();
  }

  // Get service instances for advanced usage
  getHSMService(): HSMService {
    return this.hsmService;
  }

  getMasterKeyManager(): MasterKeyManager {
    return this.masterKeyManager;
  }

  getAuditService(): AuditService {
    return this.auditService;
  }

  getKillSwitchService(): KillSwitchService {
    return this.killSwitchService;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

// Singleton instance for application-wide use
let hsmIntegrationInstance: HSMIntegration | null = null;

export function getHSMIntegration(config?: HSMIntegrationConfig): HSMIntegration {
  if (!hsmIntegrationInstance) {
    hsmIntegrationInstance = new HSMIntegration(config);
  }
  return hsmIntegrationInstance;
}

export function resetHSMIntegration(): void {
  hsmIntegrationInstance = null;
}

export default HSMIntegration;
