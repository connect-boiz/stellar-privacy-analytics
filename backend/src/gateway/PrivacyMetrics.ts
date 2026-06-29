import { Request, Response } from "express";
import { MetricsConfig } from "./PrivacyApiGateway";
import { MetricsStore } from "./MetricsStore";
import { logger } from "../utils/logger";

const DEFAULT_FLUSH_INTERVAL = 30000; // 30 seconds
const DEFAULT_MAX_BUFFER_SIZE = 10000;

export interface PrivacyMetric {
  timestamp: Date;
  requestId: string;
  userId?: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  privacyLevel: string;
  policiesApplied: string[];
  transformationsApplied: string[];
  accessDecision: "allow" | "deny";
  dataClassification: string;
  jurisdiction: string;
  apiKeyId?: string;
  ipAddress: string;
  userAgent: string;
}

export interface AggregatedMetrics {
  totalRequests: number;
  successfulRequests: number;
  blockedRequests: number;
  averageResponseTime: number;
  requestsByPrivacyLevel: Record<string, number>;
  requestsByEndpoint: Record<string, number>;
  requestsByPolicy: Record<string, number>;
  requestsByTransformation: Record<string, number>;
  requestsByHour: Array<{ hour: string; count: number }>;
  topBlockedEndpoints: Array<{
    endpoint: string;
    count: number;
    reason: string;
  }>;
  privacyViolations: Array<{
    timestamp: Date;
    policyId: string;
    reason: string;
    userId?: string;
    endpoint: string;
  }>;
}

export interface PrivacyAlert {
  id: string;
  timestamp: Date;
  type:
    | "policy_violation"
    | "rate_limit_exceeded"
    | "unauthorized_access"
    | "data_breach_risk";
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  details: Record<string, any>;
  resolved: boolean;
  resolvedAt?: Date;
}

export class PrivacyMetrics {
  private config: MetricsConfig;
  private metrics: Map<string, PrivacyMetric>;
  private alerts: PrivacyAlert[];
  private aggregationCache: Map<string, AggregatedMetrics>;
  private collectionInterval?: NodeJS.Timeout;

  // Persistence: durable store + flush plumbing (no-ops when persistence is off).
  private store?: MetricsStore;
  private unflushed: PrivacyMetric[] = [];
  private flushInterval?: NodeJS.Timeout;
  private readonly flushIntervalMs: number;
  private readonly maxBufferSize: number;

  constructor(config: MetricsConfig) {
    this.config = config;
    this.metrics = new Map();
    this.alerts = [];
    this.aggregationCache = new Map();

    const persistence = config.persistence;
    this.flushIntervalMs = persistence?.flushInterval ?? DEFAULT_FLUSH_INTERVAL;
    this.maxBufferSize = persistence?.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE;

    if (persistence?.enabled) {
      this.store = new MetricsStore({
        filePath: persistence.filePath,
        retentionPeriod: config.retentionPeriod,
      });
    }
  }

  async start(): Promise<void> {
    if (!this.config.enabled) {
      logger.info("Privacy metrics collection disabled");
      return;
    }

    // Recover historical metrics persisted before the last shutdown/crash so
    // getMetrics() reflects them immediately after a restart.
    if (this.store) {
      try {
        const recovered = this.store.load();
        for (const metric of recovered) {
          this.metrics.set(metric.requestId, metric);
        }
        this.enforceBufferCap();
        logger.info("Recovered persisted privacy metrics", {
          recovered: recovered.length,
          filePath: this.store.getFilePath(),
        });
      } catch (error) {
        logger.error("Failed to recover persisted privacy metrics", {
          error: (error as Error).message,
        });
      }

      // Periodic flush of the in-memory buffer to the durable store.
      this.flushInterval = setInterval(() => {
        this.flush();
      }, this.flushIntervalMs);
    }

    // Start periodic aggregation
    this.collectionInterval = setInterval(() => {
      this.aggregateMetrics();
      this.cleanupOldMetrics();
      this.checkForAlerts();
    }, this.config.collectionInterval);

    logger.info("Privacy metrics collection started", {
      collectionInterval: this.config.collectionInterval,
      retentionPeriod: this.config.retentionPeriod,
      persistence: Boolean(this.store),
      flushInterval: this.store ? this.flushIntervalMs : undefined,
    });
  }

