import { OptimizedAnonymizationWorker, WorkerConfig } from './optimizedAnonymizationWorker';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';
import * as os from 'os';

export interface OrchestratorConfig extends WorkerConfig {
  orchestrator: {
    enableHorizontalScaling: boolean;
    minWorkers: number;
    maxWorkers: number;
    scaleUpThreshold: number;
    scaleDownThreshold: number;
    scaleCheckInterval: number;
    workerHealthCheckInterval: number;
  };
}

export interface WorkerInstance {
  id: string;
  worker: OptimizedAnonymizationWorker;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  startedAt: Date;
  lastHealthCheck?: Date;
  healthStatus?: 'healthy' | 'degraded' | 'unhealthy';
  processedJobs: number;
  failedJobs: number;
}

/**
 * Worker Orchestrator for horizontal scaling of message queue consumers
 * Manages multiple worker instances and scales based on queue depth
 */
export class WorkerOrchestrator extends EventEmitter {
  private config: OrchestratorConfig;
  private workers: Map<string, WorkerInstance> = new Map();
  private scaleCheckInterval: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isShuttingDown: boolean = false;
  private scalingInProgress: boolean = false;

  constructor(config: OrchestratorConfig) {
    super();
    this.config = config;
    this.initialize();
  }

  private async initialize(): Promise<void> {
    logger.info('Initializing Worker Orchestrator', {
      minWorkers: this.config.orchestrator.minWorkers,
      maxWorkers: this.config.orchestrator.maxWorkers,
      horizontalScaling: this.config.orchestrator.enableHorizontalScaling,
    });

    // Start minimum number of workers
    for (let i = 0; i < this.config.orchestrator.minWorkers; i++) {
      await this.startWorker();
    }

    // Setup scaling and health checks
    if (this.config.orchestrator.enableHorizontalScaling) {
      this.setupScalingMonitor();
    }
    this.setupHealthMonitor();
    this.setupGracefulShutdown();

    logger.info('Worker Orchestrator initialized', {
      activeWorkers: this.workers.size,
    });
  }

  /**
   * Start a new worker instance
   */
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

  /**
   * Stop a worker instance
   */
  private async stopWorker(workerId: string): Promise<void> {
    const instance = this.workers.get(workerId);
    if (!instance) {
      logger.warn('Worker instance not found', { workerId });
      return;
    }

    logger.info('Stopping worker instance', { workerId });

    try {
      instance.status = 'stopping';
      
      // Pause the worker to stop accepting new jobs
      await instance.worker.pause();
      
      // Wait for active jobs to complete (with timeout)
      await this.waitForWorkerIdle(instance.worker, 60000);
      
      // Perform health check to get final stats
      const health = await instance.worker.healthCheck();
      instance.processedJobs = health.worker.processedJobs;
      instance.failedJobs = health.worker.failedJobs;

      instance.status = 'stopped';
      this.workers.delete(workerId);

      logger.info('Worker instance stopped successfully', {
        workerId,
        totalWorkers: this.workers.size,
        processedJobs: instance.processedJobs,
        failedJobs: instance.failedJobs,
      });

      this.emit('workerStopped', {
        workerId,
        totalWorkers: this.workers.size,
        stats: {
          processedJobs: instance.processedJobs,
          failedJobs: instance.failedJobs,
        },
      });
    } catch (error) {
      logger.error('Error stopping worker instance', {
        workerId,
        error: error.message,
      });
      instance.status = 'error';
    }
  }

  /**
   * Setup automatic scaling based on queue depth
   */
  private setupScalingMonitor(): void {
    this.scaleCheckInterval = setInterval(async () => {
      if (this.isShuttingDown || this.scalingInProgress) return;

      try {
        await this.checkAndScale();
      } catch (error) {
        logger.error('Error in scaling monitor:', error);
      }
    }, this.config.orchestrator.scaleCheckInterval);

    logger.info('Scaling monitor started', {
      interval: this.config.orchestrator.scaleCheckInterval,
    });
  }

