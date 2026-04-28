# Cache Invalidation Implementation - Distributed System

## Overview

This document describes the comprehensive implementation of cache invalidation for the distributed Stellar Privacy Analytics system. The solution addresses cache coherence, consistency, performance, and reliability across multiple distributed nodes.

## Problem Statement

The system was experiencing:
- Stale data being served across distributed nodes
- Inconsistent cache states between nodes
- Poor cache hit ratios
- Lack of cache performance monitoring
- No automated cache warming strategies
- Insufficient fallback mechanisms for cache failures

## Solution Architecture

### 1. Distributed Cache Manager (`DistributedCacheManager.ts`)

**Core Features:**
- **Two-tier caching**: Local LRU cache + Redis distributed cache
- **Cache coherence protocol**: Pub/Sub based invalidation propagation
- **Versioning**: Each cache entry has a version number to detect stale data
- **Tag-based invalidation**: Group related cache entries for bulk invalidation
- **Pattern-based invalidation**: Invalidate multiple keys using wildcards
- **Automatic fallback**: Graceful degradation when cache is unavailable

**Key Components:**

```typescript
interface CacheEntry {
  key: string;
  value: any;
  timestamp: number;
  ttl: number;
  version: number;
  nodeId: string;
  tags?: string[];
}

interface CacheInvalidationEvent {
  type: 'invalidate' | 'update' | 'delete' | 'clear';
  keys?: string[];
  pattern?: string;
  tags?: string[];
  nodeId: string;
  timestamp: number;
}
```

**Invalidation Flow:**
1. Node A updates/deletes a cache entry
2. Node A publishes invalidation event to Redis Pub/Sub channel
3. All other nodes (B, C, D...) receive the event
4. Each node invalidates its local cache for affected keys
5. Next request fetches fresh data from source

### 2. Cache Monitor (`CacheMonitor.ts`)

**Monitoring Capabilities:**
- **Real-time metrics**: Hit rate, latency, error rate tracking
- **Health checks**: Periodic validation of cache connectivity
- **Consistency checks**: Verify cache coherence across nodes
- **Freshness checks**: Detect and alert on stale data
- **Alert system**: Configurable thresholds with severity levels
- **Trend analysis**: Historical metrics and performance trends

**Health Report Structure:**
```typescript
interface CacheHealthReport {
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
```

**Alert Types:**
- Low hit rate (< 70%)
- High latency (> 100ms)
- High error rate (> 5%)
- Consistency issues
- Stale data detection
- Cache unavailability

### 3. Cache Warming Strategy (`CacheWarmingStrategy.ts`)

**Warming Strategies:**

1. **Frequently Accessed**: Warm most accessed keys based on usage patterns
2. **Predictive**: ML-based prediction of likely accessed keys
3. **Time-based**: Warm keys based on time-of-day patterns
4. **User-specific**: Pre-load data for active users
5. **Critical Data**: Always keep critical configuration/metadata cached

**Configuration:**
```typescript
interface WarmingStrategy {
  name: string;
  enabled: boolean;
  priority: number;
  schedule?: string; // Cron expression
  trigger?: 'startup' | 'scheduled' | 'manual' | 'threshold';
}
```

**Execution Flow:**
1. Strategy triggered (startup, schedule, or manual)
2. Identify keys to warm based on strategy
3. Load data in batches (configurable concurrency)
4. Populate both local and distributed cache
5. Track metrics (items warmed, duration, errors)

### 4. Performance Tester (`CachePerformanceTester.ts`)

**Testing Capabilities:**
- **Load testing**: Simulate various traffic patterns
- **Benchmarking**: Measure throughput and latency
- **Scenario testing**: Predefined test scenarios (light, normal, heavy, stress)
- **Comparative analysis**: Compare performance across configurations
- **Detailed reporting**: Comprehensive performance reports

**Test Scenarios:**
- Light Load: 5 concurrent, 80% reads
- Normal Load: 10 concurrent, 70% reads
- Heavy Load: 25 concurrent, 65% reads
- Write Heavy: 15 concurrent, 50% writes
- Read Heavy: 20 concurrent, 90% reads
- Stress Test: 50 concurrent, mixed operations

**Metrics Collected:**
- Operations per second
- Latency (min, max, mean, median, P95, P99)
- Hit rate, miss rate, eviction rate
- Error rate
- Throughput (bytes/sec)

## Implementation Details

### Cache Coherence Protocol

**Invalidation Propagation:**
```
Node A                    Redis Pub/Sub              Node B, C, D
   |                           |                           |
   |-- Update cache entry ---->|                           |
   |                           |                           |
   |-- Publish invalidation -->|                           |
   |                           |                           |
   |                           |-- Broadcast event ------->|
   |                           |                           |
   |                           |                           |-- Invalidate local cache
   |                           |                           |
   |                           |                           |-- Fetch fresh data on next request
```

**Version Control:**
- Each cache entry has a monotonically increasing version number
- On update, version is incremented
- Stale entries with lower versions are automatically rejected

### Fallback Mechanisms

