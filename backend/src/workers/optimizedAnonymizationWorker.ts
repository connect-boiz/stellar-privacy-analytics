import { Queue, Worker, Job, QueueScheduler, QueueEvents } from 'bullmq';
import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';
import { PIIMasker } from './piMasker';
import { NERProcessor } from './nerProcessor';
import { SandboxManager } from './sandboxManager';
import { MetadataRepository } from '../repositories/metadataRepository';
import { DeadLetterQueue } from './deadLetterQueue';
import { WorkerMetrics } from './workerMetrics';
import { ConnectionPool } from '../utils/connectionPool';

export interface AnonymizationJob {
  id: string;
  datasetId: string;
  metadata: Record<string, any>;
  priority: 'critical' | 'high' | 'normal' | 'low';
  createdAt: Date;
  retryCount?: number;
  maxRetries?: number;
  timeout?: number;
  batchId?: string;
}

export interface AnonymizationResult {
  jobId: string;
  datasetId: string;
  originalMetadata: Record<string, any>;
  sanitizedMetadata: Record<string, any>;
  piiDetected: PIIDetection[];
  processingTime: number;
  success: boolean;
  error?: string;
  processedAt: Date;
}

export interface PIIDetection {
  type: 'email' | 'phone' | 'ssn' | 'credit_card' | 'name' | 'address' | 'date' | 'custom';
  value: string;
  maskedValue: string;
  position: {
    start: number;
    end: number;
  };
  confidence: number;
  method: 'regex' | 'ner' | 'custom';
}

export interface WorkerConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    maxConnections?: number;
    minConnections?: number;
  };
  postgres: {
    readReplica: {
      host: string;
      port: number;
      database: string;
      username: string;
      password: string;
    };
  };
  piiMasking: {
    enableRegex: boolean;
    enableNER: boolean;
    customPatterns?: Record<string, string>;
  };
  sandbox: {
    enableSandbox: boolean;
    memoryLimit: number;
    timeoutMs: number;
  };
  worker: {
    concurrency: number;
    maxRetries: number;
    retryDelay: number;
    enableDynamicScaling: boolean;
    minConcurrency: number;
    maxConcurrency: number;
    scalingThreshold: number;
    enableBatchProcessing: boolean;
    batchSize: number;
    batchTimeout: number;
  };
  monitoring: {
    enableMetrics: boolean;
    metricsInterval: number;
  };
}

