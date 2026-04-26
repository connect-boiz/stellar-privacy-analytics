import { logger } from '../utils/logger';
import { EnhancedRateLimiter, RateLimitMetrics } from '../middleware/enhancedRateLimiter';

export interface RateLimitAlert {
  id: string;
  type: 'HIGH_BLOCK_RATE' | 'BURST_DETECTED' | 'COLLISION_DETECTED' | 'ADAPTIVE_THRESHOLD' | 'REDIS_FAILURE';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  metrics: Partial<RateLimitMetrics>;
  details?: any;
}

export interface MonitoringConfig {
  alertThresholds: {
    blockRate: number; // Percentage of blocked requests
    collisionRate: number; // Number of collisions per minute
    burstRate: number; // Number of burst triggers per minute
    adaptiveAdjustments: number; // Number of adaptive adjustments per minute
  };
  alerting: {
    enabled: boolean;
    webhookUrl?: string;
    slackChannel?: string;
    emailRecipients?: string[];
  };
  monitoring: {
    enabled: boolean;
    metricsInterval: number; // milliseconds
    retentionPeriod: number; // milliseconds
  };
}

export class RateLimitMonitor {
  private rateLimiters: Map<string, EnhancedRateLimiter> = new Map();
  private alerts: RateLimitAlert[] = [];
  private metrics: RateLimitMetrics[] = [];
  private config: MonitoringConfig;
  private monitoringInterval?: NodeJS.Timeout;

  constructor(config: Partial<MonitoringConfig> = {}) {
    this.config = {
      alertThresholds: {
        blockRate: 0.1, // 10% block rate
        collisionRate: 5, // 5 collisions per minute
        burstRate: 3, // 3 burst triggers per minute
        adaptiveAdjustments: 10 // 10 adaptive adjustments per minute
      },
      alerting: {
        enabled: true
      },
      monitoring: {
        enabled: true,
        metricsInterval: 30000, // 30 seconds
        retentionPeriod: 24 * 60 * 60 * 1000 // 24 hours
      },
      ...config
    };

    if (this.config.monitoring.enabled) {
      this.startMonitoring();
    }
  }

  /**
   * Register a rate limiter for monitoring
   */
  registerRateLimiter(name: string, rateLimiter: EnhancedRateLimiter): void {
    this.rateLimiters.set(name, rateLimiter);
    logger.info('Rate limiter registered for monitoring', { name });
  }

  /**
   * Start continuous monitoring
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
      this.analyzeMetrics();
      this.cleanupOldData();
    }, this.config.monitoring.metricsInterval);

    logger.info('Rate limit monitoring started', {
      interval: this.config.monitoring.metricsInterval,
      retentionPeriod: this.config.monitoring.retentionPeriod
    });
  }

  /**
   * Collect metrics from all registered rate limiters
   */
  private collectMetrics(): void {
    const timestamp = new Date();
    let aggregatedMetrics: RateLimitMetrics = {
      totalRequests: 0,
      blockedRequests: 0,
      bypassedRequests: 0,
      averageRequestRate: 0,
      peakRequestRate: 0,
      collisionCount: 0,
      adaptiveAdjustments: 0
    };

    for (const [name, rateLimiter] of this.rateLimiters.entries()) {
      const metrics = rateLimiter.getEnhancedMetrics();
      
      // Aggregate metrics
      aggregatedMetrics.totalRequests += metrics.totalRequests;
      aggregatedMetrics.blockedRequests += metrics.blockedRequests;
      aggregatedMetrics.bypassedRequests += metrics.bypassedRequests;
      aggregatedMetrics.collisionCount += metrics.collisionCount;
      aggregatedMetrics.adaptiveAdjustments += metrics.adaptiveAdjustments;
      
      // Track peak rate
      aggregatedMetrics.peakRequestRate = Math.max(
        aggregatedMetrics.peakRequestRate,
        metrics.peakRequestRate
      );
    }

    // Calculate average request rate
    const timeWindow = this.config.monitoring.metricsInterval / 1000; // Convert to seconds
    aggregatedMetrics.averageRequestRate = aggregatedMetrics.totalRequests / timeWindow;

    // Store metrics with timestamp
    this.metrics.push({
      ...aggregatedMetrics,
      timestamp: timestamp.getTime() as any
    });

    logger.debug('Rate limit metrics collected', aggregatedMetrics);
  }

