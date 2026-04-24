import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { HSMService } from './hsmService';
import { MasterKeyManager } from './masterKeyManager';
import { AuditService, AuditRecord } from './auditService';

export interface KillSwitchTrigger {
  id: string;
  timestamp: Date;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: 'manual' | 'automated' | 'security_incident' | 'system_failure';
  triggeredBy?: string;
  metadata?: Record<string, any>;
}

export interface KillSwitchStatus {
  active: boolean;
  activatedAt?: Date;
  deactivatedAt?: Date;
  lastTrigger?: KillSwitchTrigger;
  totalActivations: number;
  autoRecoveryEnabled: boolean;
  recoveryAttempts: number;
  nextRecoveryAttempt?: Date;
}

export interface SecurityMetrics {
  failedAuthentications: number;
  suspiciousRequests: number;
  keyAccessAnomalies: number;
  systemErrors: number;
  timeWindow: number; // in minutes
}

export class KillSwitchService extends EventEmitter {
  private hsmService: HSMService;
  private masterKeyManager: MasterKeyManager;
  private auditService: AuditService;
  private status: KillSwitchStatus;
  private securityMetrics: SecurityMetrics;
  private autoRecoveryTimer: NodeJS.Timeout | null = null;
  private metricsResetTimer: NodeJS.Timeout | null = null;
  private thresholds: {
    maxFailedAuth: number;
    maxSuspiciousRequests: number;
    maxKeyAnomalies: number;
    maxSystemErrors: number;
    metricsWindow: number;
  };

  constructor(
    hsmService: HSMService,
    masterKeyManager: MasterKeyManager,
    auditService: AuditService,
    config: {
      autoRecoveryEnabled?: boolean;
      autoRecoveryDelay?: number; // minutes
      thresholds?: {
        maxFailedAuth?: number;
        maxSuspiciousRequests?: number;
        maxKeyAnomalies?: number;
        maxSystemErrors?: number;
        metricsWindow?: number;
      };
    } = {}
  ) {
    super();

    this.hsmService = hsmService;
    this.masterKeyManager = masterKeyManager;
    this.auditService = auditService;

    this.thresholds = {
      maxFailedAuth: config.thresholds?.maxFailedAuth || 10,
      maxSuspiciousRequests: config.thresholds?.maxSuspiciousRequests || 5,
      maxKeyAnomalies: config.thresholds?.maxKeyAnomalies || 3,
      maxSystemErrors: config.thresholds?.maxSystemErrors || 15,
      metricsWindow: config.thresholds?.metricsWindow || 5
    };

    this.securityMetrics = {
      failedAuthentications: 0,
      suspiciousRequests: 0,
      keyAccessAnomalies: 0,
      systemErrors: 0,
      timeWindow: this.thresholds.metricsWindow
    };

    this.status = {
      active: false,
      totalActivations: 0,
      autoRecoveryEnabled: config.autoRecoveryEnabled ?? false,
      recoveryAttempts: 0
    };

    this.startMetricsCollection();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Listen to HSM events
    this.hsmService.on('connectionUnhealthy', (data) => {
      this.recordSystemError();
      if (data.error.includes('authentication')) {
        this.checkThresholds('system_failure', 'HSM authentication failure');
      }
    });

    // Listen to master key events
    this.masterKeyManager.on('masterKeyRevoked', (data) => {
      this.recordKeyAnomaly();
      this.checkThresholds('security_incident', `Master key revoked: ${data.reason}`);
    });

    // Listen to audit events
    this.auditService.on('auditEvent', (record: AuditRecord) => {
      if (record.category === 'security_violation') {
        this.recordSuspiciousRequest();
        this.checkThresholds('security_incident', `Security violation: ${record.action}`);
      }

      if (record.category === 'access_control' && record.outcome === 'failure') {
        this.recordFailedAuthentication();
        this.checkThresholds('security_incident', 'Access control failure');
      }
    });
  }

  private startMetricsCollection(): void {
    // Reset metrics window periodically
    this.metricsResetTimer = setInterval(() => {
      this.resetMetrics();
    }, this.securityMetrics.timeWindow * 60 * 1000);
  }

  private resetMetrics(): void {
    this.securityMetrics = {
      ...this.securityMetrics,
      failedAuthentications: 0,
      suspiciousRequests: 0,
      keyAccessAnomalies: 0,
      systemErrors: 0
    };
  }

  private recordFailedAuthentication(): void {
    this.securityMetrics.failedAuthentications++;
    logger.warn('Failed authentication recorded', {
      count: this.securityMetrics.failedAuthentications,
      threshold: this.thresholds.maxFailedAuth
    });
  }

