import { logger } from '../utils/logger';
import * as os from 'os';
import * as v8 from 'v8';
import { EventEmitter } from 'events';

export interface MemoryMetrics {
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  rss: number;
  systemTotal: number;
  systemFree: number;
  systemUsed: number;
  heapUsagePercentage: number;
  systemUsagePercentage: number;
  timestamp: number;
}

export interface MemoryAlert {
  level: 'warning' | 'critical' | 'emergency';
  message: string;
  metrics: MemoryMetrics;
  recommendations: string[];
  timestamp: number;
}

export interface MemoryThresholds {
  heapWarning: number; // percentage
  heapCritical: number; // percentage
  systemWarning: number; // percentage
  systemCritical: number; // percentage
  emergencyCleanupThreshold: number; // percentage
}

export class MemoryMonitorService extends EventEmitter {
  private thresholds: MemoryThresholds;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;
  private metricsHistory: MemoryMetrics[] = [];
  private maxHistorySize: number = 1000;
  private lastCleanupTime: number = 0;
  private cleanupCooldown: number = 30000; // 30 seconds

  constructor(config: {
    thresholds?: Partial<MemoryThresholds>;
    monitoringInterval?: number;
    maxHistorySize?: number;
    cleanupCooldown?: number;
  } = {}) {
    super();

    this.thresholds = {
      heapWarning: 70,
      heapCritical: 85,
      systemWarning: 80,
      systemCritical: 90,
      emergencyCleanupThreshold: 95,
      ...config.thresholds
    };

    this.maxHistorySize = config.maxHistorySize || 1000;
    this.cleanupCooldown = config.cleanupCooldown || 30000;

    logger.info('Memory Monitor Service initialized', {
      thresholds: this.thresholds,
      monitoringInterval: config.monitoringInterval || 5000
    });
  }

  /**
   * Start memory monitoring
   */
  startMonitoring(intervalMs: number = 5000): void {
    if (this.isMonitoring) {
      logger.warn('Memory monitoring is already active');
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, intervalMs);

    logger.info('Memory monitoring started', { intervalMs });
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.isMonitoring = false;
    logger.info('Memory monitoring stopped');
  }

  /**
   * Collect current memory metrics
   */
  collectMetrics(): MemoryMetrics {
    const heapStats = v8.getHeapStatistics();
    const memUsage = process.memoryUsage();
    const systemMem = this.getSystemMemory();

    const metrics: MemoryMetrics = {
      heapUsed: heapStats.used_heap_size,
      heapTotal: heapStats.total_heap_size,
      external: heapStats.external_memory,
      arrayBuffers: heapStats.array_buffers_size,
      rss: memUsage.rss,
      systemTotal: systemMem.total,
      systemFree: systemMem.free,
      systemUsed: systemMem.used,
      heapUsagePercentage: (heapStats.used_heap_size / heapStats.total_heap_size) * 100,
      systemUsagePercentage: (systemMem.used / systemMem.total) * 100,
      timestamp: Date.now()
    };

    // Store in history
    this.addToHistory(metrics);

    // Check thresholds and emit alerts
    this.checkThresholds(metrics);

    return metrics;
  }

  /**
   * Get current memory metrics without storing
   */
  getCurrentMetrics(): MemoryMetrics {
    const heapStats = v8.getHeapStatistics();
    const memUsage = process.memoryUsage();
    const systemMem = this.getSystemMemory();

    return {
      heapUsed: heapStats.used_heap_size,
      heapTotal: heapStats.total_heap_size,
      external: heapStats.external_memory,
      arrayBuffers: heapStats.array_buffers_size,
      rss: memUsage.rss,
      systemTotal: systemMem.total,
      systemFree: systemMem.free,
      systemUsed: systemMem.used,
      heapUsagePercentage: (heapStats.used_heap_size / heapStats.total_heap_size) * 100,
      systemUsagePercentage: (systemMem.used / systemMem.total) * 100,
      timestamp: Date.now()
    };
  }

  /**
   * Get memory metrics history
   */
  getMetricsHistory(limit?: number): MemoryMetrics[] {
    if (limit) {
      return this.metricsHistory.slice(-limit);
    }
    return [...this.metricsHistory];
  }

  /**
   * Force garbage collection if available
   */
  forceGarbageCollection(): boolean {
    if (global.gc) {
      const beforeMetrics = this.getCurrentMetrics();
      global.gc();
      const afterMetrics = this.getCurrentMetrics();
      
      const freed = beforeMetrics.heapUsed - afterMetrics.heapUsed;
      logger.info('Manual garbage collection executed', {
        freedBytes: freed,
        freedMB: Math.round(freed / 1024 / 1024),
        beforeHeapMB: Math.round(beforeMetrics.heapUsed / 1024 / 1024),
        afterHeapMB: Math.round(afterMetrics.heapUsed / 1024 / 1024)
      });
      
      return true;
    } else {
      logger.warn('Garbage collection not available (run with --expose-gc)');
      return false;
    }
  }

  /**
   * Perform emergency memory cleanup
   */
  async performEmergencyCleanup(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCleanupTime < this.cleanupCooldown) {
      logger.warn('Emergency cleanup on cooldown, skipping');
      return;
    }

    logger.warn('Performing emergency memory cleanup');
    const beforeMetrics = this.getCurrentMetrics();

