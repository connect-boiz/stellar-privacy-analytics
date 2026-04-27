import { EventEmitter } from 'events';
import { LRUCache } from 'lru-cache';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../../utils/errorHandler';
import type { KeyMetadata } from './KeyManagementService';

export interface CacheConfig {
  maxSize: number;
  ttl: number; // milliseconds
  updateAgeOnGet: boolean;
}

export interface PerformanceMetrics {
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  averageOperationTime: number;
  totalOperations: number;
  batchOperations: number;
  parallelOperations: number;
}

export interface OptimizationStrategy {
  enableCaching: boolean;
  enableBatching: boolean;
  enableParallelization: boolean;
  enablePrefetching: boolean;
  batchSize: number;
  maxParallelOps: number;
  prefetchThreshold: number;
}

/**
 * Performance Optimizer for Cryptographic Operations
 * Provides caching, batching, and parallelization for key operations
 */
export class PerformanceOptimizer extends EventEmitter {
  private keyCache: LRUCache<string, any>;
  private operationQueue: Map<string, any[]> = new Map();
  private operationMetrics: Map<string, number[]> = new Map();
  private strategy: OptimizationStrategy;
  
  private metrics: PerformanceMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    cacheHitRate: 0,
    averageOperationTime: 0,
    totalOperations: 0,
    batchOperations: 0,
    parallelOperations: 0
  };

  private batchTimer: NodeJS.Timeout | null = null;
  private prefetchTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<CacheConfig & OptimizationStrategy>) {
    super();

    const cacheConfig: CacheConfig = {
      maxSize: config?.maxSize || 1000,
      ttl: config?.ttl || 3600000, // 1 hour
      updateAgeOnGet: config?.updateAgeOnGet !== false
    };

    this.strategy = {
      enableCaching: config?.enableCaching !== false,
      enableBatching: config?.enableBatching !== false,
      enableParallelization: config?.enableParallelization !== false,
      enablePrefetching: config?.enablePrefetching !== false,
      batchSize: config?.batchSize || 10,
      maxParallelOps: config?.maxParallelOps || 5,
      prefetchThreshold: config?.prefetchThreshold || 0.8
    };

    this.keyCache = new LRUCache({
      max: cacheConfig.maxSize,
      ttl: cacheConfig.ttl,
      updateAgeOnGet: cacheConfig.updateAgeOnGet,
      dispose: (value, key) => {
        this.emit('cacheEviction', { key, value });
      }
    });
  }

  async initialize(): Promise<void> {
    if (this.strategy.enableBatching) {
      this.startBatchProcessor();
    }

    if (this.strategy.enablePrefetching) {
      this.startPrefetcher();
    }

    logger.info('Performance Optimizer initialized', {
      strategy: this.strategy
    });

    this.emit('initialized');
  }

  async shutdown(): Promise<void> {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.prefetchTimer) {
      clearInterval(this.prefetchTimer);
      this.prefetchTimer = null;
    }

    // Process remaining batches
    await this.processBatches();

    this.keyCache.clear();

    logger.info('Performance Optimizer shutdown completed');
  }

  /**
   * Optimize key for performance
   */
  async optimizeKey(keyId: string, metadata: KeyMetadata): Promise<void> {
    if (!this.strategy.enableCaching) {
      return;
    }

    try {
      // Cache key metadata
      this.keyCache.set(`metadata:${keyId}`, metadata);

      // Analyze usage patterns
      this.analyzeUsagePattern(keyId, metadata);

      logger.debug('Key optimized', { keyId });
    } catch (error: unknown) {
      logger.error(`Failed to optimize key ${keyId}:`, error);
    }
  }

  /**
   * Get cached key metadata
   */
  getCachedMetadata(keyId: string): KeyMetadata | null {
    if (!this.strategy.enableCaching) {
      return null;
    }

    const cached = this.keyCache.get(`metadata:${keyId}`);
    
    if (cached) {
      this.metrics.cacheHits++;
      this.updateCacheHitRate();
      return cached as KeyMetadata;
    }

    this.metrics.cacheMisses++;
    this.updateCacheHitRate();
    return null;
  }

  /**
   * Cache operation result
   */
  cacheOperationResult(operationType: string, key: string, result: any, ttl?: number): void {
    if (!this.strategy.enableCaching) {
      return;
    }

    const cacheKey = `${operationType}:${key}`;
    
    if (ttl) {
      this.keyCache.set(cacheKey, result, { ttl });
    } else {
      this.keyCache.set(cacheKey, result);
    }

    logger.debug('Operation result cached', { operationType, key });
  }

  /**
   * Get cached operation result
   */
  getCachedOperationResult(operationType: string, key: string): any | null {
    if (!this.strategy.enableCaching) {
      return null;
    }

    const cacheKey = `${operationType}:${key}`;
    const cached = this.keyCache.get(cacheKey);

    if (cached) {
      this.metrics.cacheHits++;
      this.updateCacheHitRate();
      return cached;
    }

    this.metrics.cacheMisses++;
    this.updateCacheHitRate();
    return null;
  }

  /**
   * Queue operation for batching
   */
  async queueOperation(
    operationType: string,
    operation: () => Promise<any>
  ): Promise<any> {
    if (!this.strategy.enableBatching) {
      return await this.executeOperation(operationType, operation);
    }

    return new Promise((resolve, reject) => {
      const queue = this.operationQueue.get(operationType) || [];
      queue.push({ operation, resolve, reject });
      this.operationQueue.set(operationType, queue);

      // Process if batch size reached
      if (queue.length >= this.strategy.batchSize) {
        this.processBatch(operationType);
      }
    });
  }

  /**
   * Execute operations in parallel
   */
  async executeParallel<T>(
    operations: (() => Promise<T>)[]
  ): Promise<T[]> {
    if (!this.strategy.enableParallelization) {
      // Execute sequentially
      const results: T[] = [];
      for (const op of operations) {
        results.push(await op());
      }
      return results;
    }

    // Execute in parallel with concurrency limit
    const results: T[] = [];
    const chunks = this.chunkArray(operations, this.strategy.maxParallelOps);

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(chunk.map(op => op()));
      results.push(...chunkResults);
      this.metrics.parallelOperations += chunk.length;
    }

    return results;
  }

  /**
   * Prefetch keys based on usage patterns
   */
  async prefetchKeys(keyIds: string[]): Promise<void> {
    if (!this.strategy.enablePrefetching) {
      return;
    }

    logger.info('Prefetching keys', { count: keyIds.length });
    this.emit('cacheWarming', keyIds);

    // This would trigger actual key loading in the key management service
    // For now, we just emit the event
  }

  /**
   * Warm cache with frequently used keys
   */
  async warmCache(keys: Map<string, any>): Promise<void> {
    if (!this.strategy.enableCaching) {
      return;
    }

    let warmedCount = 0;

    for (const [keyId, data] of keys.entries()) {
      this.keyCache.set(`metadata:${keyId}`, data);
      warmedCount++;
    }

    logger.info('Cache warmed', { count: warmedCount });
    this.emit('cacheWarmed', { count: warmedCount });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.keyCache.clear();
    logger.info('Cache cleared');
    this.emit('cacheCleared');
  }

  /**
   * Invalidate cache entry
   */
  invalidateCache(key: string): void {
    this.keyCache.delete(key);
    logger.debug('Cache invalidated', { key });
  }

  /**
   * Get performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      cacheHitRate: 0,
      averageOperationTime: 0,
      totalOperations: 0,
      batchOperations: 0,
      parallelOperations: 0
    };

    this.operationMetrics.clear();
    logger.info('Metrics reset');
  }

  /**
   * Update optimization strategy
   */
  updateStrategy(updates: Partial<OptimizationStrategy>): void {
    this.strategy = { ...this.strategy, ...updates };

    // Restart services if needed
    if (updates.enableBatching !== undefined) {
      if (updates.enableBatching && !this.batchTimer) {
        this.startBatchProcessor();
      } else if (!updates.enableBatching && this.batchTimer) {
        clearInterval(this.batchTimer);
        this.batchTimer = null;
      }
    }

    if (updates.enablePrefetching !== undefined) {
      if (updates.enablePrefetching && !this.prefetchTimer) {
        this.startPrefetcher();
      } else if (!updates.enablePrefetching && this.prefetchTimer) {
        clearInterval(this.prefetchTimer);
        this.prefetchTimer = null;
      }
    }

    logger.info('Optimization strategy updated', { updates });
    this.emit('strategyUpdated', this.strategy);
  }

  /**
   * Get current strategy
   */
  getStrategy(): OptimizationStrategy {
    return { ...this.strategy };
  }

  /**
   * Get cache statistics
   */
  getCacheStatistics(): {
    size: number;
    maxSize: number;
    hitRate: number;
    evictions: number;
  } {
    return {
      size: this.keyCache.size,
      maxSize: this.keyCache.max,
      hitRate: this.metrics.cacheHitRate,
      evictions: this.listenerCount('cacheEviction')
    };
  }

  // Private methods

  private async executeOperation(
    operationType: string,
    operation: () => Promise<any>
  ): Promise<any> {
    const startTime = Date.now();

    try {
      const result = await operation();
      
      const duration = Date.now() - startTime;
      this.recordOperationTime(operationType, duration);
      this.metrics.totalOperations++;

      return result;
    } catch (error: unknown) {
      logger.error(`Operation ${operationType} failed:`, error);
      throw error;
    }
  }

  private startBatchProcessor(): void {
    // Process batches every 100ms
    this.batchTimer = setInterval(() => {
      this.processBatches();
    }, 100);
  }

  private async processBatches(): Promise<void> {
    for (const [operationType, queue] of this.operationQueue.entries()) {
      if (queue.length > 0) {
        await this.processBatch(operationType);
      }
    }
  }

  private async processBatch(operationType: string): Promise<void> {
    const queue = this.operationQueue.get(operationType);
    if (!queue || queue.length === 0) {
      return;
    }

    // Take batch
    const batch = queue.splice(0, this.strategy.batchSize);
    this.operationQueue.set(operationType, queue);

    logger.debug('Processing batch', {
      operationType,
      batchSize: batch.length
    });

    // Execute batch operations
    for (const item of batch) {
      try {
        const result = await this.executeOperation(operationType, item.operation);
        item.resolve(result);
      } catch (error: unknown) {
        item.reject(error);
      }
    }

    this.metrics.batchOperations += batch.length;
  }

  private startPrefetcher(): void {
    // Analyze usage patterns every 5 minutes
    this.prefetchTimer = setInterval(() => {
      this.analyzePrefetchOpportunities();
    }, 5 * 60 * 1000);
  }

  private analyzePrefetchOpportunities(): void {
    // Analyze cache hit rates and identify frequently accessed keys
    // This would trigger prefetching of related keys
    logger.debug('Analyzing prefetch opportunities');
  }

  private analyzeUsagePattern(keyId: string, metadata: KeyMetadata): void {
    // Track usage patterns for optimization
    // This could be used for intelligent prefetching
  }

  private recordOperationTime(operationType: string, duration: number): void {
    const times = this.operationMetrics.get(operationType) || [];
    times.push(duration);

    // Keep only last 1000 measurements
    if (times.length > 1000) {
      times.shift();
    }

    this.operationMetrics.set(operationType, times);

    // Update average
    const allTimes = Array.from(this.operationMetrics.values()).flat();
    this.metrics.averageOperationTime = 
      allTimes.reduce((sum, t) => sum + t, 0) / allTimes.length;
  }

  private updateCacheHitRate(): void {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    this.metrics.cacheHitRate = total > 0 ? this.metrics.cacheHits / total : 0;
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}

export default PerformanceOptimizer;
