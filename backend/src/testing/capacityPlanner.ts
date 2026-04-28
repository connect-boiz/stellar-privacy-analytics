import { LoadTestResults } from './loadTest';
import { logger } from '../utils/logger';

export interface CapacityRequirements {
  expectedJobsPerSecond: number;
  peakJobsPerSecond: number;
  averageJobSize: 'small' | 'medium' | 'large';
  priorityDistribution: {
    critical: number;
    high: number;
    normal: number;
    low: number;
  };
  slaRequirements: {
    maxProcessingTime: number; // milliseconds
    maxQueueDepth: number;
    minThroughput: number; // jobs per second
    maxErrorRate: number; // percentage
  };
}

export interface CapacityRecommendations {
  workers: {
    minimum: number;
    recommended: number;
    peak: number;
  };
  concurrency: {
    perWorker: number;
    total: number;
  };
  redis: {
    memory: string;
    connections: number;
    recommendedConfig: Record<string, any>;
  };
  postgres: {
    connections: number;
    readReplicas: number;
    recommendedConfig: Record<string, any>;
  };
  infrastructure: {
    cpu: string;
    memory: string;
    network: string;
  };
  scaling: {
    enableDynamicScaling: boolean;
    scaleUpThreshold: number;
    scaleDownThreshold: number;
    minWorkers: number;
    maxWorkers: number;
  };
  monitoring: {
    alertThresholds: Record<string, number>;
    metricsInterval: number;
  };
  estimatedCosts: {
    monthly: number;
    perMillionJobs: number;
  };
  warnings: string[];
  optimizations: string[];
}

export class CapacityPlanner {
  /**
   * Analyze load test results and generate capacity recommendations
   */
  static analyzeLoadTest(
    results: LoadTestResults,
    requirements: CapacityRequirements
  ): CapacityRecommendations {
    logger.info('Analyzing load test results for capacity planning');

    const recommendations: CapacityRecommendations = {
      workers: this.calculateWorkerRequirements(results, requirements),
      concurrency: this.calculateConcurrencyRequirements(results, requirements),
      redis: this.calculateRedisRequirements(results, requirements),
      postgres: this.calculatePostgresRequirements(results, requirements),
      infrastructure: this.calculateInfrastructureRequirements(results, requirements),
      scaling: this.calculateScalingParameters(results, requirements),
      monitoring: this.calculateMonitoringRequirements(results, requirements),
      estimatedCosts: this.estimateCosts(results, requirements),
      warnings: [],
      optimizations: [],
    };

    // Generate warnings
    recommendations.warnings = this.generateWarnings(results, requirements, recommendations);

    // Generate optimization suggestions
    recommendations.optimizations = this.generateOptimizations(results, requirements, recommendations);

    return recommendations;
  }

  /**
   * Calculate worker requirements
   */
  private static calculateWorkerRequirements(
    results: LoadTestResults,
    requirements: CapacityRequirements
  ): CapacityRecommendations['workers'] {
    const actualThroughput = results.throughput;
    const targetThroughput = requirements.expectedJobsPerSecond;
    const peakThroughput = requirements.peakJobsPerSecond;

    // Calculate workers needed based on throughput
    const throughputPerWorker = actualThroughput / (results.workerMetrics.averageConcurrency || 1);
    
    const minimumWorkers = Math.ceil(targetThroughput / throughputPerWorker);
    const recommendedWorkers = Math.ceil(minimumWorkers * 1.5); // 50% buffer
    const peakWorkers = Math.ceil(peakThroughput / throughputPerWorker);

    return {
      minimum: Math.max(minimumWorkers, 2),
      recommended: Math.max(recommendedWorkers, 3),
      peak: Math.max(peakWorkers, 5),
    };
  }

  /**
   * Calculate concurrency requirements
   */
  private static calculateConcurrencyRequirements(
    results: LoadTestResults,
    requirements: CapacityRequirements
  ): CapacityRecommendations['concurrency'] {
    const avgProcessingTime = results.averageProcessingTime / 1000; // Convert to seconds
    const targetThroughput = requirements.expectedJobsPerSecond;

    // Little's Law: L = λ * W
    // Where L = concurrency, λ = arrival rate, W = processing time
    const requiredConcurrency = Math.ceil(targetThroughput * avgProcessingTime);

    const recommendedWorkers = this.calculateWorkerRequirements(results, requirements).recommended;
    const concurrencyPerWorker = Math.ceil(requiredConcurrency / recommendedWorkers);

    return {
      perWorker: Math.max(concurrencyPerWorker, 5),
      total: requiredConcurrency,
    };
  }

