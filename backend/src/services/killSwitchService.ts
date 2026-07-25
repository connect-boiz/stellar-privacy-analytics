import { EventEmitter } from "events";
import { logger } from "../utils/logger";
import { HSMService } from "./hsmService";
import { MasterKeyManager } from "./masterKeyManager";
import { AuditService, AuditRecord } from "./auditService";

export interface KillSwitchTrigger {
  id: string;
  timestamp: Date;
  reason: string;
  severity: "low" | "medium" | "high" | "critical";
  source: "manual" | "automated" | "security_incident" | "system_failure";
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

interface SecurityEvent {
  timestamp: number;
  type: 'failedAuth' | 'suspiciousRequest' | 'keyAnomaly' | 'systemError';
}

interface CumulativeMetrics {
  failedAuthentications: number;
  suspiciousRequests: number;
  keyAccessAnomalies: number;
  systemErrors: number;
}

interface DecayingMetrics {
  failedAuthentications: number;
  suspiciousRequests: number;
  keyAccessAnomalies: number;
  systemErrors: number;
  windowStart: number;
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
  // Sliding window implementation
  private eventTimestamps: SecurityEvent[] = [];
  // Cumulative tracking across all windows
  private cumulativeMetrics: CumulativeMetrics = {
    failedAuthentications: 0,
    suspiciousRequests: 0,
    keyAccessAnomalies: 0,
    systemErrors: 0,
  };
  // Decaying metrics from previous half-window
  private decayingMetrics: DecayingMetrics = {
    failedAuthentications: 0,
    suspiciousRequests: 0,
    keyAccessAnomalies: 0,
    systemErrors: 0,
    windowStart: Date.now(),
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
    } = {},
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
      metricsWindow: config.thresholds?.metricsWindow || 5,
    };

    this.securityMetrics = {
      failedAuthentications: 0,
      suspiciousRequests: 0,
      keyAccessAnomalies: 0,
      systemErrors: 0,
      timeWindow: this.thresholds.metricsWindow,
    };

    this.status = {
      active: false,
      totalActivations: 0,
      autoRecoveryEnabled: config.autoRecoveryEnabled ?? false,
      recoveryAttempts: 0,
    };

    this.startMetricsCollection();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Listen to HSM events
    this.hsmService.on("connectionUnhealthy", (data) => {
      this.recordSystemError();
      if (data.error.includes("authentication")) {
        this.checkThresholds("system_failure", "HSM authentication failure");
      }
    });

    // Listen to master key events
    this.masterKeyManager.on("masterKeyRevoked", (data) => {
      this.recordKeyAnomaly();
      this.checkThresholds(
        "security_incident",
        `Master key revoked: ${data.reason}`,
      );
    });

