/**
 * CRITICAL BUG FIXES
 * Apply these fixes to make the code functional
 */

// ============================================================================
// FIX 1: Add getJobStatus method to OptimizedAnonymizationWorker
// Location: backend/src/workers/optimizedAnonymizationWorker.ts
// Add after the addJob() method (around line 620)
// ============================================================================

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

// ============================================================================
// FIX 2: Fix scaleConcurrency method
// Location: backend/src/workers/optimizedAnonymizationWorker.ts
// Replace the existing scaleConcurrency method (around line 680)
// ============================================================================

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

// ============================================================================
// FIX 3: Add missing methods to DeadLetterQueue
// Location: backend/src/workers/deadLetterQueue.ts
// Add these methods to the DeadLetterQueue class
// ============================================================================

// Add to constructor - FIRST LINE
constructor(queueName: string, retryPolicy?: Partial<RetryPolicy>) {
  super(); // ADD THIS LINE FIRST!
  
  this.retryPolicy = {
    maxRetries: 3,
    retryDelay: 5000,
    backoffMultiplier: 2,
    maxRetryDelay: 300000,
    retryableErrors: [
      'TIMEOUT',
      'MEMORY_ERROR',
      'NETWORK_ERROR',
      'TEMPORARY_FAILURE',
      'RATE_LIMIT_EXCEEDED',
      'CONNECTION_ERROR',
    ],
    ...retryPolicy,
  };
  // ... rest of constructor
}

// Add this method
async add(job: Omit<DeadLetterJob, 'id'>): Promise<string> {
  const dlqJob: DeadLetterJob = {
    ...job,
    id: `dlq_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
  };

  await this.queue.add('dead-letter-job', dlqJob, {
    attempts: 0,
  });

  logger.info('Job added to dead letter queue', {
    jobId: dlqJob.id,
    originalJobId: dlqJob.jobId,
    error: dlqJob.error,
  });

  this.emit('jobAdded', dlqJob);

  return dlqJob.id;
}

// Add this method
async getStats(): Promise<DeadLetterStats> {
  const jobs = await this.queue.getJobs(['completed', 'failed', 'waiting', 'active']);
  
  const jobsByError: Record<string, number> = {};
  const jobsByHour: Record<string, number> = {};
  let oldestJob: Date | null = null;
  let newestJob: Date | null = null;
  let totalRetries = 0;

  jobs.forEach(job => {
    const data = job.data as DeadLetterJob;
    
    jobsByError[data.error] = (jobsByError[data.error] || 0) + 1;
    
    const hour = new Date(data.failedAt).toISOString().substring(0, 13);
    jobsByHour[hour] = (jobsByHour[hour] || 0) + 1;
    
    if (!oldestJob || data.failedAt < oldestJob) {
      oldestJob = data.failedAt;
    }
    if (!newestJob || data.failedAt > newestJob) {
      newestJob = data.failedAt;
    }
    
    totalRetries += data.attempts;
  });

  return {
    totalJobs: jobs.length,
    jobsByError,
    jobsByHour,
    oldestJob,
    newestJob,
    averageRetryCount: jobs.length > 0 ? totalRetries / jobs.length : 0,
  };
}

// Add this method
async close(): Promise<void> {
  if (this.isShuttingDown) return;
  
  this.isShuttingDown = true;
  
  if (this.retryWorker) {
    await this.retryWorker.close();
  }
  
  await this.queue.close();
  
  if (this.redis) {
    await this.redis.quit();
  }
  
  logger.info('Dead letter queue closed');
}

// ============================================================================
// FIX 4: Fix EventEmitter super() calls
// ============================================================================

// WorkerMetrics constructor - ADD super() as FIRST LINE
constructor(config: MetricsConfig) {
  super(); // ADD THIS
  this.config = config;
  this.startTime = new Date();
  this.lastResetTime = new Date();
  this.resetMetrics();
}

// ConnectionPool constructor - ADD super() as FIRST LINE
constructor(config: ConnectionPoolConfig) {
  super(); // ADD THIS
  this.config = {
    acquireTimeout: 5000,
    idleTimeout: 300000,
    ...config,
  };
  this.initialize();
}

// WorkerOrchestrator constructor - ADD super() as FIRST LINE
constructor(config: OrchestratorConfig) {
  super(); // ADD THIS
  this.config = config;
  this.initialize();
}

// ============================================================================
// FIX 5: Fix WorkerOrchestrator startWorker method
// Location: backend/src/workers/workerOrchestrator.ts
// Replace the startWorker method
// ============================================================================

private async startWorker(): Promise<string> {
  const workerId = this.generateWorkerId();
  
  logger.info('Starting new worker instance', { workerId });

  try {
    // Extract WorkerConfig from OrchestratorConfig
    const workerConfig: WorkerConfig = {
      redis: this.config.redis,
      postgres: this.config.postgres,
      piiMasking: this.config.piiMasking,
      sandbox: this.config.sandbox,
      worker: this.config.worker,
      monitoring: this.config.monitoring,
    };
    
    const worker = new OptimizedAnonymizationWorker(workerConfig);
    
    const instance: WorkerInstance = {
      id: workerId,
      worker,
      status: 'starting',
      startedAt: new Date(),
      processedJobs: 0,
      failedJobs: 0,
    };

    this.workers.set(workerId, instance);

    // Wait for worker to be ready
    await this.waitForWorkerReady(worker);
    
    instance.status = 'running';
    instance.lastHealthCheck = new Date();
    instance.healthStatus = 'healthy';

    logger.info('Worker instance started successfully', {
      workerId,
      totalWorkers: this.workers.size,
    });

    this.emit('workerStarted', { workerId, totalWorkers: this.workers.size });

    return workerId;
  } catch (error) {
    logger.error('Failed to start worker instance', {
      workerId,
      error: error.message,
    });

    const instance = this.workers.get(workerId);
    if (instance) {
      instance.status = 'error';
    }

    throw error;
  }
}

// ============================================================================
// FIX 6: Add missing import to WorkerOrchestrator
// Location: backend/src/workers/workerOrchestrator.ts
// Add this import at the top
// ============================================================================

import { WorkerConfig } from './optimizedAnonymizationWorker';

// ============================================================================
// SUMMARY OF FIXES
// ============================================================================

/*
1. ✅ Added getJobStatus() method to OptimizedAnonymizationWorker
2. ✅ Fixed scaleConcurrency() method (removed invalid await assignment)
3. ✅ Added super() call to DeadLetterQueue constructor
4. ✅ Added add() method to DeadLetterQueue
5. ✅ Added getStats() method to DeadLetterQueue
6. ✅ Added close() method to DeadLetterQueue
7. ✅ Added super() calls to WorkerMetrics, ConnectionPool, WorkerOrchestrator
8. ✅ Fixed WorkerOrchestrator startWorker() to extract correct config
9. ✅ Added missing import to WorkerOrchestrator
10. ✅ Created startWorker.ts entry point
11. ✅ Created startOrchestrator.ts entry point

REMAINING ISSUES:
- Need to add healthCheck() to MetadataRepository
- Need to add isHealthy() to SandboxManager
- Need to integrate monitoring routes into main app
- Need to create load test CLI files
- Need to simplify or remove batch processing logic
*/
