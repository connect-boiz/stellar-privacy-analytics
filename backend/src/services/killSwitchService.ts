import { EventEmitter } from "events";
import { logger } from "../utils/logger";
import { HSMService } from "./hsmService";
import { MasterKeyManager } from "./masterKeyManager";
import { AuditService, AuditRecord } from "./auditService";
import { killSwitchRecoveryAttempts } from "../utils/prometheus";

export interface KillSwitchTrigger {
  id: string;
  timestamp: Date;
  reason: string;
  severity: "low" | "medium" | "high" | "critical";
  source: "manual" | "automated" | "security_incident" | "system_failure" | "hsm_failure";
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
  maxRecoveryAttempts: number;
  nextRecoveryAttempt?: Date;
  recoveredAt?: Date;
}

export interface SecurityMetrics {
  failedAuthentications: number;
  suspiciousRequests: number;
  keyAccessAnomalies: number;
  systemErrors: number;
  timeWindow: number; // in minutes
}

// Recovery delay mapping based on trigger source (in minutes)
export const RECOVERY_DELAY_MAP: Record<KillSwitchTrigger["source"], number> = {
  hsm_failure: 0.5,        // 30 seconds for HSM transient failure
  system_failure: 2,       // 2 minutes for system failures
  security_incident: 5,    // 5 minutes for security incidents
  automated: 5,            // 5 minutes for automated triggers
  manual: 5,               // 5 minutes for manual triggers
};

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
  private maxRecoveryAttempts: number;
  private currentRecoveryDelay?: number;

  constructor(
    hsmService: HSMService,
    masterKeyManager: MasterKeyManager,
    auditService: AuditService,
    config: {
      autoRecoveryEnabled?: boolean;
      autoRecoveryDelay?: number; // minutes
      maxRecoveryAttempts?: number;
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

    this.maxRecoveryAttempts = config.maxRecoveryAttempts ?? 5;

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
      autoRecoveryEnabled: config.autoRecoveryEnabled ?? true,
      recoveryAttempts: 0,
      maxRecoveryAttempts: this.maxRecoveryAttempts,
    };

    this.startMetricsCollection();
    this.setupEventListeners();

    // Initialize Prometheus gauge
    killSwitchRecoveryAttempts.set(0);
  }

  private setupEventListeners(): void {
    // Listen to HSM events
    this.hsmService.on("connectionUnhealthy", (data) => {
      this.recordSystemError();
      if (data.error.includes("authentication")) {
        this.checkThresholds("hsm_failure", "HSM authentication failure");
      } else {
        this.checkThresholds("hsm_failure", "HSM connection unhealthy");
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
    // Reset metrics window periodically
    this.metricsResetTimer = setInterval(
      () => {
        this.resetMetrics();
      },
      this.securityMetrics.timeWindow * 60 * 1000,
    );
  }

  private resetMetrics(): void {
    this.securityMetrics = {
      ...this.securityMetrics,
      failedAuthentications: 0,
      suspiciousRequests: 0,
      keyAccessAnomalies: 0,
      systemErrors: 0,
    };
  }

  private recordFailedAuthentication(): void {
    this.securityMetrics.failedAuthentications++;
    logger.warn("Failed authentication recorded", {
      count: this.securityMetrics.failedAuthentications,
      threshold: this.thresholds.maxFailedAuth,
    });
  }

  private recordSuspiciousRequest(): void {
    this.securityMetrics.suspiciousRequests++;
    logger.warn("Suspicious request recorded", {
      count: this.securityMetrics.suspiciousRequests,
      threshold: this.thresholds.maxSuspiciousRequests,
    });
  }

  private recordKeyAnomaly(): void {
    this.securityMetrics.keyAccessAnomalies++;
    logger.warn("Key access anomaly recorded", {
      count: this.securityMetrics.keyAccessAnomalies,
      threshold: this.thresholds.maxKeyAnomalies,
    });
  }

  private recordSystemError(): void {
    this.securityMetrics.systemErrors++;
    logger.warn("System error recorded", {
      count: this.securityMetrics.systemErrors,
      threshold: this.thresholds.maxSystemErrors,
    });
  }

  private checkThresholds(
    source: KillSwitchTrigger["source"],
    reason: string,
  ): void {
    const triggers: string[] = [];

    if (
      this.securityMetrics.failedAuthentications >=
      this.thresholds.maxFailedAuth
    ) {
      triggers.push(
        `Failed auth threshold: ${this.securityMetrics.failedAuthentications}/${this.thresholds.maxFailedAuth}`,
      );
    }

    if (
      this.securityMetrics.suspiciousRequests >=
      this.thresholds.maxSuspiciousRequests
    ) {
      triggers.push(
        `Suspicious requests threshold: ${this.securityMetrics.suspiciousRequests}/${this.thresholds.maxSuspiciousRequests}`,
      );
    }

    if (
      this.securityMetrics.keyAccessAnomalies >= this.thresholds.maxKeyAnomalies
    ) {
      triggers.push(
        `Key anomalies threshold: ${this.securityMetrics.keyAccessAnomalies}/${this.thresholds.maxKeyAnomalies}`,
      );
    }

    if (this.securityMetrics.systemErrors >= this.thresholds.maxSystemErrors) {
      triggers.push(
        `System errors threshold: ${this.securityMetrics.systemErrors}/${this.thresholds.maxSystemErrors}`,
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
      this.currentRecoveryDelay = undefined;

      // Clear master key cache
      this.masterKeyManager.clearCache();

      // Cancel auto-recovery if active and reset Prometheus gauge
      if (this.autoRecoveryTimer) {
        clearTimeout(this.autoRecoveryTimer);
        this.autoRecoveryTimer = null;
      }

      // Schedule auto-recovery if enabled (start fresh for this activation)
      this.scheduleAutoRecoveryIfEnabled();

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

  /**
   * Enable auto-recovery with a delay based on the trigger source.
   * If a delayMinutes is explicitly provided, it is used; otherwise the delay
   * is derived from the last trigger's source using RECOVERY_DELAY_MAP.
   */
  enableAutoRecovery(delayMinutes?: number): void {
    // Store explicitly provided delay for test and backoff purposes
    if (delayMinutes !== undefined) {
      this.currentRecoveryDelay = delayMinutes;
    }

    // Calculate delay based on trigger source if not explicitly provided
    const computedDelay =
      this.currentRecoveryDelay ??
      (this.status.lastTrigger
        ? RECOVERY_DELAY_MAP[this.status.lastTrigger.source] ?? 5
        : 5);

    this.status.autoRecoveryEnabled = true;
    this.status.nextRecoveryAttempt = new Date(
      Date.now() + computedDelay * 60 * 1000,
    );

    if (this.autoRecoveryTimer) {
      clearTimeout(this.autoRecoveryTimer);
    }

    this.autoRecoveryTimer = setTimeout(
      async () => {
        await this.attemptAutoRecovery();
      },
      computedDelay * 60 * 1000,
    );

    logger.info("Auto-recovery enabled", {
      delayMinutes: computedDelay,
      nextAttempt: this.status.nextRecoveryAttempt,
      triggerSource: this.status.lastTrigger?.source,
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
    killSwitchRecoveryAttempts.set(this.status.recoveryAttempts);

    logger.info("Auto-recovery attempt started", {
      attempt: this.status.recoveryAttempts,
      maxAttempts: this.maxRecoveryAttempts,
    });

    // Check if max attempts exceeded — escalate to human operators
    if (this.status.recoveryAttempts > this.maxRecoveryAttempts) {
      logger.error(
        "Auto-recovery: Maximum recovery attempts exceeded. Escalating to human operators.",
        {
          attempts: this.status.recoveryAttempts,
          maxAttempts: this.maxRecoveryAttempts,
          lastTrigger: this.status.lastTrigger,
        },
      );

      this.disableAutoRecovery();

      // Log escalation to audit
      await this.auditService.logSecurityViolation(
        "kill_switch_recovery_escalated",
        {
          userId: "system",
          ipAddress: "system",
          userAgent: "kill-switch-service",
        },
        {
          type: "system",
          id: `escalation-${Date.now()}`,
        },
        {
          reason: "Maximum auto-recovery attempts exceeded",
          attempts: this.status.recoveryAttempts,
          maxAttempts: this.maxRecoveryAttempts,
          lastTrigger: this.status.lastTrigger,
        },
      );

      this.emit("recoveryEscalated", {
        attempts: this.status.recoveryAttempts,
        maxAttempts: this.maxRecoveryAttempts,
        lastTrigger: this.status.lastTrigger,
      });

      return;
    }

    try {
      // Circuit breaker pattern: Probe first — do a single health check
      // while still in kill-switch state before attempting full recovery
      logger.info("Auto-recovery: Running circuit-breaker probe", {
        attempt: this.status.recoveryAttempts,
      });

      const probeResult = await this.runRecoveryProbe();

      if (!probeResult.passed) {
        logger.warn("Auto-recovery: Circuit-breaker probe failed", {
          attempt: this.status.recoveryAttempts,
          probeErrors: probeResult.errors,
        });

        await this.scheduleNextRecoveryAttempt(
          `Circuit-breaker probe failed: ${probeResult.errors.join("; ")}`,
        );
        return;
      }

      // Probe passed — proceed with full recovery
      logger.info(
        "Auto-recovery: Circuit-breaker probe passed, proceeding with recovery",
        { attempt: this.status.recoveryAttempts },
      );

      // Deactivate the kill switch
      await this.deactivate(
        `Auto-recovery attempt ${this.status.recoveryAttempts}`,
        "system",
      );

      // Verify system health after deactivation
      const health = await this.masterKeyManager.healthCheck();

      if (health.healthy) {
        this.status.recoveredAt = new Date();
        killSwitchRecoveryAttempts.set(0);

        logger.info("Auto-recovery successful", {
          attempt: this.status.recoveryAttempts,
          recoveredAt: this.status.recoveredAt,
        });

        this.emit("autoRecovered", {
          attempt: this.status.recoveryAttempts,
          recoveredAt: this.status.recoveredAt,
        });
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

        await this.scheduleNextRecoveryAttempt(
          `System unhealthy after deactivation`,
          health,
        );
      }
    } catch (error) {
      logger.error("Auto-recovery attempt failed:", error);
      await this.scheduleNextRecoveryAttempt(
        `Error during recovery: ${error}`,
        error,
      );
    }
  }

  /**
   * Circuit-breaker probe: runs a lightweight health check while still
   * in kill-switch state to determine if it's safe to deactivate.
   * Does NOT check the kill-switch status itself since it's expected to be active.
   */
  private async runRecoveryProbe(): Promise<{
    passed: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      // Check HSM connection health (not kill-switch state)
      const hsmStatus = this.hsmService.getSystemStatus();
      if (!hsmStatus.connectionHealth) {
        errors.push("HSM connection unhealthy");
      }

      // Check master key manager health, filtering out kill-switch-related
      // issues since the kill switch is expected to be active during recovery
      const masterKeyHealth = await this.masterKeyManager.healthCheck();
      const relevantIssues = masterKeyHealth.issues.filter(
        (issue) => !issue.toLowerCase().includes("kill switch"),
      );
      if (relevantIssues.length > 0) {
        errors.push(
          `Master key manager unhealthy: ${relevantIssues.join(", ")}`,
        );
      }

      // Check if security thresholds are breached (exclude HSM kill-switch state)
      if (
        this.securityMetrics.failedAuthentications >=
        this.thresholds.maxFailedAuth
      ) {
        errors.push(
          `Failed auth threshold still exceeded: ${this.securityMetrics.failedAuthentications}/${this.thresholds.maxFailedAuth}`,
        );
      }

      if (
        this.securityMetrics.suspiciousRequests >=
        this.thresholds.maxSuspiciousRequests
      ) {
        errors.push(
          `Suspicious requests threshold still exceeded: ${this.securityMetrics.suspiciousRequests}/${this.thresholds.maxSuspiciousRequests}`,
        );
      }
    } catch (error) {
      errors.push(`Probe error: ${error}`);
    }

    return {
      passed: errors.length === 0,
      errors,
    };
  }

  /**
   * Schedule the next recovery attempt with exponential backoff.
   * Doubles the base delay each attempt, capped at 240 minutes (4 hours).
   */
  private async scheduleNextRecoveryAttempt(
    reason: string,
    context?: any,
  ): Promise<void> {
    const baseDelay =
      this.currentRecoveryDelay ??
      RECOVERY_DELAY_MAP[this.status.lastTrigger?.source ?? "automated"] ?? 5;
    const nextDelay = Math.min(
      baseDelay * Math.pow(2, this.status.recoveryAttempts),
      240, // cap at 4 hours
    );

    logger.warn("Auto-recovery: Scheduling next attempt with exponential backoff", {
      attempt: this.status.recoveryAttempts,
      nextDelay,
      reason,
      context,
    });

    this.enableAutoRecovery(nextDelay);

    this.emit("autoRecoveryFailed", {
      attempt: this.status.recoveryAttempts,
      reason,
      nextDelay,
      context,
    });
  }

  /**
   * Schedule auto-recovery on activation if autoRecoveryEnabled is true.
   * Uses the trigger source to determine the initial delay.
   */
  private scheduleAutoRecoveryIfEnabled(): void {
    if (this.status.autoRecoveryEnabled && this.status.lastTrigger) {
      const delayMinutes =
        RECOVERY_DELAY_MAP[this.status.lastTrigger.source] ?? 5;
      logger.info("Scheduling auto-recovery on activation", {
        delayMinutes,
        triggerSource: this.status.lastTrigger.source,
      });
      this.enableAutoRecovery(delayMinutes);
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

    // Reset Prometheus gauge
    killSwitchRecoveryAttempts.set(0);

    logger.info("Kill switch service shutdown completed");
  }
}

export default KillSwitchService;
