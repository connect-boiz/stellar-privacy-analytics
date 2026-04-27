import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

export interface MetricsConfig {
  interval: number;
  workerName: string;
}

export interface WorkerMetricsData {
  jobsAdded: number;
  jobsCompleted: number;
  jobsFailed: number;
  jobsStalled: number;
  jobsWaiting: number;
  jobsActive: number;
  workerErrors: number;
  averageProcessingTime: number;
  minProcessingTime: number;
  maxProcessingTime: number;
  throughput: number; // jobs per minute
  concurrencyChanges: number;
  currentConcurrency: number;
  timestamp: Date;
  byPriority: Record<string, {
    added: number;
    completed: number;
    failed: number;
    averageTime: number;
  }>;
}

export class WorkerMetrics extends EventEmitter {
  private config: MetricsConfig;
  private metrics: WorkerMetricsData;
  private processingTimes: number[] = [];
  private interval: NodeJS.Timeout | null = null;
  private startTime: Date;
  private lastResetTime: Date;

  constructor(config: MetricsConfig) {
    super();
    this.config = config;
    this.startTime = new Date();
    this.lastResetTime = new Date();
    this.resetMetrics();
  }

  private resetMetrics(): void {
    this.metrics = {
      jobsAdded: 0,
      jobsCompleted: 0,
      jobsFailed: 0,
      jobsStalled: 0,
      jobsWaiting: 0,
      jobsActive: 0,
      workerErrors: 0,
      averageProcessingTime: 0,
      minProcessingTime: Infinity,
      maxProcessingTime: 0,
      throughput: 0,
      concurrencyChanges: 0,
      currentConcurrency: 0,
      timestamp: new Date(),
      byPriority: {
        critical: { added: 0, completed: 0, failed: 0, averageTime: 0 },
        high: { added: 0, completed: 0, failed: 0, averageTime: 0 },
        normal: { added: 0, completed: 0, failed: 0, averageTime: 0 },
        low: { added: 0, completed: 0, failed: 0, averageTime: 0 },
      },
    };
    this.processingTimes = [];
  }

  start(): void {
    if (this.interval) return;

    this.interval = setInterval(() => {
      this.calculateMetrics();
      this.emitMetrics();
      this.logMetrics();
    }, this.config.interval);

    logger.info('Worker metrics collection started', {
      workerName: this.config.workerName,
      interval: this.config.interval,
    });
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    logger.info('Worker metrics collection stopped', {
      workerName: this.config.workerName,
    });
  }

  recordJobAdded(priority: string = 'normal'): void {
    this.metrics.jobsAdded++;
    if (this.metrics.byPriority[priority]) {
      this.metrics.byPriority[priority].added++;
    }
  }

  recordJobCompleted(processingTime: number, priority: string = 'normal'): void {
    this.metrics.jobsCompleted++;
    this.processingTimes.push(processingTime);

    if (this.metrics.byPriority[priority]) {
      this.metrics.byPriority[priority].completed++;
    }

    // Update min/max processing times
    if (processingTime < this.metrics.minProcessingTime) {
      this.metrics.minProcessingTime = processingTime;
    }
    if (processingTime > this.metrics.maxProcessingTime) {
      this.metrics.maxProcessingTime = processingTime;
    }
  }

  recordJobFailed(priority: string = 'normal'): void {
    this.metrics.jobsFailed++;
    if (this.metrics.byPriority[priority]) {
      this.metrics.byPriority[priority].failed++;
    }
  }

  recordJobStalled(): void {
    this.metrics.jobsStalled++;
  }

  recordJobWaiting(): void {
    this.metrics.jobsWaiting++;
  }

  recordJobActive(): void {
    this.metrics.jobsActive++;
  }

  recordWorkerError(): void {
    this.metrics.workerErrors++;
  }

  recordConcurrencyChange(newConcurrency: number): void {
    this.metrics.concurrencyChanges++;
    this.metrics.currentConcurrency = newConcurrency;
  }

  private calculateMetrics(): void {
    // Calculate average processing time
    if (this.processingTimes.length > 0) {
      const sum = this.processingTimes.reduce((a, b) => a + b, 0);
      this.metrics.averageProcessingTime = sum / this.processingTimes.length;

      // Calculate average time by priority
      for (const priority in this.metrics.byPriority) {
        const priorityMetrics = this.metrics.byPriority[priority];
        if (priorityMetrics.completed > 0) {
          // This is a simplified calculation - in production, you'd track times per priority
          priorityMetrics.averageTime = this.metrics.averageProcessingTime;
        }
      }
    }

    // Calculate throughput (jobs per minute)
    const elapsedMinutes = (Date.now() - this.lastResetTime.getTime()) / 60000;
    if (elapsedMinutes > 0) {
      this.metrics.throughput = this.metrics.jobsCompleted / elapsedMinutes;
    }

    this.metrics.timestamp = new Date();
  }

  private emitMetrics(): void {
    this.emit('metrics', this.getMetrics());
  }

  private logMetrics(): void {
    logger.info('Worker metrics', {
      workerName: this.config.workerName,
      metrics: {
        jobsAdded: this.metrics.jobsAdded,
        jobsCompleted: this.metrics.jobsCompleted,
        jobsFailed: this.metrics.jobsFailed,
        jobsStalled: this.metrics.jobsStalled,
        averageProcessingTime: Math.round(this.metrics.averageProcessingTime),
        throughput: Math.round(this.metrics.throughput * 100) / 100,
        currentConcurrency: this.metrics.currentConcurrency,
        failureRate: this.getFailureRate(),
      },
    });
  }

  getMetrics(): WorkerMetricsData {
    return { ...this.metrics };
  }

  getFailureRate(): number {
    const total = this.metrics.jobsCompleted + this.metrics.jobsFailed;
    if (total === 0) return 0;
    return (this.metrics.jobsFailed / total) * 100;
  }

  getSummary(): {
    uptime: number;
    totalProcessed: number;
    successRate: number;
    averageThroughput: number;
  } {
    const uptime = Date.now() - this.startTime.getTime();
    const totalProcessed = this.metrics.jobsCompleted + this.metrics.jobsFailed;
    const successRate = totalProcessed > 0 
      ? (this.metrics.jobsCompleted / totalProcessed) * 100 
      : 0;

    return {
      uptime,
      totalProcessed,
      successRate,
      averageThroughput: this.metrics.throughput,
    };
  }

  reset(): void {
    this.resetMetrics();
    this.lastResetTime = new Date();
    logger.info('Worker metrics reset', {
      workerName: this.config.workerName,
    });
  }
}
