import { Router, Request, Response } from 'express';
import { WorkerOrchestrator } from '../workers/workerOrchestrator';
import { logger } from '../utils/logger';

export interface QueueMonitoringRoutes {
  router: Router;
}

/**
 * Queue Monitoring Dashboard API
 * Provides comprehensive metrics and control endpoints for message queue monitoring
 */
export function createQueueMonitoringRoutes(
  orchestrator: WorkerOrchestrator
): QueueMonitoringRoutes {
  const router = Router();

  /**
   * GET /api/v1/queue/metrics
   * Get comprehensive queue and worker metrics
   */
  router.get('/metrics', async (req: Request, res: Response) => {
    try {
      const stats = orchestrator.getStats();
      const workers = orchestrator.getWorkers();

      // Get queue stats from first available worker
      const runningWorker = workers.find(w => w.status === 'running');
      let queueStats = null;

      if (runningWorker) {
        queueStats = await runningWorker.worker.getQueueStats();
      }

      res.json({
        success: true,
        timestamp: new Date(),
        orchestrator: stats,
        queue: queueStats,
        workers: workers.map(w => ({
          id: w.id,
          status: w.status,
          healthStatus: w.healthStatus,
          startedAt: w.startedAt,
          lastHealthCheck: w.lastHealthCheck,
          processedJobs: w.processedJobs,
          failedJobs: w.failedJobs,
          uptime: Date.now() - w.startedAt.getTime(),
        })),
      });
    } catch (error) {
      logger.error('Error fetching queue metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch queue metrics',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/v1/queue/health
   * Get overall queue system health
   */
  router.get('/health', async (req: Request, res: Response) => {
    try {
      const stats = orchestrator.getStats();
      const workers = orchestrator.getWorkers();

      const healthyWorkers = workers.filter(w => w.healthStatus === 'healthy').length;
      const totalWorkers = workers.length;
      const healthPercentage = totalWorkers > 0 ? (healthyWorkers / totalWorkers) * 100 : 0;

      let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      if (healthPercentage < 50) {
        overallStatus = 'unhealthy';
      } else if (healthPercentage < 80) {
        overallStatus = 'degraded';
      }

      res.json({
        success: true,
        status: overallStatus,
        timestamp: new Date(),
        workers: {
          total: totalWorkers,
          healthy: healthyWorkers,
          degraded: workers.filter(w => w.healthStatus === 'degraded').length,
          unhealthy: workers.filter(w => w.healthStatus === 'unhealthy').length,
          healthPercentage,
        },
        system: stats.systemResources,
      });
    } catch (error) {
      logger.error('Error checking queue health:', error);
      res.status(500).json({
        success: false,
        status: 'unhealthy',
        error: 'Failed to check queue health',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/v1/queue/stats
   * Get detailed queue statistics
   */
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const workers = orchestrator.getWorkers();
      const runningWorker = workers.find(w => w.status === 'running');

      if (!runningWorker) {
        return res.status(503).json({
          success: false,
          error: 'No running workers available',
        });
      }

      const queueStats = await runningWorker.worker.getQueueStats();

      res.json({
        success: true,
        timestamp: new Date(),
        queue: queueStats,
        summary: {
          totalJobs: queueStats.waiting + queueStats.active + queueStats.completed + queueStats.failed,
          activeJobs: queueStats.active,
          pendingJobs: queueStats.waiting,
          completedJobs: queueStats.completed,
          failedJobs: queueStats.failed,
          successRate: queueStats.completed > 0
            ? ((queueStats.completed / (queueStats.completed + queueStats.failed)) * 100).toFixed(2)
            : 0,
        },
      });
    } catch (error) {
      logger.error('Error fetching queue stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch queue stats',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/v1/queue/workers
   * Get detailed worker information
   */
  router.get('/workers', async (req: Request, res: Response) => {
    try {
      const workers = orchestrator.getWorkers();

      const workerDetails = await Promise.all(
        workers.map(async (w) => {
          let health = null;
          
          if (w.status === 'running') {
            try {
              health = await w.worker.healthCheck();
            } catch (error) {
              logger.error(`Health check failed for worker ${w.id}:`, error);
            }
          }

          return {
            id: w.id,
            status: w.status,
            healthStatus: w.healthStatus,
            startedAt: w.startedAt,
            lastHealthCheck: w.lastHealthCheck,
            uptime: Date.now() - w.startedAt.getTime(),
            processedJobs: w.processedJobs,
            failedJobs: w.failedJobs,
            health,
          };
        })
      );

      res.json({
        success: true,
        timestamp: new Date(),
        totalWorkers: workers.length,
        workers: workerDetails,
      });
    } catch (error) {
      logger.error('Error fetching worker details:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch worker details',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/v1/queue/scale
   * Manually scale workers
   */
  router.post('/scale', async (req: Request, res: Response) => {
    try {
      const { targetWorkers } = req.body;

      if (!targetWorkers || typeof targetWorkers !== 'number') {
        return res.status(400).json({
          success: false,
          error: 'Invalid targetWorkers parameter',
        });
      }

      const currentWorkers = orchestrator.getWorkers().length;

      logger.info('Manual scaling requested', {
        from: currentWorkers,
        to: targetWorkers,
      });

      await orchestrator.scaleTo(targetWorkers);

      res.json({
        success: true,
        message: 'Workers scaled successfully',
        from: currentWorkers,
        to: targetWorkers,
      });
    } catch (error) {
      logger.error('Error scaling workers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to scale workers',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/v1/queue/dead-letter
   * Get dead letter queue statistics
   */
  router.get('/dead-letter', async (req: Request, res: Response) => {
    try {
      const workers = orchestrator.getWorkers();
      const runningWorker = workers.find(w => w.status === 'running');

      if (!runningWorker) {
        return res.status(503).json({
          success: false,
          error: 'No running workers available',
        });
      }

      const queueStats = await runningWorker.worker.getQueueStats();
      const deadLetterStats = queueStats.deadLetter;

      res.json({
        success: true,
        timestamp: new Date(),
        deadLetter: deadLetterStats,
      });
    } catch (error) {
      logger.error('Error fetching dead letter stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch dead letter stats',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/v1/queue/metrics/prometheus
   * Prometheus-compatible metrics endpoint
   */
  router.get('/metrics/prometheus', async (req: Request, res: Response) => {
    try {
      const stats = orchestrator.getStats();
      const workers = orchestrator.getWorkers();
      const runningWorker = workers.find(w => w.status === 'running');

      let queueStats = null;
      if (runningWorker) {
        queueStats = await runningWorker.worker.getQueueStats();
      }

      // Generate Prometheus metrics format
      const metrics: string[] = [];

      // Worker metrics
      metrics.push(`# HELP queue_workers_total Total number of workers`);
      metrics.push(`# TYPE queue_workers_total gauge`);
      metrics.push(`queue_workers_total ${stats.totalWorkers}`);

      metrics.push(`# HELP queue_workers_by_status Number of workers by status`);
      metrics.push(`# TYPE queue_workers_by_status gauge`);
      Object.entries(stats.workersByStatus).forEach(([status, count]) => {
        metrics.push(`queue_workers_by_status{status="${status}"} ${count}`);
      });

      // Queue metrics
      if (queueStats) {
        metrics.push(`# HELP queue_jobs_waiting Number of jobs waiting in queue`);
        metrics.push(`# TYPE queue_jobs_waiting gauge`);
        metrics.push(`queue_jobs_waiting ${queueStats.waiting}`);

        metrics.push(`# HELP queue_jobs_active Number of jobs currently being processed`);
        metrics.push(`# TYPE queue_jobs_active gauge`);
        metrics.push(`queue_jobs_active ${queueStats.active}`);

        metrics.push(`# HELP queue_jobs_completed_total Total number of completed jobs`);
        metrics.push(`# TYPE queue_jobs_completed_total counter`);
        metrics.push(`queue_jobs_completed_total ${queueStats.completed}`);

        metrics.push(`# HELP queue_jobs_failed_total Total number of failed jobs`);
        metrics.push(`# TYPE queue_jobs_failed_total counter`);
        metrics.push(`queue_jobs_failed_total ${queueStats.failed}`);

        // Priority queue metrics
        if (queueStats.byPriority) {
          metrics.push(`# HELP queue_jobs_by_priority Number of jobs by priority`);
          metrics.push(`# TYPE queue_jobs_by_priority gauge`);
          Object.entries(queueStats.byPriority).forEach(([priority, stats]: [string, any]) => {
            metrics.push(`queue_jobs_by_priority{priority="${priority}",status="waiting"} ${stats.waiting}`);
            metrics.push(`queue_jobs_by_priority{priority="${priority}",status="active"} ${stats.active}`);
          });
        }
      }

      // System metrics
      metrics.push(`# HELP system_cpu_usage CPU usage percentage`);
      metrics.push(`# TYPE system_cpu_usage gauge`);
      metrics.push(`system_cpu_usage ${stats.systemResources.cpuUsage.toFixed(2)}`);

      metrics.push(`# HELP system_memory_usage Memory usage percentage`);
      metrics.push(`# TYPE system_memory_usage gauge`);
      metrics.push(`system_memory_usage ${stats.systemResources.memoryUsage.toFixed(2)}`);

      res.set('Content-Type', 'text/plain');
      res.send(metrics.join('\n'));
    } catch (error) {
      logger.error('Error generating Prometheus metrics:', error);
      res.status(500).send('# Error generating metrics');
    }
  });

  return { router };
}
