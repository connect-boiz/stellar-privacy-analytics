import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { DistributedCacheManager, CacheMetrics } from './DistributedCacheManager';

export interface CacheAlert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  message: string;
  timestamp: Date;
  metrics?: any;
  resolved: boolean;
}

export interface CacheHealthReport {
  timestamp: Date;
  overall: 'healthy' | 'degraded' | 'unhealthy';
  hitRate: number;
  latency: number;
  errorRate: number;
  consistency: number;
  freshness: number;
  alerts: CacheAlert[];
  recommendations: string[];
}

export interface MonitorConfig {
  checkInterval: number;
  hitRateThreshold: number;
  latencyThreshold: number;
  errorRateThreshold: number;
  consistencyCheckInterval: number;
  freshnessCheckInterval: number;
  alertRetentionDays: number;
}

/**
 * Cache Monitor for tracking cache health, consistency, and performance
 */
export class CacheMonitor extends EventEmitter {
  private config: MonitorConfig;
  private cacheManager: DistributedCacheManager;
  private alerts: CacheAlert[] = [];
  private monitorTimer?: NodeJS.Timeout;
  private consistencyTimer?: NodeJS.Timeout;
  private freshnessTimer?: NodeJS.Timeout;
  private metricsHistory: Array<{ timestamp: Date; metrics: CacheMetrics }> = [];
  private isMonitoring: boolean = false;

  constructor(
    cacheManager: DistributedCacheManager,
    config?: Partial<MonitorConfig>
  ) {
    super();

    this.cacheManager = cacheManager;
    this.config = {
      checkInterval: config?.checkInterval || 60000, // 1 minute
      hitRateThreshold: config?.hitRateThreshold || 0.7, // 70%
      latencyThreshold: config?.latencyThreshold || 100, // 100ms
      errorRateThreshold: config?.errorRateThreshold || 0.05, // 5%
      consistencyCheckInterval: config?.consistencyCheckInterval || 300000, // 5 minutes
      freshnessCheckInterval: config?.freshnessCheckInterval || 180000, // 3 minutes
      alertRetentionDays: config?.alertRetentionDays || 7
    };
  }

  /**
   * Start monitoring
   */
  start(): void {
    if (this.isMonitoring) {
      logger.warn('Cache monitor already running');
      return;
    }

    // Start periodic health checks
    this.monitorTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.checkInterval);

    // Start consistency checks
    this.consistencyTimer = setInterval(() => {
      this.checkConsistency();
    }, this.config.consistencyCheckInterval);

    // Start freshness checks
    this.freshnessTimer = setInterval(() => {
      this.checkFreshness();
    }, this.config.freshnessCheckInterval);

    this.isMonitoring = true;

    logger.info('Cache monitor started', {
      checkInterval: this.config.checkInterval,
      consistencyCheckInterval: this.config.consistencyCheckInterval,
      freshnessCheckInterval: this.config.freshnessCheckInterval
    });

