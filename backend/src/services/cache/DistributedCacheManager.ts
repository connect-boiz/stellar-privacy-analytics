import { EventEmitter } from 'events';
import { RedisClientType, createClient } from 'redis';
import { logger } from '../../utils/logger';
import { LRUCache } from 'lru-cache';
import crypto from 'crypto';

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number;
  version: number;
  nodeId: string;
  tags?: string[];
}

export interface CacheInvalidationEvent {
  type: 'invalidate' | 'update' | 'delete' | 'clear';
  keys?: string[];
  pattern?: string;
  tags?: string[];
  nodeId: string;
  timestamp: number;
  reason?: string;
}

export interface CacheConfig {
  nodeId: string;
  redisUrl: string;
  localCacheSize: number;
  defaultTTL: number;
  enableLocalCache: boolean;
  enableDistributedCache: boolean;
  invalidationChannel: string;
  healthCheckInterval: number;
  maxRetries: number;
}

export interface CacheMetrics {
  localHits: number;
  localMisses: number;
  distributedHits: number;
  distributedMisses: number;
  invalidations: number;
  evictions: number;
  errors: number;
  totalRequests: number;
  hitRate: number;
  averageLatency: number;
  lastHealthCheck: Date;
  isHealthy: boolean;
}

/**
 * Distributed Cache Manager with Cache Coherence Protocol
 * Implements distributed cache invalidation and consistency across nodes
 */
export class DistributedCacheManager extends EventEmitter {
  private config: CacheConfig;
  private redisClient: RedisClientType;
  private subscriberClient: RedisClientType;
  private localCache: LRUCache<string, CacheEntry>;
  private metrics: CacheMetrics;
  private healthCheckTimer?: NodeJS.Timeout;
  private isInitialized: boolean = false;
  private pendingInvalidations: Map<string, CacheInvalidationEvent> = new Map();
  private versionMap: Map<string, number> = new Map();

  constructor(config: Partial<CacheConfig> = {}) {
    super();

    // Validate configuration
    if (config.localCacheSize !== undefined && config.localCacheSize < 1) {
      throw new Error('localCacheSize must be at least 1');
    }

    if (config.defaultTTL !== undefined && config.defaultTTL < 1000) {
      throw new Error('defaultTTL must be at least 1000ms (1 second)');
    }

    if (config.healthCheckInterval !== undefined && config.healthCheckInterval < 1000) {
      throw new Error('healthCheckInterval must be at least 1000ms (1 second)');
    }

    if (config.maxRetries !== undefined && config.maxRetries < 0) {
      throw new Error('maxRetries must be non-negative');
    }

    this.config = {
      nodeId: config.nodeId || this.generateNodeId(),
      redisUrl: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
      localCacheSize: config.localCacheSize || 10000,
      defaultTTL: config.defaultTTL || 3600000, // 1 hour
      enableLocalCache: config.enableLocalCache !== false,
      enableDistributedCache: config.enableDistributedCache !== false,
      invalidationChannel: config.invalidationChannel || 'cache:invalidation',
      healthCheckInterval: config.healthCheckInterval || 30000, // 30 seconds
      maxRetries: config.maxRetries || 3
    };

    // Initialize local cache
    this.localCache = new LRUCache<string, CacheEntry>({
      max: this.config.localCacheSize,
      ttl: this.config.defaultTTL,
      updateAgeOnGet: true,
      dispose: (value, key) => {
        this.metrics.evictions++;
        this.versionMap.delete(key); // Clean up version map
        this.emit('eviction', { key, value });
      }
    });

    // Initialize metrics
    this.metrics = {
      localHits: 0,
      localMisses: 0,
      distributedHits: 0,
      distributedMisses: 0,
      invalidations: 0,
      evictions: 0,
      errors: 0,
      totalRequests: 0,
      hitRate: 0,
      averageLatency: 0,
      lastHealthCheck: new Date(),
      isHealthy: false
    };

    // Initialize Redis clients
    this.redisClient = createClient({ url: this.config.redisUrl });
    this.subscriberClient = createClient({ url: this.config.redisUrl });

    this.setupErrorHandlers();
  }