  /**
   * Calculate Redis requirements
   */
  private static calculateRedisRequirements(
    results: LoadTestResults,
    requirements: CapacityRequirements
  ): CapacityRecommendations['redis'] {
    const maxQueueDepth = Math.max(...results.queueDepthOverTime.map(s => s.waiting + s.active));
    const avgJobSize = this.estimateJobSize(requirements.averageJobSize);
    
    // Estimate memory needed (jobs + metadata + overhead)
    const memoryPerJob = avgJobSize * 2; // 2x for safety
    const totalMemoryBytes = maxQueueDepth * memoryPerJob * 1.5; // 50% buffer
    const memoryGB = Math.ceil(totalMemoryBytes / (1024 * 1024 * 1024));

    const recommendedWorkers = this.calculateWorkerRequirements(results, requirements).recommended;
    const connectionsPerWorker = 10;
    const totalConnections = recommendedWorkers * connectionsPerWorker;

    return {
      memory: `${Math.max(memoryGB, 2)}GB`,
      connections: totalConnections,
      recommendedConfig: {
        maxmemory: `${Math.max(memoryGB, 2)}gb`,
        'maxmemory-policy': 'allkeys-lru',
        'tcp-backlog': 511,
        timeout: 300,
        'tcp-keepalive': 60,
        'maxclients': totalConnections + 100,
      },
    };
  }

  /**
   * Calculate PostgreSQL requirements
   */
  private static calculatePostgresRequirements(
    results: LoadTestResults,
    requirements: CapacityRequirements
  ): CapacityRecommendations['postgres'] {
    const recommendedWorkers = this.calculateWorkerRequirements(results, requirements).recommended;
    const connectionsPerWorker = 5;
    const totalConnections = recommendedWorkers * connectionsPerWorker;

    // Recommend read replicas for high throughput
    const readReplicas = requirements.expectedJobsPerSecond > 100 ? 2 : 1;

    return {
      connections: totalConnections,
      readReplicas,
      recommendedConfig: {
        max_connections: totalConnections + 50,
        shared_buffers: '256MB',
        effective_cache_size: '1GB',
        maintenance_work_mem: '64MB',
        checkpoint_completion_target: 0.9,
        wal_buffers: '16MB',
        default_statistics_target: 100,
        random_page_cost: 1.1,
        effective_io_concurrency: 200,
        work_mem: '4MB',
        min_wal_size: '1GB',
        max_wal_size: '4GB',
      },
    };
  }

  /**
   * Calculate infrastructure requirements
   */
  private static calculateInfrastructureRequirements(
    results: LoadTestResults,
    requirements: CapacityRequirements
  ): CapacityRecommendations['infrastructure'] {
    const recommendedWorkers = this.calculateWorkerRequirements(results, requirements).recommended;
    const concurrencyPerWorker = this.calculateConcurrencyRequirements(results, requirements).perWorker;

    // CPU: 1 core per 5 concurrent jobs
    const cpuCoresPerWorker = Math.ceil(concurrencyPerWorker / 5);
    const totalCpuCores = recommendedWorkers * cpuCoresPerWorker;

    // Memory: 2GB base + 100MB per concurrent job
    const memoryPerWorker = 2 + (concurrencyPerWorker * 0.1);
    const totalMemoryGB = Math.ceil(recommendedWorkers * memoryPerWorker);

    // Network: Estimate based on job size and throughput
    const avgJobSize = this.estimateJobSize(requirements.averageJobSize);
    const networkMbps = Math.ceil((requirements.peakJobsPerSecond * avgJobSize * 8) / (1024 * 1024));

    return {
      cpu: `${totalCpuCores} vCPUs (${cpuCoresPerWorker} per worker)`,
      memory: `${totalMemoryGB}GB (${memoryPerWorker.toFixed(1)}GB per worker)`,
      network: `${Math.max(networkMbps, 100)}Mbps`,
    };
  }

