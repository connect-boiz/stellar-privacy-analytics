import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { DistributedCacheManager } from './DistributedCacheManager';

export interface PerformanceTestConfig {
  duration: number; // milliseconds
  concurrency: number;
  operationMix: {
    get: number; // percentage
    set: number;
    delete: number;
    invalidate: number;
  };
  keyCount: number;
  valueSize: number; // bytes
  warmupDuration: number;
}

export interface PerformanceTestResult {
  testId: string;
  config: PerformanceTestConfig;
  startTime: Date;
  endTime: Date;
  duration: number;
  operations: {
    total: number;
    successful: number;
    failed: number;
    get: number;
    set: number;
    delete: number;
    invalidate: number;
  };
  latency: {
    min: number;
    max: number;
    mean: number;
    median: number;
    p95: number;
    p99: number;
  };
  throughput: {
    operationsPerSecond: number;
    bytesPerSecond: number;
  };
  cacheMetrics: {
    hitRate: number;
    missRate: number;
    evictionRate: number;
  };
  errors: Array<{ operation: string; error: string; timestamp: Date }>;
}

export interface LoadTestScenario {
  name: string;
  description: string;
  config: PerformanceTestConfig;
}

/**
 * Cache Performance Tester
 * Comprehensive testing and benchmarking for cache performance
 */
export class CachePerformanceTester extends EventEmitter {
  private cacheManager: DistributedCacheManager;
  private isRunning: boolean = false;
  private testResults: Map<string, PerformanceTestResult> = new Map();

  constructor(cacheManager: DistributedCacheManager) {
    super();
    this.cacheManager = cacheManager;
  }

