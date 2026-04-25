import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { AnonymizationWorker } from '../workers/anonymizationWorker';

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  version: string;
  environment: string;
  worker: {
    status: string;
    activeJobs: number;
    processedJobs: number;
    failedJobs: number;
    lastProcessedAt?: Date;
    averageProcessingTime: number;
  };
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    deadLetter: {
      total: number;
      oldestJob: Date | null;
      newestJob: Date | null;
      averageRetryCount: number;
    };
  };
  components: {
    redis: boolean;
    postgres: boolean;
    piiMasker: boolean;
    nerProcessor: boolean;
    sandbox: boolean;
  };
  resources: {
    memory: {
      total: number;
      free: number;
      used: number;
      percentage: number;
    };
    cpu: {
      usage: number;
      loadAverage: number[];
    };
  };
  alerts: Array<{
    level: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    timestamp: Date;
    component: string;
  }>;
}

export class WorkerHealthController {
  private worker: AnonymizationWorker;
  private startTime: Date;
  private alerts: HealthResponse['alerts'] = [];
  private maxAlerts: number = 100;

  constructor(worker: AnonymizationWorker) {
    this.worker = worker;
    this.startTime = new Date();
    
    // Set up periodic health checks
    this.setupPeriodicChecks();
  }

  /**
   * Main health check endpoint
   */
  async getHealth(req: Request, res: Response): Promise<void> {
    try {
      const healthResponse = await this.generateHealthResponse();
      
      res.status(healthResponse.status === 'healthy' ? 200 : 
                     healthResponse.status === 'degraded' ? 200 : 503)
         .json(healthResponse);
    } catch (error) {
      logger.error('Health check failed:', error);
      
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date(),
        error: 'Health check failed',
        uptime: Date.now() - this.startTime.getTime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        alerts: this.alerts,
      });
    }
  }

  /**
   * Detailed health check with all components
   */
  async getDetailedHealth(req: Request, res: Response): Promise<void> {
    try {
      const healthResponse = await this.generateHealthResponse();
      
      res.status(healthResponse.status === 'healthy' ? 200 : 
                     healthResponse.status === 'degraded' ? 200 : 503)
         .json(healthResponse);
    } catch (error) {
      logger.error('Detailed health check failed:', error);
      
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date(),
        error: 'Detailed health check failed',
        uptime: Date.now() - this.startTime.getTime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        alerts: this.alerts,
      });
    }
  }

  /**
   * Readiness probe (for Kubernetes)
   */
  async getReadiness(req: Request, res: Response): Promise<void> {
    try {
      const healthResponse = await this.generateHealthResponse();
      
      // Readiness probe should return 200 only if healthy
      if (healthResponse.status === 'healthy') {
        res.status(200).json({
          status: 'ready',
          timestamp: healthResponse.timestamp,
        });
      } else {
        res.status(503).json({
          status: 'not_ready',
          timestamp: new Date(),
          issues: this.getHealthIssues(healthResponse),
        });
      }
    } catch (error) {
      logger.error('Readiness probe failed:', error);
      
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date(),
        error: 'Readiness probe failed',
      });
    }
  }

  /**
   * Liveness probe (for Kubernetes)
   */
  async getLiveness(req: Request, res: Response): Promise<void> {
    try {
      // Simple liveness check - just check if the worker is responsive
      const workerStats = await this.worker.getQueueStats();
      
      res.status(200).json({
        status: 'alive',
        timestamp: new Date(),
        activeJobs: workerStats.activeJobs,
      });
    } catch (error) {
      logger.error('Liveness probe failed:', error);
      
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date(),
        error: 'Liveness probe failed',
      });
    }
  }

  /**
   * Metrics endpoint for monitoring
   */
  async getMetrics(req: Request, res: Response): Promise<void> {
    try {
      const workerStats = await this.worker.getQueueStats();
      const systemResources = this.getSystemResources();
      
      res.json({
        timestamp: new Date(),
        uptime: Date.now() - this.startTime.getTime(),
        worker: workerStats,
        system: systemResources,
        alerts: this.alerts,
      });
    } catch (error) {
      logger.error('Metrics endpoint failed:', error);
      
      res.status(500).json({
        error: 'Failed to get metrics',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Generate comprehensive health response
   */
  private async generateHealthResponse(): Promise<HealthResponse> {
    const uptime = Date.now() - this.startTime.getTime();
    
    // Get worker status
    const workerHealth = await this.worker.healthCheck();
    
    // Get system resources
    const systemResources = this.getSystemResources();
    
    // Get component health
    const components = {
      redis: workerHealth.components.redis,
      postgres: workerHealth.components.postgres,
      piiMasker: workerHealth.components.piiMasker,
      nerProcessor: workerHealth.components.nerProcessor,
      sandbox: workerHealth.components.sandbox,
    };

    // Determine overall status
    const allComponentsHealthy = Object.values(components).every(status => status);
    const hasActiveJobs = workerHealth.worker.activeJobs > 0;
    const highFailureRate = workerHealth.worker.failedJobs > workerHealth.worker.processedJobs * 0.1; // >10% failure rate
    
    let status: HealthResponse['status'] = 'healthy';
    
    if (!allComponentsHealthy || highFailureRate) {
      status = 'unhealthy';
    } else if (hasActiveJobs) {
      status = 'degraded';
    }

    // Get queue stats
    const queueStats = await this.worker.getQueueStats();
    
    // Get dead letter queue stats
    const deadLetterStats = await this.worker.deadLetterQueue.getStats();

    return {
      status,
      timestamp: new Date(),
      uptime,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      worker: workerHealth.worker,
      queue: {
        waiting: queueStats.waiting,
        active: queueStats.active,
        completed: queueStats.completed,
        failed: queueStats.failed,
        deadLetter: {
          total: deadLetterStats.totalJobs,
          oldestJob: deadLetterStats.oldestJob,
          newestJob: deadLetterStats.newestJob,
          averageRetryCount: deadLetterStats.averageRetryCount,
        },
      },
      components,
      resources: systemResources,
      alerts: this.alerts,
    };
  }

  /**
   * Get system resource usage
   */
  private getSystemResources(): HealthResponse['resources'] {
    const usage = process.memoryUsage();
    const cpus = require('os').cpus();
    
    return {
      memory: {
        total: Math.round(usage.heapTotal / 1024 / 1024), // MB
        free: Math.round(usage.heapUsed / 1024 / 1024), // MB
        used: Math.round((usage.heapTotal - usage.heapUsed) / 1024 / 1024), // MB
        percentage: Math.round(((usage.heapTotal - usage.heapUsed) / usage.heapTotal) * 100),
      },
      cpu: {
        usage: cpus[0]?.user || 0,
        loadAverage: require('os').loadavg(),
      },
    };
  }

  /**
   * Get health issues for debugging
   */
  private getHealthIssues(healthResponse: HealthResponse): string[] {
    const issues: string[] = [];

    if (!healthResponse.components.redis) {
      issues.push('Redis connection failed');
    }
    
    if (!healthResponse.components.postgres) {
      issues.push('PostgreSQL connection failed');
    }
    
    if (!healthResponse.components.piiMasker) {
      issues.push('PII Masker is unhealthy');
    }
    
    if (!healthComponents.nerProcessor) {
      issues.push('NER Processor is unhealthy');
    }
    
    if (!healthComponents.sandbox) {
      issues.push('Sandbox is unhealthy');
    }

    if (healthResponse.queue.failed > healthResponse.queue.completed * 0.1) {
      issues.push('High failure rate in queue');
    }

    if (healthResponse.resources.memory.percentage > 80) {
      issues.push('High memory usage');
    }

    if (healthResponse.resources.cpu.usage > 80) {
      issues.push('High CPU usage');
    }

    return issues;
  }

  /**
   * Set up periodic health checks
   */
  private setupPeriodicChecks(): void {
    // Check health every 30 seconds
    setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error('Periodic health check failed:', error);
      }
    }, 30000);

    // Clean up old alerts every 5 minutes
    setInterval(() => {
      this.cleanupOldAlerts();
    }, 300000);

    // Archive old metrics every hour
    setInterval(() => {
      this.archiveMetrics();
    }, 3600000);
  }

  /**
   * Perform periodic health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const healthResponse = await this.generateHealthResponse();
      
      // Check for new issues
      const issues = this.getHealthIssues(healthResponse);
      
      // Add alerts for new issues
      for (const issue of issues) {
        if (!this.hasAlert(issue)) {
          this.addAlert('warning', issue, 'system');
        }
      }

      // Clear resolved alerts
      this.clearResolvedAlerts(issues);

      // Log health status
      logger.info('Periodic health check completed', {
        status: healthResponse.status,
        activeJobs: healthResponse.worker.activeJobs,
        failedJobs: healthResponse.worker.failedJobs,
        alerts: this.alerts.length,
        uptime: healthResponse.uptime,
      });
    } catch (error) {
      this.addAlert('error', 'Health check failed', 'system');
    }
  }

  /**
   * Add an alert
   */
  private addAlert(level: HealthResponse['alerts'][0]['level'], message: string, component: string): void {
    const alert = {
      level,
      message,
      timestamp: new Date(),
      component,
    };

    this.alerts.unshift(alert);
    
    // Keep only the most recent alerts
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(0, this.maxAlerts);
    }

    logger.warn('Alert added', {
      level,
      message,
      component,
      timestamp: alert.timestamp,
    });
  }

  /**
   * Check if an alert already exists
   */
  private hasAlert(message: string): boolean {
    return this.alerts.some(alert => alert.message === message);
  }

  /**
   * Clear resolved alerts
   */
  private clearResolvedAlerts(currentIssues: string[]): void {
    this.alerts = this.alerts.filter(alert => 
      currentIssues.includes(alert.message)
    );
  }

  /**
   * Clean up old alerts
   */
  private cleanupOldAlerts(): void {
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const cutoff = new Date(Date.now() - maxAge);
    
    this.alerts = this.alerts.filter(alert => alert.timestamp > cutoff);
    
    logger.debug('Cleaned up old alerts', {
      remaining: this.alerts.length,
      maxAge,
    });
  }

  /**
   * Archive metrics
   */
  private archiveMetrics(): void {
    // This would typically send metrics to a monitoring system
    // For now, we'll just log them
    const metrics = {
      timestamp: new Date(),
      uptime: Date.now() - this.startTime.getTime(),
      alerts: this.alerts.length,
    };

    logger.info('Metrics archived', metrics);
  }

  /**
   * Force health check
   */
  async forceHealthCheck(): Promise<HealthResponse> {
    return this.generateHealthResponse();
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(limit: number = 50): HealthResponse['alerts'] {
    return this.alerts.slice(0, limit);
  }

  /**
   * Clear all alerts
   */
  clearAlerts(): void {
    this.alerts = [];
    logger.info('All alerts cleared');
  }

  /**
   * Get component-specific health
   */
  async getComponentHealth(component: string): Promise<{
    healthy: boolean;
    details: any;
    lastCheck: Date;
  }> {
    const healthResponse = await this.generateHealthResponse();
    
    const componentMap: Record<string, any> = {
      redis: healthResponse.components.redis,
      postgres: healthResponse.components.postgres,
      piiMasker: healthResponse.components.piiMasker,
      nerProcessor: healthResponse.components.nerProcessor,
      sandbox: healthResponse.components.sandbox,
    };

    return {
      healthy: componentMap[component] || false,
      details: componentMap[component],
      lastCheck: new Date(),
    };
  }
}

export default WorkerHealthController;
