# Distributed Cache System

A comprehensive distributed caching solution for the Stellar Privacy Analytics platform with cache coherence, monitoring, warming strategies, and performance testing.

## Features

- ✅ **Distributed Cache Coherence**: Real-time invalidation across all nodes
- ✅ **Two-Tier Caching**: Local LRU + Redis distributed cache
- ✅ **Cache Monitoring**: Real-time metrics, alerts, and health checks
- ✅ **Cache Warming**: Intelligent strategies for optimal performance
- ✅ **Performance Testing**: Comprehensive benchmarking and load testing
- ✅ **Fallback Mechanisms**: Multi-level fallback for high availability
- ✅ **Tag-Based Invalidation**: Group and invalidate related entries
- ✅ **Pattern Matching**: Wildcard-based bulk invalidation

## Quick Start

### Installation

```bash
# Already included in the backend
cd backend
npm install
```

### Configuration

```env
# .env
REDIS_URL=redis://localhost:6379
CACHE_NODE_ID=node-1
CACHE_LOCAL_SIZE=10000
CACHE_DEFAULT_TTL=3600000
```

### Basic Usage

```typescript
import { initializeCacheSystem } from './services/cache';

// Initialize
const cacheSystem = await initializeCacheSystem();

// Use cache
const data = await cacheSystem.cacheManager.get(
  'user:123',
  async () => {
    return await database.users.findById(123);
  }
);
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Cache      │  │   Cache      │  │   Cache      │      │
│  │   Monitor    │  │   Warming    │  │   Perf Test  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │        Distributed Cache Manager                     │    │
│  │  ┌──────────────┐         ┌──────────────┐         │    │
│  │  │ Local Cache  │         │   Pub/Sub    │         │    │
│  │  │    (LRU)     │         │  Invalidation│         │    │
│  │  └──────────────┘         └──────────────┘         │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│                      Redis Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Distributed  │  │   Pub/Sub    │  │   Metrics    │      │
│  │    Cache     │  │   Channel    │  │   Storage    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## Components

### DistributedCacheManager

Main cache manager with two-tier caching and invalidation propagation.

```typescript
const cacheManager = new DistributedCacheManager({
  nodeId: 'node-1',
  redisUrl: 'redis://localhost:6379',
  localCacheSize: 10000,
  defaultTTL: 3600000
});

await cacheManager.initialize();
```

**Key Methods:**
- `get(key, fallback?, options?)` - Get value with optional fallback
- `set(key, value, options?)` - Set value with TTL and tags
- `delete(key)` - Delete specific key
- `invalidatePattern(pattern)` - Invalidate by pattern
- `invalidateByTags(tags)` - Invalidate by tags
- `clear()` - Clear all cache
- `warmCache(entries)` - Warm cache with data

### CacheMonitor

Real-time monitoring, health checks, and alerting.

```typescript
const monitor = new CacheMonitor(cacheManager, {
  checkInterval: 60000,
  hitRateThreshold: 0.7,
  latencyThreshold: 100
});

monitor.start();
```

**Key Methods:**
- `generateHealthReport()` - Get comprehensive health report
- `getActiveAlerts()` - Get active alerts
- `getMetricsHistory(duration?)` - Get historical metrics
- `getMetricsTrend(metric, duration?)` - Get metric trends

### CacheWarmingStrategy

Intelligent cache warming based on usage patterns.

```typescript
const warmingStrategy = new CacheWarmingStrategy(cacheManager, {
  batchSize: 100,
  concurrency: 5
});

await warmingStrategy.initialize();
await warmingStrategy.executeStrategy('frequently-accessed');
```

**Strategies:**
- `frequently-accessed` - Warm most accessed keys
- `predictive` - ML-based prediction
- `time-based` - Time-of-day patterns
- `user-specific` - Active user data
- `critical-data` - Critical configuration

### CachePerformanceTester

Comprehensive performance testing and benchmarking.

```typescript
const tester = new CachePerformanceTester(cacheManager);

