/**
 * Cache System Integration
 * 
 * This file demonstrates how to integrate the distributed cache system
 * into the main application.
 */

import { Express } from 'express';
import { initializeCacheSystem, shutdownCacheSystem } from '../services/cache';
import { initializeCacheRoutes } from '../routes/cache';
import { logger } from '../utils/logger';

// Global cache system instance
let cacheSystem: Awaited<ReturnType<typeof initializeCacheSystem>> | null = null;

/**
 * Initialize and integrate cache system into the application
 */
export async function integrateCacheSystem(app: Express): Promise<void> {
  try {
    logger.info('Integrating distributed cache system');

    // Initialize cache system with configuration from environment
    cacheSystem = await initializeCacheSystem({
      cache: {
        nodeId: process.env.CACHE_NODE_ID || `node-${process.pid}`,
        redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
        localCacheSize: parseInt(process.env.CACHE_LOCAL_SIZE || '10000'),
        defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL || '3600000'),
        enableLocalCache: process.env.CACHE_ENABLE_LOCAL !== 'false',
        enableDistributedCache: process.env.CACHE_ENABLE_DISTRIBUTED !== 'false'
      },
      monitor: {
        checkInterval: parseInt(process.env.CACHE_MONITOR_INTERVAL || '60000'),
        hitRateThreshold: parseFloat(process.env.CACHE_HIT_RATE_THRESHOLD || '0.7'),
        latencyThreshold: parseInt(process.env.CACHE_LATENCY_THRESHOLD || '100'),
        errorRateThreshold: parseFloat(process.env.CACHE_ERROR_RATE_THRESHOLD || '0.05')
      },
      warming: {
        batchSize: parseInt(process.env.CACHE_WARMING_BATCH_SIZE || '100'),
        concurrency: parseInt(process.env.CACHE_WARMING_CONCURRENCY || '5')
      }
    });

    // Register cache routes
    const cacheRoutes = initializeCacheRoutes(
      cacheSystem.cacheManager,
      cacheSystem.monitor,
      cacheSystem.warmingStrategy,
      cacheSystem.performanceTester
    );

    app.use('/api/cache', cacheRoutes);

    // Setup event listeners
    setupEventListeners();

    // Warm critical cache on startup
    await warmCriticalCache();

    logger.info('Cache system integrated successfully');
  } catch (error) {
    logger.error('Failed to integrate cache system:', error);
    throw error;
  }
}

/**
 * Shutdown cache system
 */
export async function shutdownCache(): Promise<void> {
  if (cacheSystem) {
    await shutdownCacheSystem(cacheSystem);
    cacheSystem = null;
  }
}

/**
 * Get cache system instance
 */
export function getCacheSystem() {
  if (!cacheSystem) {
    throw new Error('Cache system not initialized');
  }
  return cacheSystem;
}

/**
 * Setup event listeners for cache system
 */
