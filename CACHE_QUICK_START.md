# Cache Invalidation - Quick Start Guide

## Installation

The cache invalidation system is already integrated into the Stellar Privacy Analytics backend. No additional installation is required.

## Prerequisites

- Redis server running (default: `redis://localhost:6379`)
- Node.js 18+
- Backend service running

## Quick Setup

### 1. Start Redis

```bash
# Using Docker
docker run -d -p 6379:6379 redis:7-alpine

# Or using local Redis
redis-server
```

### 2. Configure Environment

Add to your `.env` file:

```env
# Redis Configuration
REDIS_URL=redis://localhost:6379

# Cache Configuration (optional - these are defaults)
CACHE_NODE_ID=node-1
CACHE_LOCAL_SIZE=10000
CACHE_DEFAULT_TTL=3600000
CACHE_ENABLE_LOCAL=true
CACHE_ENABLE_DISTRIBUTED=true
```

### 3. Initialize Cache System

The cache system is automatically initialized when the backend starts. To manually initialize:

```typescript
import { initializeCacheSystem } from './services/cache';

// Initialize with default configuration
const cacheSystem = await initializeCacheSystem();

// Or with custom configuration
const cacheSystem = await initializeCacheSystem({
  cache: {
    nodeId: 'node-1',
    localCacheSize: 10000,
    defaultTTL: 3600000
  },
  monitor: {
    checkInterval: 60000,
    hitRateThreshold: 0.7
  }
});
```

## Basic Usage

### 1. Simple Get/Set

```typescript
import { cacheManager } from './services/cache';

// Set a value
await cacheManager.set('user:123', { name: 'John', email: 'john@example.com' });

// Get a value
const user = await cacheManager.get('user:123');
console.log(user); // { name: 'John', email: 'john@example.com' }
```

### 2. Get with Fallback

```typescript
// Automatically load from database if not in cache
const user = await cacheManager.get(
  'user:123',
  async () => {
    // This function is called only if cache miss
    return await database.users.findById(123);
  }
);
```

### 3. Cache with TTL and Tags

```typescript
// Set with custom TTL and tags
await cacheManager.set(
  'user:123:profile',
  userProfile,
  {
    ttl: 1800000, // 30 minutes
    tags: ['user', 'profile']
  }
);
```

### 4. Invalidation

```typescript
// Invalidate specific key
await cacheManager.delete('user:123');

// Invalidate by pattern
await cacheManager.invalidatePattern('user:*');

// Invalidate by tags
await cacheManager.invalidateByTags(['user', 'profile']);

// Clear all cache
await cacheManager.clear();
```

## API Usage

### Check Cache Health

```bash
curl http://localhost:3001/api/cache/health
```

Response:
```json
{
  "success": true,
  "data": {
    "timestamp": "2024-01-15T10:30:00.000Z",
    "overall": "healthy",
    "hitRate": 0.85,
    "latency": 45.2,
    "errorRate": 0.01,
    "consistency": 0.95,
    "freshness": 0.92,
    "alerts": [],
    "recommendations": []
  }
}
```

### Get Cache Metrics

```bash
curl http://localhost:3001/api/cache/metrics
```

Response:
```json
{
  "success": true,
  "data": {
    "localHits": 1250,
    "localMisses": 180,
    "distributedHits": 320,
    "distributedMisses": 95,
    "invalidations": 45,
    "evictions": 12,
    "errors": 3,
    "totalRequests": 1845,
    "hitRate": 0.85,
    "averageLatency": 42.5,
    "lastHealthCheck": "2024-01-15T10:29:00.000Z",
    "isHealthy": true
  }
}
```

### Invalidate Cache

```bash
# Invalidate by pattern
curl -X POST http://localhost:3001/api/cache/invalidate \
  -H "Content-Type: application/json" \
  -d '{"pattern": "user:*"}'

# Invalidate by tags
curl -X POST http://localhost:3001/api/cache/invalidate \
  -H "Content-Type: application/json" \
  -d '{"tags": ["user", "profile"]}'

# Invalidate specific keys
curl -X POST http://localhost:3001/api/cache/invalidate \
  -H "Content-Type: application/json" \
  -d '{"keys": ["user:123", "user:456"]}'
```

### Run Performance Test

```bash
# Run predefined scenario
curl -X POST http://localhost:3001/api/cache/test/scenario/Normal%20Load

# Get test results
curl http://localhost:3001/api/cache/test/results
```

## Common Patterns

### 1. User Data Caching

```typescript
async function getUserProfile(userId: string) {
  return await cacheManager.get(
    `user:${userId}:profile`,
    async () => {
      const profile = await db.users.findById(userId);
      return profile;
    },
    {
      ttl: 1800000, // 30 minutes
      tags: ['user', 'profile']
    }
  );
}

// Invalidate when user updates profile
async function updateUserProfile(userId: string, updates: any) {
  await db.users.update(userId, updates);
  
  // Invalidate cache
  await cacheManager.delete(`user:${userId}:profile`);
  // Or invalidate all user-related cache
  await cacheManager.invalidatePattern(`user:${userId}:*`);
}
```

### 2. Query Result Caching

```typescript
async function getAnalyticsData(filters: any) {
  const cacheKey = `analytics:${JSON.stringify(filters)}`;
  
  return await cacheManager.get(
    cacheKey,
    async () => {
      const data = await db.analytics.query(filters);
      return data;
    },
    {
      ttl: 300000, // 5 minutes
      tags: ['analytics']
    }
  );
}

// Invalidate when new data arrives
async function onNewAnalyticsData() {
  await cacheManager.invalidateByTags(['analytics']);
}
```

### 3. Configuration Caching