const result = await tester.runTest({
  duration: 60000,
  concurrency: 10,
  operationMix: { get: 70, set: 20, delete: 5, invalidate: 5 }
});

console.log(tester.generateReport(result.testId));
```

**Scenarios:**
- Light Load
- Normal Load
- Heavy Load
- Write Heavy
- Read Heavy
- Stress Test

## API Reference

### Cache Operations

```typescript
// Get with fallback
const user = await cacheManager.get('user:123', async () => {
  return await db.users.findById(123);
});

// Set with options
await cacheManager.set('user:123', userData, {
  ttl: 1800000,
  tags: ['user', 'profile']
});

// Invalidate by pattern
await cacheManager.invalidatePattern('user:*');

// Invalidate by tags
await cacheManager.invalidateByTags(['user', 'profile']);

// Delete specific key
await cacheManager.delete('user:123');

// Clear all
await cacheManager.clear();
```

### Monitoring

```typescript
// Get metrics
const metrics = cacheManager.getMetrics();
console.log(`Hit rate: ${metrics.hitRate * 100}%`);

// Get health report
const health = await monitor.generateHealthReport();
console.log(`Status: ${health.overall}`);

// Get alerts
const alerts = monitor.getActiveAlerts();
```

### Cache Warming

```typescript
// Execute strategy
await warmingStrategy.executeStrategy('frequently-accessed');

// Manual warming
await cacheManager.warmCache([
  { key: 'config:app', value: config, ttl: 86400000 }
]);

// Record access patterns
warmingStrategy.recordAccess('user:123');
```

### Performance Testing

```typescript
// Run scenario
const result = await tester.runScenario(
  tester.getPredefinedScenarios()[1]
);

// Generate report
const report = tester.generateReport(result.testId);
console.log(report);
```

## REST API

### Management Endpoints

```bash
# Get metrics
GET /api/cache/metrics

# Get statistics
GET /api/cache/statistics

# Get health
GET /api/cache/health

# Invalidate cache
POST /api/cache/invalidate
{
  "pattern": "user:*"
  // or "tags": ["user", "profile"]
  // or "keys": ["user:123", "user:456"]
}

# Clear cache
POST /api/cache/clear

# Warm cache
POST /api/cache/warm
{
  "entries": [
    { "key": "key1", "value": "value1", "ttl": 3600000 }
  ]
}
```

### Monitoring Endpoints

```bash
# Get alerts
GET /api/cache/alerts?active=true

# Resolve alert
POST /api/cache/alerts/:alertId/resolve

# Get metrics history
GET /api/cache/metrics/history?duration=3600000

# Get metric trend
GET /api/cache/metrics/trend/hitRate
```

### Warming Endpoints

```bash
# List strategies
GET /api/cache/warming/strategies

# Execute strategy
POST /api/cache/warming/strategies/frequently-accessed/execute

# Update strategy
PUT /api/cache/warming/strategies/frequently-accessed
{
  "enabled": true,
  "schedule": "*/10 * * * *"
}

# Get tasks
GET /api/cache/warming/tasks?active=true
```

### Testing Endpoints

```bash
# Run performance test
POST /api/cache/test/performance
{
  "duration": 60000,
  "concurrency": 10,
  "operationMix": { "get": 70, "set": 20, "delete": 5, "invalidate": 5 }
}

# Get scenarios
GET /api/cache/test/scenarios

# Run scenario
POST /api/cache/test/scenario/Normal%20Load

# Get results
GET /api/cache/test/results

# Get report
GET /api/cache/test/results/:testId/report
```

## Configuration

### Environment Variables

```env
# Redis
REDIS_URL=redis://localhost:6379

# Cache
CACHE_NODE_ID=node-1
CACHE_LOCAL_SIZE=10000
CACHE_DEFAULT_TTL=3600000
CACHE_ENABLE_LOCAL=true
CACHE_ENABLE_DISTRIBUTED=true

# Monitoring
CACHE_MONITOR_INTERVAL=60000
CACHE_HIT_RATE_THRESHOLD=0.7
CACHE_LATENCY_THRESHOLD=100
CACHE_ERROR_RATE_THRESHOLD=0.05

