import { Queue, Worker, Job, QueueScheduler } from 'bullmq';
import { createClient } from 'redis';
import { logger } from '../utils/logger';
import { PIIMasker } from './piMasker';
import { NERProcessor } from './nerProcessor';
import { SandboxManager } from './sandboxManager';
import { MetadataRepository } from '../repositories/metadataRepository';
import { DeadLetterQueue } from './deadLetterQueue';

export interface AnonymizationJob {
  id: string;
  datasetId: string;
  metadata: Record<string, any>;
  priority: 'low' | 'normal' | 'high';
  createdAt: Date;
  retryCount?: number;
  maxRetries?: number;
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

export class AnonymizationWorker {
  private queue: Queue;
  private worker: Worker;
  private scheduler: QueueScheduler;
  private deadLetterQueue: DeadLetterQueue;
  private piiMasker: PIIMasker;
  private nerProcessor: NERProcessor;
  private sandboxManager: SandboxManager;
  private metadataRepository: MetadataRepository;
  private isShuttingDown: boolean = false;

  constructor(config: {
    redis: {
      host: string;
      port: number;
      password?: string;
      db?: number;
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
    };
  }) {
    this.initializeRedis(config.redis);
    this.initializeQueues();
    this.initializeComponents(config);
    this.initializeWorker(config.worker);
    this.setupGracefulShutdown();
  }

  private initializeRedis(redisConfig: any): void {
    // Redis client for BullMQ
    const redisConnection = createClient({
      socket: {
        host: redisConfig.host,
        port: redisConfig.port
      },
      password: redisConfig.password,
      database: redisConfig.db || 0
    });

    redisConnection.on('error', (err) => {
      logger.error('Redis connection error:', err);
    });

    redisConnection.on('connect', () => {
      logger.info('Connected to Redis for BullMQ');
    });
  }

  private initializeQueues(): void {
    // Main anonymization queue
    this.queue = new Queue('anonymization', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
      },
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    // Queue scheduler for delayed jobs
    this.scheduler = new QueueScheduler('anonymization', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
      },
    });

    // Dead letter queue for failed jobs
    this.deadLetterQueue = new DeadLetterQueue('anonymization-dead-letter');

