/**
 * Distributed Cache System
 * 
 * A comprehensive distributed caching solution with:
 * - Cache coherence protocol for distributed nodes
 * - Automatic cache invalidation event propagation
 * - Performance monitoring and optimization
 * - Cache consistency and freshness tracking
 * - Intelligent cache warming strategies
 * - Fallback mechanisms for cache failures
 * - Performance testing and benchmarking
 */

export { DistributedCacheManager, CacheConfig, CacheEntry, CacheInvalidationEvent, CacheMetrics } from './DistributedCacheManager';
export { CacheMonitor, CacheAlert, CacheHealthReport, MonitorConfig } from './CacheMonitor';
export { CacheWarmingStrategy, WarmingStrategy, WarmingTask, WarmingConfig } from './CacheWarmingStrategy';
export { CachePerformanceTester, PerformanceTestConfig, PerformanceTestResult, LoadTestScenario } from './CachePerformanceTester';

import { DistributedCacheManager, CacheConfig } from './DistributedCacheManager';
import { CacheMonitor, MonitorConfig } from './CacheMonitor';
import { CacheWarmingStrategy, WarmingConfig } from './CacheWarmingStrategy';
import { CachePerformanceTester } from './CachePerformanceTester';
import { logger } from '../../utils/logger';

/**
 * Initialize complete cache system
 */
export async function initializeCacheSystem(config?: {
  cache?: Partial<CacheConfig>;
  monitor?: Partial<MonitorConfig>;
  warming?: Partial<WarmingConfig>;
}): Promise<{
  cacheManager: DistributedCacheManager;
  monitor: CacheMonitor;
  warmingStrategy: CacheWarmingStrategy;
  performanceTester: CachePerformanceTester;
}> {
  try {
    logger.info('Initializing distributed cache system');

    // Initialize cache manager
    const cacheManager = new DistributedCacheManager(config?.cache);
    await cacheManager.initialize();

    // Initialize monitor
    const monitor = new CacheMonitor(cacheManager, config?.monitor);
    monitor.start();

    // Initialize warming strategy
    const warmingStrategy = new CacheWarmingStrategy(cacheManager, config?.warming);
    await warmingStrategy.initialize();

    // Initialize performance tester
    const performanceTester = new CachePerformanceTester(cacheManager);

    // Setup event listeners for monitoring
    cacheManager.on('error', (error) => {
      logger.error('Cache manager error:', error);
    });

    cacheManager.on('invalidationReceived', (event) => {
      logger.debug('Cache invalidation received:', event);
    });

    monitor.on('alert', (alert) => {
      logger.warn('Cache alert:', alert);
    });

    warmingStrategy.on('strategyCompleted', ({ task, strategy }) => {
      logger.info('Cache warming completed:', {
        strategy: strategy.name,
        itemsWarmed: task.itemsWarmed,
        duration: task.duration
      });
    });

    logger.info('Distributed cache system initialized successfully');

    return {
      cacheManager,
      monitor,
      warmingStrategy,
      performanceTester
    };
  } catch (error) {
    logger.error('Failed to initialize cache system:', error);
    throw error;
  }
}

/**
 * Shutdown cache system
 */
export async function shutdownCacheSystem(system: {
  cacheManager: DistributedCacheManager;
  monitor: CacheMonitor;
  warmingStrategy: CacheWarmingStrategy;
}): Promise<void> {
  try {
    logger.info('Shutting down distributed cache system');

    await Promise.all([
      system.warmingStrategy.shutdown(),
      system.cacheManager.shutdown()
    ]);

    system.monitor.stop();

    logger.info('Distributed cache system shutdown completed');
  } catch (error) {
    logger.error('Error during cache system shutdown:', error);
    throw error;
  }
}

export default {
  initializeCacheSystem,
  shutdownCacheSystem,
  DistributedCacheManager,
  CacheMonitor,
  CacheWarmingStrategy,
  CachePerformanceTester
};