  private recordSuspiciousRequest(): void {
    this.securityMetrics.suspiciousRequests++;
    logger.warn('Suspicious request recorded', {
      count: this.securityMetrics.suspiciousRequests,
      threshold: this.thresholds.maxSuspiciousRequests
    });
  }

  private recordKeyAnomaly(): void {
    this.securityMetrics.keyAccessAnomalies++;
    logger.warn('Key access anomaly recorded', {
      count: this.securityMetrics.keyAccessAnomalies,
      threshold: this.thresholds.maxKeyAnomalies
    });
  }

  private recordSystemError(): void {
    this.securityMetrics.systemErrors++;
    logger.warn('System error recorded', {
      count: this.securityMetrics.systemErrors,
      threshold: this.thresholds.maxSystemErrors
    });
  }

  private checkThresholds(source: KillSwitchTrigger['source'], reason: string): void {
    const triggers: string[] = [];

    if (this.securityMetrics.failedAuthentications >= this.thresholds.maxFailedAuth) {
      triggers.push(`Failed auth threshold: ${this.securityMetrics.failedAuthentications}/${this.thresholds.maxFailedAuth}`);
    }

    if (this.securityMetrics.suspiciousRequests >= this.thresholds.maxSuspiciousRequests) {
      triggers.push(`Suspicious requests threshold: ${this.securityMetrics.suspiciousRequests}/${this.thresholds.maxSuspiciousRequests}`);
    }

    if (this.securityMetrics.keyAccessAnomalies >= this.thresholds.maxKeyAnomalies) {
      triggers.push(`Key anomalies threshold: ${this.securityMetrics.keyAccessAnomalies}/${this.thresholds.maxKeyAnomalies}`);
    }

    if (this.securityMetrics.systemErrors >= this.thresholds.maxSystemErrors) {
      triggers.push(`System errors threshold: ${this.securityMetrics.systemErrors}/${this.thresholds.maxSystemErrors}`);
    }

    if (triggers.length > 0) {
      const fullReason = `${reason}. Triggers: ${triggers.join(', ')}`;
      this.activate(fullReason, source, 'high');
    }
  }

  async activate(
    reason: string,
    source: KillSwitchTrigger['source'] = 'manual',
    severity: KillSwitchTrigger['severity'] = 'critical',
    triggeredBy?: string
  ): Promise<void> {
    if (this.status.active) {
      logger.warn('Kill switch already active', { reason });
      return;
    }

    const trigger: KillSwitchTrigger = {
      id: this.generateTriggerId(),
      timestamp: new Date(),
      reason,
      severity,
      source,
      triggeredBy
    };

    try {
      // Activate HSM kill switch
      this.hsmService.activateKillSwitch(reason);

      // Update status
      this.status.active = true;
      this.status.activatedAt = new Date();
      this.status.lastTrigger = trigger;
      this.status.totalActivations++;
      this.status.recoveryAttempts = 0;

      // Clear master key cache
      this.masterKeyManager.clearCache();

      // Cancel auto-recovery if active
      if (this.autoRecoveryTimer) {
        clearTimeout(this.autoRecoveryTimer);
        this.autoRecoveryTimer = null;
      }

      // Log the activation
      await this.auditService.logSecurityViolation(
        'kill_switch_activated',
        {
          userId: triggeredBy,
          ipAddress: 'system',
          userAgent: 'kill-switch-service'
        },
        {
          type: 'system',
          id: trigger.id
        },
        {
          reason,
          source,
          severity,
          metrics: this.securityMetrics
        }
      );

      logger.error('Kill switch activated', {
        trigger,
        metrics: this.securityMetrics
      });

      this.emit('activated', { trigger, status: this.status });

    } catch (error) {
      logger.error('Failed to activate kill switch:', error);
      throw error;
    }
  }

  async deactivate(reason: string = 'Manual deactivation', triggeredBy?: string): Promise<void> {
    if (!this.status.active) {
      logger.warn('Kill switch not active');
      return;
    }

    try {
      // Deactivate HSM kill switch
      this.hsmService.deactivateKillSwitch();

      // Update status
      this.status.active = false;
      this.status.deactivatedAt = new Date();

      // Log the deactivation
      await this.auditService.logSystemEvent(
        'kill_switch_deactivated',
        {
          userId: triggeredBy,
          ipAddress: 'system',
          userAgent: 'kill-switch-service'
        },
        {
          reason,
          duration: this.status.deactivatedAt.getTime() - this.status.activatedAt!.getTime()
        }
      );

      logger.info('Kill switch deactivated', { reason, triggeredBy });

      this.emit('deactivated', { reason, triggeredBy, status: this.status });

    } catch (error) {
      logger.error('Failed to deactivate kill switch:', error);
      throw error;
    }
  }