  /**
   * Analyze metrics and trigger alerts if necessary
   */
  private analyzeMetrics(): void {
    if (this.metrics.length === 0) return;

    const latestMetrics = this.metrics[this.metrics.length - 1];
    const previousMetrics = this.metrics.length > 1 ? this.metrics[this.metrics.length - 2] : null;

    // Check block rate threshold
    if (latestMetrics.totalRequests > 0) {
      const blockRate = latestMetrics.blockedRequests / latestMetrics.totalRequests;
      if (blockRate > this.config.alertThresholds.blockRate) {
        this.triggerAlert({
          id: `block-rate-${Date.now()}`,
          type: 'HIGH_BLOCK_RATE',
          severity: blockRate > 0.5 ? 'critical' : blockRate > 0.3 ? 'high' : 'medium',
          message: `High block rate detected: ${(blockRate * 100).toFixed(2)}%`,
          timestamp: new Date(),
          metrics: latestMetrics,
          details: { blockRate, threshold: this.config.alertThresholds.blockRate }
        });
      }
    }

    // Check collision rate
    if (previousMetrics) {
      const collisionRate = latestMetrics.collisionCount - previousMetrics.collisionCount;
      if (collisionRate > this.config.alertThresholds.collisionRate) {
        this.triggerAlert({
          id: `collision-rate-${Date.now()}`,
          type: 'COLLISION_DETECTED',
          severity: collisionRate > 20 ? 'critical' : collisionRate > 10 ? 'high' : 'medium',
          message: `High collision rate detected: ${collisionRate} collisions per interval`,
          timestamp: new Date(),
          metrics: latestMetrics,
          details: { collisionRate, threshold: this.config.alertThresholds.collisionRate }
        });
      }
    }

    // Check adaptive adjustment rate
    if (latestMetrics.adaptiveAdjustments > this.config.alertThresholds.adaptiveAdjustments) {
      this.triggerAlert({
        id: `adaptive-adjustments-${Date.now()}`,
        type: 'ADAPTIVE_THRESHOLD',
        severity: 'medium',
        message: `High adaptive adjustment rate: ${latestMetrics.adaptiveAdjustments} adjustments`,
        timestamp: new Date(),
        metrics: latestMetrics,
        details: { 
          adjustments: latestMetrics.adaptiveAdjustments, 
          threshold: this.config.alertThresholds.adaptiveAdjustments 
        }
      });
    }
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(alert: RateLimitAlert): void {
    this.alerts.push(alert);
    
    logger.warn('Rate limit alert triggered', alert);
    
    if (this.config.alerting.enabled) {
      this.sendAlert(alert);
    }
  }

  /**
   * Send alert to configured destinations
   */
  private async sendAlert(alert: RateLimitAlert): Promise<void> {
    const promises: Promise<void>[] = [];

    // Webhook alert
    if (this.config.alerting.webhookUrl) {
      promises.push(this.sendWebhookAlert(alert));
    }

    // Slack alert
    if (this.config.alerting.slackChannel) {
      promises.push(this.sendSlackAlert(alert));
    }

    // Email alert
    if (this.config.alerting.emailRecipients?.length) {
      promises.push(this.sendEmailAlert(alert));
    }

    try {
      await Promise.allSettled(promises);
    } catch (error) {
      logger.error('Failed to send alerts', { error, alertId: alert.id });
    }
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(alert: RateLimitAlert): Promise<void> {
    if (!this.config.alerting.webhookUrl) return;

    try {
      const response = await fetch(this.config.alerting.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          alert,
          service: 'stellar-privacy-analytics',
          timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error(`Webhook failed with status: ${response.status}`);
      }

      logger.info('Webhook alert sent successfully', { alertId: alert.id });
    } catch (error) {
      logger.error('Failed to send webhook alert', { error, alertId: alert.id });
    }
  }

  /**
   * Send Slack alert
   */
  private async sendSlackAlert(alert: RateLimitAlert): Promise<void> {
    if (!this.config.alerting.slackChannel) return;

    try {
      const slackMessage = {
        channel: this.config.alerting.slackChannel,
        text: `🚨 Rate Limit Alert: ${alert.type}`,
        attachments: [
          {
            color: this.getSeverityColor(alert.severity),
            fields: [
              {
                title: 'Alert Type',
                value: alert.type,
                short: true
              },
              {
                title: 'Severity',
                value: alert.severity,
                short: true
              },
              {
                title: 'Message',
                value: alert.message,
                short: false
              },
              {
                title: 'Timestamp',
                value: alert.timestamp.toISOString(),
                short: true
              }
            ]
          }
        ]
      };

      // In production, integrate with actual Slack API
      logger.info('Slack alert would be sent', { alertId: alert.id, message: slackMessage });
    } catch (error) {
      logger.error('Failed to send Slack alert', { error, alertId: alert.id });
    }
  }

  /**
   * Send email alert
   */
  private async sendEmailAlert(alert: RateLimitAlert): Promise<void> {
    if (!this.config.alerting.emailRecipients?.length) return;

    try {
      // In production, integrate with actual email service
      logger.info('Email alert would be sent', { 
        alertId: alert.id, 
        recipients: this.config.alerting.emailRecipients 
      });
    } catch (error) {
      logger.error('Failed to send email alert', { error, alertId: alert.id });
    }
  }

  /**
   * Get color for Slack message based on severity
   */
  private getSeverityColor(severity: RateLimitAlert['severity']): string {
    switch (severity) {
      case 'critical': return 'danger';
      case 'high': return 'warning';
      case 'medium': return 'good';
      case 'low': return '#36a64f';
      default: return 'good';
    }
  }

  /**
   * Clean up old metrics and alerts
   */
  private cleanupOldData(): void {
    const cutoffTime = Date.now() - this.config.monitoring.retentionPeriod;
    
    // Clean up old metrics
    this.metrics = this.metrics.filter(metric => 
      (metric.timestamp as any) > cutoffTime
    );
    
    // Clean up old alerts (keep last 100)
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }
  }

  /**
   * Get current metrics summary
   */
  getMetricsSummary(): {
    current: RateLimitMetrics | null;
    alerts: RateLimitAlert[];
    trends: {
      blockRate: number;
      collisionRate: number;
      adaptiveRate: number;
    };
  } {
    const current = this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;
    const recentAlerts = this.alerts.slice(-10);
    
    let trends = { blockRate: 0, collisionRate: 0, adaptiveRate: 0 };
    
    if (this.metrics.length > 1) {
      const latest = this.metrics[this.metrics.length - 1];
      const previous = this.metrics[this.metrics.length - 2];
      
      trends.blockRate = (latest.blockedRequests - previous.blockedRequests) / latest.totalRequests;
      trends.collisionRate = latest.collisionCount - previous.collisionCount;
      trends.adaptiveRate = latest.adaptiveAdjustments - previous.adaptiveAdjustments;
    }
    
    return {
      current,
      alerts: recentAlerts,
      trends
    };
  }

  /**
   * Get detailed metrics history
   */
  getMetricsHistory(limit?: number): RateLimitMetrics[] {
    if (limit) {
      return this.metrics.slice(-limit);
    }
    return this.metrics;
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit?: number): RateLimitAlert[] {
    if (limit) {
      return this.alerts.slice(-limit);
    }
    return this.alerts;
  }

  /**
   * Update monitoring configuration
   */
  updateConfig(newConfig: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Rate limit monitoring configuration updated', this.config);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      logger.info('Rate limit monitoring stopped');
    }
  }

  /**
   * Reset all metrics and alerts
   */
  reset(): void {
    this.metrics = [];
    this.alerts = [];
    
    // Reset all registered rate limiters
    for (const rateLimiter of this.rateLimiters.values()) {
      rateLimiter.resetEnhancedMetrics();
    }
    
    logger.info('Rate limit monitoring reset');
  }
}

// Global monitor instance
export const rateLimitMonitor = new RateLimitMonitor();

export default RateLimitMonitor;
