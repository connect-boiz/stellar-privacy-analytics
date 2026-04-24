import { Queue, Worker, Job } from 'bullmq';
import { createClient } from 'redis';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

export interface DeadLetterJob {
  id: string;
  jobId: string;
  originalJob: any;
  error: string;
  failedAt: Date;
  attempts: number;
  stackTrace?: string;
  metadata?: Record<string, any>;
}

export interface DeadLetterStats {
  totalJobs: number;
  jobsByError: Record<string, number>;
  jobsByHour: Record<string, number>;
  oldestJob: Date | null;
  newestJob: Date | null;
  averageRetryCount: number;
}

export interface RetryPolicy {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
  maxRetryDelay: number;
  retryableErrors: string[];
}

export class DeadLetterQueue extends EventEmitter {
  private queue: Queue;
  private retryWorker: Worker | null = null;
  private redis: any;
  private retryPolicy: RetryPolicy;
  private isShuttingDown: boolean = false;

  constructor(queueName: string, retryPolicy?: Partial<RetryPolicy>) {
    this.retryPolicy = {
      maxRetries: 3,
      retryDelay: 5000, // 5 seconds
      backoffMultiplier: 2,
      maxRetryDelay: 300000, // 5 minutes
      retryableErrors: [
        'TIMEOUT',
        'MEMORY_ERROR',
        'NETWORK_ERROR',
        'TEMPORARY_FAILURE',
        'RATE_LIMIT_EXCEEDED'
      ],
      ...retryPolicy,
    };

    this.initializeRedis();
    this.initializeQueue(queueName);
    this.setupRetryWorker();
    this.setupGracefulShutdown();

    logger.info('Dead Letter Queue initialized', {
      queueName,
      retryPolicy: this.retryPolicy,
    });
  }

