import { OptimizedAnonymizationWorker, WorkerConfig } from '../workers/optimizedAnonymizationWorker';
import { logger } from '../utils/logger';

export interface LoadTestConfig {
  duration: number; // Test duration in milliseconds
  jobsPerSecond: number; // Target jobs per second
  priorityDistribution: {
    critical: number; // Percentage
    high: number;
    normal: number;
    low: number;
  };
  datasetSizes: {
    small: number; // Percentage
    medium: number;
    large: number;
  };
  rampUpTime: number; // Ramp up time in milliseconds
  rampDownTime: number; // Ramp down time in milliseconds
}

export interface LoadTestResults {
  testConfig: LoadTestConfig;
  startTime: Date;
  endTime: Date;
  duration: number;
  totalJobsSubmitted: number;
  totalJobsCompleted: number;
  totalJobsFailed: number;
  averageProcessingTime: number;
  minProcessingTime: number;
  maxProcessingTime: number;
  p50ProcessingTime: number;
  p95ProcessingTime: number;
  p99ProcessingTime: number;
  throughput: number; // Jobs per second
  errorRate: number; // Percentage
  queueDepthOverTime: Array<{
    timestamp: Date;
    waiting: number;
    active: number;
  }>;
  workerMetrics: {
    averageConcurrency: number;
    maxConcurrency: number;
    scalingEvents: number;
  };
  recommendations: string[];
}

export class LoadTester {
  private worker: OptimizedAnonymizationWorker;
  private config: LoadTestConfig;
  private results: Partial<LoadTestResults> = {};
  private processingTimes: number[] = [];
  private queueDepthSamples: Array<{ timestamp: Date; waiting: number; active: number }> = [];
  private isRunning: boolean = false;
  private jobsSubmitted: number = 0;
  private jobsCompleted: number = 0;
  private jobsFailed: number = 0;

  constructor(worker: OptimizedAnonymizationWorker, config: LoadTestConfig) {
    this.worker = worker;
    this.config = config;
  }

