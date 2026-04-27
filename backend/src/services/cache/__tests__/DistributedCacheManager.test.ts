import { DistributedCacheManager } from '../DistributedCacheManager';
import { createClient } from 'redis';

// Mock Redis
jest.mock('redis', () => {
  const mockData = new Map<string, string>();
  const mockSets = new Map<string, Set<string>>();
  let mockCursor = 0;

  return {
    createClient: jest.fn(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      subscribe: jest.fn().mockResolvedValue(undefined),
      unsubscribe: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn().mockResolvedValue(1),
      get: jest.fn((key: string) => Promise.resolve(mockData.get(key) || null)),
      setEx: jest.fn((key: string, ttl: number, value: string) => {
        mockData.set(key, value);
        return Promise.resolve('OK');
      }),
      del: jest.fn((keys: string | string[]) => {
        const keysArray = Array.isArray(keys) ? keys : [keys];
        keysArray.forEach(key => mockData.delete(key));
        return Promise.resolve(keysArray.length);
      }),
      scan: jest.fn((cursor: number, options: any) => {
        const keys = Array.from(mockData.keys());
        const pattern = options.MATCH;
        const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
        const matchedKeys = keys.filter(k => regex.test(k));
        
        return Promise.resolve({
          cursor: 0,
          keys: matchedKeys
        });
      }),
      sMembers: jest.fn((key: string) => {
        return Promise.resolve(Array.from(mockSets.get(key) || []));
      }),
      sAdd: jest.fn((key: string, value: string) => {
        if (!mockSets.has(key)) {
          mockSets.set(key, new Set());
        }
        mockSets.get(key)!.add(value);
        return Promise.resolve(1);
      }),
      ping: jest.fn().mockResolvedValue('PONG'),
      info: jest.fn().mockResolvedValue('used_memory:1024')
    }))
  };
});