function setupEventListeners(): void {
  if (!cacheSystem) return;

  const { cacheManager, monitor, warmingStrategy } = cacheSystem;

  // Cache manager events
  cacheManager.on('error', (error) => {
    logger.error('Cache manager error:', error);
  });

  cacheManager.on('invalidationReceived', (event) => {
    logger.debug('Cache invalidation received:', {
      type: event.type,
      nodeId: event.nodeId,
      keys: event.keys?.length,
      pattern: event.pattern,
      tags: event.tags
    });
  });

  cacheManager.on('eviction', ({ key }) => {
    logger.debug('Cache entry evicted:', { key });
  });

  cacheManager.on('cacheWarmed', ({ count }) => {
    logger.info('Cache warmed:', { count });
  });

  // Monitor events
  monitor.on('alert', (alert) => {
    logger.warn('Cache alert:', {
      severity: alert.severity,
      type: alert.type,
      message: alert.message
    });

    // Send to external monitoring system if needed
    // sendToMonitoring(alert);
  });

  monitor.on('healthCheck', ({ healthy }) => {
    if (!healthy) {
      logger.error('Cache health check failed');
    }
  });

  // Warming strategy events
  warmingStrategy.on('strategyCompleted', ({ task, strategy }) => {
    logger.info('Cache warming completed:', {
      strategy: strategy.name,
      itemsWarmed: task.itemsWarmed,
      duration: task.duration,
      errors: task.errors
    });
  });

  warmingStrategy.on('strategyFailed', ({ task, strategy, error }) => {
    logger.error('Cache warming failed:', {
      strategy: strategy.name,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  });
}

/**
 * Warm critical cache on startup
 */
async function warmCriticalCache(): Promise<void> {
  if (!cacheSystem) return;

  try {
    logger.info('Warming critical cache on startup');

    // Execute critical-data warming strategy
    await cacheSystem.warmingStrategy.executeStrategy('critical-data');

    logger.info('Critical cache warmed successfully');
  } catch (error) {
    logger.error('Failed to warm critical cache:', error);
    // Don't throw - application should continue even if warming fails
  }
}

/**
 * Helper function to create cache key
 */
export function createCacheKey(...parts: (string | number)[]): string {
  return parts.join(':');
}

/**
 * Helper function to cache database query results
 */
export async function cacheQuery<T>(
  key: string,
  queryFn: () => Promise<T>,
  options?: {
    ttl?: number;
    tags?: string[];
  }
): Promise<T> {
  const { cacheManager } = getCacheSystem();

  return await cacheManager.get(key, queryFn, options);
}

/**
 * Helper function to invalidate cache by entity
 */
export async function invalidateEntity(
  entityType: string,
  entityId?: string | number
): Promise<void> {
  const { cacheManager } = getCacheSystem();

  if (entityId) {
    // Invalidate specific entity
    await cacheManager.invalidatePattern(`${entityType}:${entityId}:*`);
  } else {
    // Invalidate all entities of this type
    await cacheManager.invalidatePattern(`${entityType}:*`);
  }
}

/**
 * Middleware to cache API responses
 */
export function cacheMiddleware(options: {
  ttl?: number;
  keyGenerator?: (req: any) => string;
  tags?: string[];
}) {
  return async (req: any, res: any, next: any) => {
    const { cacheManager } = getCacheSystem();

    // Generate cache key
    const cacheKey = options.keyGenerator
      ? options.keyGenerator(req)
      : `api:${req.method}:${req.path}:${JSON.stringify(req.query)}`;

    try {
      // Try to get from cache
      const cached = await cacheManager.get(cacheKey);

      if (cached !== null) {
        logger.debug('Cache hit for API request:', { key: cacheKey });
        return res.json(cached);
      }

      // Cache miss - intercept response
      const originalJson = res.json.bind(res);
      res.json = async (data: any) => {
        // Cache the response
        await cacheManager.set(cacheKey, data, {
          ttl: options.ttl,
          tags: options.tags
        });

        return originalJson(data);
      };

      next();
    } catch (error) {
      logger.error('Cache middleware error:', error);
      next(); // Continue without caching on error
    }
  };
}

/**
 * Example: Cache user data
 */
export async function getCachedUser(userId: string): Promise<any> {
  return await cacheQuery(
    createCacheKey('user', userId),
    async () => {
      // Load from database
      // return await db.users.findById(userId);
      return { id: userId, name: 'Example User' };
    },
    {
      ttl: 1800000, // 30 minutes
      tags: ['user']
    }
  );
}

/**
 * Example: Invalidate user cache
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  await invalidateEntity('user', userId);
}

/**
 * Example: Cache analytics data
 */
export async function getCachedAnalytics(filters: any): Promise<any> {
  const cacheKey = createCacheKey('analytics', JSON.stringify(filters));

  return await cacheQuery(
    cacheKey,
    async () => {
      // Load from database
      // return await db.analytics.query(filters);
      return { data: 'analytics data' };
    },
    {
      ttl: 300000, // 5 minutes
      tags: ['analytics']
    }
  );
}

/**
 * Example: Invalidate analytics cache
 */
export async function invalidateAnalyticsCache(): Promise<void> {
  await invalidateEntity('analytics');
}

/**
 * Example: Cache configuration
 */
export async function getCachedConfig(configKey: string): Promise<any> {
  return await cacheQuery(
    createCacheKey('config', configKey),
    async () => {
      // Load from database
      // return await db.config.get(configKey);
      return { key: configKey, value: 'config value' };
    },
    {
      ttl: 86400000, // 24 hours
      tags: ['config']
    }
  );
}

/**
 * Example: Warm frequently accessed data
 */
export async function warmFrequentlyAccessedData(): Promise<void> {
  const { warmingStrategy } = getCacheSystem();
  await warmingStrategy.executeStrategy('frequently-accessed');
}

/**
 * Example: Get cache health status
 */
export async function getCacheHealth(): Promise<any> {
  const { monitor } = getCacheSystem();
  return await monitor.generateHealthReport();
}

/**
 * Example: Get cache metrics
 */
export function getCacheMetrics(): any {
  const { cacheManager } = getCacheSystem();
  return cacheManager.getMetrics();
}

export default {
  integrateCacheSystem,
  shutdownCache,
  getCacheSystem,
  createCacheKey,
  cacheQuery,
  invalidateEntity,
  cacheMiddleware,
  getCachedUser,
  invalidateUserCache,
  getCachedAnalytics,
  invalidateAnalyticsCache,
  getCachedConfig,
  warmFrequentlyAccessedData,
  getCacheHealth,
  getCacheMetrics
};