    logger.info('BullMQ queues initialized');
  }

  private initializeComponents(config: any): void {
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

    // Metadata Repository
    this.metadataRepository = new MetadataRepository(config.postgres.readReplica);

    logger.info('Worker components initialized');
  }

  private initializeWorker(workerConfig: any): void {
    this.worker = new Worker(
      'anonymization',
      async (job: Job<AnonymizationJob>) => {
        return this.processJob(job);
      },
      {
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
        },
        concurrency: workerConfig.concurrency || 5,
        maxRetriesPerJob: workerConfig.maxRetries || 3,
        retryDelay: workerConfig.retryDelay || 2000,
      }
    );

    this.setupWorkerEvents();
    logger.info('Anonymization worker started');
  }

  private setupWorkerEvents(): void {
    this.worker.on('completed', (job: Job, result: AnonymizationResult) => {
      logger.info('Job completed', {
        jobId: job.id,
        datasetId: result.datasetId,
        processingTime: result.processingTime,
        piiDetected: result.piiDetected.length,
      });
    });

    this.worker.on('failed', (job: Job, err: Error) => {
      logger.error('Job failed', {
        jobId: job.id,
        datasetId: job.data?.datasetId,
        error: err.message,
        attempts: job.attemptsMade,
        opts: job.opts,
      });

      // Send to dead letter queue if max retries exceeded
      if (job.attemptsMade >= (job.opts?.attempts || 3)) {
        this.deadLetterQueue.add({
          jobId: job.id!,
          originalJob: job.data,
          error: err.message,
          failedAt: new Date(),
          attempts: job.attemptsMade,
        });
      }
    });

    this.worker.on('error', (err: Error) => {
      logger.error('Worker error:', err);
    });

    this.worker.on('stalled', (job: Job) => {
      logger.warn('Job stalled', { jobId: job.id, datasetId: job.data?.datasetId });
    });
  }

  private async processJob(job: Job<AnonymizationJob>): Promise<AnonymizationResult> {
    const startTime = Date.now();
    const { id: jobId, datasetId, metadata } = job.data;

    try {
      logger.info('Processing anonymization job', {
        jobId,
        datasetId,
        metadataKeys: Object.keys(metadata),
      });

      // Validate job data
      this.validateJobData(job.data);

      // Process in sandbox if enabled
      const result = this.sandboxManager.isEnabled()
        ? await this.sandboxManager.execute(async () => {
            return this.performAnonymization(jobId, datasetId, metadata);
          })
        : await this.performAnonymization(jobId, datasetId, metadata);

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
    metadata: Record<string, any>
  ): Promise<Omit<AnonymizationResult, 'processingTime' | 'processedAt'>> {
    const piiDetections: PIIDetection[] = [];
    const sanitizedMetadata = JSON.parse(JSON.stringify(metadata)); // Deep clone

    // Process each metadata field
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string') {
        const fieldResult = await this.anonymizeField(key, value);
        sanitizedMetadata[key] = fieldResult.sanitizedValue;
        piiDetections.push(...fieldResult.detections);
      } else if (typeof value === 'object' && value !== null) {
        // Recursively process nested objects
        const nestedResult = await this.anonymizeObject(value);
        sanitizedMetadata[key] = nestedResult.sanitizedObject;
        piiDetections.push(...nestedResult.detections);
      }
    }

    return {
      jobId,
      datasetId,
      originalMetadata: metadata,
      sanitizedMetadata,
      piiDetected,
      success: true,
    };
  }

  private async anonymizeField(
    fieldName: string,
    fieldValue: string
  ): Promise<{ sanitizedValue: string; detections: PIIDetection[] }> {
    const detections: PIIDetection[] = [];
    let sanitizedValue = fieldValue;

    // Regex-based PII detection and masking
    if (this.piiMasker.isRegexEnabled()) {
      const regexResult = this.piiMasker.maskWithRegex(fieldValue);
      sanitizedValue = regexResult.maskedText;
      detections.push(...regexResult.detections);
    }

    // NER-based PII detection and masking
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
        // Recursively process nested objects
        const nestedResult = await this.anonymizeObject(value);
        sanitizedObject[key] = nestedResult.sanitizedObject;
        detections.push(...nestedResult.detections);
      } else {
        // Keep other types as-is
        sanitizedObject[key] = value;
      }
    }

    return { sanitizedObject, detections };
  }

  /**
   * Add a new anonymization job to the queue
   */
  async addJob(jobData: Omit<AnonymizationJob, 'id' | 'createdAt'>): Promise<string> {
    const job: AnonymizationJob = {
      ...jobData,
      id: this.generateJobId(),
      createdAt: new Date(),
    };

    const bullJob = await this.queue.add(
      'anonymize-metadata',
      job,
      {
        priority: this.getPriorityValue(job.priority),
        delay: 0,
        attempts: job.maxRetries || 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      }
    );

    logger.info('Anonymization job added to queue', {
      jobId: job.id,
      datasetId: job.datasetId,
      priority: job.priority,
      bullJobId: bullJob.id,
    });

    return job.id;
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<any> {
    const job = await this.queue.getJob(jobId);
    
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    return {
      id: job.id,
      data: job.data,
      progress: job.progress,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
      returnvalue: job.returnvalue,
      attemptsMade: job.attemptsMade,
      opts: job.opts,
    };
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<any> {
    const waiting = await this.queue.getWaiting();
    const active = await this.queue.getActive();
    const completed = await this.queue.getCompleted();
    const failed = await this.queue.getFailed();
    const delayed = await this.queue.getDelayed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      deadLetter: await this.deadLetterQueue.getStats(),
    };
  }

  /**
   * Pause the worker
   */
  async pause(): Promise<void> {
    await this.worker.pause();
    logger.info('Anonymization worker paused');
  }

  /**
   * Resume the worker
   */
  async resume(): Promise<void> {
    await this.worker.resume();
    logger.info('Anonymization worker resumed');
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
        // Stop accepting new jobs
        await this.worker.close();
        
        // Wait for active jobs to complete (with timeout)
        const activeJobs = await this.queue.getActive();
        if (activeJobs.length > 0) {
          logger.info(`Waiting for ${activeJobs.length} active jobs to complete...`);
          await this.waitUntilEmpty(30000); // 30 seconds timeout
        }

        // Close queues
        await this.queue.close();
        await this.scheduler.close();
        await this.deadLetterQueue.close();

        // Close components
        await this.sandboxManager.cleanup();
        await this.nerProcessor.cleanup();

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
      if (active.length === 0) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    logger.warn('Timeout waiting for queue to empty');
  }

  private generateJobId(): string {
    return `anon_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private getPriorityValue(priority: 'low' | 'normal' | 'high'): number {
    switch (priority) {
      case 'low': return 1;
      case 'normal': return 5;
      case 'high': return 10;
      default: return 5;
    }
  }

  /**
   * Health check for orchestrators
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: Date;
    worker: {
      status: string;
      activeJobs: number;
      processedJobs: number;
      failedJobs: number;
    };
    queue: {
      waiting: number;
      active: number;
      failed: number;
    };
    components: {
      redis: boolean;
      postgres: boolean;
      piiMasker: boolean;
      nerProcessor: boolean;
      sandbox: boolean;
    };
  }> {
    try {
      const queueStats = await this.getQueueStats();
      
      // Check component health
      const components = {
        redis: await this.checkRedisHealth(),
        postgres: await this.checkPostgresHealth(),
        piiMasker: this.piiMasker.isHealthy(),
        nerProcessor: this.nerProcessor.isHealthy(),
        sandbox: this.sandboxManager.isHealthy(),
      };

      const allComponentsHealthy = Object.values(components).every(status => status);
      const hasActiveJobs = queueStats.active > 0;
      const highFailureRate = queueStats.failed > queueStats.completed * 0.1; // >10% failure rate

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      if (!allComponentsHealthy || highFailureRate) {
        status = 'unhealthy';
      } else if (hasActiveJobs) {
        status = 'degraded';
      }

      return {
        status,
        timestamp: new Date(),
        worker: {
          status: this.isShuttingDown ? 'shutting_down' : 'running',
          activeJobs: queueStats.active,
          processedJobs: queueStats.completed,
          failedJobs: queueStats.failed,
        },
        queue: {
          waiting: queueStats.waiting,
          active: queueStats.active,
          failed: queueStats.failed,
        },
        components,
      };
    } catch (error) {
      logger.error('Health check failed:', error);
      
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        worker: {
          status: 'error',
          activeJobs: 0,
          processedJobs: 0,
          failedJobs: 0,
        },
        queue: {
          waiting: 0,
          active: 0,
          failed: 0,
        },
        components: {
          redis: false,
          postgres: false,
          piiMasker: false,
          nerProcessor: false,
          sandbox: false,
        },
      };
    }
  }

  private async checkRedisHealth(): Promise<boolean> {
    try {
      const client = createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        },
        password: process.env.REDIS_PASSWORD,
      });
      
      await client.connect();
      await client.ping();
      await client.disconnect();
      
      return true;
    } catch (error) {
      return false;
    }
  }

  private async checkPostgresHealth(): Promise<boolean> {
    try {
      await this.metadataRepository.healthCheck();
      return true;
    } catch (error) {
      return false;
    }
  }
}

export default AnonymizationWorker;