  private initializeRedis(): void {
    this.redis = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
      },
    });

    this.redis.on('error', (err) => {
      logger.error('Redis connection error in Dead Letter Queue:', err);
    });

    this.redis.on('connect', () => {
      logger.info('Connected to Redis for Dead Letter Queue');
    });
  }

  private initializeQueue(queueName: string): void {
    this.queue = new Queue(queueName, {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
      },
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
        attempts: 0, // Dead letter jobs don't retry by default
      },
    });

    this.queue.on('error', (err) => {
      logger.error('Dead Letter Queue error:', err);
    });

    logger.info(`Dead Letter Queue initialized: ${queueName}`);
  }

  private setupRetryWorker(): void {
    this.retryWorker = new Worker(
      `${this.queue.name}-retry`,
      async (job: Job<DeadLetterJob>) => {
        return this.retryJob(job);
      },
      {
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
        },
        concurrency: 2, // Low concurrency for retry jobs
        maxRetriesPerJob: 0, // No retries for retry jobs
      }
    );

    this.retryWorker.on('completed', (job: Job, result: any) => {
      logger.info('Dead Letter job retry completed', {
        jobId: job.id,
        originalJobId: result.originalJobId,
        retryCount: result.retryCount,
      });
    });

    this.retryWorker.on('failed', (job: Job, err: Error) => {
      logger.error('Dead Letter job retry failed permanently', {
        jobId: job.id,
        originalJobId: job.data?.originalJobId,
        error: err.message,
        retryCount: job.data?.retryCount || 0,
      });
    });

    logger.info('Retry worker started for Dead Letter Queue');
  }

  /**
   * Add a failed job to the dead letter queue
   */
  async add(jobData: Omit<DeadLetterJob, 'id' | 'failedAt'>): Promise<string> {
    const deadLetterJob: DeadLetterJob = {
      id: this.generateJobId(),
      ...jobData,
      failedAt: new Date(),
    };

    try {
      const job = await this.queue.add('dead-letter', deadLetterJob, {
        priority: this.calculatePriority(jobData),
        delay: 0,
        attempts: 0,
      });

      logger.warn('Job added to Dead Letter Queue', {
        jobId: deadLetterJob.id,
        originalJobId: jobData.originalJobId,
        error: jobData.error,
        attempts: jobData.attempts,
      });

      this.emit('jobAdded', deadLetterJob);
      return deadLetterJob.id;
    } catch (error) {
      logger.error('Failed to add job to Dead Letter Queue:', error);
      throw error;
    }
  }

  /**
   * Retry a dead letter job
   */
  private async retryJob(job: Job<DeadLetterJob>): Promise<any> {
    const deadLetterJob = job.data;
    
    if (!this.isRetryable(deadLetterJob)) {
      throw new Error(`Job is not retryable: ${deadLetterJob.error}`);
    }

    const retryCount = deadLetterJob.metadata?.retryCount || 0;
    
    if (retryCount >= this.retryPolicy.maxRetries) {
      throw new Error(`Max retries exceeded: ${retryCount}/${this.retryPolicy.maxRetries}`);
    }

    // Calculate retry delay with exponential backoff
    const retryDelay = Math.min(
      this.retryPolicy.retryDelay * Math.pow(this.retryPolicy.backoffMultiplier, retryCount),
      this.retryPolicy.maxRetryDelay
    );

    logger.info('Retrying dead letter job', {
      jobId: deadLetterJob.id,
      originalJobId: deadLetterJob.originalJobId,
      retryCount: retryCount + 1,
      retryDelay,
    });

    // Wait before retry
    await this.delay(retryDelay);

    // Add retry count to metadata
    const updatedMetadata = {
      ...deadLetterJob.metadata,
      retryCount: retryCount + 1,
      lastRetryAt: new Date(),
    };

    // Here you would typically re-add the job to the original queue
    // For now, we'll just simulate a successful retry
    const retryResult = {
      originalJobId: deadLetterJob.originalJobId,
      retryCount: retryCount + 1,
      success: true,
      retriedAt: new Date(),
    };

    // Update the dead letter job with retry information
    await this.updateJobAfterRetry(deadLetterJob.id, updatedMetadata);

    return retryResult;
  }

  /**
   * Check if a job is retryable
   */
  private isRetryable(job: DeadLetterJob): boolean {
    // Check if the error type is retryable
    const errorType = this.extractErrorType(job.error);
    
    if (!this.retryPolicy.retryableErrors.includes(errorType)) {
      return false;
    }

    // Check if we haven't exceeded max retries
    const retryCount = job.metadata?.retryCount || 0;
    if (retryCount >= this.retryPolicy.maxRetries) {
      return false;
    }

    // Check if the job is not too old
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    if (Date.now() - job.failedAt.getTime() > maxAge) {
      return false;
    }

    return true;
  }

  /**
   * Extract error type from error message
   */
  private extractErrorType(errorMessage: string): string {
    const upperError = errorMessage.toUpperCase();
    
    for (const retryableError of this.retryPolicy.retryableErrors) {
      if (upperError.includes(retryableError)) {
        return retryableError;
      }
    }

    // Default to unknown
    return 'UNKNOWN_ERROR';
  }

  /**
   * Calculate job priority based on error and retry count
   */
  private calculatePriority(jobData: Omit<DeadLetterJob, 'id' | 'failedAt'>): number {
    let priority = 5; // Default priority

    // Higher priority for retryable errors
    const errorType = this.extractErrorType(jobData.error);
    if (this.retryPolicy.retryableErrors.includes(errorType)) {
      priority = 8;
    }

    // Lower priority for jobs with many retries
    const retryCount = jobData.metadata?.retryCount || 0;
    if (retryCount > 2) {
      priority = Math.max(1, priority - retryCount);
    }

    return priority;
  }

  /**
   * Update job after retry attempt
   */
  private async updateJobAfterRetry(jobId: string, metadata: Record<string, any>): Promise<void> {
    try {
      const job = await this.queue.getJob(jobId);
      if (job) {
        await job.update({
          metadata: {
            ...job.data.metadata,
            ...metadata,
          },
        });
      }
    } catch (error) {
      logger.error('Failed to update job after retry:', error);
    }
  }

  /**
   * Get dead letter job by ID
   */
  async getJob(jobId: string): Promise<DeadLetterJob | null> {
    try {
      const job = await this.queue.getJob(jobId);
      return job ? job.data as DeadLetterJob : null;
    } catch (error) {
      logger.error('Failed to get dead letter job:', error);
      return null;
    }
  }

  /**
   * Get all dead letter jobs
   */
  async getJobs(options: {
    limit?: number;
    offset?: number;
    errorType?: string;
  } = {}): Promise<DeadLetterJob[]> {
    try {
      let jobs = await this.queue.getJobs(['waiting', 'active', 'completed', 'failed']);

      // Filter by error type if specified
      if (options.errorType) {
        jobs = jobs.filter(job => {
          const jobData = job.data as DeadLetterJob;
          return this.extractErrorType(jobData.error) === options.errorType;
        });
      }

      // Sort by failed date (newest first)
      jobs.sort((a, b) => {
        const aData = a.data as DeadLetterJob;
        const bData = b.data as DeadLetterJob;
        return bData.failedAt.getTime() - aData.failedAt.getTime();
      });

      // Apply pagination
      const offset = options.offset || 0;
      const limit = options.limit || 50;
      const paginatedJobs = jobs.slice(offset, offset + limit);

      return paginatedJobs.map(job => job.data as DeadLetterJob);
    } catch (error) {
      logger.error('Failed to get dead letter jobs:', error);
      return [];
    }
  }

  /**
   * Get dead letter queue statistics
   */
  async getStats(): Promise<DeadLetterStats> {
    try {
      const jobs = await this.queue.getJobs(['waiting', 'active', 'completed', 'failed']);
      
      const stats: DeadLetterStats = {
        totalJobs: jobs.length,
        jobsByError: {},
        jobsByHour: {},
        oldestJob: null,
        newestJob: null,
        averageRetryCount: 0,
      };

      let totalRetryCount = 0;

      for (const job of jobs) {
        const jobData = job.data as DeadLetterJob;

        // Count by error type
        const errorType = this.extractErrorType(jobData.error);
        stats.jobsByError[errorType] = (stats.jobsByError[errorType] || 0) + 1;

        // Count by hour
        const hour = jobData.failedAt.toISOString().substring(0, 13); // YYYY-MM-DDTHH
        stats.jobsByHour[hour] = (stats.jobsByHour[hour] || 0) + 1;

        // Track oldest and newest jobs
        if (!stats.oldestJob || jobData.failedAt < stats.oldestJob) {
          stats.oldestJob = jobData.failedAt;
        }
        if (!stats.newestJob || jobData.failedAt > stats.newestJob) {
          stats.newestJob = jobData.failedAt;
        }

        // Calculate retry count
        const retryCount = jobData.metadata?.retryCount || 0;
        totalRetryCount += retryCount;
      }

      if (jobs.length > 0) {
        stats.averageRetryCount = totalRetryCount / jobs.length;
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get dead letter queue stats:', error);
      
      return {
        totalJobs: 0,
        jobsByError: {},
        jobsByHour: {},
        oldestJob: null,
        newestJob: null,
        averageRetryCount: 0,
      };
    }
  }

  /**
   * Retry a specific job
   */
  async retryJob(jobId: string): Promise<boolean> {
    try {
      const job = await this.queue.getJob(jobId);
      
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      // Add to retry queue
      await this.retryWorker?.add(job.data);
      
      logger.info('Job queued for retry', { jobId });
      return true;
    } catch (error) {
      logger.error('Failed to queue job for retry:', error);
      return false;
    }
  }

  /**
   * Retry all retryable jobs
   */
  async retryAllRetryableJobs(): Promise<number> {
    try {
      const jobs = await this.getJobs();
      const retryableJobs = jobs.filter(job => this.isRetryable(job));
      
      let retriedCount = 0;
      
      for (const job of retryableJobs) {
        if (await this.retryJob(job.id)) {
          retriedCount++;
        }
      }

      logger.info('Retryable jobs processed', {
        totalJobs: jobs.length,
        retryableJobs: retryableJobs.length,
        retriedCount,
      });

      return retriedCount;
    } catch (error) {
      logger.error('Failed to retry all retryable jobs:', error);
      return 0;
    }
  }

  /**
   * Remove a job from the dead letter queue
   */
  async removeJob(jobId: string): Promise<boolean> {
    try {
      const job = await this.queue.getJob(jobId);
      
      if (job) {
        await job.remove();
        logger.info('Dead letter job removed', { jobId });
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Failed to remove dead letter job:', error);
      return false;
    }
  }

  /**
   * Clear old jobs (cleanup)
   */
  async clearOldJobs(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    try {
      const jobs = await this.queue.getJobs();
      const cutoffDate = new Date(Date.now() - maxAge);
      
      let removedCount = 0;
      
      for (const job of jobs) {
        const jobData = job.data as DeadLetterJob;
        
        if (jobData.failedAt < cutoffDate) {
          await job.remove();
          removedCount++;
        }
      }

      logger.info('Old dead letter jobs cleared', {
        removedCount,
        maxAge,
      });

      return removedCount;
    } catch (error) {
      logger.error('Failed to clear old dead letter jobs:', error);
      return 0;
    }
  }

  /**
   * Export jobs for analysis
   */
  async exportJobs(options: {
    format?: 'json' | 'csv';
    errorType?: string;
    limit?: number;
  } = {}): Promise<string> {
    const jobs = await this.getJobs({
      errorType: options.errorType,
      limit: options.limit || 1000,
    });

    if (options.format === 'csv') {
      const headers = [
        'id',
        'jobId',
        'error',
        'failedAt',
        'attempts',
        'retryCount',
        'stackTrace'
      ];

      const csvRows = [headers.join(',')];

      for (const job of jobs) {
        const row = [
          job.id,
          job.originalJobId,
          job.error,
          job.failedAt.toISOString(),
          job.attempts,
          job.metadata?.retryCount || 0,
          (job.stackTrace || '').replace(/"/g, '""')
        ];
        csvRows.push(row.map(field => `"${field}"`).join(','));
      }

      return csvRows.join('\n');
    }

    return JSON.stringify(jobs, null, 2);
  }

  /**
   * Update retry policy
   */
  updateRetryPolicy(policy: Partial<RetryPolicy>): void {
    this.retryPolicy = { ...this.retryPolicy, ...policy };
    
    logger.info('Retry policy updated', this.retryPolicy);
  }

  /**
   * Get current retry policy
   */
  getRetryPolicy(): RetryPolicy {
    return { ...this.retryPolicy };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: Date;
    queue: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    };
    retryWorker: {
      running: boolean;
      processed: number;
      failed: number;
    };
    redis: boolean;
  }> {
    try {
      const queueStats = await this.getStats();
      const waiting = await this.queue.getWaiting();
      const active = await this.queue.getActive();
      const completed = await this.queue.getCompleted();
      const failed = await this.queue.getFailed();

      const status = queueStats.totalJobs > 1000 ? 'degraded' : 'healthy';

      return {
        status,
        timestamp: new Date(),
        queue: {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
        },
        retryWorker: {
          running: !!this.retryWorker,
          processed: 0, // Would need to track this separately
          failed: 0,
        },
        redis: await this.checkRedisHealth(),
      };
    } catch (error) {
      logger.error('Dead Letter Queue health check failed:', error);
      
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        queue: {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
        },
        retryWorker: {
          running: false,
          processed: 0,
          failed: 0,
        },
        redis: false,
      };
    }
  }

  private async checkRedisHealth(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate job ID
   */
  private generateJobId(): string {
    return `dl_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Graceful shutdown
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      
      this.isShuttingDown = true;
      logger.info(`Received ${signal}, shutting down Dead Letter Queue...`);

      try {
        if (this.retryWorker) {
          await this.retryWorker.close();
        }
        await this.queue.close();
        await this.redis.quit();
        
        logger.info('Dead Letter Queue shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during Dead Letter Queue shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * Close the dead letter queue
   */
  async close(): Promise<void> {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    
    if (this.retryWorker) {
      await this.retryWorker.close();
    }
    
    await this.queue.close();
    await this.redis.quit();
    
    logger.info('Dead Letter Queue closed');
  }
}

export default DeadLetterQueue;