    // Listen to audit events
    this.auditService.on("auditEvent", (record: AuditRecord) => {
      if (record.category === "security_violation") {
        this.recordSuspiciousRequest();
        this.checkThresholds(
          "security_incident",
          `Security violation: ${record.action}`,
        );
      }

      if (
        record.category === "access_control" &&
        record.outcome === "failure"
      ) {
        this.recordFailedAuthentication();
        this.checkThresholds("security_incident", "Access control failure");
      }
    });
  }

  private startMetricsCollection(): void {
    // Cleanup old events periodically (every minute)
    this.metricsResetTimer = setInterval(
      () => {
        this.cleanupOldEvents();
        this.updateDecayingMetrics();
      },
      60 * 1000, // Run every minute
    );
  }

  /**
   * Remove events outside the sliding window
   */
  private cleanupOldEvents(): void {
    const now = Date.now();
    const windowMs = this.securityMetrics.timeWindow * 60 * 1000;
    
    // Keep only events within the current window
    this.eventTimestamps = this.eventTimestamps.filter(
      (event) => now - event.timestamp < windowMs
    );
  }

  /**
   * Update decaying metrics for half-window overlap
   * This creates a "memory" effect that prevents attackers from 
   * exploiting window boundaries
   */
  private updateDecayingMetrics(): void {
    const now = Date.now();
    const halfWindowMs = (this.securityMetrics.timeWindow * 60 * 1000) / 2;
    const timeSinceWindowStart = now - this.decayingMetrics.windowStart;
    
    // If we've passed a half-window, update the decaying metrics
    if (timeSinceWindowStart >= halfWindowMs) {
      const currentWindowMetrics = this.getCurrentWindowMetrics();
      
      // Set decaying metrics to current half-window counts (50% decay factor)
      this.decayingMetrics = {
        failedAuthentications: Math.floor(currentWindowMetrics.failedAuthentications * 0.5),
        suspiciousRequests: Math.floor(currentWindowMetrics.suspiciousRequests * 0.5),
        keyAccessAnomalies: Math.floor(currentWindowMetrics.keyAccessAnomalies * 0.5),
        systemErrors: Math.floor(currentWindowMetrics.systemErrors * 0.5),
        windowStart: now,
      };
      
      logger.debug('Decaying metrics updated', {
        decayingMetrics: this.decayingMetrics,
      });
    }
  }

  /**
   * Get metrics for events within the current sliding window
   */
  private getCurrentWindowMetrics(): {
    failedAuthentications: number;
    suspiciousRequests: number;
    keyAccessAnomalies: number;
    systemErrors: number;
  } {
    const now = Date.now();
    const windowMs = this.securityMetrics.timeWindow * 60 * 1000;
    
    const recentEvents = this.eventTimestamps.filter(
      (event) => now - event.timestamp < windowMs
    );
    
    return {
      failedAuthentications: recentEvents.filter((e) => e.type === 'failedAuth').length,
      suspiciousRequests: recentEvents.filter((e) => e.type === 'suspiciousRequest').length,
      keyAccessAnomalies: recentEvents.filter((e) => e.type === 'keyAnomaly').length,
      systemErrors: recentEvents.filter((e) => e.type === 'systemError').length,
    };
  }

  /**
   * Record a security event in the sliding window
   */
  private recordEvent(type: SecurityEvent['type']): void {
    const event: SecurityEvent = {
      timestamp: Date.now(),
      type,
    };
    
    this.eventTimestamps.push(event);
    
    // Update cumulative counters
    switch (type) {
      case 'failedAuth':
        this.cumulativeMetrics.failedAuthentications++;
        break;
      case 'suspiciousRequest':
        this.cumulativeMetrics.suspiciousRequests++;
        break;
      case 'keyAnomaly':
        this.cumulativeMetrics.keyAccessAnomalies++;
        break;
      case 'systemError':
        this.cumulativeMetrics.systemErrors++;
        break;
    }
    
    // Update the current metrics display
    const currentMetrics = this.getCurrentWindowMetrics();
    this.securityMetrics = {
      ...this.securityMetrics,
      ...currentMetrics,
    };
  }

  private recordFailedAuthentication(): void {
    this.recordEvent('failedAuth');
    logger.warn("Failed authentication recorded", {
      slidingWindowCount: this.securityMetrics.failedAuthentications,
      cumulativeCount: this.cumulativeMetrics.failedAuthentications,
      threshold: this.thresholds.maxFailedAuth,
      cumulativeThreshold: this.thresholds.maxFailedAuth * 3,
    });
  }

  private recordSuspiciousRequest(): void {
    this.recordEvent('suspiciousRequest');
    logger.warn("Suspicious request recorded", {
      slidingWindowCount: this.securityMetrics.suspiciousRequests,
      cumulativeCount: this.cumulativeMetrics.suspiciousRequests,
      threshold: this.thresholds.maxSuspiciousRequests,
      cumulativeThreshold: this.thresholds.maxSuspiciousRequests * 3,
    });
  }

  private recordKeyAnomaly(): void {
    this.recordEvent('keyAnomaly');
    logger.warn("Key access anomaly recorded", {
      slidingWindowCount: this.securityMetrics.keyAccessAnomalies,
      cumulativeCount: this.cumulativeMetrics.keyAccessAnomalies,
      threshold: this.thresholds.maxKeyAnomalies,
      cumulativeThreshold: this.thresholds.maxKeyAnomalies * 3,
    });
  }

  private recordSystemError(): void {
    this.recordEvent('systemError');
    logger.warn("System error recorded", {
      slidingWindowCount: this.securityMetrics.systemErrors,
      cumulativeCount: this.cumulativeMetrics.systemErrors,
      threshold: this.thresholds.maxSystemErrors,
      cumulativeThreshold: this.thresholds.maxSystemErrors * 3,
    });
  }

  private checkThresholds(
    source: KillSwitchTrigger["source"],
    reason: string,
  ): void {
    const triggers: string[] = [];
    const currentMetrics = this.getCurrentWindowMetrics();
    
    // Apply decaying metrics from previous half-window
    const effectiveMetrics = {
      failedAuthentications: currentMetrics.failedAuthentications + this.decayingMetrics.failedAuthentications,
      suspiciousRequests: currentMetrics.suspiciousRequests + this.decayingMetrics.suspiciousRequests,
      keyAccessAnomalies: currentMetrics.keyAccessAnomalies + this.decayingMetrics.keyAccessAnomalies,
      systemErrors: currentMetrics.systemErrors + this.decayingMetrics.systemErrors,
    };

    // Check sliding window thresholds (with decaying metrics)
    if (effectiveMetrics.failedAuthentications >= this.thresholds.maxFailedAuth) {
      triggers.push(
        `Failed auth sliding window threshold: ${effectiveMetrics.failedAuthentications}/${this.thresholds.maxFailedAuth} (current: ${currentMetrics.failedAuthentications}, decaying: ${this.decayingMetrics.failedAuthentications})`,
      );
    }

    if (effectiveMetrics.suspiciousRequests >= this.thresholds.maxSuspiciousRequests) {
      triggers.push(
        `Suspicious requests sliding window threshold: ${effectiveMetrics.suspiciousRequests}/${this.thresholds.maxSuspiciousRequests} (current: ${currentMetrics.suspiciousRequests}, decaying: ${this.decayingMetrics.suspiciousRequests})`,
      );
    }

    if (effectiveMetrics.keyAccessAnomalies >= this.thresholds.maxKeyAnomalies) {
      triggers.push(
        `Key anomalies sliding window threshold: ${effectiveMetrics.keyAccessAnomalies}/${this.thresholds.maxKeyAnomalies} (current: ${currentMetrics.keyAccessAnomalies}, decaying: ${this.decayingMetrics.keyAccessAnomalies})`,
      );
    }

    if (effectiveMetrics.systemErrors >= this.thresholds.maxSystemErrors) {
      triggers.push(
        `System errors sliding window threshold: ${effectiveMetrics.systemErrors}/${this.thresholds.maxSystemErrors} (current: ${currentMetrics.systemErrors}, decaying: ${this.decayingMetrics.systemErrors})`,
      );
    }

    // Check cumulative thresholds (3x the normal threshold)
    const cumulativeThreshold = 3;
    
    if (
      this.cumulativeMetrics.failedAuthentications >=
      this.thresholds.maxFailedAuth * cumulativeThreshold
    ) {
      triggers.push(
        `Failed auth cumulative threshold: ${this.cumulativeMetrics.failedAuthentications}/${this.thresholds.maxFailedAuth * cumulativeThreshold}`,
      );
    }

    if (
      this.cumulativeMetrics.suspiciousRequests >=
      this.thresholds.maxSuspiciousRequests * cumulativeThreshold
    ) {
      triggers.push(
        `Suspicious requests cumulative threshold: ${this.cumulativeMetrics.suspiciousRequests}/${this.thresholds.maxSuspiciousRequests * cumulativeThreshold}`,
      );
    }

    if (
      this.cumulativeMetrics.keyAccessAnomalies >=
      this.thresholds.maxKeyAnomalies * cumulativeThreshold
    ) {
      triggers.push(
        `Key anomalies cumulative threshold: ${this.cumulativeMetrics.keyAccessAnomalies}/${this.thresholds.maxKeyAnomalies * cumulativeThreshold}`,
      );
    }

    if (
      this.cumulativeMetrics.systemErrors >=
      this.thresholds.maxSystemErrors * cumulativeThreshold
    ) {
      triggers.push(
        `System errors cumulative threshold: ${this.cumulativeMetrics.systemErrors}/${this.thresholds.maxSystemErrors * cumulativeThreshold}`,
      );
    }

    if (triggers.length > 0) {
      const fullReason = `${reason}. Triggers: ${triggers.join(", ")}`;
      this.activate(fullReason, source, "high");
    }
  }

  async activate(
    reason: string,
    source: KillSwitchTrigger["source"] = "manual",
    severity: KillSwitchTrigger["severity"] = "critical",
    triggeredBy?: string,
  ): Promise<void> {
    if (this.status.active) {
      logger.warn("Kill switch already active", { reason });
      return;
    }

    const trigger: KillSwitchTrigger = {
      id: this.generateTriggerId(),
      timestamp: new Date(),
      reason,
      severity,
      source,
      triggeredBy,
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
        "kill_switch_activated",
        {
          userId: triggeredBy,
          ipAddress: "system",
          userAgent: "kill-switch-service",
        },
        {
          type: "system",
          id: trigger.id,
        },
        {
          reason,
          source,
          severity,
          metrics: this.securityMetrics,
        },
      );

      logger.error("Kill switch activated", {
        trigger,
        metrics: this.securityMetrics,
      });

      this.emit("activated", { trigger, status: this.status });
    } catch (error) {
      logger.error("Failed to activate kill switch:", error);
      throw error;
    }
  }

  async deactivate(
    reason: string = "Manual deactivation",
    triggeredBy?: string,
  ): Promise<void> {
    if (!this.status.active) {
      logger.warn("Kill switch not active");
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
        "kill_switch_deactivated",
        {
          userId: triggeredBy,
          ipAddress: "system",
          userAgent: "kill-switch-service",
        },
        {
          reason,
          duration:
            this.status.deactivatedAt.getTime() -
            this.status.activatedAt!.getTime(),
        },
      );

      logger.info("Kill switch deactivated", { reason, triggeredBy });

      this.emit("deactivated", { reason, triggeredBy, status: this.status });
    } catch (error) {
      logger.error("Failed to deactivate kill switch:", error);
      throw error;
    }
  }

  enableAutoRecovery(delayMinutes: number = 30): void {
    this.status.autoRecoveryEnabled = true;
    this.status.nextRecoveryAttempt = new Date(
      Date.now() + delayMinutes * 60 * 1000,
    );

    if (this.autoRecoveryTimer) {
      clearTimeout(this.autoRecoveryTimer);
    }

    this.autoRecoveryTimer = setTimeout(
      async () => {
        await this.attemptAutoRecovery();
      },
      delayMinutes * 60 * 1000,
    );

    logger.info("Auto-recovery enabled", {
      delayMinutes,
      nextAttempt: this.status.nextRecoveryAttempt,
    });
  }

  disableAutoRecovery(): void {
    this.status.autoRecoveryEnabled = false;
    this.status.nextRecoveryAttempt = undefined;

    if (this.autoRecoveryTimer) {
      clearTimeout(this.autoRecoveryTimer);
      this.autoRecoveryTimer = null;
    }

    logger.info("Auto-recovery disabled");
  }

  private async attemptAutoRecovery(): Promise<void> {
    if (!this.status.active) {
      logger.info("Auto-recovery: Kill switch not active");
      return;
    }

    this.status.recoveryAttempts++;

    try {
      // Deactivate first, then verify health
      await this.deactivate(
        `Auto-recovery attempt ${this.status.recoveryAttempts}`,
        "system",
      );

      const health = await this.masterKeyManager.healthCheck();

      if (health.healthy) {
        logger.info("Auto-recovery successful", {
          attempt: this.status.recoveryAttempts,
        });
        this.emit("autoRecovered", { attempt: this.status.recoveryAttempts });
      } else {
        logger.warn("Auto-recovery: System unhealthy after deactivation", {
          health,
          attempt: this.status.recoveryAttempts,
        });

        // Re-activate kill switch since system is unhealthy
        await this.activate(
          `System unhealthy after auto-recovery attempt ${this.status.recoveryAttempts}`,
          "automated",
          "high",
        );

        // Schedule next attempt with exponential backoff
        const nextDelay = Math.min(
          30 * Math.pow(2, this.status.recoveryAttempts),
          240,
        );
        this.enableAutoRecovery(nextDelay);

        this.emit("autoRecoveryFailed", {
          attempt: this.status.recoveryAttempts,
          health,
          nextDelay,
        });
      }
    } catch (error) {
      logger.error("Auto-recovery attempt failed:", error);

      // Schedule retry
      const nextDelay = Math.min(
        30 * Math.pow(2, this.status.recoveryAttempts),
        240,
      );
      this.enableAutoRecovery(nextDelay);

      this.emit("autoRecoveryFailed", {
        attempt: this.status.recoveryAttempts,
        error,
        nextDelay,
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

  /**
   * Get cumulative metrics across all windows
   * This is useful for detecting distributed attacks
   */
  getCumulativeMetrics(): CumulativeMetrics {
    return { ...this.cumulativeMetrics };
  }

  /**
   * Get the current decaying metrics from the previous half-window
   */
  getDecayingMetrics(): Omit<DecayingMetrics, 'windowStart'> {
    return {
      failedAuthentications: this.decayingMetrics.failedAuthentications,
      suspiciousRequests: this.decayingMetrics.suspiciousRequests,
      keyAccessAnomalies: this.decayingMetrics.keyAccessAnomalies,
      systemErrors: this.decayingMetrics.systemErrors,
    };
  }

  /**
   * Reset cumulative metrics (use with caution - typically only after system maintenance)
   */
  resetCumulativeMetrics(): void {
    this.cumulativeMetrics = {
      failedAuthentications: 0,
      suspiciousRequests: 0,
      keyAccessAnomalies: 0,
      systemErrors: 0,
    };
    logger.info("Cumulative metrics reset");
  }

  getThresholds(): typeof this.thresholds {
    return { ...this.thresholds };
  }

  updateThresholds(newThresholds: Partial<typeof this.thresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    logger.info("Kill switch thresholds updated", this.thresholds);
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
      issues.push("HSM connection unhealthy");
    }
    if (hsmStatus.killSwitchActive) {
      issues.push("HSM kill switch is active");
    }

    // Check master key manager
    const masterKeyHealth = await this.masterKeyManager.healthCheck();
    if (!masterKeyHealth.healthy) {
      issues.push(...masterKeyHealth.issues);
    }

    // Check security metrics
    if (
      this.securityMetrics.failedAuthentications >
      this.thresholds.maxFailedAuth * 0.7
    ) {
      recommendations.push("High failed authentication rate detected");
    }

    if (
      this.securityMetrics.suspiciousRequests >
      this.thresholds.maxSuspiciousRequests * 0.7
    ) {
      recommendations.push("High suspicious request rate detected");
    }

    return {
      healthy: issues.length === 0,
      issues,
      recommendations,
    };
  }

  async shutdown(): Promise<void> {
    if (this.autoRecoveryTimer) {
      clearTimeout(this.autoRecoveryTimer);
    }

    if (this.metricsResetTimer) {
      clearInterval(this.metricsResetTimer);
    }

    logger.info("Kill switch service shutdown completed");
  }
}

export default KillSwitchService;