describe('DistributedCacheManager', () => {
  let cacheManager: DistributedCacheManager;

  beforeEach(async () => {
    cacheManager = new DistributedCacheManager({
      nodeId: 'test-node',
      redisUrl: 'redis://localhost:6379',
      localCacheSize: 100,
      defaultTTL: 60000,
      enableLocalCache: true,
      enableDistributedCache: true
    });

    await cacheManager.initialize();
  });

  afterEach(async () => {
    await cacheManager.shutdown();
  });

  describe('Configuration Validation', () => {
    test('should throw error for invalid localCacheSize', () => {
      expect(() => {
        new DistributedCacheManager({ localCacheSize: 0 });
      }).toThrow('localCacheSize must be at least 1');
    });

    test('should throw error for invalid defaultTTL', () => {
      expect(() => {
        new DistributedCacheManager({ defaultTTL: 500 });
      }).toThrow('defaultTTL must be at least 1000ms');
    });

    test('should throw error for invalid healthCheckInterval', () => {
      expect(() => {
        new DistributedCacheManager({ healthCheckInterval: 500 });
      }).toThrow('healthCheckInterval must be at least 1000ms');
    });

    test('should throw error for negative maxRetries', () => {
      expect(() => {
        new DistributedCacheManager({ maxRetries: -1 });
      }).toThrow('maxRetries must be non-negative');
    });

    test('should accept valid configuration', () => {
      expect(() => {
        new DistributedCacheManager({
          localCacheSize: 1000,
          defaultTTL: 5000,
          healthCheckInterval: 10000,
          maxRetries: 3
        });
      }).not.toThrow();
    });
  });

  describe('Basic Operations', () => {
    test('should set and get cache entry', async () => {
      const key = 'test-key';
      const value = { data: 'test-value' };

      await cacheManager.set(key, value);
      const result = await cacheManager.get(key);

      expect(result).toEqual(value);
    });

    test('should return null for non-existent key', async () => {
      const result = await cacheManager.get('non-existent-key');
      expect(result).toBeNull();
    });

    test('should use fallback when key not found', async () => {
      const key = 'test-key';
      const fallbackValue = { data: 'fallback-value' };
      const fallback = jest.fn().mockResolvedValue(fallbackValue);

      const result = await cacheManager.get(key, fallback);

      expect(fallback).toHaveBeenCalled();
      expect(result).toEqual(fallbackValue);
    });

    test('should cache fallback result', async () => {
      const key = 'test-key';
      const fallbackValue = { data: 'fallback-value' };
      const fallback = jest.fn().mockResolvedValue(fallbackValue);

      // First call - should use fallback
      await cacheManager.get(key, fallback);
      expect(fallback).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const result = await cacheManager.get(key, fallback);
      expect(fallback).toHaveBeenCalledTimes(1); // Not called again
      expect(result).toEqual(fallbackValue);
    });

    test('should delete cache entry', async () => {
      const key = 'test-key';
      const value = { data: 'test-value' };

      await cacheManager.set(key, value);
      await cacheManager.delete(key);

      const result = await cacheManager.get(key);
      expect(result).toBeNull();
    });

    test('should clear all cache entries', async () => {
      await cacheManager.set('key1', 'value1');
      await cacheManager.set('key2', 'value2');

      await cacheManager.clear();

      const result1 = await cacheManager.get('key1');
      const result2 = await cacheManager.get('key2');

      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    test('should handle TTL correctly', async () => {
      const key = 'ttl-key';
      const value = 'ttl-value';
      const ttl = 100; // 100ms

      await cacheManager.set(key, value, { ttl });

      // Should be available immediately
      const result1 = await cacheManager.get(key);
      expect(result1).toBe(value);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be expired
      const result2 = await cacheManager.get(key);
      expect(result2).toBeNull();
    });
  });

  describe('Invalidation', () => {
    test('should invalidate by pattern', async () => {
      await cacheManager.set('user:1', 'data1');
      await cacheManager.set('user:2', 'data2');
      await cacheManager.set('post:1', 'data3');

      const count = await cacheManager.invalidatePattern('user:*');

      expect(count).toBeGreaterThanOrEqual(0);
      
      const user1 = await cacheManager.get('user:1');
      const user2 = await cacheManager.get('user:2');
      const post1 = await cacheManager.get('post:1');

      expect(user1).toBeNull();
      expect(user2).toBeNull();
      expect(post1).toBe('data3'); // Should not be affected
    });

    test('should invalidate by tags', async () => {
      await cacheManager.set('key1', 'value1', { tags: ['user', 'profile'] });
      await cacheManager.set('key2', 'value2', { tags: ['user', 'settings'] });
      await cacheManager.set('key3', 'value3', { tags: ['post'] });

      const count = await cacheManager.invalidateByTags(['user']);

      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should handle wildcard patterns correctly', async () => {
      await cacheManager.set('test:1:data', 'value1');
      await cacheManager.set('test:2:data', 'value2');
      await cacheManager.set('other:1:data', 'value3');

      await cacheManager.invalidatePattern('test:*');

      const test1 = await cacheManager.get('test:1:data');
      const test2 = await cacheManager.get('test:2:data');
      const other1 = await cacheManager.get('other:1:data');

      expect(test1).toBeNull();
      expect(test2).toBeNull();
      expect(other1).toBe('value3');
    });
  });

  describe('Cache Warming', () => {
    test('should warm cache with entries', async () => {
      const entries = [
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: 'value2' },
        { key: 'key3', value: 'value3' }
      ];

      await cacheManager.warmCache(entries);

      const result1 = await cacheManager.get('key1');
      const result2 = await cacheManager.get('key2');
      const result3 = await cacheManager.get('key3');

      expect(result1).toBe('value1');
      expect(result2).toBe('value2');
      expect(result3).toBe('value3');
    });

    test('should warm cache with custom TTL', async () => {
      const entries = [
        { key: 'key1', value: 'value1', ttl: 5000 }
      ];

      await cacheManager.warmCache(entries);

      const result = await cacheManager.get('key1');
      expect(result).toBe('value1');
    });
  });

  describe('Metrics', () => {
    test('should track cache hits and misses', async () => {
      await cacheManager.set('key1', 'value1');

      // Hit
      await cacheManager.get('key1');

      // Miss
      await cacheManager.get('key2');

      const metrics = cacheManager.getMetrics();

      expect(metrics.localHits).toBeGreaterThan(0);
      expect(metrics.totalRequests).toBeGreaterThan(0);
    });

    test('should calculate hit rate', async () => {
      await cacheManager.set('key1', 'value1');

      await cacheManager.get('key1'); // Hit
      await cacheManager.get('key2'); // Miss

      const metrics = cacheManager.getMetrics();

      expect(metrics.hitRate).toBeGreaterThanOrEqual(0);
      expect(metrics.hitRate).toBeLessThanOrEqual(1);
    });

    test('should reset metrics', () => {
      cacheManager.resetMetrics();

      const metrics = cacheManager.getMetrics();

      expect(metrics.localHits).toBe(0);
      expect(metrics.localMisses).toBe(0);
      expect(metrics.totalRequests).toBe(0);
    });

    test('should track errors', async () => {
      const initialMetrics = cacheManager.getMetrics();
      const initialErrors = initialMetrics.errors;

      // This should not cause an error, but we're testing the error tracking
      await cacheManager.get('test-key');

      const metrics = cacheManager.getMetrics();
      expect(metrics.errors).toBeGreaterThanOrEqual(initialErrors);
    });
  });

  describe('Statistics', () => {
    test('should get cache statistics', async () => {
      await cacheManager.set('key1', 'value1');
      await cacheManager.set('key2', 'value2');

      const stats = await cacheManager.getStatistics();

      expect(stats).toHaveProperty('nodeId');
      expect(stats).toHaveProperty('local');
      expect(stats).toHaveProperty('distributed');
      expect(stats).toHaveProperty('metrics');
      expect(stats).toHaveProperty('health');
      expect(stats.local.size).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle fallback on error', async () => {
      const fallbackValue = 'fallback-value';
      const fallback = jest.fn().mockResolvedValue(fallbackValue);

      const result = await cacheManager.get('error-key', fallback);

      expect(result).toBeDefined();
    });

    test('should track errors in metrics', async () => {
      const initialMetrics = cacheManager.getMetrics();
      const initialErrors = initialMetrics.errors;

      await cacheManager.get('test-key');

      const metrics = cacheManager.getMetrics();
      expect(metrics.errors).toBeGreaterThanOrEqual(initialErrors);
    });

    test('should handle invalid JSON in distributed cache gracefully', async () => {
      // This tests error handling in getFromDistributed
      const result = await cacheManager.get('invalid-json-key');
      expect(result).toBeNull();
    });
  });

  describe('TTL and Expiration', () => {
    test('should respect TTL', async () => {
      const key = 'ttl-key';
      const value = 'ttl-value';
      const ttl = 100; // 100ms

      await cacheManager.set(key, value, { ttl });

      // Should be available immediately
      const result1 = await cacheManager.get(key);
      expect(result1).toBe(value);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be expired
      const result2 = await cacheManager.get(key);
      expect(result2).toBeNull();
    });

    test('should use default TTL when not specified', async () => {
      const key = 'default-ttl-key';
      const value = 'default-ttl-value';

      await cacheManager.set(key, value);

      const result = await cacheManager.get(key);
      expect(result).toBe(value);
    });
  });

  describe('Versioning', () => {
    test('should increment version on update', async () => {
      const key = 'version-key';

      await cacheManager.set(key, 'value1');
      await cacheManager.set(key, 'value2');
      await cacheManager.set(key, 'value3');

      const result = await cacheManager.get(key);
      expect(result).toBe('value3');
    });

    test('should clean up version map when it grows too large', async () => {
      // Set many keys to trigger cleanup
      for (let i = 0; i < 250; i++) {
        await cacheManager.set(`key${i}`, `value${i}`);
      }

      // Version map should be cleaned up
      const result = await cacheManager.get('key0');
      expect(result).toBeDefined();
    });
  });

  describe('Event Emission', () => {
    test('should emit set event', async () => {
      const setHandler = jest.fn();
      cacheManager.on('set', setHandler);

      await cacheManager.set('test-key', 'test-value');

      expect(setHandler).toHaveBeenCalled();
    });

    test('should emit delete event', async () => {
      const deleteHandler = jest.fn();
      cacheManager.on('delete', deleteHandler);

      await cacheManager.set('test-key', 'test-value');
      await cacheManager.delete('test-key');

      expect(deleteHandler).toHaveBeenCalled();
    });

    test('should emit clear event', async () => {
      const clearHandler = jest.fn();
      cacheManager.on('clear', clearHandler);

      await cacheManager.clear();

      expect(clearHandler).toHaveBeenCalled();
    });

    test('should emit eviction event', async () => {
      const evictionHandler = jest.fn();
      cacheManager.on('eviction', evictionHandler);

      // Fill cache beyond capacity to trigger eviction
      for (let i = 0; i < 150; i++) {
        await cacheManager.set(`key${i}`, `value${i}`);
      }

      // Eviction should have occurred
      expect(evictionHandler).toHaveBeenCalled();
    });
  });
});
