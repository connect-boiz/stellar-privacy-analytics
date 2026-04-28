import Redis from 'redis';
import LRUCache from 'lru-cache';
import { logger } from '../utils/logger';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
  useLocalCache?: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  redisHits: number;
  redisMisses: number;
  localHits: number;
  localMisses: number;
}

export class CacheService {
  private redisClient: Redis.RedisClientType | null = null;
  private localCache: LRUCache<string, any> | null = null;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    redisHits: 0,
    redisMisses: 0,
    localHits: 0,
    localMisses: 0
  };
  private defaultTTL = 3600; // 1 hour
  private keyPrefix = 'stellar:';

  constructor(redisClient?: Redis.RedisClientType) {
    this.redisClient = redisClient || null;

    // Initialize local LRU cache
    this.localCache = new LRUCache({
      max: 1000, // Maximum 1000 items
      ttl: this.defaultTTL * 1000, // Convert to milliseconds
      updateAgeOnGet: true,
      allowStale: false
    });
  }

  /**
   * Set a value in cache
   */
  async set(key: string, value: any, options: CacheOptions = {}): Promise<void> {
    const fullKey = this.getFullKey(key, options.prefix);
    const ttl = options.ttl || this.defaultTTL;

    try {
      // Set in local cache
      if (options.useLocalCache !== false && this.localCache) {
        this.localCache.set(fullKey, value, { ttl: ttl * 1000 });
      }

      // Set in Redis
      if (this.redisClient) {
        await this.redisClient.setEx(fullKey, ttl, JSON.stringify(value));
      }

      this.stats.sets++;
      logger.debug(`Cache set: ${fullKey}`);
    } catch (error) {
      logger.error(`Cache set failed for key ${fullKey}:`, error);
      // Don't throw - cache failures shouldn't break the app
    }
  }

  /**
   * Get a value from cache
   */
  async get<T = any>(key: string, options: CacheOptions = {}): Promise<T | null> {
    const fullKey = this.getFullKey(key, options.prefix);

    try {
      // Try local cache first
      if (options.useLocalCache !== false && this.localCache) {
        const localValue = this.localCache.get(fullKey);
        if (localValue !== undefined) {
          this.stats.hits++;
          this.stats.localHits++;
          logger.debug(`Cache hit (local): ${fullKey}`);
          return localValue;
        }
      }

      // Try Redis
      if (this.redisClient) {
        const redisValue = await this.redisClient.get(fullKey);
        if (redisValue) {
          const parsedValue = JSON.parse(redisValue);

          // Update local cache
          if (options.useLocalCache !== false && this.localCache) {
            this.localCache.set(fullKey, parsedValue);
          }

          this.stats.hits++;
          this.stats.redisHits++;
          logger.debug(`Cache hit (redis): ${fullKey}`);
          return parsedValue;
        }
      }

      this.stats.misses++;
      if (this.redisClient) {
        this.stats.redisMisses++;
      } else {
        this.stats.localMisses++;
      }
      logger.debug(`Cache miss: ${fullKey}`);
      return null;
    } catch (error) {
      logger.error(`Cache get failed for key ${fullKey}:`, error);
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string, options: CacheOptions = {}): Promise<void> {
    const fullKey = this.getFullKey(key, options.prefix);

    try {
      // Delete from local cache
      if (this.localCache) {
        this.localCache.delete(fullKey);
      }

      // Delete from Redis
      if (this.redisClient) {
        await this.redisClient.del(fullKey);
      }

      this.stats.deletes++;
      logger.debug(`Cache delete: ${fullKey}`);
    } catch (error) {
      logger.error(`Cache delete failed for key ${fullKey}:`, error);
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string, options: CacheOptions = {}): Promise<boolean> {
    const fullKey = this.getFullKey(key, options.prefix);

    try {
      // Check local cache first
      if (options.useLocalCache !== false && this.localCache && this.localCache.has(fullKey)) {
        return true;
      }

      // Check Redis
      if (this.redisClient) {
        const exists = await this.redisClient.exists(fullKey);
        return exists === 1;
      }

      return false;
    } catch (error) {
      logger.error(`Cache exists check failed for key ${fullKey}:`, error);
      return false;
    }
  }

  /**
   * Clear all cache entries with a prefix
   */
  async clear(prefix?: string): Promise<void> {
    const prefixToClear = prefix ? `${this.keyPrefix}${prefix}:*` : `${this.keyPrefix}*`;

    try {
      // Clear local cache
      if (this.localCache) {
        if (prefix) {
          // Clear specific prefix from local cache
          const keysToDelete: string[] = [];
          for (const key of this.localCache.keys()) {
            if (key.startsWith(`${this.keyPrefix}${prefix}:`)) {
              keysToDelete.push(key);
            }
          }
          keysToDelete.forEach(key => this.localCache!.delete(key));
        } else {
          this.localCache.clear();
        }
      }

      // Clear Redis
      if (this.redisClient) {
        const keys = await this.redisClient.keys(prefixToClear);
        if (keys.length > 0) {
          await this.redisClient.del(keys);
        }
      }

      logger.info(`Cache cleared with prefix: ${prefix || 'all'}`);
    } catch (error) {
      logger.error(`Cache clear failed for prefix ${prefix}:`, error);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      redisHits: 0,
      redisMisses: 0,
      localHits: 0,
      localMisses: 0
    };
  }

  /**
   * Get hit rate
   */
  getHitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    return total > 0 ? (this.stats.hits / total) * 100 : 0;
  }

  private getFullKey(key: string, prefix?: string): string {
    const prefixPart = prefix ? `${prefix}:` : '';
    return `${this.keyPrefix}${prefixPart}${key}`;
  }
}

// Global cache instance
let globalCacheService: CacheService | null = null;

export function initializeCacheService(redisClient?: Redis.RedisClientType): CacheService {
  if (!globalCacheService) {
    globalCacheService = new CacheService(redisClient);
    logger.info('Cache service initialized');
  }
  return globalCacheService;
}

export function getCacheService(): CacheService {
  if (!globalCacheService) {
    throw new Error('Cache service not initialized. Call initializeCacheService() first.');
  }
  return globalCacheService;
}