  /**
   * Initialize the cache manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Cache manager already initialized');
      return;
    }

    try {
      // Connect Redis clients
      await Promise.all([
        this.redisClient.connect(),
        this.subscriberClient.connect()
      ]);

      // Subscribe to invalidation channel
      await this.subscriberClient.subscribe(
        this.config.invalidationChannel,
        this.handleInvalidationEvent.bind(this)
      );

      // Start health checks
      this.startHealthChecks();

      this.isInitialized = true;
      this.metrics.isHealthy = true;

      logger.info('Distributed Cache Manager initialized', {
        nodeId: this.config.nodeId,
        localCacheSize: this.config.localCacheSize,
        defaultTTL: this.config.defaultTTL
      });

      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize cache manager:', error);
      throw error;
    }
  }

  /**
   * Shutdown the cache manager
   */
  async shutdown(): Promise<void> {
    try {
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
      }

      await this.subscriberClient.unsubscribe(this.config.invalidationChannel);
      
      await Promise.all([
        this.redisClient.quit(),
        this.subscriberClient.quit()
      ]);

      this.localCache.clear();
      this.isInitialized = false;
      this.metrics.isHealthy = false;

      logger.info('Distributed Cache Manager shutdown completed');
      this.emit('shutdown');
    } catch (error) {
      logger.error('Error during cache manager shutdown:', error);
      throw error;
    }
  }

  /**
   * Get value from cache with fallback
   */
  async get<T = any>(
    key: string,
    fallback?: () => Promise<T>,
    options?: { ttl?: number; tags?: string[] }
  ): Promise<T | null> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      // Try local cache first
      if (this.config.enableLocalCache) {
        const localEntry = this.localCache.get(key);
        if (localEntry && this.isEntryValid(localEntry)) {
          this.metrics.localHits++;
          this.updateHitRate();
          this.recordLatency(Date.now() - startTime);
          return localEntry.value as T;
        }
        this.metrics.localMisses++;
      }

      // Try distributed cache
      if (this.config.enableDistributedCache) {
        const distributedEntry = await this.getFromDistributed<T>(key);
        if (distributedEntry) {
          this.metrics.distributedHits++;
          
          // Update local cache
          if (this.config.enableLocalCache) {
            this.localCache.set(key, distributedEntry);
          }
          
          this.updateHitRate();
          this.recordLatency(Date.now() - startTime);
          return distributedEntry.value;
        }
        this.metrics.distributedMisses++;
      }

      // Use fallback if provided
      if (fallback) {
        const value = await fallback();
        await this.set(key, value, options);
        this.recordLatency(Date.now() - startTime);
        return value;
      }

      this.recordLatency(Date.now() - startTime);
      return null;
    } catch (error) {
      this.metrics.errors++;
      logger.error(`Cache get error for key ${key}:`, error);
      
      // Return fallback on error
      if (fallback) {
        try {
          return await fallback();
        } catch (fallbackError) {
          logger.error('Fallback function failed:', fallbackError);
        }
      }
      
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set<T = any>(
    key: string,
    value: T,
    options?: { ttl?: number; tags?: string[] }
  ): Promise<void> {
    try {
      const ttl = options?.ttl || this.config.defaultTTL;
      const version = this.incrementVersion(key);
      
      const entry: CacheEntry<T> = {
        key,
        value,
        timestamp: Date.now(),
        ttl,
        version,
        nodeId: this.config.nodeId,
        tags: options?.tags
      };

      // Set in local cache
      if (this.config.enableLocalCache) {
        this.localCache.set(key, entry, { ttl });
      }

      // Set in distributed cache
      if (this.config.enableDistributedCache) {
        await this.setInDistributed(key, entry, ttl);
      }

      this.emit('set', { key, value, ttl });
    } catch (error) {
      this.metrics.errors++;
      logger.error(`Cache set error for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete key from cache
   */
  async delete(key: string, propagate: boolean = true): Promise<void> {
    try {
      // Delete from local cache
      if (this.config.enableLocalCache) {
        this.localCache.delete(key);
      }

      // Delete from distributed cache
      if (this.config.enableDistributedCache) {
        await this.redisClient.del(this.getCacheKey(key));
      }

      // Propagate invalidation
      if (propagate) {
        await this.publishInvalidation({
          type: 'delete',
          keys: [key],
          nodeId: this.config.nodeId,
          timestamp: Date.now()
        });
      }

      this.emit('delete', { key });
    } catch (error) {
      this.metrics.errors++;
      logger.error(`Cache delete error for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Invalidate cache entries by pattern
   */
  async invalidatePattern(pattern: string): Promise<number> {
    try {
      let invalidatedCount = 0;

      // Invalidate local cache
      if (this.config.enableLocalCache) {
        const regex = this.patternToRegex(pattern);
        const keysToDelete: string[] = [];
        
        for (const key of this.localCache.keys()) {
          if (regex.test(key)) {
            keysToDelete.push(key);
          }
        }

        keysToDelete.forEach(key => this.localCache.delete(key));
        invalidatedCount += keysToDelete.length;
      }

      // Invalidate distributed cache using SCAN instead of KEYS
      if (this.config.enableDistributedCache) {
        const keys = await this.scanKeys(this.getCacheKey(pattern));
        if (keys.length > 0) {
          // Delete in batches to avoid blocking Redis
          const batchSize = 100;
          for (let i = 0; i < keys.length; i += batchSize) {
            const batch = keys.slice(i, i + batchSize);
            await this.redisClient.del(batch);
          }
          invalidatedCount += keys.length;
        }
      }

      // Propagate invalidation
      await this.publishInvalidation({
        type: 'invalidate',
        pattern,
        nodeId: this.config.nodeId,
        timestamp: Date.now()
      });

      this.metrics.invalidations += invalidatedCount;
      this.emit('invalidatePattern', { pattern, count: invalidatedCount });

      return invalidatedCount;
    } catch (error) {
      this.metrics.errors++;
      logger.error(`Cache invalidate pattern error for ${pattern}:`, error);
      throw error;
    }
  }

  /**
   * Invalidate cache entries by tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    try {
      let invalidatedCount = 0;

      // Invalidate local cache
      if (this.config.enableLocalCache) {
        const keysToDelete: string[] = [];
        
        for (const [key, entry] of this.localCache.entries()) {
          if (entry.tags && entry.tags.some(tag => tags.includes(tag))) {
            keysToDelete.push(key);
          }
        }

        keysToDelete.forEach(key => this.localCache.delete(key));
        invalidatedCount += keysToDelete.length;
      }

      // Invalidate distributed cache (scan for tagged entries)
      if (this.config.enableDistributedCache) {
        for (const tag of tags) {
          const tagKey = `cache:tag:${tag}`;
          const keys = await this.redisClient.sMembers(tagKey);
          
          if (keys.length > 0) {
            await this.redisClient.del(keys);
            await this.redisClient.del(tagKey);
            invalidatedCount += keys.length;
          }
        }
      }

      // Propagate invalidation
      await this.publishInvalidation({
        type: 'invalidate',
        tags,
        nodeId: this.config.nodeId,
        timestamp: Date.now()
      });

      this.metrics.invalidations += invalidatedCount;
      this.emit('invalidateByTags', { tags, count: invalidatedCount });

      return invalidatedCount;
    } catch (error) {
      this.metrics.errors++;
      logger.error(`Cache invalidate by tags error:`, error);
      throw error;
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(propagate: boolean = true): Promise<void> {
    try {
      // Clear local cache
      if (this.config.enableLocalCache) {
        this.localCache.clear();
      }

      // Clear distributed cache using SCAN instead of KEYS
      if (this.config.enableDistributedCache) {
        const keys = await this.scanKeys(this.getCacheKey('*'));
        if (keys.length > 0) {
          // Delete in batches
          const batchSize = 100;
          for (let i = 0; i < keys.length; i += batchSize) {
            const batch = keys.slice(i, i + batchSize);
            await this.redisClient.del(batch);
          }
        }
      }

      // Propagate invalidation
      if (propagate) {
        await this.publishInvalidation({
          type: 'clear',
          nodeId: this.config.nodeId,
          timestamp: Date.now()
        });
      }

      this.versionMap.clear();
      this.emit('clear');
    } catch (error) {
      this.metrics.errors++;
      logger.error('Cache clear error:', error);
      throw error;
    }
  }

  /**
   * Warm cache with data
   */
  async warmCache(entries: Array<{ key: string; value: any; ttl?: number; tags?: string[] }>): Promise<void> {
    try {
      logger.info(`Warming cache with ${entries.length} entries`);

      const promises = entries.map(entry =>
        this.set(entry.key, entry.value, { ttl: entry.ttl, tags: entry.tags })
      );

      await Promise.all(promises);

      logger.info('Cache warming completed');
      this.emit('cacheWarmed', { count: entries.length });
    } catch (error) {
      logger.error('Cache warming error:', error);
      throw error;
    }
  }

  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      localHits: 0,
      localMisses: 0,
      distributedHits: 0,
      distributedMisses: 0,
      invalidations: 0,
      evictions: 0,
      errors: 0,
      totalRequests: 0,
      hitRate: 0,
      averageLatency: 0,
      lastHealthCheck: this.metrics.lastHealthCheck,
      isHealthy: this.metrics.isHealthy
    };
  }

  /**
   * Get cache statistics
   */
  async getStatistics(): Promise<any> {
    const localSize = this.localCache.size;
    const localMaxSize = this.localCache.max;
    
    let distributedSize = 0;
    let distributedMemory = 0;

    if (this.config.enableDistributedCache) {
      try {
        const info = await this.redisClient.info('memory');
        const memoryMatch = info.match(/used_memory:(\d+)/);
        if (memoryMatch) {
          distributedMemory = parseInt(memoryMatch[1]);
        }

        // Use SCAN instead of KEYS
        const keys = await this.scanKeys(this.getCacheKey('*'));
        distributedSize = keys.length;
      } catch (error) {
        logger.error('Error getting distributed cache stats:', error);
      }
    }

    return {
      nodeId: this.config.nodeId,
      local: {
        size: localSize,
        maxSize: localMaxSize,
        utilizationPercent: (localSize / localMaxSize) * 100
      },
      distributed: {
        size: distributedSize,
        memoryBytes: distributedMemory,
        memoryMB: (distributedMemory / 1024 / 1024).toFixed(2)
      },
      metrics: this.metrics,
      health: {
        isHealthy: this.metrics.isHealthy,
        lastCheck: this.metrics.lastHealthCheck
      }
    };
  }

  // Private methods

  /**
   * Scan Redis keys using SCAN command (non-blocking)
   */
  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = 0;

    try {
      do {
        const result = await this.redisClient.scan(cursor, {
          MATCH: pattern,
          COUNT: 100
        });
        
        cursor = result.cursor;
        keys.push(...result.keys);
      } while (cursor !== 0);
    } catch (error) {
      logger.error('Error scanning keys:', error);
    }

    return keys;
  }

  private async getFromDistributed<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      const data = await this.redisClient.get(this.getCacheKey(key));
      if (!data) {
        return null;
      }

      const entry: CacheEntry<T> = JSON.parse(data);
      
      // Check if entry is still valid
      if (!this.isEntryValid(entry)) {
        await this.redisClient.del(this.getCacheKey(key));
        return null;
      }

      return entry;
    } catch (error) {
      logger.error(`Error getting from distributed cache: ${key}`, error);
      return null;
    }
  }

  private async setInDistributed<T>(key: string, entry: CacheEntry<T>, ttl: number): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(key);
      const data = JSON.stringify(entry);
      
      await this.redisClient.setEx(cacheKey, Math.ceil(ttl / 1000), data);

      // Store tags for tag-based invalidation
      if (entry.tags && entry.tags.length > 0) {
        for (const tag of entry.tags) {
          await this.redisClient.sAdd(`cache:tag:${tag}`, cacheKey);
        }
      }
    } catch (error) {
      logger.error(`Error setting in distributed cache: ${key}`, error);
      throw error;
    }
  }

  private async publishInvalidation(event: CacheInvalidationEvent): Promise<void> {
    try {
      await this.redisClient.publish(
        this.config.invalidationChannel,
        JSON.stringify(event)
      );

      logger.debug('Published invalidation event', event);
    } catch (error) {
      logger.error('Error publishing invalidation event:', error);
    }
  }

  private async handleInvalidationEvent(message: string): Promise<void> {
    try {
      const event: CacheInvalidationEvent = JSON.parse(message);

      // Ignore events from this node
      if (event.nodeId === this.config.nodeId) {
        return;
      }

      logger.debug('Received invalidation event', event);

      try {
        switch (event.type) {
          case 'invalidate':
            if (event.pattern) {
              // Invalidate local cache only - don't propagate to avoid infinite loop
              if (this.config.enableLocalCache) {
                const regex = this.patternToRegex(event.pattern);
                const keysToDelete: string[] = [];
                
                for (const key of this.localCache.keys()) {
                  if (regex.test(key)) {
                    keysToDelete.push(key);
                  }
                }

                keysToDelete.forEach(key => this.localCache.delete(key));
              }
            } else if (event.tags) {
              // Invalidate local cache only - don't propagate to avoid infinite loop
              if (this.config.enableLocalCache) {
                const keysToDelete: string[] = [];
                
                for (const [key, entry] of this.localCache.entries()) {
                  if (entry.tags && entry.tags.some(tag => event.tags!.includes(tag))) {
                    keysToDelete.push(key);
                  }
                }

                keysToDelete.forEach(key => this.localCache.delete(key));
              }
            } else if (event.keys) {
              for (const key of event.keys) {
                await this.delete(key, false);
              }
            }
            break;

          case 'delete':
            if (event.keys) {
              for (const key of event.keys) {
                await this.delete(key, false);
              }
            }
            break;

          case 'clear':
            await this.clear(false);
            break;

          case 'update':
            if (event.keys) {
              for (const key of event.keys) {
                this.localCache.delete(key);
              }
            }
            break;
        }

        this.metrics.invalidations++;
        this.emit('invalidationReceived', event);
      } catch (operationError) {
        logger.error('Error processing invalidation operation:', operationError);
        this.metrics.errors++;
        // Don't throw - continue processing other events
      }
    } catch (error) {
      logger.error('Error handling invalidation event:', error);
      this.metrics.errors++;
    }
  }

  private isEntryValid(entry: CacheEntry): boolean {
    const now = Date.now();
    return (now - entry.timestamp) < entry.ttl;
  }

  private getCacheKey(key: string): string {
    return `cache:${key}`;
  }

  private patternToRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexPattern = escaped.replace(/\\\*/g, '.*').replace(/\\\?/g, '.');
    return new RegExp(`^${regexPattern}$`);
  }

  private incrementVersion(key: string): number {
    // Simple atomic increment using Map
    // In high-concurrency scenarios, consider using Redis INCR
    const current = this.versionMap.get(key) || 0;
    const next = current + 1;
    this.versionMap.set(key, next);
    
    // Limit version map size to prevent memory issues
    if (this.versionMap.size > this.config.localCacheSize * 2) {
      // Remove oldest entries (simple cleanup)
      const entries = Array.from(this.versionMap.entries());
      const toRemove = entries.slice(0, this.config.localCacheSize);
      toRemove.forEach(([k]) => this.versionMap.delete(k));
    }
    
    return next;
  }

  private updateHitRate(): void {
    const totalHits = this.metrics.localHits + this.metrics.distributedHits;
    const totalMisses = this.metrics.localMisses + this.metrics.distributedMisses;
    const total = totalHits + totalMisses;
    
    this.metrics.hitRate = total > 0 ? totalHits / total : 0;
  }

  private recordLatency(latency: number): void {
    const currentAvg = this.metrics.averageLatency;
    const count = this.metrics.totalRequests;
    
    this.metrics.averageLatency = ((currentAvg * (count - 1)) + latency) / count;
  }

  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  private async performHealthCheck(): Promise<void> {
    try {
      // Check Redis connection
      if (this.config.enableDistributedCache) {
        await this.redisClient.ping();
      }

      this.metrics.isHealthy = true;
      this.metrics.lastHealthCheck = new Date();
      
      this.emit('healthCheck', { healthy: true });
    } catch (error) {
      this.metrics.isHealthy = false;
      this.metrics.errors++;
      
      logger.error('Health check failed:', error);
      this.emit('healthCheck', { healthy: false, error });
    }
  }

  private generateNodeId(): string {
    return `node-${crypto.randomBytes(8).toString('hex')}`;
  }

  private setupErrorHandlers(): void {
    this.redisClient.on('error', (error) => {
      this.metrics.errors++;
      logger.error('Redis client error:', error);
      this.emit('error', { source: 'redis', error });
    });

    this.subscriberClient.on('error', (error) => {
      this.metrics.errors++;
      logger.error('Redis subscriber error:', error);
      this.emit('error', { source: 'subscriber', error });
    });
  }
}

export default DistributedCacheManager;