  /**
   * Calculate scaling parameters
   */
  private static calculateScalingParameters(
    results: LoadTestResults,
    requirements: CapacityRequirements
  ): CapacityRecommendations['scaling'] {
    const workers = this.calculateWorkerRequirements(results, requirements);
    const avgQueueDepth = results.queueDepthOverTime.reduce(
      (sum, s) => sum + s.waiting + s.active,
      0
    ) / results.queueDepthOverTime.length;

    return {
      enableDynamicScaling: true,
      scaleUpThreshold: Math.ceil(avgQueueDepth * 1.5),
      scaleDownThreshold: Math.ceil(avgQueueDepth * 0.5),
      minWorkers: workers.minimum,
      maxWorkers: workers.peak,
    };
  }

  /**
   * Calculate monitoring requirements
   */
  private static calculateMonitoringRequirements(
    results: LoadTestResults,
    requirements: CapacityRequirements
  ): CapacityRecommendations['monitoring'] {
    return {
      alertThresholds: {
        queueDepth: requirements.slaRequirements.maxQueueDepth,
        processingTime: requirements.slaRequirements.maxProcessingTime,
        errorRate: requirements.slaRequirements.maxErrorRate,
        throughput: requirements.slaRequirements.minThroughput,
        workerHealth: 80, // Percentage of healthy workers
        memoryUsage: 85, // Percentage
        cpuUsage: 80, // Percentage
      },
      metricsInterval: 30000, // 30 seconds
    };
  }

  /**
   * Estimate costs
   */
  private static estimateCosts(
    results: LoadTestResults,
    requirements: CapacityRequirements
  ): CapacityRecommendations['estimatedCosts'] {
    const workers = this.calculateWorkerRequirements(results, requirements);
    const infrastructure = this.calculateInfrastructureRequirements(results, requirements);

    // Rough cost estimates (adjust based on cloud provider)
    const costPerWorkerPerMonth = 100; // $100/month per worker instance
    const redisCostPerMonth = 50; // $50/month for Redis
    const postgresCostPerMonth = 100; // $100/month for PostgreSQL

    const monthlyCost = 
      (workers.recommended * costPerWorkerPerMonth) +
      redisCostPerMonth +
      postgresCostPerMonth;

    const jobsPerMonth = requirements.expectedJobsPerSecond * 60 * 60 * 24 * 30;
    const costPerMillionJobs = (monthlyCost / jobsPerMonth) * 1000000;

    return {
      monthly: monthlyCost,
      perMillionJobs: Math.round(costPerMillionJobs * 100) / 100,
    };
  }

  /**
   * Generate warnings
   */
  private static generateWarnings(
    results: LoadTestResults,
    requirements: CapacityRequirements,
    recommendations: CapacityRecommendations
  ): string[] {
    const warnings: string[] = [];

    // Check if SLA requirements are met
    if (results.p95ProcessingTime > requirements.slaRequirements.maxProcessingTime) {
      warnings.push(
        `P95 processing time (${results.p95ProcessingTime}ms) exceeds SLA requirement (${requirements.slaRequirements.maxProcessingTime}ms)`
      );
    }

    if (results.errorRate > requirements.slaRequirements.maxErrorRate) {
      warnings.push(
        `Error rate (${results.errorRate.toFixed(2)}%) exceeds SLA requirement (${requirements.slaRequirements.maxErrorRate}%)`
      );
    }

    if (results.throughput < requirements.slaRequirements.minThroughput) {
      warnings.push(
        `Throughput (${results.throughput.toFixed(2)} jobs/s) below SLA requirement (${requirements.slaRequirements.minThroughput} jobs/s)`
      );
    }

    const maxQueueDepth = Math.max(...results.queueDepthOverTime.map(s => s.waiting + s.active));
    if (maxQueueDepth > requirements.slaRequirements.maxQueueDepth) {
      warnings.push(
        `Max queue depth (${maxQueueDepth}) exceeds SLA requirement (${requirements.slaRequirements.maxQueueDepth})`
      );
    }

    return warnings;
  }