# Warming
CACHE_WARMING_BATCH_SIZE=100
CACHE_WARMING_CONCURRENCY=5
```

### Programmatic Configuration

```typescript
const cacheSystem = await initializeCacheSystem({
  cache: {
    nodeId: 'node-1',
    redisUrl: 'redis://localhost:6379',
    localCacheSize: 10000,
    defaultTTL: 3600000,
    enableLocalCache: true,
    enableDistributedCache: true
  },
  monitor: {
    checkInterval: 60000,
    hitRateThreshold: 0.7,
    latencyThreshold: 100,
    errorRateThreshold: 0.05
  },
  warming: {
    batchSize: 100,
    concurrency: 5,
    strategies: [...]
  }
});
```

## Performance

### Benchmarks

- **Throughput**: 5,000-10,000 ops/sec
- **Latency**:
  - Local cache hit: < 1ms
  - Distributed cache hit: 2-5ms
  - Cache miss: 10-50ms
- **Hit Rate**: > 80% (with warming)
- **Error Rate**: < 1%

### Optimization Tips

1. Increase local cache size for frequently accessed data
2. Use appropriate TTL values
3. Implement cache warming for predictable patterns
4. Use tag-based invalidation for related data
5. Monitor and tune based on metrics

## Monitoring

### Key Metrics

- **Hit Rate**: Percentage of cache hits
- **Latency**: Average response time
- **Error Rate**: Percentage of errors
- **Consistency**: Cache coherence score
- **Freshness**: Data freshness score

### Alerts

- Low hit rate (< 70%)
- High latency (> 100ms)
- High error rate (> 5%)
- Consistency issues
- Stale data
- Cache unavailability

## Testing

### Unit Tests

```bash
npm test -- backend/src/services/cache
```

### Integration Tests

```bash
npm run test:integration -- cache
```

### Performance Tests

```bash
# Via API
curl -X POST http://localhost:3001/api/cache/test/scenarios

# Programmatically
const result = await tester.runScenario(scenario);
```

## Troubleshooting

### Low Hit Rate

**Symptoms**: Hit rate < 70%

**Solutions**:
1. Increase cache TTL
2. Implement cache warming
3. Review cache key patterns
4. Increase local cache size

### High Latency

**Symptoms**: Average latency > 100ms

**Solutions**:
1. Check Redis connection
2. Optimize data serialization
3. Increase local cache size
4. Review network latency

### Stale Data

**Symptoms**: Serving outdated data

**Solutions**:
1. Verify invalidation is working
2. Check Redis Pub/Sub connectivity
3. Reduce TTL for dynamic data
4. Implement proactive invalidation

### Cache Errors

**Symptoms**: High error rate

**Solutions**:
1. Verify Redis is running
2. Check Redis connection string
3. Review error logs
4. Ensure fallback functions work

## Best Practices

1. **Use appropriate TTL values**
   - Static: 24 hours
   - Semi-static: 1-6 hours
   - Dynamic: 5-30 minutes
   - Real-time: 1-5 minutes

2. **Implement cache warming**
   - Warm critical data on startup
   - Use scheduled warming
   - Track access patterns

3. **Use tags for related data**
   - Group related entries
   - Bulk invalidation
   - Easier management

4. **Monitor cache health**
   - Set up alerts
   - Monitor trends
   - Track error rates

5. **Implement proper invalidation**
   - Invalidate on updates
   - Use pattern matching
   - Consider consistency

6. **Use fallback functions**
   - Always provide fallback
   - Handle errors gracefully
   - Log failures

7. **Test performance regularly**
   - Run load tests
   - Benchmark changes
   - Monitor production

## Documentation

- [Implementation Guide](../../../../../CACHE_INVALIDATION_IMPLEMENTATION.md)
- [Quick Start Guide](../../../../../CACHE_QUICK_START.md)
- [Implementation Summary](../../../../../CACHE_IMPLEMENTATION_SUMMARY.md)

## License

MIT
