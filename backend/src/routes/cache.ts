import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { DistributedCacheManager } from '../services/cache/DistributedCacheManager';
import { CacheMonitor } from '../services/cache/CacheMonitor';
import { CacheWarmingStrategy } from '../services/cache/CacheWarmingStrategy';
import { CachePerformanceTester } from '../services/cache/CachePerformanceTester';

const router = Router();

// These will be injected by the main application
let cacheManager: DistributedCacheManager;
let cacheMonitor: CacheMonitor;
let warmingStrategy: CacheWarmingStrategy;
let performanceTester: CachePerformanceTester;

/**
 * Initialize cache route with dependencies
 */
export function initializeCacheRoutes(
  manager: DistributedCacheManager,
  monitor: CacheMonitor,
  warming: CacheWarmingStrategy,
  tester: CachePerformanceTester
): Router {
  cacheManager = manager;
  cacheMonitor = monitor;
  warmingStrategy = warming;
  performanceTester = tester;

  return router;
}

/**
 * GET /api/cache/metrics
 * Get cache metrics
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = cacheManager.getMetrics();
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    logger.error('Error getting cache metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache metrics'
    });
  }
});

/**
 * GET /api/cache/statistics
 * Get detailed cache statistics
 */
router.get('/statistics', async (req: Request, res: Response) => {
  try {
    const statistics = await cacheManager.getStatistics();
    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    logger.error('Error getting cache statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache statistics'
    });
  }
});

/**
 * GET /api/cache/health
 * Get cache health report
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const healthReport = await cacheMonitor.generateHealthReport();
    res.json({
      success: true,
      data: healthReport
    });
  } catch (error) {
    logger.error('Error getting cache health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache health'
    });
  }
});

/**
 * GET /api/cache/alerts
 * Get cache alerts
 */
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.active === 'true';
    const alerts = activeOnly 
      ? cacheMonitor.getActiveAlerts()
      : cacheMonitor.getAllAlerts();

    res.json({
      success: true,
      data: alerts
    });
  } catch (error) {
    logger.error('Error getting cache alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache alerts'
    });
  }
});

/**
 * POST /api/cache/alerts/:alertId/resolve
 * Resolve a cache alert
 */
router.post('/alerts/:alertId/resolve', async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    cacheMonitor.resolveAlert(alertId);

    res.json({
      success: true,
      message: 'Alert resolved successfully'
    });
  } catch (error) {
    logger.error('Error resolving alert:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resolve alert'
    });
  }
});

/**
 * POST /api/cache/invalidate
 * Invalidate cache entries
 */
router.post('/invalidate', async (req: Request, res: Response) => {
  try {
    const { pattern, tags, keys } = req.body;

    let invalidatedCount = 0;

    if (pattern) {
      invalidatedCount = await cacheManager.invalidatePattern(pattern);
    } else if (tags && Array.isArray(tags)) {
      invalidatedCount = await cacheManager.invalidateByTags(tags);
    } else if (keys && Array.isArray(keys)) {
      for (const key of keys) {
        await cacheManager.delete(key);
        invalidatedCount++;
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'Must provide pattern, tags, or keys'
      });
    }

    res.json({
      success: true,
      data: {
        invalidatedCount
      }
    });
  } catch (error) {
    logger.error('Error invalidating cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to invalidate cache'
    });
  }
});

/**
 * POST /api/cache/clear
 * Clear all cache entries
 */
router.post('/clear', async (req: Request, res: Response) => {
  try {
    await cacheManager.clear();

    res.json({
      success: true,
      message: 'Cache cleared successfully'
    });
  } catch (error) {
    logger.error('Error clearing cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache'
    });
  }
});

/**
 * POST /api/cache/warm
 * Warm cache with data
 */
router.post('/warm', async (req: Request, res: Response) => {
  try {
    const { entries } = req.body;

    if (!entries || !Array.isArray(entries)) {
      return res.status(400).json({
        success: false,
        error: 'Must provide entries array'
      });
    }

    await cacheManager.warmCache(entries);

    res.json({
      success: true,
      message: `Cache warmed with ${entries.length} entries`
    });
  } catch (error) {
    logger.error('Error warming cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to warm cache'
    });
  }
});

/**
 * GET /api/cache/warming/strategies
 * Get warming strategies
 */