**Multi-level Fallback:**
1. Try local cache (fastest)
2. Try distributed cache (Redis)
3. Execute fallback function (load from source)
4. On error, return cached data even if stale (if available)

**Error Handling:**
- Automatic retry with exponential backoff
- Circuit breaker pattern for repeated failures
- Graceful degradation (serve stale data if necessary)
- Comprehensive error logging and alerting

### Performance Optimizations

**Local Cache (LRU):**
- Fast in-memory access (< 1ms)
- Configurable size (default: 10,000 entries)
- Automatic eviction of least recently used entries
- TTL-based expiration

**Distributed Cache (Redis):**
- Persistent storage across restarts
- Shared across all nodes
- Pub/Sub for invalidation events
- Configurable TTL and eviction policies

**Batching:**
- Batch cache operations for efficiency
- Configurable batch size and concurrency
- Parallel processing of independent operations

## API Endpoints

### Cache Management

```
GET    /api/cache/metrics              - Get current cache metrics
GET    /api/cache/statistics           - Get detailed statistics
GET    /api/cache/health               - Get health report
POST   /api/cache/invalidate           - Invalidate cache entries
POST   /api/cache/clear                - Clear all cache
POST   /api/cache/warm                 - Warm cache with data
```

### Monitoring

```
GET    /api/cache/alerts               - Get cache alerts
POST   /api/cache/alerts/:id/resolve   - Resolve alert
GET    /api/cache/metrics/history      - Get metrics history
GET    /api/cache/metrics/trend/:metric - Get metric trend
```

### Warming Strategies

```
GET    /api/cache/warming/strategies           - List strategies
POST   /api/cache/warming/strategies/:name/execute - Execute strategy
PUT    /api/cache/warming/strategies/:name     - Update strategy
GET    /api/cache/warming/tasks                - Get warming tasks
```

### Performance Testing

```
POST   /api/cache/test/performance             - Run custom test
GET    /api/cache/test/scenarios               - List test scenarios
POST   /api/cache/test/scenario/:name          - Run scenario
GET    /api/cache/test/results                 - Get all results
GET    /api/cache/test/results/:id             - Get specific result
GET    /api/cache/test/results/:id/report      - Get test report
```

## Configuration

### Environment Variables

```env
# Redis Configuration
REDIS_URL=redis://localhost:6379

# Cache Configuration
CACHE_NODE_ID=node-1
CACHE_LOCAL_SIZE=10000
CACHE_DEFAULT_TTL=3600000
CACHE_ENABLE_LOCAL=true
CACHE_ENABLE_DISTRIBUTED=true

# Monitoring Configuration
CACHE_MONITOR_INTERVAL=60000
CACHE_HIT_RATE_THRESHOLD=0.7
CACHE_LATENCY_THRESHOLD=100
CACHE_ERROR_RATE_THRESHOLD=0.05

# Warming Configuration
CACHE_WARMING_BATCH_SIZE=100
CACHE_WARMING_CONCURRENCY=5
```

### Programmatic Configuration

```typescript
import { initializeCacheSystem } from './services/cache';

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
    strategies: [
      {
        name: 'frequently-accessed',
        enabled: true,
        priority: 1,
        trigger: 'startup',
        schedule: '*/15 * * * *'
      }
    ]
  }
});
```

## Usage Examples

### Basic Cache Operations

```typescript
// Get with fallback
const userData = await cacheManager.get(
  'user:123',
  async () => {
    // Fallback: load from database
    return await db.users.findById(123);
  },
  { ttl: 3600000, tags: ['user', 'profile'] }
);

// Set cache entry
await cacheManager.set('user:123', userData, {
  ttl: 3600000,
  tags: ['user', 'profile']
});

// Invalidate by pattern
await cacheManager.invalidatePattern('user:*');

// Invalidate by tags
await cacheManager.invalidateByTags(['user', 'profile']);

// Delete specific key
await cacheManager.delete('user:123');

// Clear all cache
await cacheManager.clear();
```

### Monitoring

```typescript
// Get current metrics
const metrics = cacheManager.getMetrics();
console.log(`Hit rate: ${metrics.hitRate * 100}%`);
console.log(`Average latency: ${metrics.averageLatency}ms`);

// Get health report
const health = await cacheMonitor.generateHealthReport();
console.log(`Overall health: ${health.overall}`);
console.log(`Active alerts: ${health.alerts.length}`);

// Get active alerts
const alerts = cacheMonitor.getActiveAlerts();
for (const alert of alerts) {
  console.log(`${alert.severity}: ${alert.message}`);
}
```

### Cache Warming

```typescript
// Execute warming strategy
const task = await warmingStrategy.executeStrategy('frequently-accessed');
console.log(`Warmed ${task.itemsWarmed} items in ${task.duration}ms`);

// Manual cache warming
await cacheManager.warmCache([
  { key: 'config:app', value: appConfig, ttl: 86400000 },
  { key: 'config:features', value: features, ttl: 86400000 }
]);

// Record access patterns for intelligent warming
warmingStrategy.recordAccess('user:123');
warmingStrategy.recordAccess('user:123:profile');
```

### Performance Testing