    try {
      // Force garbage collection
      this.forceGarbageCollection();

      // Clear metrics history if it's getting large
      if (this.metricsHistory.length > this.maxHistorySize / 2) {
        this.metricsHistory = this.metricsHistory.slice(-this.maxHistorySize / 2);
        logger.debug('Cleared metrics history to free memory');
      }

      // Emit cleanup event for other services to react
      this.emit('emergency-cleanup', { beforeMetrics, afterMetrics: this.getCurrentMetrics() });

      this.lastCleanupTime = now;

      const afterMetrics = this.getCurrentMetrics();
      const freed = beforeMetrics.heapUsed - afterMetrics.heapUsed;
      
      logger.info('Emergency cleanup completed', {
        freedBytes: freed,
        freedMB: Math.round(freed / 1024 / 1024),
        beforeHeapMB: Math.round(beforeMetrics.heapUsed / 1024 / 1024),
        afterHeapMB: Math.round(afterMetrics.heapUsed / 1024 / 1024)
      });

    } catch (error) {
      logger.error('Emergency cleanup failed', { error: error.message });
    }
  }

  /**
   * Check if memory usage is critical
   */
  isMemoryCritical(): boolean {
    const metrics = this.getCurrentMetrics();
    return (
      metrics.heapUsagePercentage >= this.thresholds.emergencyCleanupThreshold ||
      metrics.systemUsagePercentage >= this.thresholds.emergencyCleanupThreshold
    );
  }

  /**
   * Get memory recommendations based on current usage
   */
  getRecommendations(metrics?: MemoryMetrics): string[] {
    const currentMetrics = metrics || this.getCurrentMetrics();
    const recommendations: string[] = [];

    if (currentMetrics.heapUsagePercentage > this.thresholds.heapWarning) {
      recommendations.push('Consider implementing streaming for large datasets');
      recommendations.push('Reduce batch sizes in data processing');
      recommendations.push('Implement object pooling for frequently created objects');
    }

    if (currentMetrics.systemUsagePercentage > this.thresholds.systemWarning) {
      recommendations.push('Consider horizontal scaling');
      recommendations.push('Implement data partitioning');
      recommendations.push('Add memory-efficient algorithms');
    }

    if (currentMetrics.arrayBuffers > 100 * 1024 * 1024) { // 100MB
      recommendations.push('Large ArrayBuffer usage detected - consider streaming or chunking');
    }

    if (currentMetrics.external > 100 * 1024 * 1024) { // 100MB
      recommendations.push('High external memory usage - check for native module leaks');
    }

    return recommendations;
  }

  /**
   * Add metrics to history
   */
  private addToHistory(metrics: MemoryMetrics): void {
    this.metricsHistory.push(metrics);
    
    // Trim history if it gets too large
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory = this.metricsHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Check thresholds and emit alerts
   */
  private checkThresholds(metrics: MemoryMetrics): void {
    const alerts: MemoryAlert[] = [];

    // Check heap usage
    if (metrics.heapUsagePercentage >= this.thresholds.emergencyCleanupThreshold) {
      alerts.push({
        level: 'emergency',
        message: `Heap usage critical: ${metrics.heapUsagePercentage.toFixed(1)}%`,
        metrics,
        recommendations: [...this.getRecommendations(metrics), 'Immediate cleanup required'],
        timestamp: Date.now()
      });

      // Trigger emergency cleanup
      this.performEmergencyCleanup();
    } else if (metrics.heapUsagePercentage >= this.thresholds.heapCritical) {
      alerts.push({
        level: 'critical',
        message: `Heap usage critical: ${metrics.heapUsagePercentage.toFixed(1)}%`,
        metrics,
        recommendations: this.getRecommendations(metrics),
        timestamp: Date.now()
      });
    } else if (metrics.heapUsagePercentage >= this.thresholds.heapWarning) {
      alerts.push({
        level: 'warning',
        message: `Heap usage high: ${metrics.heapUsagePercentage.toFixed(1)}%`,
        metrics,
        recommendations: this.getRecommendations(metrics),
        timestamp: Date.now()
      });
    }

    // Check system memory
    if (metrics.systemUsagePercentage >= this.thresholds.systemCritical) {
      alerts.push({
        level: 'critical',
        message: `System memory critical: ${metrics.systemUsagePercentage.toFixed(1)}%`,
        metrics,
        recommendations: this.getRecommendations(metrics),
        timestamp: Date.now()
      });
    } else if (metrics.systemUsagePercentage >= this.thresholds.systemWarning) {
      alerts.push({
        level: 'warning',
        message: `System memory high: ${metrics.systemUsagePercentage.toFixed(1)}%`,
        metrics,
        recommendations: this.getRecommendations(metrics),
        timestamp: Date.now()
      });
    }

    // Emit alerts
    alerts.forEach(alert => {
      this.emit('memory-alert', alert);
      logger.warn('Memory alert', {
        level: alert.level,
        message: alert.message,
        heapUsage: `${metrics.heapUsagePercentage.toFixed(1)}%`,
        systemUsage: `${metrics.systemUsagePercentage.toFixed(1)}%`
      });
    });
  }

  /**
   * Get system memory information
   */
  private getSystemMemory(): { total: number; free: number; used: number } {
    const total = os.totalmem();
    const free = os.freemem();
    return {
      total,
      free,
      used: total - free
    };
  }

  /**
   * Get monitoring status
   */
  getStatus(): {
    isMonitoring: boolean;
    thresholds: MemoryThresholds;
    historySize: number;
    lastCleanupTime: number;
  } {
    return {
      isMonitoring: this.isMonitoring,
      thresholds: this.thresholds,
      historySize: this.metricsHistory.length,
      lastCleanupTime: this.lastCleanupTime
    };
  }

  /**
   * Cleanup service
   */
  destroy(): void {
    this.stopMonitoring();
    this.metricsHistory = [];
    this.removeAllListeners();
    logger.info('Memory Monitor Service destroyed');
  }
}

export default MemoryMonitorService;