  async stop(): Promise<void> {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
    }

    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = undefined;
    }

    // Final flush so in-flight metrics are not lost on a graceful shutdown.
    this.flush();

    logger.info("Privacy metrics collection stopped");
  }

  recordRequest(req: any, res: Response, responseTime: number): void {
    if (!this.config.enabled) {
      return;
    }

    const metric: PrivacyMetric = {
      timestamp: new Date(),
      requestId: req.requestId || "unknown",
      userId: req.userId,
      endpoint: req.path,
      method: req.method,
      statusCode: res.statusCode,
      responseTime,
      privacyLevel: req.privacyLevel || "unknown",
      policiesApplied: req.appliedPolicies || [],
      transformationsApplied: req.appliedTransformations || [],
      accessDecision: res.statusCode < 400 ? "allow" : "deny",
      dataClassification: req.dataClassification || "unknown",
      jurisdiction: req.jurisdiction || "unknown",
      apiKeyId: req.apiKeyId,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] || "unknown",
    };

    this.metrics.set(metric.requestId, metric);

    if (this.store) {
      this.unflushed.push(metric);
      this.enforceBufferCap();
    }

    // Real-time alert checking for critical events
    if (res.statusCode === 403) {
      this.checkForImmediateAlerts(metric);
    }
  }

  recordResponse(req: any, proxyRes: any): void {
    if (!this.config.enabled) {
      return;
    }

    // Update existing metric with response details
    const existingMetric = this.metrics.get(req.requestId);
    if (existingMetric) {
      existingMetric.statusCode = proxyRes.statusCode;
      existingMetric.accessDecision =
        proxyRes.statusCode < 400 ? "allow" : "deny";

      // Re-queue the updated record; the store de-duplicates by requestId with
      // last-write-wins, so the persisted copy reflects the final status.
      if (this.store) {
        this.unflushed.push(existingMetric);
      }
    }
  }

  async getMetrics(timeRange?: {
    start: Date;
    end: Date;
  }): Promise<AggregatedMetrics> {
    const cacheKey = timeRange
      ? `${timeRange.start.toISOString()}-${timeRange.end.toISOString()}`
      : "all";

    // Check cache first
    const cached = this.aggregationCache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    const filteredMetrics = this.collectMetrics(timeRange);

    const aggregated = this.aggregateMetricsData(filteredMetrics);

    // Cache the result
    this.aggregationCache.set(cacheKey, aggregated);

    return aggregated;
  }

  async getPrivacyViolations(timeRange?: {
    start: Date;
    end: Date;
  }): Promise<PrivacyMetric[]> {
    return this.collectMetrics(timeRange).filter(
      (m) => m.accessDecision === "deny",
    );
  }

  async getAlerts(
    severity?: string,
    resolved?: boolean,
  ): Promise<PrivacyAlert[]> {
    let filteredAlerts = this.alerts;

    if (severity) {
      filteredAlerts = filteredAlerts.filter((a) => a.severity === severity);
    }

    if (resolved !== undefined) {
      filteredAlerts = filteredAlerts.filter((a) => a.resolved === resolved);
    }

    return filteredAlerts.sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );
  }

  async createAlert(
    type: PrivacyAlert["type"],
    severity: PrivacyAlert["severity"],
    message: string,
    details: Record<string, any>,
  ): Promise<PrivacyAlert> {
    const alert: PrivacyAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
      timestamp: new Date(),
      type,
      severity,
      message,
      details,
      resolved: false,
    };

    this.alerts.push(alert);

    logger.warn("Privacy alert created", {
      alertId: alert.id,
      type,
      severity,
      message,
    });

    return alert;
  }

  async resolveAlert(alertId: string): Promise<boolean> {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (!alert) {
      return false;
    }

    alert.resolved = true;
    alert.resolvedAt = new Date();

    logger.info("Privacy alert resolved", {
      alertId,
      resolvedAt: alert.resolvedAt,
    });

    return true;
  }

  async exportMetrics(format: "json" | "csv" | "prometheus"): Promise<string> {
    const aggregated = await this.getMetrics();

    switch (format) {
      case "json":
        return JSON.stringify(aggregated, null, 2);

      case "csv":
        return this.convertToCSV(aggregated);

      case "prometheus":
        return this.convertToPrometheusFormat(aggregated);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  private aggregateMetricsData(metrics: PrivacyMetric[]): AggregatedMetrics {
    const totalRequests = metrics.length;
    const successfulRequests = metrics.filter(
      (m) => m.accessDecision === "allow",
    ).length;
    const blockedRequests = metrics.filter(
      (m) => m.accessDecision === "deny",
    ).length;

    const averageResponseTime =
      totalRequests > 0
        ? metrics.reduce((sum, m) => sum + m.responseTime, 0) / totalRequests
        : 0;

    // Group by privacy level
    const requestsByPrivacyLevel: Record<string, number> = {};
    metrics.forEach((m) => {
      requestsByPrivacyLevel[m.privacyLevel] =
        (requestsByPrivacyLevel[m.privacyLevel] || 0) + 1;
    });

    // Group by endpoint
    const requestsByEndpoint: Record<string, number> = {};
    metrics.forEach((m) => {
      requestsByEndpoint[m.endpoint] =
        (requestsByEndpoint[m.endpoint] || 0) + 1;
    });

    // Group by policy
    const requestsByPolicy: Record<string, number> = {};
    metrics.forEach((m) => {
      m.policiesApplied.forEach((policy) => {
        requestsByPolicy[policy] = (requestsByPolicy[policy] || 0) + 1;
      });
    });

    // Group by transformation
    const requestsByTransformation: Record<string, number> = {};
    metrics.forEach((m) => {
      m.transformationsApplied.forEach((transformation) => {
        requestsByTransformation[transformation] =
          (requestsByTransformation[transformation] || 0) + 1;
      });
    });

    // Group by hour
    const requestsByHour = this.groupByHour(metrics);

    // Top blocked endpoints
    const blockedMetrics = metrics.filter((m) => m.accessDecision === "deny");
    const topBlockedEndpoints = this.getTopBlockedEndpoints(blockedMetrics);

    // Privacy violations
    const privacyViolations = blockedMetrics.map((m) => ({
      timestamp: m.timestamp,
      policyId: m.policiesApplied[0] || "unknown",
      reason: "Access denied",
      userId: m.userId,
      endpoint: m.endpoint,
    }));

    return {
      totalRequests,
      successfulRequests,
      blockedRequests,
      averageResponseTime,
      requestsByPrivacyLevel,
      requestsByEndpoint,
      requestsByPolicy,
      requestsByTransformation,
      requestsByHour,
      topBlockedEndpoints,
      privacyViolations,
    };
  }

  private groupByHour(
    metrics: PrivacyMetric[],
  ): Array<{ hour: string; count: number }> {
    const hourlyCounts = new Map<string, number>();

    metrics.forEach((m) => {
      const hour = m.timestamp.toISOString().substring(0, 13); // YYYY-MM-DDTHH
      hourlyCounts.set(hour, (hourlyCounts.get(hour) || 0) + 1);
    });

    return Array.from(hourlyCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([hour, count]) => ({ hour, count }));
  }

  private getTopBlockedEndpoints(
    blockedMetrics: PrivacyMetric[],
  ): Array<{ endpoint: string; count: number; reason: string }> {
    const endpointCounts = new Map<
      string,
      { count: number; reasons: string[] }
    >();

    blockedMetrics.forEach((m) => {
      const existing = endpointCounts.get(m.endpoint) || {
        count: 0,
        reasons: [],
      };
      existing.count++;
      if (
        m.policiesApplied.length > 0 &&
        !existing.reasons.includes(m.policiesApplied[0])
      ) {
        existing.reasons.push(m.policiesApplied[0]);
      }
      endpointCounts.set(m.endpoint, existing);
    });

    return Array.from(endpointCounts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([endpoint, data]) => ({
        endpoint,
        count: data.count,
        reason: data.reasons.join(", "),
      }));
  }

  private aggregateMetrics(): void {
    // Update cache with latest aggregations
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    this.getMetrics({ start: last24Hours, end: now }).catch((error) => {
      logger.error("Failed to aggregate metrics:", error);
    });
  }

  /**
   * Build the working set for aggregation/queries. With persistence enabled the
   * durable store is the source of truth (so trimmed-from-memory and recovered
   * records are included), overlaid with not-yet-flushed records. Without it,
   * the in-memory map is used as before.
   */
  private collectMetrics(timeRange?: {
    start: Date;
    end: Date;
  }): PrivacyMetric[] {
    if (!this.store) {
      let arr = Array.from(this.metrics.values());
      if (timeRange) {
        arr = arr.filter(
          (m) => m.timestamp >= timeRange.start && m.timestamp <= timeRange.end,
        );
      }
      return arr;
    }

    const merged = new Map<string, PrivacyMetric>();
    for (const metric of this.store.load(timeRange)) {
      merged.set(metric.requestId, metric);
    }
    for (const metric of this.unflushed) {
      if (
        timeRange &&
        (metric.timestamp < timeRange.start || metric.timestamp > timeRange.end)
      ) {
        continue;
      }
      merged.set(metric.requestId, metric);
    }

    return Array.from(merged.values());
  }

  /**
   * Persist buffered metrics to the durable store. On failure the batch is
   * re-queued so the next interval retries rather than dropping records.
   */
  private flush(): void {
    if (!this.store || this.unflushed.length === 0) {
      return;
    }

    const batch = this.unflushed;
    this.unflushed = [];

    try {
      this.store.append(batch);
    } catch (error) {
      this.unflushed = batch.concat(this.unflushed);
      logger.error("Failed to flush privacy metrics to durable store", {
        pending: this.unflushed.length,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Bound the in-memory map. Only safe with persistence on, where evicted
   * (oldest, insertion-ordered) records remain durable in the store/flush queue.
   */
  private enforceBufferCap(): void {
    if (!this.store) {
      return;
    }

    let overflow = this.metrics.size - this.maxBufferSize;
    if (overflow <= 0) {
      return;
    }

    for (const id of this.metrics.keys()) {
      if (overflow <= 0) {
        break;
      }
      this.metrics.delete(id);
      overflow--;
    }
  }

  private cleanupOldMetrics(): void {
    const cutoff = new Date(Date.now() - this.config.retentionPeriod);
    const beforeCount = this.metrics.size;

    for (const [id, metric] of this.metrics) {
      if (metric.timestamp <= cutoff) {
        this.metrics.delete(id);
      }
    }

    const removed = beforeCount - this.metrics.size;
    if (removed > 0) {
      logger.debug(`Cleaned up ${removed} old privacy metrics`);
    }

    // Drop expired records from the durable store as well.
    if (this.store) {
      this.flush();
      this.store.compact();
    }

    // Clean up old alerts
    const alertCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
    const beforeAlertCount = this.alerts.length;

    this.alerts = this.alerts.filter((a) => a.timestamp > alertCutoff);

    const removedAlerts = beforeAlertCount - this.alerts.length;
    if (removedAlerts > 0) {
      logger.debug(`Cleaned up ${removedAlerts} old privacy alerts`);
    }
  }

  private checkForAlerts(): void {
    const now = new Date();
    const last5Minutes = new Date(now.getTime() - 5 * 60 * 1000);
    const recentMetrics = Array.from(this.metrics.values()).filter(
      (m) => m.timestamp > last5Minutes,
    );

    // Check for high denial rate
    const recentDenials = recentMetrics.filter(
      (m) => m.accessDecision === "deny",
    );
    const denialRate =
      recentMetrics.length > 0
        ? recentDenials.length / recentMetrics.length
        : 0;

    if (denialRate > 0.1) {
      // More than 10% denial rate
      this.createAlert(
        "policy_violation",
        "high",
        `High denial rate detected: ${(denialRate * 100).toFixed(1)}%`,
        {
          denialRate,
          totalRequests: recentMetrics.length,
          deniedRequests: recentDenials.length,
          timeWindow: "5 minutes",
        },
      );
    }

    // Check for repeated violations from same user
    const violationsByUser = new Map<string, number>();
    recentDenials.forEach((m) => {
      if (m.userId) {
        violationsByUser.set(
          m.userId,
          (violationsByUser.get(m.userId) || 0) + 1,
        );
      }
    });

    violationsByUser.forEach((count, userId) => {
      if (count > 10) {
        // More than 10 violations in 5 minutes
        this.createAlert(
          "unauthorized_access",
          "critical",
          `Multiple access violations from user: ${userId}`,
          {
            userId,
            violationCount: count,
            timeWindow: "5 minutes",
          },
        );
      }
    });
  }

  private checkForImmediateAlerts(metric: PrivacyMetric): void {
    // Immediate alerts for critical events
    if (
      metric.statusCode === 403 &&
      metric.policiesApplied.includes("sensitive-data-protection")
    ) {
      this.createAlert(
        "data_breach_risk",
        "critical",
        `Attempted access to sensitive data blocked`,
        {
          userId: metric.userId,
          endpoint: metric.endpoint,
          ipAddress: metric.ipAddress,
          policiesApplied: metric.policiesApplied,
        },
      );
    }
  }

  private isCacheValid(aggregated: AggregatedMetrics): boolean {
    // Simple cache validity check - in production, use timestamps
    return true;
  }

  private convertToCSV(aggregated: AggregatedMetrics): string {
    const headers = ["Metric", "Value", "Details"];

    const rows = [
      ["Total Requests", aggregated.totalRequests.toString(), ""],
      ["Successful Requests", aggregated.successfulRequests.toString(), ""],
      ["Blocked Requests", aggregated.blockedRequests.toString(), ""],
      [
        "Average Response Time",
        aggregated.averageResponseTime.toFixed(2) + "ms",
        "",
      ],
    ];

    // Add privacy level breakdown
    Object.entries(aggregated.requestsByPrivacyLevel).forEach(
      ([level, count]) => {
        rows.push([`Requests - ${level}`, count.toString(), ""]);
      },
    );

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    return csvContent;
  }

  private convertToPrometheusFormat(aggregated: AggregatedMetrics): string {
    const metrics = [];

    metrics.push(
      `# HELP stellar_privacy_total_requests Total number of requests`,
    );
    metrics.push(`# TYPE stellar_privacy_total_requests counter`);
    metrics.push(`stellar_privacy_total_requests ${aggregated.totalRequests}`);

    metrics.push(
      `# HELP stellar_privacy_successful_requests Number of successful requests`,
    );
    metrics.push(`# TYPE stellar_privacy_successful_requests counter`);
    metrics.push(
      `stellar_privacy_successful_requests ${aggregated.successfulRequests}`,
    );

    metrics.push(
      `# HELP stellar_privacy_blocked_requests Number of blocked requests`,
    );
    metrics.push(`# TYPE stellar_privacy_blocked_requests counter`);
    metrics.push(
      `stellar_privacy_blocked_requests ${aggregated.blockedRequests}`,
    );

    metrics.push(
      `# HELP stellar_privacy_average_response_time Average response time in milliseconds`,
    );
    metrics.push(`# TYPE stellar_privacy_average_response_time gauge`);
    metrics.push(
      `stellar_privacy_average_response_time ${aggregated.averageResponseTime}`,
    );

    // Privacy level metrics
    Object.entries(aggregated.requestsByPrivacyLevel).forEach(
      ([level, count]) => {
        metrics.push(
          `stellar_privacy_requests_by_privacy_level{privacy_level="${level}"} ${count}`,
        );
      },
    );

    return metrics.join("\n");
  }

  public getStats(): {
    totalMetrics: number;
    totalAlerts: number;
    activeAlerts: number;
    cacheSize: number;
    enabled: boolean;
    persistenceEnabled: boolean;
    pendingFlush: number;
  } {
    return {
      totalMetrics: this.metrics.size,
      totalAlerts: this.alerts.length,
      activeAlerts: this.alerts.filter((a) => !a.resolved).length,
      cacheSize: this.aggregationCache.size,
      enabled: this.config.enabled,
      persistenceEnabled: Boolean(this.store),
      pendingFlush: this.unflushed.length,
    };
  }
}