export class OptimizedAnonymizationWorker {
  private queue: Queue;
  private priorityQueues: Map<string, Queue> = new Map();
  private worker: Worker;
  private scheduler: QueueScheduler;
  private queueEvents: QueueEvents;
  private deadLetterQueue: DeadLetterQueue;
  private piiMasker: PIIMasker;
  private nerProcessor: NERProcessor;
  private sandboxManager: SandboxManager;
  private metadataRepository: MetadataRepository;
  private metrics: WorkerMetrics;
  private connectionPool: ConnectionPool;
  private isShuttingDown: boolean = false;
  private config: WorkerConfig;
  private currentConcurrency: number;
  private batchBuffer: Map<string, Job<AnonymizationJob>[]> = new Map();
  private batchTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: WorkerConfig) {
    this.config = config;
    this.currentConcurrency = config.worker.concurrency;
    
    this.initializeConnectionPool();
    this.initializeQueues();
    this.initializeComponents(config);
    this.initializeWorker(config.worker);
    this.initializeMetrics();
    this.setupDynamicScaling();
    this.setupGracefulShutdown();
    
    logger.info('Optimized Anonymization Worker initialized', {
      concurrency: this.currentConcurrency,
      dynamicScaling: config.worker.enableDynamicScaling,
      batchProcessing: config.worker.enableBatchProcessing,
    });
  }

  /**
   * Initialize Redis connection pool for better performance
   */
  private initializeConnectionPool(): void {
    this.connectionPool = new ConnectionPool({
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password,
      maxConnections: this.config.redis.maxConnections || 20,
      minConnections: this.config.redis.minConnections || 5,
    });

    logger.info('Redis connection pool initialized', {
      maxConnections: this.config.redis.maxConnections || 20,
      minConnections: this.config.redis.minConnections || 5,
    });
  }

  /**
   * Initialize priority queues for critical operations
   */
  private initializeQueues(): void {
    const redisConnection = {
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password,
    };

    // Main anonymization queue
    this.queue = new Queue('anonymization', {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 500,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    // Priority queues for different priority levels
    const priorities = ['critical', 'high', 'normal', 'low'];
    priorities.forEach(priority => {
      const priorityQueue = new Queue(`anonymization-${priority}`, {
        connection: redisConnection,
        defaultJobOptions: {
          removeOnComplete: 1000,
          removeOnFail: 500,
          attempts: priority === 'critical' ? 5 : 3,
          backoff: {
            type: 'exponential',
            delay: priority === 'critical' ? 1000 : 2000,
          },
        },
      });
      this.priorityQueues.set(priority, priorityQueue);
    });

    // Queue scheduler for delayed jobs
    this.scheduler = new QueueScheduler('anonymization', {
      connection: redisConnection,
    });

    // Queue events for monitoring
    this.queueEvents = new QueueEvents('anonymization', {
      connection: redisConnection,
    });

    // Dead letter queue for failed jobs
    this.deadLetterQueue = new DeadLetterQueue('anonymization-dead-letter', {
      maxRetries: 5,
      retryDelay: 10000,
      backoffMultiplier: 2,
      maxRetryDelay: 600000,
      retryableErrors: [
        'TIMEOUT',
        'MEMORY_ERROR',
        'NETWORK_ERROR',
        'TEMPORARY_FAILURE',
        'RATE_LIMIT_EXCEEDED',
        'CONNECTION_ERROR',
      ],
    });

    logger.info('BullMQ queues initialized with priority support');
  }

  private initializeComponents(config: WorkerConfig): void {
    // PII Masker
    this.piiMasker = new PIIMasker({
      enableRegex: config.piiMasking.enableRegex,
      enableNER: config.piiMasking.enableNER,
      customPatterns: config.piiMasking.customPatterns || {},
    });

    // NER Processor
    this.nerProcessor = new NERProcessor({
      modelsPath: process.env.NER_MODELS_PATH || './models/ner',
      languages: ['en'],
      confidenceThreshold: 0.8,
    });

    // Sandbox Manager
    this.sandboxManager = new SandboxManager({
      enableSandbox: config.sandbox.enableSandbox,
      memoryLimit: config.sandbox.memoryLimit,
      timeoutMs: config.sandbox.timeoutMs,
    });

    // Metadata Repository with connection pooling
    this.metadataRepository = new MetadataRepository(config.postgres.readReplica);

    logger.info('Worker components initialized');
  }

  /**
   * Initialize worker with dynamic concurrency support
   */
  private initializeWorker(workerConfig: any): void {
    this.worker = new Worker(
      'anonymization',
      async (job: Job<AnonymizationJob>) => {
        // Check if batch processing is enabled
        if (workerConfig.enableBatchProcessing && job.data.batchId) {
          return this.processBatchJob(job);
        }
        return this.processJob(job);
      },
      {
        connection: {
          host: this.config.redis.host,
          port: this.config.redis.port,
          password: this.config.redis.password,
        },
        concurrency: this.currentConcurrency,
        limiter: {
          max: 1000,
          duration: 60000, // 1000 jobs per minute max
        },
      }
    );

    this.setupWorkerEvents();
    logger.info('Optimized anonymization worker started', {
      concurrency: this.currentConcurrency,
    });
  }

  /**
   * Setup worker event handlers with enhanced monitoring
   */
  private setupWorkerEvents(): void {
    this.worker.on('completed', (job: Job, result: AnonymizationResult) => {
      this.metrics.recordJobCompleted(result.processingTime);
      
      logger.info('Job completed', {
        jobId: job.id,
        datasetId: result.datasetId,
        processingTime: result.processingTime,
        piiDetected: result.piiDetected.length,
        priority: job.data.priority,
      });
    });

    this.worker.on('failed', (job: Job, err: Error) => {
      this.metrics.recordJobFailed();
      
      logger.error('Job failed', {
        jobId: job.id,
        datasetId: job.data?.datasetId,
        error: err.message,
        attempts: job.attemptsMade,
        priority: job.data?.priority,
      });

      // Send to dead letter queue if max retries exceeded
      if (job.attemptsMade >= (job.opts?.attempts || 3)) {
        this.deadLetterQueue.add({
          jobId: job.id!,
          originalJob: job.data,
          error: err.message,
          failedAt: new Date(),
          attempts: job.attemptsMade,
          stackTrace: err.stack,
          metadata: {
            priority: job.data?.priority,
            datasetId: job.data?.datasetId,
          },
        });
      }
    });

    this.worker.on('error', (err: Error) => {
      logger.error('Worker error:', err);
      this.metrics.recordWorkerError();
    });

    this.worker.on('stalled', (jobId: string) => {
      logger.warn('Job stalled', { jobId });
      this.metrics.recordJobStalled();
    });

    this.worker.on('progress', (job: Job, progress: number) => {
      logger.debug('Job progress', {
        jobId: job.id,
        progress,
        datasetId: job.data?.datasetId,
      });
    });

    // Queue events monitoring
    this.queueEvents.on('waiting', ({ jobId }) => {
      this.metrics.recordJobWaiting();
    });

    this.queueEvents.on('active', ({ jobId }) => {
      this.metrics.recordJobActive();
    });
  }

  /**
   * Process individual job with timeout handling
   */
  private async processJob(job: Job<AnonymizationJob>): Promise<AnonymizationResult> {
    const startTime = Date.now();
    const { id: jobId, datasetId, metadata, timeout } = job.data;

    try {
      logger.info('Processing anonymization job', {
        jobId,
        datasetId,
        metadataKeys: Object.keys(metadata),
        priority: job.data.priority,
      });

      // Validate job data
      this.validateJobData(job.data);

      // Set job timeout
      const jobTimeout = timeout || this.config.sandbox.timeoutMs;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT')), jobTimeout);
      });

      // Process with timeout
      const result = await Promise.race([
        this.performAnonymization(jobId, datasetId, metadata, job),
        timeoutPromise,
      ]);

      // Store sanitized metadata
      await this.metadataRepository.storeSanitizedMetadata(datasetId, result.sanitizedMetadata);

      // Update job progress
      await job.updateProgress(100);

      const processingTime = Date.now() - startTime;

      logger.info('Anonymization job completed successfully', {
        jobId,
        datasetId,
        processingTime,
        piiDetected: result.piiDetected.length,
      });

      return {
        ...result,
        processingTime,
        processedAt: new Date(),
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Anonymization job failed', {
        jobId,
        datasetId,
        error: error.message,
        processingTime,
      });

      throw error;
    }
  }

  /**
   * Process batch of jobs for improved throughput
   */
  private async processBatchJob(job: Job<AnonymizationJob>): Promise<AnonymizationResult> {
    const batchId = job.data.batchId!;
    
    // Add job to batch buffer
    if (!this.batchBuffer.has(batchId)) {
      this.batchBuffer.set(batchId, []);
    }
    this.batchBuffer.get(batchId)!.push(job);

    // Check if batch is ready to process
    const batchJobs = this.batchBuffer.get(batchId)!;
    if (batchJobs.length >= this.config.worker.batchSize) {
      return this.processBatch(batchId);
    }

    // Set timeout for batch processing
    if (!this.batchTimers.has(batchId)) {
      const timer = setTimeout(() => {
        this.processBatch(batchId);
      }, this.config.worker.batchTimeout);
      this.batchTimers.set(batchId, timer);
    }

    // Return placeholder result (actual result will be updated)
    return this.processJob(job);
  }

  /**
   * Process batch of jobs together
   */
  private async processBatch(batchId: string): Promise<AnonymizationResult> {
    const batchJobs = this.batchBuffer.get(batchId) || [];
    if (batchJobs.length === 0) return null as any;

    logger.info('Processing batch', {
      batchId,
      jobCount: batchJobs.length,
    });

    // Clear batch buffer and timer
    this.batchBuffer.delete(batchId);
    const timer = this.batchTimers.get(batchId);
    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(batchId);
    }

    // Process all jobs in batch
    const results = await Promise.allSettled(
      batchJobs.map(job => this.processJob(job))
    );

    // Log batch results
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    logger.info('Batch processing completed', {
      batchId,
      total: batchJobs.length,
      successful,
      failed,
    });

    return results[0].status === 'fulfilled' ? results[0].value : null as any;
  }

  private validateJobData(jobData: AnonymizationJob): void {
    if (!jobData.id || !jobData.datasetId || !jobData.metadata) {
      throw new Error('Invalid job data: missing required fields');
    }

    if (typeof jobData.metadata !== 'object' || Array.isArray(jobData.metadata)) {
      throw new Error('Invalid job data: metadata must be an object');
    }

    if (Object.keys(jobData.metadata).length === 0) {
      throw new Error('Invalid job data: metadata cannot be empty');
    }
  }

  private async performAnonymization(
    jobId: string,
    datasetId: string,
    metadata: Record<string, any>,
    job: Job<AnonymizationJob>
  ): Promise<Omit<AnonymizationResult, 'processingTime' | 'processedAt'>> {
    const piiDetections: PIIDetection[] = [];
    const sanitizedMetadata = JSON.parse(JSON.stringify(metadata));

    let processedFields = 0;
    const totalFields = Object.keys(metadata).length;

    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string') {
        const fieldResult = await this.anonymizeField(key, value);
        sanitizedMetadata[key] = fieldResult.sanitizedValue;
        piiDetections.push(...fieldResult.detections);
      } else if (typeof value === 'object' && value !== null) {
        const nestedResult = await this.anonymizeObject(value);
        sanitizedMetadata[key] = nestedResult.sanitizedObject;
        piiDetections.push(...nestedResult.detections);
      }

      // Update progress
      processedFields++;
      const progress = Math.floor((processedFields / totalFields) * 100);
      await job.updateProgress(progress);
    }

    return {
      jobId,
      datasetId,
      originalMetadata: metadata,
      sanitizedMetadata,
      piiDetected: piiDetections,
      success: true,
    };
  }

  private async anonymizeField(
    fieldName: string,
    fieldValue: string
  ): Promise<{ sanitizedValue: string; detections: PIIDetection[] }> {
    const detections: PIIDetection[] = [];
    let sanitizedValue = fieldValue;

    if (this.piiMasker.isRegexEnabled()) {
      const regexResult = this.piiMasker.maskWithRegex(fieldValue);
      sanitizedValue = regexResult.maskedText;
      detections.push(...regexResult.detections);
    }

    if (this.nerProcessor.isEnabled()) {
      const nerResult = await this.nerProcessor.maskWithNER(fieldValue);
      sanitizedValue = nerResult.maskedText;
      detections.push(...nerResult.detections);
    }

    return { sanitizedValue, detections };
  }

  private async anonymizeObject(
    obj: Record<string, any>
  ): Promise<{ sanitizedObject: Record<string, any>; detections: PIIDetection[] }> {
    const detections: PIIDetection[] = [];
    const sanitizedObject: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        const fieldResult = await this.anonymizeField(key, value);
        sanitizedObject[key] = fieldResult.sanitizedValue;
        detections.push(...fieldResult.detections);
      } else if (typeof value === 'object' && value !== null) {
        const nestedResult = await this.anonymizeObject(value);
        sanitizedObject[key] = nestedResult.sanitizedObject;
        detections.push(...nestedResult.detections);
      } else {
        sanitizedObject[key] = value;
      }
    }

    return { sanitizedObject, detections };
  }

  /**
   * Add job to appropriate priority queue
   */
  async addJob(jobData: Omit<AnonymizationJob, 'id' | 'createdAt'>): Promise<string> {
    const job: AnonymizationJob = {
      ...jobData,
      id: this.generateJobId(),
      createdAt: new Date(),
    };

    const priorityQueue = this.priorityQueues.get(job.priority) || this.queue;
    
    const bullJob = await priorityQueue.add(
      'anonymize-metadata',
      job,
      {
        priority: this.getPriorityValue(job.priority),
        delay: 0,
        attempts: job.maxRetries || (job.priority === 'critical' ? 5 : 3),
        backoff: {
          type: 'exponential',
          delay: job.priority === 'critical' ? 1000 : 2000,
        },
        timeout: job.timeout || this.config.sandbox.timeoutMs,
      }
    );

    this.metrics.recordJobAdded(job.priority);

    logger.info('Anonymization job added to priority queue', {
      jobId: job.id,
      datasetId: job.datasetId,
      priority: job.priority,
      queue: `anonymization-${job.priority}`,
      bullJobId: bullJob.id,
    });

    return job.id;
  }

  /**
   * Get job status by ID
   */
  async getJobStatus(jobId: string): Promise<any> {
    // Try to find job in all priority queues
    for (const [priority, queue] of this.priorityQueues.entries()) {
      try {
        const job = await queue.getJob(jobId);
        if (job) {
          return {
            id: job.id,
            data: job.data,
            progress: await job.progress,
            processedOn: job.processedOn,
            finishedOn: job.finishedOn,
            failedReason: job.failedReason,
            returnvalue: job.returnvalue,
            attemptsMade: job.attemptsMade,
            opts: job.opts,
            priority: priority,
            state: await job.getState(),
          };
        }
      } catch (error) {
        // Continue searching in other queues
      }
    }
    
    // Also check main queue
    try {
      const job = await this.queue.getJob(jobId);
      if (job) {
        return {
          id: job.id,
          data: job.data,
          progress: await job.progress,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
          failedReason: job.failedReason,
          returnvalue: job.returnvalue,
          attemptsMade: job.attemptsMade,
          opts: job.opts,
          state: await job.getState(),
        };
      }
    } catch (error) {
      // Job not found
    }
    
    throw new Error(`Job ${jobId} not found in any queue`);
  }

  /**
   * Dynamic scaling based on queue depth
   */
  private setupDynamicScaling(): void {
    if (!this.config.worker.enableDynamicScaling) return;

    setInterval(async () => {
      try {
        const queueStats = await this.getQueueStats();
        const totalWaiting = queueStats.waiting;
        const totalActive = queueStats.active;

        // Calculate optimal concurrency
        const queueDepth = totalWaiting + totalActive;
        const threshold = this.config.worker.scalingThreshold;

        let targetConcurrency = this.currentConcurrency;

        if (queueDepth > threshold * 2) {
          // High load - scale up
          targetConcurrency = Math.min(
            this.currentConcurrency + 2,
            this.config.worker.maxConcurrency
          );
        } else if (queueDepth < threshold / 2 && this.currentConcurrency > this.config.worker.minConcurrency) {
          // Low load - scale down
          targetConcurrency = Math.max(
            this.currentConcurrency - 1,
            this.config.worker.minConcurrency
          );
        }

        if (targetConcurrency !== this.currentConcurrency) {
          await this.scaleConcurrency(targetConcurrency);
        }
      } catch (error) {
        logger.error('Dynamic scaling error:', error);
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Scale worker concurrency dynamically
   */
  private async scaleConcurrency(newConcurrency: number): Promise<void> {
    logger.info('Scaling worker concurrency', {
      from: this.currentConcurrency,
      to: newConcurrency,
    });

    // Note: BullMQ doesn't support dynamic concurrency changes at runtime
    // The worker needs to be restarted with new concurrency
    // For now, just track the desired concurrency
    this.currentConcurrency = newConcurrency;

    this.metrics.recordConcurrencyChange(newConcurrency);
    
    logger.warn('Concurrency change recorded but requires worker restart to take effect');
  }

  /**
   * Initialize metrics collection
   */
  private initializeMetrics(): void {
    if (!this.config.monitoring.enableMetrics) return;

    this.metrics = new WorkerMetrics({
      interval: this.config.monitoring.metricsInterval,
      workerName: 'anonymization',
    });

    this.metrics.start();
  }

  /**
   * Get comprehensive queue statistics
   */
  async getQueueStats(): Promise<any> {
    const stats = {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      byPriority: {} as Record<string, any>,
    };

    // Aggregate stats from all priority queues
    for (const [priority, queue] of this.priorityQueues.entries()) {
      const waiting = await queue.getWaiting();
      const active = await queue.getActive();
      const completed = await queue.getCompleted();
      const failed = await queue.getFailed();
      const delayed = await queue.getDelayed();

      stats.waiting += waiting.length;
      stats.active += active.length;
      stats.completed += completed.length;
      stats.failed += failed.length;
      stats.delayed += delayed.length;

      stats.byPriority[priority] = {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
      };
    }

    return {
      ...stats,
      deadLetter: await this.deadLetterQueue.getStats(),
      metrics: this.metrics?.getMetrics(),
    };
  }

  /**
   * Pause worker
   */
  async pause(): Promise<void> {
    await this.worker.pause();
    logger.info('Optimized anonymization worker paused');
  }

  /**
   * Resume worker
   */
  async resume(): Promise<void> {
    await this.worker.resume();
    logger.info('Optimized anonymization worker resumed');
  }

  /**
   * Graceful shutdown
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      
      this.isShuttingDown = true;
      logger.info(`Received ${signal}, shutting down gracefully...`);

      try {
        await this.worker.close();
        
        const activeJobs = await this.queue.getActive();
        if (activeJobs.length > 0) {
          logger.info(`Waiting for ${activeJobs.length} active jobs to complete...`);
          await this.waitUntilEmpty(60000);
        }

        await this.queue.close();
        for (const queue of this.priorityQueues.values()) {
          await queue.close();
        }
        await this.scheduler.close();
        await this.queueEvents.close();
        await this.deadLetterQueue.close();
        await this.connectionPool.close();
        
        if (this.metrics) {
          this.metrics.stop();
        }

        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  private async waitUntilEmpty(timeout: number): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const active = await this.queue.getActive();
      if (active.length === 0) return;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    logger.warn('Timeout waiting for queue to empty');
  }

  private generateJobId(): string {
    return `anon_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private getPriorityValue(priority: 'critical' | 'high' | 'normal' | 'low'): number {
    switch (priority) {
      case 'critical': return 20;
      case 'high': return 10;
      case 'normal': return 5;
      case 'low': return 1;
      default: return 5;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<any> {
    try {
      const queueStats = await this.getQueueStats();
      
      const components = {
        redis: await this.connectionPool.healthCheck(),
        postgres: await this.metadataRepository.healthCheck(),
        piiMasker: this.piiMasker.isHealthy(),
        nerProcessor: this.nerProcessor.isHealthy(),
        sandbox: this.sandboxManager.isHealthy(),
      };

      const allComponentsHealthy = Object.values(components).every(status => status);
      const highFailureRate = queueStats.failed > queueStats.completed * 0.1;

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      if (!allComponentsHealthy || highFailureRate) {
        status = 'unhealthy';
      } else if (queueStats.active > 0) {
        status = 'degraded';
      }

      return {
        status,
        timestamp: new Date(),
        worker: {
          status: this.isShuttingDown ? 'shutting_down' : 'running',
          concurrency: this.currentConcurrency,
          activeJobs: queueStats.active,
          processedJobs: queueStats.completed,
          failedJobs: queueStats.failed,
        },
        queue: queueStats,
        components,
      };
    } catch (error) {
      logger.error('Health check failed:', error);
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        error: error.message,
      };
    }
  }
}

export default OptimizedAnonymizationWorker;