  enableAutoRecovery(delayMinutes: number = 30): void {
    this.status.autoRecoveryEnabled = true;
    this.status.nextRecoveryAttempt = new Date(Date.now() + delayMinutes * 60 * 1000);

    if (this.autoRecoveryTimer) {
      clearTimeout(this.autoRecoveryTimer);
    }

    this.autoRecoveryTimer = setTimeout(async () => {
      await this.attemptAutoRecovery();
    }, delayMinutes * 60 * 1000);

    logger.info('Auto-recovery enabled', { delayMinutes, nextAttempt: this.status.nextRecoveryAttempt });
  }

  disableAutoRecovery(): void {
    this.status.autoRecoveryEnabled = false;
    this.status.nextRecoveryAttempt = undefined;

    if (this.autoRecoveryTimer) {
      clearTimeout(this.autoRecoveryTimer);
      this.autoRecoveryTimer = null;
    }

    logger.info('Auto-recovery disabled');
  }

  private async attemptAutoRecovery(): Promise<void> {
    if (!this.status.active) {
      logger.info('Auto-recovery: Kill switch not active');
      return;
    }

    this.status.recoveryAttempts++;

    try {
      // Check system health
      const health = await this.masterKeyManager.healthCheck();
      
      if (health.healthy) {
        await this.deactivate(`Auto-recovery attempt ${this.status.recoveryAttempts}`, 'system');
        logger.info('Auto-recovery successful', { attempt: this.status.recoveryAttempts });
        this.emit('autoRecovered', { attempt: this.status.recoveryAttempts });
      } else {
        logger.warn('Auto-recovery failed: System unhealthy', { health, attempt: this.status.recoveryAttempts });
        
        // Schedule next attempt with exponential backoff
        const nextDelay = Math.min(30 * Math.pow(2, this.status.recoveryAttempts), 240); // Max 4 hours
        this.enableAutoRecovery(nextDelay);
        
        this.emit('autoRecoveryFailed', { 
          attempt: this.status.recoveryAttempts, 
          health, 
          nextDelay 
        });
      }
    } catch (error) {
      logger.error('Auto-recovery attempt failed:', error);
      
      // Schedule retry
      const nextDelay = Math.min(30 * Math.pow(2, this.status.recoveryAttempts), 240);
      this.enableAutoRecovery(nextDelay);
      
      this.emit('autoRecoveryFailed', { 
        attempt: this.status.recoveryAttempts, 
        error, 
        nextDelay 
      });
    }
  }

  private generateTriggerId(): string {
    return `ks-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  getStatus(): KillSwitchStatus {
    return { ...this.status };
  }

  getSecurityMetrics(): SecurityMetrics {
    return { ...this.securityMetrics };
  }

  getThresholds(): typeof this.thresholds {
    return { ...this.thresholds };
  }

  updateThresholds(newThresholds: Partial<typeof this.thresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    logger.info('Kill switch thresholds updated', this.thresholds);
  }

  async forceHealthCheck(): Promise<{
    healthy: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check HSM health
    const hsmStatus = this.hsmService.getSystemStatus();
    if (!hsmStatus.connectionHealth) {
      issues.push('HSM connection unhealthy');
    }
    if (hsmStatus.killSwitchActive) {
      issues.push('HSM kill switch is active');
    }

    // Check master key manager
    const masterKeyHealth = await this.masterKeyManager.healthCheck();
    if (!masterKeyHealth.healthy) {
      issues.push(...masterKeyHealth.issues);
    }

    // Check security metrics
    if (this.securityMetrics.failedAuthentications > this.thresholds.maxFailedAuth * 0.7) {
      recommendations.push('High failed authentication rate detected');
    }

    if (this.securityMetrics.suspiciousRequests > this.thresholds.maxSuspiciousRequests * 0.7) {
      recommendations.push('High suspicious request rate detected');
    }

    return {
      healthy: issues.length === 0,
      issues,
      recommendations
    };
  }

  async shutdown(): Promise<void> {
    if (this.autoRecoveryTimer) {
      clearTimeout(this.autoRecoveryTimer);
    }
    
    if (this.metricsResetTimer) {
      clearInterval(this.metricsResetTimer);
    }

    logger.info('Kill switch service shutdown completed');
  }
}

export default KillSwitchService;