  /**
   * Run load test
   */
  async run(): Promise<LoadTestResults> {
    logger.info('Starting load test', {
      duration: this.config.duration,
      jobsPerSecond: this.config.jobsPerSecond,
    });

    this.isRunning = true;
    const startTime = new Date();

    // Start monitoring
    const monitoringInterval = this.startMonitoring();

    try {
      // Ramp up phase
      await this.rampUp();

      // Sustained load phase
      await this.sustainedLoad();

      // Ramp down phase
      await this.rampDown();

      // Wait for remaining jobs to complete
      await this.waitForCompletion();

      const endTime = new Date();

      // Stop monitoring
      clearInterval(monitoringInterval);

      // Calculate results
      return this.calculateResults(startTime, endTime);
    } catch (error) {
      logger.error('Load test failed:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Ramp up phase - gradually increase load
   */
  private async rampUp(): Promise<void> {
    logger.info('Load test: Ramp up phase');

    const steps = 10;
    const stepDuration = this.config.rampUpTime / steps;
    const targetRate = this.config.jobsPerSecond;

    for (let i = 1; i <= steps; i++) {
      const currentRate = (targetRate * i) / steps;
      await this.generateLoad(currentRate, stepDuration);
    }
  }

  /**
   * Sustained load phase - maintain target load
   */
  private async sustainedLoad(): Promise<void> {
    logger.info('Load test: Sustained load phase');

    const sustainedDuration = this.config.duration - this.config.rampUpTime - this.config.rampDownTime;
    await this.generateLoad(this.config.jobsPerSecond, sustainedDuration);
  }

  /**
   * Ramp down phase - gradually decrease load
   */
  private async rampDown(): Promise<void> {
    logger.info('Load test: Ramp down phase');

    const steps = 10;
    const stepDuration = this.config.rampDownTime / steps;
    const targetRate = this.config.jobsPerSecond;

    for (let i = steps - 1; i >= 0; i--) {
      const currentRate = (targetRate * i) / steps;
      await this.generateLoad(currentRate, stepDuration);
    }
  }

  /**
   * Generate load at specified rate
   */
  private async generateLoad(jobsPerSecond: number, duration: number): Promise<void> {
    const interval = 1000 / jobsPerSecond;
    const endTime = Date.now() + duration;

    while (Date.now() < endTime && this.isRunning) {
      await this.submitJob();
      await this.sleep(interval);
    }
  }

  /**
   * Submit a test job
   */
  private async submitJob(): Promise<void> {
    try {
      const priority = this.selectPriority();
      const datasetSize = this.selectDatasetSize();
      const metadata = this.generateMetadata(datasetSize);

      const jobId = await this.worker.addJob({
        datasetId: `test_dataset_${this.jobsSubmitted}`,
        metadata,
        priority,
      });

      this.jobsSubmitted++;

      // Track job completion
      this.trackJobCompletion(jobId);
    } catch (error) {
      logger.error('Failed to submit job:', error);
      this.jobsFailed++;
    }
  }

  /**
   * Track job completion
   */
  private async trackJobCompletion(jobId: string): Promise<void> {
    const startTime = Date.now();

    try {
      // Poll for job completion
      const maxWaitTime = 300000; // 5 minutes
      const pollInterval = 1000; // 1 second
      let elapsed = 0;

      while (elapsed < maxWaitTime) {
        try {
          const status = await this.worker.getJobStatus(jobId);
          
          if (status.finishedOn) {
            const processingTime = Date.now() - startTime;
            this.processingTimes.push(processingTime);
            this.jobsCompleted++;
            return;
          }

          if (status.failedReason) {
            this.jobsFailed++;
            return;
          }
        } catch (error) {
          // Job might not be found yet
        }

        await this.sleep(pollInterval);
        elapsed += pollInterval;
      }

      // Timeout
      this.jobsFailed++;
    } catch (error) {
      logger.error('Error tracking job completion:', error);
      this.jobsFailed++;
    }
  }

  /**
   * Start monitoring queue depth
   */
  private startMonitoring(): NodeJS.Timeout {
    return setInterval(async () => {
      try {
        const stats = await this.worker.getQueueStats();
        this.queueDepthSamples.push({
          timestamp: new Date(),
          waiting: stats.waiting,
          active: stats.active,
        });
      } catch (error) {
        logger.error('Error monitoring queue depth:', error);
      }
    }, 5000); // Sample every 5 seconds
  }

  /**
   * Wait for all jobs to complete
   */
  private async waitForCompletion(): Promise<void> {
    logger.info('Waiting for remaining jobs to complete...');

    const maxWaitTime = 600000; // 10 minutes
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const stats = await this.worker.getQueueStats();
      
      if (stats.waiting === 0 && stats.active === 0) {
        logger.info('All jobs completed');
        return;
      }

      await this.sleep(5000);
    }

    logger.warn('Timeout waiting for jobs to complete');
  }

  /**
   * Calculate test results
   */
  private calculateResults(startTime: Date, endTime: Date): LoadTestResults {
    const duration = endTime.getTime() - startTime.getTime();
    const sortedTimes = this.processingTimes.sort((a, b) => a - b);

    const results: LoadTestResults = {
      testConfig: this.config,
      startTime,
      endTime,
      duration,
      totalJobsSubmitted: this.jobsSubmitted,
      totalJobsCompleted: this.jobsCompleted,
      totalJobsFailed: this.jobsFailed,
      averageProcessingTime: this.calculateAverage(this.processingTimes),
      minProcessingTime: Math.min(...this.processingTimes),
      maxProcessingTime: Math.max(...this.processingTimes),
      p50ProcessingTime: this.calculatePercentile(sortedTimes, 50),
      p95ProcessingTime: this.calculatePercentile(sortedTimes, 95),
      p99ProcessingTime: this.calculatePercentile(sortedTimes, 99),
      throughput: (this.jobsCompleted / duration) * 1000, // Jobs per second
      errorRate: (this.jobsFailed / this.jobsSubmitted) * 100,
      queueDepthOverTime: this.queueDepthSamples,
      workerMetrics: {
        averageConcurrency: 0, // Would need to track this
        maxConcurrency: 0,
        scalingEvents: 0,
      },
      recommendations: this.generateRecommendations(),
    };

    logger.info('Load test completed', {
      totalJobsSubmitted: results.totalJobsSubmitted,
      totalJobsCompleted: results.totalJobsCompleted,
      totalJobsFailed: results.totalJobsFailed,
      throughput: results.throughput.toFixed(2),
      errorRate: results.errorRate.toFixed(2),
    });

    return results;
  }

  /**
   * Generate recommendations based on test results
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    // Check error rate
    const errorRate = (this.jobsFailed / this.jobsSubmitted) * 100;
    if (errorRate > 5) {
      recommendations.push(
        `High error rate (${errorRate.toFixed(2)}%). Consider increasing worker concurrency or investigating failures.`
      );
    }

    // Check queue depth
    const avgQueueDepth = this.calculateAverage(
      this.queueDepthSamples.map(s => s.waiting + s.active)
    );
    if (avgQueueDepth > 1000) {
      recommendations.push(
        `High average queue depth (${avgQueueDepth.toFixed(0)}). Consider horizontal scaling or increasing worker concurrency.`
      );
    }

    // Check processing times
    const p95Time = this.calculatePercentile(this.processingTimes.sort((a, b) => a - b), 95);
    if (p95Time > 60000) {
      recommendations.push(
        `High P95 processing time (${(p95Time / 1000).toFixed(2)}s). Consider optimizing job processing or adding more workers.`
      );
    }

    // Check throughput
    const targetThroughput = this.config.jobsPerSecond;
    const actualThroughput = this.jobsCompleted / (this.config.duration / 1000);
    if (actualThroughput < targetThroughput * 0.8) {
      recommendations.push(
        `Throughput below target (${actualThroughput.toFixed(2)} vs ${targetThroughput} jobs/s). System may be under-provisioned.`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('System performance is within acceptable parameters.');
    }

    return recommendations;
  }

  private selectPriority(): 'critical' | 'high' | 'normal' | 'low' {
    const rand = Math.random() * 100;
    const dist = this.config.priorityDistribution;

    if (rand < dist.critical) return 'critical';
    if (rand < dist.critical + dist.high) return 'high';
    if (rand < dist.critical + dist.high + dist.normal) return 'normal';
    return 'low';
  }

  private selectDatasetSize(): 'small' | 'medium' | 'large' {
    const rand = Math.random() * 100;
    const sizes = this.config.datasetSizes;

    if (rand < sizes.small) return 'small';
    if (rand < sizes.small + sizes.medium) return 'medium';
    return 'large';
  }

  private generateMetadata(size: 'small' | 'medium' | 'large'): Record<string, any> {
    const fieldCounts = {
      small: 5,
      medium: 20,
      large: 50,
    };

    const fieldCount = fieldCounts[size];
    const metadata: Record<string, any> = {};

    for (let i = 0; i < fieldCount; i++) {
      metadata[`field_${i}`] = this.generateRandomValue();
    }

    return metadata;
  }

  private generateRandomValue(): string {
    const types = ['email', 'phone', 'name', 'address', 'text'];
    const type = types[Math.floor(Math.random() * types.length)];

    switch (type) {
      case 'email':
        return `user${Math.random().toString(36).substring(7)}@example.com`;
      case 'phone':
        return `+1${Math.floor(Math.random() * 10000000000)}`;
      case 'name':
        return `John Doe ${Math.random().toString(36).substring(7)}`;
      case 'address':
        return `${Math.floor(Math.random() * 9999)} Main St, City, State`;
      default:
        return `Random text ${Math.random().toString(36).substring(7)}`;
    }
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[index];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Run a predefined load test scenario
 */
export async function runLoadTestScenario(
  worker: OptimizedAnonymizationWorker,
  scenario: 'light' | 'moderate' | 'heavy' | 'peak'
): Promise<LoadTestResults> {
  const scenarios: Record<string, LoadTestConfig> = {
    light: {
      duration: 300000, // 5 minutes
      jobsPerSecond: 10,
      priorityDistribution: { critical: 5, high: 15, normal: 60, low: 20 },
      datasetSizes: { small: 70, medium: 25, large: 5 },
      rampUpTime: 30000,
      rampDownTime: 30000,
    },
    moderate: {
      duration: 600000, // 10 minutes
      jobsPerSecond: 50,
      priorityDistribution: { critical: 10, high: 20, normal: 50, low: 20 },
      datasetSizes: { small: 50, medium: 40, large: 10 },
      rampUpTime: 60000,
      rampDownTime: 60000,
    },
    heavy: {
      duration: 900000, // 15 minutes
      jobsPerSecond: 100,
      priorityDistribution: { critical: 15, high: 25, normal: 40, low: 20 },
      datasetSizes: { small: 40, medium: 40, large: 20 },
      rampUpTime: 120000,
      rampDownTime: 120000,
    },
    peak: {
      duration: 1200000, // 20 minutes
      jobsPerSecond: 200,
      priorityDistribution: { critical: 20, high: 30, normal: 35, low: 15 },
      datasetSizes: { small: 30, medium: 50, large: 20 },
      rampUpTime: 180000,
      rampDownTime: 180000,
    },
  };

  const config = scenarios[scenario];
  const tester = new LoadTester(worker, config);
  
  return tester.run();
}