```typescript
async function getAppConfig() {
  return await cacheManager.get(
    'config:app',
    async () => {
      const config = await db.config.getAppConfig();
      return config;
    },
    {
      ttl: 86400000, // 24 hours
      tags: ['config']
    }
  );
}

// Warm critical configuration on startup
async function warmCriticalCache() {
  await cacheManager.warmCache([
    {
      key: 'config:app',
      value: await db.config.getAppConfig(),
      ttl: 86400000,
      tags: ['config']
    },
    {
      key: 'config:features',
      value: await db.config.getFeatures(),
      ttl: 86400000,
      tags: ['config']
    }
  ]);
}
```

### 4. List/Collection Caching

```typescript
async function getUserList(page: number, limit: number) {
  const cacheKey = `users:list:${page}:${limit}`;
  
  return await cacheManager.get(
    cacheKey,
    async () => {
      const users = await db.users.list(page, limit);
      return users;
    },
    {
      ttl: 600000, // 10 minutes
      tags: ['users', 'list']
    }
  );
}

// Invalidate all list caches when a user is added/updated/deleted
async function onUserChange() {
  await cacheManager.invalidateByTags(['users', 'list']);
}
```

## Monitoring

### View Active Alerts

```bash
curl http://localhost:3001/api/cache/alerts?active=true
```

### View Metrics History

```bash
# Last hour
curl http://localhost:3001/api/cache/metrics/history?duration=3600000

# Last 24 hours
curl http://localhost:3001/api/cache/metrics/history?duration=86400000
```

### View Metric Trends

```bash
# Hit rate trend
curl http://localhost:3001/api/cache/metrics/trend/hitRate

# Latency trend
curl http://localhost:3001/api/cache/metrics/trend/averageLatency
```

## Cache Warming

### Execute Warming Strategy

```bash
# Execute frequently-accessed strategy
curl -X POST http://localhost:3001/api/cache/warming/strategies/frequently-accessed/execute

# Execute critical-data strategy
curl -X POST http://localhost:3001/api/cache/warming/strategies/critical-data/execute
```

### Update Warming Strategy

```bash
curl -X PUT http://localhost:3001/api/cache/warming/strategies/frequently-accessed \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "schedule": "*/10 * * * *"
  }'
```

## Troubleshooting

### Issue: Low Hit Rate

**Check:**
```bash
curl http://localhost:3001/api/cache/metrics
```

**Solutions:**
1. Increase cache TTL
2. Implement cache warming
3. Review cache key patterns
4. Increase local cache size

### Issue: High Latency

**Check:**
```bash
curl http://localhost:3001/api/cache/metrics/trend/averageLatency
```

**Solutions:**
1. Check Redis connection
2. Optimize data serialization
3. Increase local cache size
4. Review network latency

### Issue: Stale Data

**Check:**
```bash
curl http://localhost:3001/api/cache/health
```

**Solutions:**
1. Verify invalidation is working
2. Check Redis Pub/Sub connectivity
3. Reduce TTL for dynamic data
4. Implement proactive invalidation

### Issue: Cache Errors

**Check:**
```bash
curl http://localhost:3001/api/cache/alerts
```

**Solutions:**
1. Verify Redis is running
2. Check Redis connection string
3. Review error logs
4. Ensure fallback functions are working

## Performance Testing

### Run All Scenarios

```bash
# Get available scenarios
curl http://localhost:3001/api/cache/test/scenarios

# Run each scenario
curl -X POST http://localhost:3001/api/cache/test/scenario/Light%20Load
curl -X POST http://localhost:3001/api/cache/test/scenario/Normal%20Load
curl -X POST http://localhost:3001/api/cache/test/scenario/Heavy%20Load
```

### Custom Performance Test

```bash
curl -X POST http://localhost:3001/api/cache/test/performance \
  -H "Content-Type: application/json" \
  -d '{
    "duration": 60000,
    "concurrency": 10,
    "operationMix": {
      "get": 70,
      "set": 20,
      "delete": 5,
      "invalidate": 5
    },
    "keyCount": 1000,
    "valueSize": 1024
  }'
```

### View Test Report

```bash
# Get test results
curl http://localhost:3001/api/cache/test/results

# Get specific test report
curl http://localhost:3001/api/cache/test/results/{testId}/report
```

## Best Practices

1. **Use appropriate TTL values**
   - Static data: 24 hours
   - Semi-static data: 1-6 hours
   - Dynamic data: 5-30 minutes
   - Real-time data: 1-5 minutes

2. **Implement cache warming**
   - Warm critical data on startup
   - Use scheduled warming for predictable patterns
   - Track access patterns for intelligent warming

3. **Use tags for related data**
   - Group related cache entries
   - Bulk invalidation when needed
   - Easier cache management

4. **Monitor cache health**
   - Set up alerts for low hit rate
   - Monitor latency trends
   - Track error rates

5. **Implement proper invalidation**
   - Invalidate on data updates
   - Use pattern matching for bulk invalidation
   - Consider eventual consistency trade-offs

6. **Use fallback functions**
   - Always provide fallback for cache misses
   - Handle errors gracefully
   - Log cache failures

7. **Test performance regularly**
   - Run load tests before deployment
   - Benchmark after configuration changes
   - Monitor production metrics

## Next Steps

1. Review the [full implementation documentation](./CACHE_INVALIDATION_IMPLEMENTATION.md)
2. Set up monitoring and alerting
3. Configure cache warming strategies
4. Run performance tests
5. Tune configuration based on metrics

## Support

For issues or questions:
- Check the logs: `backend/logs/`
- Review metrics: `GET /api/cache/metrics`
- Check health: `GET /api/cache/health`
- View alerts: `GET /api/cache/alerts`
