/**
 * Simple test runner for cache manager
 * Run with: npx ts-node src/services/cache/__tests__/run-tests.ts
 */

import { DistributedCacheManager } from '../DistributedCacheManager';

// Colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

let passedTests = 0;
let failedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`${colors.green}✓${colors.reset} ${message}`);
  } else {
    failedTests++;
    console.log(`${colors.red}✗${colors.reset} ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEquals(actual: any, expected: any, message: string) {
  const condition = JSON.stringify(actual) === JSON.stringify(expected);
  assert(condition, `${message} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
}

function assertNotNull(value: any, message: string) {
  assert(value !== null && value !== undefined, message);
}

function assertNull(value: any, message: string) {
  assert(value === null, message);
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log(`\n${colors.blue}=== Cache Manager Tests ===${colors.reset}\n`);

  let cacheManager: DistributedCacheManager;

  try {
    // Test 1: Configuration Validation
    console.log(`\n${colors.yellow}Configuration Validation Tests${colors.reset}`);
    
    try {
      new DistributedCacheManager({ localCacheSize: 0 });
      assert(false, 'Should throw error for invalid localCacheSize');
    } catch (e) {
      assert(true, 'Throws error for invalid localCacheSize');
    }

    try {
      new DistributedCacheManager({ defaultTTL: 500 });
      assert(false, 'Should throw error for invalid defaultTTL');
    } catch (e) {
      assert(true, 'Throws error for invalid defaultTTL');
    }

    try {
      new DistributedCacheManager({ healthCheckInterval: 500 });
      assert(false, 'Should throw error for invalid healthCheckInterval');
    } catch (e) {
      assert(true, 'Throws error for invalid healthCheckInterval');
    }

    try {
      new DistributedCacheManager({ maxRetries: -1 });
      assert(false, 'Should throw error for negative maxRetries');
    } catch (e) {
      assert(true, 'Throws error for negative maxRetries');
    }

    // Test 2: Initialization
    console.log(`\n${colors.yellow}Initialization Tests${colors.reset}`);
    
    cacheManager = new DistributedCacheManager({
      nodeId: 'test-node',
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      localCacheSize: 100,
      defaultTTL: 60000,
      enableLocalCache: true,
      enableDistributedCache: false // Disable for local testing
    });

    await cacheManager.initialize();
    assert(true, 'Cache manager initialized successfully');

    // Test 3: Basic Operations
    console.log(`\n${colors.yellow}Basic Operations Tests${colors.reset}`);

    await cacheManager.set('test-key', { data: 'test-value' });
    const result1 = await cacheManager.get('test-key');
    assertEquals(result1, { data: 'test-value' }, 'Set and get cache entry');

    const result2 = await cacheManager.get('non-existent-key');
    assertNull(result2, 'Returns null for non-existent key');

    const fallbackValue = { data: 'fallback-value' };
    const result3 = await cacheManager.get('fallback-key', async () => fallbackValue);
    assertEquals(result3, fallbackValue, 'Uses fallback when key not found');

    // Verify fallback was cached
    const result4 = await cacheManager.get('fallback-key');
    assertEquals(result4, fallbackValue, 'Fallback result was cached');

    await cacheManager.delete('test-key');
    const result5 = await cacheManager.get('test-key');
    assertNull(result5, 'Delete removes cache entry');

    // Test 4: TTL
    console.log(`\n${colors.yellow}TTL Tests${colors.reset}`);

    await cacheManager.set('ttl-key', 'ttl-value', { ttl: 100 });
    const result6 = await cacheManager.get('ttl-key');
    assertEquals(result6, 'ttl-value', 'TTL key available immediately');

    await sleep(150);
    const result7 = await cacheManager.get('ttl-key');
    assertNull(result7, 'TTL key expired after timeout');

    // Test 5: Pattern Invalidation
    console.log(`\n${colors.yellow}Pattern Invalidation Tests${colors.reset}`);

    await cacheManager.set('user:1', 'data1');
    await cacheManager.set('user:2', 'data2');
    await cacheManager.set('post:1', 'data3');

    await cacheManager.invalidatePattern('user:*');

    const result8 = await cacheManager.get('user:1');
    const result9 = await cacheManager.get('user:2');
    const result10 = await cacheManager.get('post:1');

    assertNull(result8, 'user:1 invalidated by pattern');
    assertNull(result9, 'user:2 invalidated by pattern');
    assertEquals(result10, 'data3', 'post:1 not affected by pattern');

    // Test 6: Tag-based Invalidation
    console.log(`\n${colors.yellow}Tag-based Invalidation Tests${colors.reset}`);

    await cacheManager.set('key1', 'value1', { tags: ['user', 'profile'] });
    await cacheManager.set('key2', 'value2', { tags: ['user', 'settings'] });
    await cacheManager.set('key3', 'value3', { tags: ['post'] });

    await cacheManager.invalidateByTags(['user']);

    const result11 = await cacheManager.get('key1');
    const result12 = await cacheManager.get('key2');
    const result13 = await cacheManager.get('key3');

    assertNull(result11, 'key1 invalidated by tag');
    assertNull(result12, 'key2 invalidated by tag');
    assertEquals(result13, 'value3', 'key3 not affected by tag');

    // Test 7: Cache Warming
    console.log(`\n${colors.yellow}Cache Warming Tests${colors.reset}`);

    await cacheManager.warmCache([
      { key: 'warm1', value: 'value1' },
      { key: 'warm2', value: 'value2' },
      { key: 'warm3', value: 'value3' }
    ]);

    const result14 = await cacheManager.get('warm1');
    const result15 = await cacheManager.get('warm2');
    const result16 = await cacheManager.get('warm3');

    assertEquals(result14, 'value1', 'Warmed key1 available');
    assertEquals(result15, 'value2', 'Warmed key2 available');
    assertEquals(result16, 'value3', 'Warmed key3 available');

    // Test 8: Metrics
    console.log(`\n${colors.yellow}Metrics Tests${colors.reset}`);

    cacheManager.resetMetrics();
    
    await cacheManager.set('metrics-key', 'metrics-value');
    await cacheManager.get('metrics-key'); // Hit
    await cacheManager.get('non-existent'); // Miss

    const metrics = cacheManager.getMetrics();
    assert(metrics.localHits > 0, 'Tracks cache hits');
    assert(metrics.totalRequests > 0, 'Tracks total requests');
    assert(metrics.hitRate >= 0 && metrics.hitRate <= 1, 'Calculates hit rate');

    // Test 9: Statistics
    console.log(`\n${colors.yellow}Statistics Tests${colors.reset}`);

    const stats = await cacheManager.getStatistics();
    assertNotNull(stats.nodeId, 'Statistics include nodeId');
    assertNotNull(stats.local, 'Statistics include local cache info');
    assertNotNull(stats.metrics, 'Statistics include metrics');
    assertNotNull(stats.health, 'Statistics include health info');

    // Test 10: Clear
    console.log(`\n${colors.yellow}Clear Tests${colors.reset}`);

    await cacheManager.set('clear1', 'value1');
    await cacheManager.set('clear2', 'value2');
    await cacheManager.clear();

    const result17 = await cacheManager.get('clear1');
    const result18 = await cacheManager.get('clear2');

    assertNull(result17, 'clear1 removed by clear()');
    assertNull(result18, 'clear2 removed by clear()');

    // Test 11: Version Management
    console.log(`\n${colors.yellow}Version Management Tests${colors.reset}`);

    await cacheManager.set('version-key', 'value1');
    await cacheManager.set('version-key', 'value2');
    await cacheManager.set('version-key', 'value3');

    const result19 = await cacheManager.get('version-key');
    assertEquals(result19, 'value3', 'Latest version retrieved');

    // Test version map cleanup
    for (let i = 0; i < 250; i++) {
      await cacheManager.set(`cleanup-key-${i}`, `value-${i}`);
    }
    assert(true, 'Version map cleanup doesn\'t crash');

    // Cleanup
    await cacheManager.shutdown();
    assert(true, 'Cache manager shutdown successfully');

  } catch (error) {
    console.error(`\n${colors.red}Test failed with error:${colors.reset}`, error);
    if (cacheManager) {
      try {
        await cacheManager.shutdown();
      } catch (e) {
        // Ignore shutdown errors
      }
    }
  }

  // Print summary
  console.log(`\n${colors.blue}=== Test Summary ===${colors.reset}`);
  console.log(`Total: ${totalTests}`);
  console.log(`${colors.green}Passed: ${passedTests}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failedTests}${colors.reset}`);
  
  if (failedTests === 0) {
    console.log(`\n${colors.green}✓ All tests passed!${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`\n${colors.red}✗ Some tests failed${colors.reset}\n`);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