    this.emit('started');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = undefined;
    }

    if (this.consistencyTimer) {
      clearInterval(this.consistencyTimer);
      this.consistencyTimer = undefined;
    }

    if (this.freshnessTimer) {
      clearInterval(this.freshnessTimer);
      this.freshnessTimer = undefined;
    }

    this.isMonitoring = false;

    logger.info('Cache monitor stopped');
    this.emit('stopped');
  }

  /**
   * Perform health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const metrics = this.cacheManager.getMetrics();
      const timestamp = new Date();

      // Store metrics history
      this.metricsHistory.push({ timestamp, metrics });
      
      // Keep only last 1000 entries
      if (this.metricsHistory.length > 1000) {
        this.metricsHistory = this.metricsHistory.slice(-1000);
      }

      // Check hit rate
      if (metrics.hitRate < this.config.hitRateThreshold) {
        this.createAlert({
          severity: metrics.hitRate < 0.5 ? 'high' : 'medium',
          type: 'low_hit_rate',
          message: `Cache hit rate is ${(metrics.hitRate * 100).toFixed(2)}% (threshold: ${(this.config.hitRateThreshold * 100).toFixed(2)}%)`,
          metrics: { hitRate: metrics.hitRate }
        });
      }

      // Check latency
      if (metrics.averageLatency > this.config.latencyThreshold) {
        this.createAlert({
          severity: metrics.averageLatency > this.config.latencyThreshold * 2 ? 'high' : 'medium',
          type: 'high_latency',
          message: `Average cache latency is ${metrics.averageLatency.toFixed(2)}ms (threshold: ${this.config.latencyThreshold}ms)`,
          metrics: { latency: metrics.averageLatency }
        });
      }

      // Check error rate
      const errorRate = metrics.totalRequests > 0 ? metrics.errors / metrics.totalRequests : 0;
      if (errorRate > this.config.errorRateThreshold) {
        this.createAlert({
          severity: errorRate > this.config.errorRateThreshold * 2 ? 'critical' : 'high',
          type: 'high_error_rate',
          message: `Cache error rate is ${(errorRate * 100).toFixed(2)}% (threshold: ${(this.config.errorRateThreshold * 100).toFixed(2)}%)`,
          metrics: { errorRate, errors: metrics.errors, totalRequests: metrics.totalRequests }
        });
      }

      // Check if cache is healthy
      if (!metrics.isHealthy) {
        this.createAlert({
          severity: 'critical',
          type: 'unhealthy',
          message: 'Cache health check failed',
          metrics
        });
      }

      this.emit('healthCheck', { timestamp, metrics });
    } catch (error) {
      logger.error('Error performing health check:', error);
      this.createAlert({
        severity: 'high',
        type: 'monitor_error',
        message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  }

  /**
   * Check cache consistency across nodes
   */
  private async checkConsistency(): Promise<void> {
    try {
      const stats = await this.cacheManager.getStatistics();
      
      // Calculate consistency score based on invalidation events
      const metrics = this.cacheManager.getMetrics();
      const consistencyScore = this.calculateConsistencyScore(metrics);

      if (consistencyScore < 0.9) {
        this.createAlert({
          severity: consistencyScore < 0.7 ? 'high' : 'medium',
          type: 'consistency_issue',
          message: `Cache consistency score is ${(consistencyScore * 100).toFixed(2)}%`,
          metrics: { consistencyScore, stats }
        });
      }

      this.emit('consistencyCheck', { consistencyScore, stats });
    } catch (error) {
      logger.error('Error checking consistency:', error);
    }
  }

  /**
   * Check data freshness
   */
  private async checkFreshness(): Promise<void> {
    try {
      const stats = await this.cacheManager.getStatistics();
      const metrics = this.cacheManager.getMetrics();
      
      // Calculate freshness score
      const freshnessScore = this.calculateFreshnessScore(metrics);

      if (freshnessScore < 0.8) {
        this.createAlert({
          severity: freshnessScore < 0.6 ? 'medium' : 'low',
          type: 'stale_data',
          message: `Cache freshness score is ${(freshnessScore * 100).toFixed(2)}%`,
          metrics: { freshnessScore }
        });
      }

      this.emit('freshnessCheck', { freshnessScore, stats });
    } catch (error) {
      logger.error('Error checking freshness:', error);
    }
  }

  /**
   * Calculate consistency score
   */
  private calculateConsistencyScore(metrics: CacheMetrics): number {
    // Higher invalidation rate relative to requests indicates better consistency
    const invalidationRate = metrics.totalRequests > 0 
      ? metrics.invalidations / metrics.totalRequests 
      : 1;

    // Normalize to 0-1 range (assuming 10% invalidation rate is optimal)
    const optimalRate = 0.1;
    const score = Math.min(1, invalidationRate / optimalRate);

    return score;
  }

  /**
   * Calculate freshness score
   */
  private calculateFreshnessScore(metrics: CacheMetrics): number {
    // Higher hit rate indicates fresher data
    // Lower error rate indicates better data quality
    const errorRate = metrics.totalRequests > 0 
      ? metrics.errors / metrics.totalRequests 
      : 0;

    const freshnessScore = metrics.hitRate * (1 - errorRate);
    return Math.max(0, Math.min(1, freshnessScore));
  }

  /**
   * Create alert
   */
  private createAlert(alert: Omit<CacheAlert, 'id' | 'timestamp' | 'resolved'>): void {
    const newAlert: CacheAlert = {
      id: this.generateAlertId(),
      timestamp: new Date(),
      resolved: false,
      ...alert
    };

    this.alerts.push(newAlert);

    // Clean up old alerts
    this.cleanupOldAlerts();

    logger.warn('Cache alert created', newAlert);
    this.emit('alert', newAlert);
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      this.emit('alertResolved', alert);
    }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): CacheAlert[] {
    return this.alerts.filter(a => !a.resolved);
  }

  /**
   * Get all alerts
   */
  getAllAlerts(): CacheAlert[] {
    return [...this.alerts];
  }

  /**
   * Generate health report
   */
  async generateHealthReport(): Promise<CacheHealthReport> {
    const metrics = this.cacheManager.getMetrics();
    const stats = await this.cacheManager.getStatistics();
    const activeAlerts = this.getActiveAlerts();

    // Calculate scores
    const consistencyScore = this.calculateConsistencyScore(metrics);
    const freshnessScore = this.calculateFreshnessScore(metrics);
    const errorRate = metrics.totalRequests > 0 
      ? metrics.errors / metrics.totalRequests 
      : 0;

    // Determine overall health
    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (!metrics.isHealthy || activeAlerts.some(a => a.severity === 'critical')) {
      overall = 'unhealthy';
    } else if (
      metrics.hitRate < this.config.hitRateThreshold ||
      metrics.averageLatency > this.config.latencyThreshold ||
      activeAlerts.length > 0
    ) {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(metrics, stats, consistencyScore, freshnessScore);

    return {
      timestamp: new Date(),
      overall,
      hitRate: metrics.hitRate,
      latency: metrics.averageLatency,
      errorRate,
      consistency: consistencyScore,
      freshness: freshnessScore,
      alerts: activeAlerts,
      recommendations
    };
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    metrics: CacheMetrics,
    stats: any,
    consistencyScore: number,
    freshnessScore: number
  ): string[] {
    const recommendations: string[] = [];

    if (metrics.hitRate < this.config.hitRateThreshold) {
      recommendations.push('Consider increasing cache TTL or implementing cache warming strategies');
      recommendations.push('Review cache key patterns to ensure optimal cache utilization');
    }

    if (metrics.averageLatency > this.config.latencyThreshold) {
      recommendations.push('Optimize cache key serialization/deserialization');
      recommendations.push('Consider increasing local cache size to reduce distributed cache lookups');
    }

    const errorRate = metrics.totalRequests > 0 ? metrics.errors / metrics.totalRequests : 0;
    if (errorRate > this.config.errorRateThreshold) {
      recommendations.push('Investigate cache connection issues and implement better error handling');
      recommendations.push('Review fallback mechanisms for cache failures');
    }

    if (consistencyScore < 0.9) {
      recommendations.push('Review cache invalidation patterns to ensure proper propagation');
      recommendations.push('Consider implementing versioning for cache entries');
    }

    if (freshnessScore < 0.8) {
      recommendations.push('Reduce cache TTL for frequently changing data');
      recommendations.push('Implement proactive cache invalidation on data updates');
    }

    const localUtilization = stats.local.utilizationPercent;
    if (localUtilization > 90) {
      recommendations.push('Local cache is near capacity - consider increasing cache size');
    } else if (localUtilization < 30) {
      recommendations.push('Local cache is underutilized - consider reducing cache size');
    }

    if (metrics.evictions > metrics.totalRequests * 0.1) {
      recommendations.push('High eviction rate detected - increase cache size or reduce TTL');
    }

    return recommendations;
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(duration?: number): Array<{ timestamp: Date; metrics: CacheMetrics }> {
    if (!duration) {
      return [...this.metricsHistory];
    }

    const cutoff = Date.now() - duration;
    return this.metricsHistory.filter(entry => entry.timestamp.getTime() >= cutoff);
  }

  /**
   * Get metrics trend
   */
  getMetricsTrend(metric: keyof CacheMetrics, duration: number = 3600000): {
    current: number;
    average: number;
    min: number;
    max: number;
    trend: 'improving' | 'stable' | 'degrading';
  } {
    const history = this.getMetricsHistory(duration);
    
    if (history.length === 0) {
      return {
        current: 0,
        average: 0,
        min: 0,
        max: 0,
        trend: 'stable'
      };
    }

    const values = history.map(h => h.metrics[metric] as number);
    const current = values[values.length - 1];
    const average = values.reduce((sum, v) => sum + v, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Calculate trend
    const recentValues = values.slice(-10);
    const recentAvg = recentValues.reduce((sum, v) => sum + v, 0) / recentValues.length;
    
    let trend: 'improving' | 'stable' | 'degrading';
    const changePercent = ((recentAvg - average) / average) * 100;
    
    if (Math.abs(changePercent) < 5) {
      trend = 'stable';
    } else if (
      (metric === 'hitRate' && changePercent > 0) ||
      (metric === 'averageLatency' && changePercent < 0) ||
      (metric === 'errors' && changePercent < 0)
    ) {
      trend = 'improving';
    } else {
      trend = 'degrading';
    }

    return { current, average, min, max, trend };
  }

  /**
   * Clean up old alerts
   */
  private cleanupOldAlerts(): void {
    const cutoff = Date.now() - (this.config.alertRetentionDays * 24 * 60 * 60 * 1000);
    this.alerts = this.alerts.filter(alert => 
      alert.timestamp.getTime() >= cutoff || !alert.resolved
    );
  }

  /**
   * Generate alert ID
   */
  private generateAlertId(): string {
    return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default CacheMonitor;