```typescript
// Run predefined scenario
const result = await performanceTester.runScenario(
  performanceTester.getPredefinedScenarios()[1] // Normal Load
);

console.log(`Throughput: ${result.throughput.operationsPerSecond} ops/sec`);
console.log(`P95 latency: ${result.latency.p95}ms`);
console.log(`Hit rate: ${result.cacheMetrics.hitRate * 100}%`);

// Generate report
const report = performanceTester.generateReport(result.testId);
console.log(report);
```

## Performance Benchmarks

### Expected Performance (Normal Load)

- **Throughput**: 5,000-10,000 operations/second
- **Latency**:
  - Local cache hit: < 1ms
  - Distributed cache hit: 2-5ms
  - Cache miss (with fallback): 10-50ms (depends on source)
- **Hit Rate**: > 80% (with proper warming)
- **Error Rate**: < 1%

### Optimization Tips

1. **Increase local cache size** for frequently accessed data
2. **Use appropriate TTL** values (shorter for dynamic data)
3. **Implement cache warming** for predictable access patterns
4. **Use tag-based invalidation** for related data
5. **Monitor and tune** based on actual usage patterns
6. **Enable compression** for large values
7. **Use batching** for bulk operations

## Monitoring and Alerting

### Key Metrics to Monitor

1. **Hit Rate**: Should be > 70%
2. **Latency**: Should be < 100ms average
3. **Error Rate**: Should be < 5%
4. **Consistency Score**: Should be > 90%
5. **Freshness Score**: Should be > 80%

### Alert Thresholds

- **Critical**: Cache unavailable, error rate > 10%
- **High**: Hit rate < 50%, latency > 200ms, error rate > 5%
- **Medium**: Hit rate < 70%, latency > 100ms, consistency < 90%
- **Low**: Freshness < 80%, high eviction rate

## Troubleshooting

### Common Issues

**1. Low Hit Rate**
- **Cause**: TTL too short, cache size too small, poor warming
- **Solution**: Increase TTL, increase cache size, implement warming strategies

**2. High Latency**
- **Cause**: Network issues, Redis overload, large values
- **Solution**: Optimize network, scale Redis, compress values

**3. Stale Data**
- **Cause**: Invalidation not propagating, version mismatch
- **Solution**: Check Redis Pub/Sub, verify node connectivity

**4. High Error Rate**
- **Cause**: Redis connection issues, serialization errors
- **Solution**: Check Redis health, validate data types

**5. Inconsistent Cache**
- **Cause**: Network partitions, missed invalidation events
- **Solution**: Implement version checking, periodic consistency checks

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
# Run all predefined scenarios
curl -X POST http://localhost:3001/api/cache/test/scenarios

# Run specific scenario
curl -X POST http://localhost:3001/api/cache/test/scenario/Normal%20Load

# Get results
curl http://localhost:3001/api/cache/test/results
```

## Deployment Considerations

### Multi-Node Setup

1. **Ensure Redis is accessible** from all nodes
2. **Configure unique node IDs** for each instance
3. **Use same Redis Pub/Sub channel** across all nodes
4. **Monitor network latency** between nodes and Redis
5. **Implement health checks** for node discovery

### Scaling

- **Horizontal**: Add more application nodes (automatic)
- **Vertical**: Increase Redis memory and CPU
- **Redis Cluster**: For very large deployments
- **Read Replicas**: For read-heavy workloads

### High Availability

- **Redis Sentinel**: Automatic failover
- **Redis Cluster**: Distributed data and failover
- **Backup Strategy**: Regular Redis snapshots
- **Monitoring**: Comprehensive alerting and logging

## Acceptance Criteria - Status

✅ **Implement distributed cache coherence protocol**
- Two-tier caching with local and distributed layers
- Version-based consistency checking
- Pub/Sub based invalidation propagation

✅ **Add cache invalidation event propagation**
- Real-time invalidation across all nodes
- Pattern-based and tag-based invalidation
- Automatic propagation with node filtering

✅ **Optimize cache hit ratios and performance**
- LRU eviction for local cache
- Intelligent warming strategies
- Batching and parallel operations
- Performance benchmarking tools

✅ **Monitor cache consistency and data freshness**
- Real-time metrics collection
- Consistency score calculation
- Freshness tracking
- Historical trend analysis

✅ **Implement cache warming strategies**
- Multiple warming strategies (frequency, predictive, time-based)
- Configurable scheduling
- Access pattern tracking
- Batch warming with concurrency control

✅ **Add fallback mechanisms for cache failures**
- Multi-level fallback (local → distributed → source)
- Graceful degradation
- Error handling with retry logic
- Stale data serving as last resort

✅ **Performance testing and optimization**
- Comprehensive performance testing framework
- Predefined load test scenarios
- Detailed metrics and reporting
- Comparative analysis tools

## Conclusion

This implementation provides a robust, scalable, and production-ready distributed cache invalidation system. It addresses all the acceptance criteria and provides comprehensive monitoring, testing, and optimization capabilities.

The system is designed to handle high-traffic scenarios while maintaining data consistency across distributed nodes, with intelligent warming strategies and fallback mechanisms to ensure reliability.