router.get('/warming/strategies', async (req: Request, res: Response) => {
  try {
    const strategies = warmingStrategy.getStrategies();

    res.json({
      success: true,
      data: strategies
    });
  } catch (error) {
    logger.error('Error getting warming strategies:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get warming strategies'
    });
  }
});

/**
 * POST /api/cache/warming/strategies/:name/execute
 * Execute a warming strategy
 */
router.post('/warming/strategies/:name/execute', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const task = await warmingStrategy.executeStrategy(name);

    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    logger.error('Error executing warming strategy:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute warming strategy'
    });
  }
});

/**
 * PUT /api/cache/warming/strategies/:name
 * Update a warming strategy
 */
router.put('/warming/strategies/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const updates = req.body;

    warmingStrategy.updateStrategy(name, updates);

    res.json({
      success: true,
      message: 'Strategy updated successfully'
    });
  } catch (error) {
    logger.error('Error updating warming strategy:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update warming strategy'
    });
  }
});

/**
 * GET /api/cache/warming/tasks
 * Get warming tasks
 */
router.get('/warming/tasks', async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.active === 'true';
    const tasks = activeOnly
      ? warmingStrategy.getActiveTasks()
      : warmingStrategy.getAllTasks();

    res.json({
      success: true,
      data: tasks
    });
  } catch (error) {
    logger.error('Error getting warming tasks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get warming tasks'
    });
  }
});

/**
 * POST /api/cache/test/performance
 * Run performance test
 */
router.post('/test/performance', async (req: Request, res: Response) => {
  try {
    const config = req.body;
    const result = await performanceTester.runTest(config);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error running performance test:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to run performance test'
    });
  }
});

/**
 * GET /api/cache/test/scenarios
 * Get predefined test scenarios
 */
router.get('/test/scenarios', async (req: Request, res: Response) => {
  try {
    const scenarios = performanceTester.getPredefinedScenarios();

    res.json({
      success: true,
      data: scenarios
    });
  } catch (error) {
    logger.error('Error getting test scenarios:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get test scenarios'
    });
  }
});

/**
 * POST /api/cache/test/scenario/:name
 * Run a specific test scenario
 */
router.post('/test/scenario/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const scenarios = performanceTester.getPredefinedScenarios();
    const scenario = scenarios.find(s => s.name === name);

    if (!scenario) {
      return res.status(404).json({
        success: false,
        error: 'Scenario not found'
      });
    }

    const result = await performanceTester.runScenario(scenario);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error running test scenario:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to run test scenario'
    });
  }
});

/**
 * GET /api/cache/test/results
 * Get all test results
 */
router.get('/test/results', async (req: Request, res: Response) => {
  try {
    const results = performanceTester.getAllTestResults();

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error('Error getting test results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get test results'
    });
  }
});

/**
 * GET /api/cache/test/results/:testId
 * Get specific test result
 */
router.get('/test/results/:testId', async (req: Request, res: Response) => {
  try {
    const { testId } = req.params;
    const result = performanceTester.getTestResult(testId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Test result not found'
      });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error getting test result:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get test result'
    });
  }
});

/**
 * GET /api/cache/test/results/:testId/report
 * Get test report
 */
router.get('/test/results/:testId/report', async (req: Request, res: Response) => {
  try {
    const { testId } = req.params;
    const report = performanceTester.generateReport(testId);

    res.type('text/plain').send(report);
  } catch (error) {
    logger.error('Error generating test report:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate test report'
    });
  }
});

/**
 * GET /api/cache/metrics/history
 * Get metrics history
 */
router.get('/metrics/history', async (req: Request, res: Response) => {
  try {
    const duration = req.query.duration ? parseInt(req.query.duration as string) : undefined;
    const history = cacheMonitor.getMetricsHistory(duration);

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    logger.error('Error getting metrics history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get metrics history'
    });
  }
});

/**
 * GET /api/cache/metrics/trend/:metric
 * Get metric trend
 */
router.get('/metrics/trend/:metric', async (req: Request, res: Response) => {
  try {
    const { metric } = req.params;
    const duration = req.query.duration ? parseInt(req.query.duration as string) : undefined;
    
    const trend = cacheMonitor.getMetricsTrend(metric as any, duration);

    res.json({
      success: true,
      data: trend
    });
  } catch (error) {
    logger.error('Error getting metric trend:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get metric trend'
    });
  }
});

export default router;