  /**
   * Run performance test
   */
  async runTest(config: Partial<PerformanceTestConfig> = {}): Promise<PerformanceTestResult> {
    if (this.isRunning) {
      throw new Error('Performance test already running');
    }

    const testConfig: PerformanceTestConfig = {
      duration: config.duration || 60000, // 1 minute
      concurrency: config.concurrency || 10,
      operationMix: config.operationMix || {
        get: 70,
        set: 20,
        delete: 5,
        invalidate: 5
      },
      keyCount: config.keyCount || 1000,
      valueSize: config.valueSize || 1024, // 1KB
      warmupDuration: config.warmupDuration || 5000 // 5 seconds
    };

    const testId = this.generateTestId();
    const result: PerformanceTestResult = {
      testId,
      config: testConfig,
      startTime: new Date(),
      endTime: new Date(),
      duration: 0,
      operations: {
        total: 0,
        successful: 0,
        failed: 0,
        get: 0,
        set: 0,
        delete: 0,
        invalidate: 0
      },
      latency: {
        min: Infinity,
        max: 0,
        mean: 0,
        median: 0,
        p95: 0,
        p99: 0
      },
      throughput: {
        operationsPerSecond: 0,
        bytesPerSecond: 0
      },
      cacheMetrics: {
        hitRate: 0,
        missRate: 0,
        evictionRate: 0
      },
      errors: []
    };

    this.isRunning = true;

    try {
      logger.info('Starting cache performance test', { testId, config: testConfig });
      this.emit('testStarted', { testId, config: testConfig });

      // Warmup phase
      await this.warmup(testConfig);

      // Reset metrics
      this.cacheManager.resetMetrics();

      // Run test
      const startTime = Date.now();
      const latencies: number[] = [];

      const workers = Array.from({ length: testConfig.concurrency }, (_, index) =>
        this.runWorker(index, testConfig, result, latencies, startTime)
      );

      await Promise.all(workers);

      const endTime = Date.now();
      result.endTime = new Date(endTime);
      result.duration = endTime - startTime;

      // Calculate statistics
      this.calculateStatistics(result, latencies);

      // Get cache metrics
      const cacheMetrics = this.cacheManager.getMetrics();
      result.cacheMetrics = {
        hitRate: cacheMetrics.hitRate,
        missRate: 1 - cacheMetrics.hitRate,
        evictionRate: cacheMetrics.evictions / cacheMetrics.totalRequests
      };

      this.testResults.set(testId, result);

      logger.info('Cache performance test completed', {
        testId,
        duration: result.duration,
        operations: result.operations.total,
        throughput: result.throughput.operationsPerSecond
      });

      this.emit('testCompleted', result);

      return result;
    } catch (error) {
      logger.error('Cache performance test failed:', error);
      this.emit('testFailed', { testId, error });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run load test scenario
   */
  async runScenario(scenario: LoadTestScenario): Promise<PerformanceTestResult> {
    logger.info(`Running load test scenario: ${scenario.name}`);
    this.emit('scenarioStarted', scenario);

    const result = await this.runTest(scenario.config);

    this.emit('scenarioCompleted', { scenario, result });

    return result;
  }

  /**
   * Run multiple scenarios
   */
  async runScenarios(scenarios: LoadTestScenario[]): Promise<PerformanceTestResult[]> {
    const results: PerformanceTestResult[] = [];

    for (const scenario of scenarios) {
      const result = await this.runScenario(scenario);
      results.push(result);

      // Wait between scenarios
      await this.sleep(5000);
    }

    return results;
  }

  /**
   * Get predefined scenarios
   */
  getPredefinedScenarios(): LoadTestScenario[] {
    return [
      {
        name: 'Light Load',
        description: 'Simulates light traffic with mostly reads',
        config: {
          duration: 30000,
          concurrency: 5,
          operationMix: { get: 80, set: 15, delete: 3, invalidate: 2 },
          keyCount: 500,
          valueSize: 512,
          warmupDuration: 3000
        }
      },
      {
        name: 'Normal Load',
        description: 'Simulates normal production traffic',
        config: {
          duration: 60000,
          concurrency: 10,
          operationMix: { get: 70, set: 20, delete: 5, invalidate: 5 },
          keyCount: 1000,
          valueSize: 1024,
          warmupDuration: 5000
        }
      },
      {
        name: 'Heavy Load',
        description: 'Simulates peak traffic conditions',
        config: {
          duration: 60000,
          concurrency: 25,
          operationMix: { get: 65, set: 25, delete: 5, invalidate: 5 },
          keyCount: 2000,
          valueSize: 2048,
          warmupDuration: 5000
        }
      },
      {
        name: 'Write Heavy',
        description: 'Simulates write-intensive workload',
        config: {
          duration: 60000,
          concurrency: 15,
          operationMix: { get: 40, set: 50, delete: 5, invalidate: 5 },
          keyCount: 1000,
          valueSize: 1024,
          warmupDuration: 5000
        }
      },
      {
        name: 'Read Heavy',
        description: 'Simulates read-intensive workload',
        config: {
          duration: 60000,
          concurrency: 20,
          operationMix: { get: 90, set: 7, delete: 2, invalidate: 1 },
          keyCount: 1500,
          valueSize: 1024,
          warmupDuration: 5000
        }
      },
      {
        name: 'Stress Test',
        description: 'Pushes cache to its limits',
        config: {
          duration: 120000,
          concurrency: 50,
          operationMix: { get: 60, set: 30, delete: 5, invalidate: 5 },
          keyCount: 5000,
          valueSize: 4096,
          warmupDuration: 10000
        }
      }
    ];
  }

  /**
   * Warmup phase
   */
  private async warmup(config: PerformanceTestConfig): Promise<void> {
    logger.info('Starting warmup phase', { duration: config.warmupDuration });

    const keys = this.generateKeys(config.keyCount);
    const value = this.generateValue(config.valueSize);

    // Pre-populate cache
    const batchSize = 100;
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      await Promise.all(
        batch.map(key => this.cacheManager.set(key, value))
      );
    }

    logger.info('Warmup phase completed');
  }

  /**
   * Run worker
   */
  private async runWorker(
    workerId: number,
    config: PerformanceTestConfig,
    result: PerformanceTestResult,
    latencies: number[],
    startTime: number
  ): Promise<void> {
    const keys = this.generateKeys(config.keyCount);
    const value = this.generateValue(config.valueSize);

    while (Date.now() - startTime < config.duration) {
      const operation = this.selectOperation(config.operationMix);
      const key = keys[Math.floor(Math.random() * keys.length)];

      const opStartTime = Date.now();

      try {
        switch (operation) {
          case 'get':
            await this.cacheManager.get(key);
            result.operations.get++;
            break;

          case 'set':
            await this.cacheManager.set(key, value);
            result.operations.set++;
            break;

          case 'delete':
            await this.cacheManager.delete(key);
            result.operations.delete++;
            break;

          case 'invalidate':
            await this.cacheManager.invalidatePattern(`${key}*`);
            result.operations.invalidate++;
            break;
        }

        const latency = Date.now() - opStartTime;
        latencies.push(latency);

        result.operations.total++;
        result.operations.successful++;

        // Update min/max latency
        result.latency.min = Math.min(result.latency.min, latency);
        result.latency.max = Math.max(result.latency.max, latency);
      } catch (error) {
        result.operations.total++;
        result.operations.failed++;
        result.errors.push({
          operation,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date()
        });
      }
    }
  }

  /**
   * Calculate statistics
   */
  private calculateStatistics(result: PerformanceTestResult, latencies: number[]): void {
    if (latencies.length === 0) {
      return;
    }

    // Sort latencies
    latencies.sort((a, b) => a - b);

    // Calculate mean
    const sum = latencies.reduce((acc, val) => acc + val, 0);
    result.latency.mean = sum / latencies.length;

    // Calculate median
    const mid = Math.floor(latencies.length / 2);
    result.latency.median = latencies.length % 2 === 0
      ? (latencies[mid - 1] + latencies[mid]) / 2
      : latencies[mid];

    // Calculate percentiles
    result.latency.p95 = latencies[Math.floor(latencies.length * 0.95)];
    result.latency.p99 = latencies[Math.floor(latencies.length * 0.99)];

    // Calculate throughput
    const durationSeconds = result.duration / 1000;
    result.throughput.operationsPerSecond = result.operations.total / durationSeconds;
    result.throughput.bytesPerSecond = 
      (result.operations.total * result.config.valueSize) / durationSeconds;
  }

  /**
   * Select operation based on mix
   */
  private selectOperation(mix: PerformanceTestConfig['operationMix']): string {
    const rand = Math.random() * 100;
    let cumulative = 0;

    for (const [operation, percentage] of Object.entries(mix)) {
      cumulative += percentage;
      if (rand <= cumulative) {
        return operation;
      }
    }

    return 'get'; // Default
  }

  /**
   * Generate keys
   */
  private generateKeys(count: number): string[] {
    return Array.from({ length: count }, (_, i) => `test-key-${i}`);
  }

  /**
   * Generate value
   */
  private generateValue(size: number): string {
    return 'x'.repeat(size);
  }

  /**
   * Generate test ID
   */
  private generateTestId(): string {
    return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get test result
   */
  getTestResult(testId: string): PerformanceTestResult | undefined {
    return this.testResults.get(testId);
  }

  /**
   * Get all test results
   */
  getAllTestResults(): PerformanceTestResult[] {
    return Array.from(this.testResults.values());
  }

  /**
   * Generate performance report
   */
  generateReport(testId: string): string {
    const result = this.testResults.get(testId);
    
    if (!result) {
      throw new Error(`Test result not found: ${testId}`);
    }

    const report = `
=== Cache Performance Test Report ===
Test ID: ${result.testId}
Duration: ${result.duration}ms
Start Time: ${result.startTime.toISOString()}
End Time: ${result.endTime.toISOString()}

Configuration:
- Concurrency: ${result.config.concurrency}
- Key Count: ${result.config.keyCount}
- Value Size: ${result.config.valueSize} bytes
- Operation Mix: ${JSON.stringify(result.config.operationMix)}

Operations:
- Total: ${result.operations.total}
- Successful: ${result.operations.successful}
- Failed: ${result.operations.failed}
- GET: ${result.operations.get}
- SET: ${result.operations.set}
- DELETE: ${result.operations.delete}
- INVALIDATE: ${result.operations.invalidate}

Latency (ms):
- Min: ${result.latency.min.toFixed(2)}
- Max: ${result.latency.max.toFixed(2)}
- Mean: ${result.latency.mean.toFixed(2)}
- Median: ${result.latency.median.toFixed(2)}
- P95: ${result.latency.p95.toFixed(2)}
- P99: ${result.latency.p99.toFixed(2)}

Throughput:
- Operations/sec: ${result.throughput.operationsPerSecond.toFixed(2)}
- Bytes/sec: ${(result.throughput.bytesPerSecond / 1024).toFixed(2)} KB/s

Cache Metrics:
- Hit Rate: ${(result.cacheMetrics.hitRate * 100).toFixed(2)}%
- Miss Rate: ${(result.cacheMetrics.missRate * 100).toFixed(2)}%
- Eviction Rate: ${(result.cacheMetrics.evictionRate * 100).toFixed(2)}%

Errors: ${result.errors.length}
${result.errors.slice(0, 10).map(e => `  - ${e.operation}: ${e.error}`).join('\n')}
${result.errors.length > 10 ? `  ... and ${result.errors.length - 10} more` : ''}

======================================
`;

    return report;
  }

  /**
   * Compare test results
   */
  compareResults(testId1: string, testId2: string): any {
    const result1 = this.testResults.get(testId1);
    const result2 = this.testResults.get(testId2);

    if (!result1 || !result2) {
      throw new Error('One or both test results not found');
    }

    const comparison = {
      throughput: {
        test1: result1.throughput.operationsPerSecond,
        test2: result2.throughput.operationsPerSecond,
        improvement: ((result2.throughput.operationsPerSecond - result1.throughput.operationsPerSecond) / 
                     result1.throughput.operationsPerSecond * 100).toFixed(2) + '%'
      },
      latency: {
        mean: {
          test1: result1.latency.mean,
          test2: result2.latency.mean,
          improvement: ((result1.latency.mean - result2.latency.mean) / 
                       result1.latency.mean * 100).toFixed(2) + '%'
        },
        p95: {
          test1: result1.latency.p95,
          test2: result2.latency.p95,
          improvement: ((result1.latency.p95 - result2.latency.p95) / 
                       result1.latency.p95 * 100).toFixed(2) + '%'
        }
      },
      hitRate: {
        test1: result1.cacheMetrics.hitRate,
        test2: result2.cacheMetrics.hitRate,
        improvement: ((result2.cacheMetrics.hitRate - result1.cacheMetrics.hitRate) / 
                     result1.cacheMetrics.hitRate * 100).toFixed(2) + '%'
      },
      errorRate: {
        test1: result1.operations.failed / result1.operations.total,
        test2: result2.operations.failed / result2.operations.total,
        improvement: (((result1.operations.failed / result1.operations.total) - 
                      (result2.operations.failed / result2.operations.total)) / 
                     (result1.operations.failed / result1.operations.total) * 100).toFixed(2) + '%'
      }
    };

    return comparison;
  }
}

export default CachePerformanceTester;
