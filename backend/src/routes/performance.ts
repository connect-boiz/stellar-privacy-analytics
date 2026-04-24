import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { DatabasePerformanceService } from '../services/databasePerformance';

const router = Router();

// Initialize performance service (will be injected with pool and redis)
let performanceService: DatabasePerformanceService;

export const initializePerformanceService = (service: DatabasePerformanceService) => {
  performanceService = service;
};

// Analyze query performance
router.post('/analyze-query', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { query, params } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const analysis = await performanceService.analyzeQuery(query, params);
    
    return res.json({
      message: 'Query analysis completed',
      analysis
    });
  } catch (error) {
    logger.error('Failed to analyze query:', error);
    return res.status(500).json({ error: 'Failed to analyze query' });
  }
}));

// Get cached query
router.get('/cached-query/:cacheKey', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { cacheKey } = req.params;
    const cachedResult = await performanceService.getCachedQuery(cacheKey);
    
    if (!cachedResult) {
      return res.status(404).json({ error: 'Cache entry not found' });
    }

    return res.json({
      message: 'Cache hit',
      data: cachedResult
    });
  } catch (error) {
    logger.error('Failed to get cached query:', error);
    return res.status(500).json({ error: 'Failed to get cached query' });
  }
}));

// Set cached query
router.post('/cached-query', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { cacheKey, result, ttl } = req.body;
    
    if (!cacheKey || result === undefined) {
      return res.status(400).json({ error: 'Cache key and result are required' });
    }

    await performanceService.setCachedQuery(cacheKey, result, ttl);
    
    return res.json({
      message: 'Query cached successfully',
      cacheKey,
      ttl: ttl || 300000
    });
  } catch (error) {
    logger.error('Failed to cache query:', error);
    return res.status(500).json({ error: 'Failed to cache query' });
  }
}));

// Analyze table indexes
router.get('/indexes/:tableName', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { tableName } = req.params;
    
    if (!tableName) {
      return res.status(400).json({ error: 'Table name is required' });
    }

    const recommendations = await performanceService.analyzeTableIndexes(tableName);
    
    return res.json({
      message: 'Index analysis completed',
      tableName,
      recommendations
    });
  } catch (error) {
    logger.error(`Failed to analyze indexes for table ${tableName}:`, error);
    return res.status(500).json({ error: 'Failed to analyze indexes' });
  }
}));

// Create recommended index
router.post('/indexes', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { tableName, columnName, indexType } = req.body;
    
    if (!tableName || !columnName) {
      return res.status(400).json({ error: 'Table name and column name are required' });
    }

    const recommendation = {
      tableName,
      columnName,
      indexType: indexType || 'btree',
      estimatedImprovement: 0.7,
      currentSelectivity: 0.3,
      estimatedSelectivity: 0.1,
      reason: 'Performance optimization recommendation',
      priority: 'medium'
    };

    await performanceService.createRecommendedIndex(recommendation);
    
    return res.json({
      message: 'Index created successfully',
      recommendation
    });
  } catch (error) {
    logger.error('Failed to create index:', error);
    return res.status(500).json({ error: 'Failed to create index' });
  }
}));

// Analyze partitioning strategy
router.get('/partitioning/:tableName/:partitionKey', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { tableName, partitionKey } = req.params;
    
    if (!tableName || !partitionKey) {
      return res.status(400).json({ error: 'Table name and partition key are required' });
    }

    const strategy = await performanceService.analyzePartitioningStrategy(tableName, partitionKey);
    
    return res.json({
      message: 'Partitioning analysis completed',
      strategy
    });
  } catch (error) {
    logger.error(`Failed to analyze partitioning for ${tableName}:`, error);
    return res.status(500).json({ error: 'Failed to analyze partitioning' });
  }
}));

// Get performance metrics
router.get('/metrics', asyncHandler(async (req: Request, res: Response) => {
  try {
    const metrics = await performanceService.getPerformanceMetrics();
    
    return res.json({
      message: 'Performance metrics retrieved',
      metrics
    });
  } catch (error) {
    logger.error('Failed to get performance metrics:', error);
    return res.status(500).json({ error: 'Failed to get performance metrics' });
  }
}));

// Perform automated optimization
router.post('/optimize', asyncHandler(async (req: Request, res: Response) => {
  try {
    await performanceService.performAutoOptimization();
    
    return res.json({
      message: 'Automated optimization completed',
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('Failed to perform automated optimization:', error);
    return res.status(500).json({ error: 'Failed to perform automated optimization' });
  }
}));

// Perform load test
router.post('/load-test', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { queries, concurrency, duration } = req.body;
    
    if (!queries || !Array.isArray(queries)) {
      return res.status(400).json({ error: 'Queries array is required' });
    }

    const results = await performanceService.performLoadTest(
      queries,
      concurrency || 10,
      duration || 60000
    );
    
    return res.json({
      message: 'Load test completed',
      results
    });
  } catch (error) {
    logger.error('Failed to perform load test:', error);
    return res.status(500).json({ error: 'Failed to perform load test' });
  }
}));

// Get slow queries
router.get('/slow-queries/:threshold?', asyncHandler(async (req: Request, res: Response) => {
  try {
    const threshold = req.params.threshold ? parseInt(req.params.threshold) : undefined;
    const slowQueries = performanceService.getSlowQueries(threshold);
    
    return res.json({
      message: 'Slow queries retrieved',
      threshold: threshold || 1000,
      count: slowQueries.length,
      queries: slowQueries
    });
  } catch (error) {
    logger.error('Failed to get slow queries:', error);
    return res.status(500).json({ error: 'Failed to get slow queries' });
  }
}));

// Get cache statistics
router.get('/cache-stats', asyncHandler(async (req: Request, res: Response) => {
  try {
    const stats = performanceService.getCacheStatistics();
    
    return res.json({
      message: 'Cache statistics retrieved',
      stats
    });
  } catch (error) {
    logger.error('Failed to get cache statistics:', error);
    return res.status(500).json({ error: 'Failed to get cache statistics' });
  }
}));

// Generate performance report
router.get('/report', asyncHandler(async (req: Request, res: Response) => {
  try {
    const report = await performanceService.generatePerformanceReport();
    
    return res.json({
      message: 'Performance report generated',
      report
    });
  } catch (error) {
    logger.error('Failed to generate performance report:', error);
    return res.status(500).json({ error: 'Failed to generate performance report' });
  }
}));

// Health check for performance service
router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  const health = {
    status: 'healthy',
    timestamp: new Date(),
    service: 'database-performance',
    version: '1.0.0',
    capabilities: [
      'query-analysis',
      'index-optimization',
      'partitioning-strategy',
      'performance-monitoring',
      'automated-optimization',
      'load-testing',
      'query-caching'
    ]
  };

  return res.json(health);
}));

export { router as performanceRoutes, initializePerformanceService };