  /**
   * Generate optimization suggestions
   */
  private static generateOptimizations(
    results: LoadTestResults,
    requirements: CapacityRequirements,
    recommendations: CapacityRecommendations
  ): string[] {
    const optimizations: string[] = [];

    // Check for optimization opportunities
    if (results.p99ProcessingTime > results.p95ProcessingTime * 2) {
      optimizations.push(
        'High variance in processing times detected. Consider implementing job batching or optimizing slow jobs.'
      );
    }

    if (recommendations.workers.peak > recommendations.workers.recommended * 2) {
      optimizations.push(
        'Large difference between recommended and peak workers. Consider implementing more aggressive auto-scaling.'
      );
    }

    const avgQueueDepth = results.queueDepthOverTime.reduce(
      (sum, s) => sum + s.waiting + s.active,
      0
    ) / results.queueDepthOverTime.length;

    if (avgQueueDepth > 500) {
      optimizations.push(
        'High average queue depth. Consider increasing worker concurrency or implementing priority queues.'
      );
    }

    if (results.errorRate > 1) {
      optimizations.push(
        'Error rate above 1%. Investigate failure causes and implement better error handling.'
      );
    }

    optimizations.push('Enable connection pooling for Redis and PostgreSQL to improve performance.');
    optimizations.push('Implement caching for frequently accessed metadata to reduce database load.');
    optimizations.push('Consider using read replicas for PostgreSQL to distribute read load.');
    optimizations.push('Enable batch processing for similar jobs to improve throughput.');

    return optimizations;
  }

  /**
   * Estimate job size in bytes
   */
  private static estimateJobSize(size: 'small' | 'medium' | 'large'): number {
    const sizes = {
      small: 1024, // 1KB
      medium: 10240, // 10KB
      large: 102400, // 100KB
    };
    return sizes[size];
  }

  /**
   * Generate capacity planning report
   */
  static generateReport(recommendations: CapacityRecommendations): string {
    const report: string[] = [];

    report.push('='.repeat(80));
    report.push('CAPACITY PLANNING REPORT');
    report.push('='.repeat(80));
    report.push('');

    report.push('WORKER CONFIGURATION');
    report.push('-'.repeat(80));
    report.push(`Minimum Workers: ${recommendations.workers.minimum}`);
    report.push(`Recommended Workers: ${recommendations.workers.recommended}`);
    report.push(`Peak Workers: ${recommendations.workers.peak}`);
    report.push(`Concurrency per Worker: ${recommendations.concurrency.perWorker}`);
    report.push(`Total Concurrency: ${recommendations.concurrency.total}`);
    report.push('');

    report.push('INFRASTRUCTURE REQUIREMENTS');
    report.push('-'.repeat(80));
    report.push(`CPU: ${recommendations.infrastructure.cpu}`);
    report.push(`Memory: ${recommendations.infrastructure.memory}`);
    report.push(`Network: ${recommendations.infrastructure.network}`);
    report.push('');

    report.push('REDIS CONFIGURATION');
    report.push('-'.repeat(80));
    report.push(`Memory: ${recommendations.redis.memory}`);
    report.push(`Connections: ${recommendations.redis.connections}`);
    report.push('');

    report.push('POSTGRESQL CONFIGURATION');
    report.push('-'.repeat(80));
    report.push(`Connections: ${recommendations.postgres.connections}`);
    report.push(`Read Replicas: ${recommendations.postgres.readReplicas}`);
    report.push('');

    report.push('SCALING CONFIGURATION');
    report.push('-'.repeat(80));
    report.push(`Dynamic Scaling: ${recommendations.scaling.enableDynamicScaling ? 'Enabled' : 'Disabled'}`);
    report.push(`Min Workers: ${recommendations.scaling.minWorkers}`);
    report.push(`Max Workers: ${recommendations.scaling.maxWorkers}`);
    report.push(`Scale Up Threshold: ${recommendations.scaling.scaleUpThreshold} jobs`);
    report.push(`Scale Down Threshold: ${recommendations.scaling.scaleDownThreshold} jobs`);
    report.push('');

    report.push('COST ESTIMATES');
    report.push('-'.repeat(80));
    report.push(`Monthly Cost: $${recommendations.estimatedCosts.monthly}`);
    report.push(`Cost per Million Jobs: $${recommendations.estimatedCosts.perMillionJobs}`);
    report.push('');

    if (recommendations.warnings.length > 0) {
      report.push('WARNINGS');
      report.push('-'.repeat(80));
      recommendations.warnings.forEach(warning => {
        report.push(`⚠️  ${warning}`);
      });
      report.push('');
    }

    if (recommendations.optimizations.length > 0) {
      report.push('OPTIMIZATION SUGGESTIONS');
      report.push('-'.repeat(80));
      recommendations.optimizations.forEach(optimization => {
        report.push(`💡 ${optimization}`);
      });
      report.push('');
    }

    report.push('='.repeat(80));

    return report.join('\n');
  }
}