  /**
   * Check queue depth and scale workers accordingly
   */
  private async checkAndScale(): Promise<void> {
    this.scalingInProgress = true;

    try {
      // Get queue stats from any worker
      const firstWorker = Array.from(this.workers.values())[0];
      if (!firstWorker || firstWorker.status !== 'running') {
        return;
      }

      const queueStats = await firstWorker.worker.getQueueStats();
      const totalWaiting = queueStats.waiting;
      const totalActive = queueStats.active;
      const queueDepth = totalWaiting + totalActive;

      const currentWorkers = this.workers.size;
      const scaleUpThreshold = this.config.orchestrator.scaleUpThreshold;
      const scaleDownThreshold = this.config.orchestrator.scaleDownThreshold;

      logger.debug('Scaling check', {
        queueDepth,
        currentWorkers,
        scaleUpThreshold,
        scaleDownThreshold,
      });

      // Scale up if queue depth is high
      if (queueDepth > scaleUpThreshold && currentWorkers < this.config.orchestrator.maxWorkers) {
        const workersToAdd = Math.min(
          Math.ceil((queueDepth - scaleUpThreshold) / 100),
          this.config.orchestrator.maxWorkers - currentWorkers
        );

        logger.info('Scaling up workers', {
          currentWorkers,
          workersToAdd,
          queueDepth,
        });

        for (let i = 0; i < workersToAdd; i++) {
          await this.startWorker();
        }

        this.emit('scaledUp', {
          from: currentWorkers,
          to: this.workers.size,
          queueDepth,
        });
      }
      // Scale down if queue depth is low
      else if (queueDepth < scaleDownThreshold && currentWorkers > this.config.orchestrator.minWorkers) {
        const workersToRemove = Math.min(
          Math.floor((scaleDownThreshold - queueDepth) / 50),
          currentWorkers - this.config.orchestrator.minWorkers
        );

        if (workersToRemove > 0) {
          logger.info('Scaling down workers', {
            currentWorkers,
            workersToRemove,
            queueDepth,
          });

          // Stop the least utilized workers
          const sortedWorkers = Array.from(this.workers.values())
            .filter(w => w.status === 'running')
            .sort((a, b) => a.processedJobs - b.processedJobs);

          for (let i = 0; i < workersToRemove; i++) {
            if (sortedWorkers[i]) {
              await this.stopWorker(sortedWorkers[i].id);
            }
          }

          this.emit('scaledDown', {
            from: currentWorkers,
            to: this.workers.size,
            queueDepth,
          });
        }
      }
    } finally {
      this.scalingInProgress = false;
    }
  }

  /**
   * Setup health monitoring for all workers
   */
  private setupHealthMonitor(): void {
    this.healthCheckInterval = setInterval(async () => {
      if (this.isShuttingDown) return;

      try {
        await this.checkWorkersHealth();
      } catch (error) {
        logger.error('Error in health monitor:', error);
      }
    }, this.config.orchestrator.workerHealthCheckInterval);

    logger.info('Health monitor started', {
      interval: this.config.orchestrator.workerHealthCheckInterval,
    });
  }

  /**
   * Check health of all workers and restart unhealthy ones
   */
  private async checkWorkersHealth(): Promise<void> {
    const healthChecks = Array.from(this.workers.entries()).map(
      async ([workerId, instance]) => {
        if (instance.status !== 'running') return;

        try {
          const health = await instance.worker.healthCheck();
          instance.lastHealthCheck = new Date();
          instance.healthStatus = health.status;
          instance.processedJobs = health.worker.processedJobs;
          instance.failedJobs = health.worker.failedJobs;

          // Restart unhealthy workers
          if (health.status === 'unhealthy') {
            logger.warn('Unhealthy worker detected, restarting', {
              workerId,
              health,
            });

            await this.stopWorker(workerId);
            await this.startWorker();

            this.emit('workerRestarted', { workerId, reason: 'unhealthy' });
          }
        } catch (error) {
          logger.error('Health check failed for worker', {
            workerId,
            error: error.message,
          });

          instance.healthStatus = 'unhealthy';
        }
      }
    );

    await Promise.allSettled(healthChecks);
  }

  /**
   * Get orchestrator statistics
   */
  getStats(): {
    totalWorkers: number;
    workersByStatus: Record<string, number>;
    workersByHealth: Record<string, number>;
    totalProcessedJobs: number;
    totalFailedJobs: number;
    systemResources: {
      cpuUsage: number;
      memoryUsage: number;
      loadAverage: number[];
    };
  } {
    const workersByStatus: Record<string, number> = {};
    const workersByHealth: Record<string, number> = {};
    let totalProcessedJobs = 0;
    let totalFailedJobs = 0;

    this.workers.forEach(instance => {
      workersByStatus[instance.status] = (workersByStatus[instance.status] || 0) + 1;
      
      if (instance.healthStatus) {
        workersByHealth[instance.healthStatus] = (workersByHealth[instance.healthStatus] || 0) + 1;
      }

      totalProcessedJobs += instance.processedJobs;
      totalFailedJobs += instance.failedJobs;
    });

    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();

    return {
      totalWorkers: this.workers.size,
      workersByStatus,
      workersByHealth,
      totalProcessedJobs,
      totalFailedJobs,
      systemResources: {
        cpuUsage: cpus.reduce((acc, cpu) => acc + cpu.times.user, 0) / cpus.length,
        memoryUsage: ((totalMemory - freeMemory) / totalMemory) * 100,
        loadAverage: os.loadavg(),
      },
    };
  }

  /**
   * Get detailed worker information
   */
  getWorkers(): WorkerInstance[] {
    return Array.from(this.workers.values());
  }

  /**
   * Manually scale to specific number of workers
   */
  async scaleTo(targetWorkers: number): Promise<void> {
    if (targetWorkers < this.config.orchestrator.minWorkers) {
      throw new Error(`Cannot scale below minimum workers (${this.config.orchestrator.minWorkers})`);
    }

    if (targetWorkers > this.config.orchestrator.maxWorkers) {
      throw new Error(`Cannot scale above maximum workers (${this.config.orchestrator.maxWorkers})`);
    }

    const currentWorkers = this.workers.size;
    const diff = targetWorkers - currentWorkers;

    logger.info('Manual scaling requested', {
      from: currentWorkers,
      to: targetWorkers,
      diff,
    });

    if (diff > 0) {
      // Scale up
      for (let i = 0; i < diff; i++) {
        await this.startWorker();
      }
    } else if (diff < 0) {
      // Scale down
      const workersToStop = Array.from(this.workers.keys()).slice(0, Math.abs(diff));
      for (const workerId of workersToStop) {
        await this.stopWorker(workerId);
      }
    }

    this.emit('manualScale', {
      from: currentWorkers,
      to: this.workers.size,
    });
  }

  /**
   * Graceful shutdown
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;

      this.isShuttingDown = true;
      logger.info(`Received ${signal}, shutting down orchestrator...`);

      try {
        // Stop monitoring
        if (this.scaleCheckInterval) {
          clearInterval(this.scaleCheckInterval);
        }
        if (this.healthCheckInterval) {
          clearInterval(this.healthCheckInterval);
        }

        // Stop all workers
        const workerIds = Array.from(this.workers.keys());
        logger.info(`Stopping ${workerIds.length} workers...`);

        await Promise.all(
          workerIds.map(workerId => this.stopWorker(workerId))
        );

        logger.info('Orchestrator shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during orchestrator shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  private async waitForWorkerReady(worker: OptimizedAnonymizationWorker): Promise<void> {
    const maxAttempts = 10;
    const delay = 1000;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const health = await worker.healthCheck();
        if (health.status !== 'unhealthy') {
          return;
        }
      } catch (error) {
        // Worker not ready yet
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }

    throw new Error('Worker failed to become ready');
  }

  private async waitForWorkerIdle(
    worker: OptimizedAnonymizationWorker,
    timeout: number
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const health = await worker.healthCheck();
        if (health.worker.activeJobs === 0) {
          return;
        }
      } catch (error) {
        // Ignore errors during shutdown
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.warn('Timeout waiting for worker to become idle');
  }

  private generateWorkerId(): string {
    return `worker_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

export default WorkerOrchestrator;
