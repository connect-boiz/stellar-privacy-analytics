import { logger } from '../utils/logger';
import { Pool } from 'pg';
import Redis from 'redis';
import crypto from 'crypto';

export interface QueryPlan {
  query: string;
  executionTime: number;
  rowsExamined: number;
  rowsReturned: number;
  indexUsed?: string;
  indexScan?: boolean;
  sortUsed?: boolean;
  hashJoin?: boolean;
  nestedLoop?: boolean;
  cost?: number;
  recommendations: string[];
}

export interface PerformanceMetrics {
  timestamp: Date;
  queryCount: number;
  averageExecutionTime: number;
  slowQueries: number;
  cacheHitRate: number;
  indexUsage: Record<string, number>;
  tableSizes: Record<string, number>;
  connectionPoolUsage: number;
  memoryUsage: number;
  diskIOPS: number;
}

export interface IndexRecommendation {
  tableName: string;
  columnName: string;
  indexType: 'btree' | 'hash' | 'gin' | 'gist' | 'partial';
  estimatedImprovement: number;
  currentSelectivity: number;
  estimatedSelectivity: number;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

export interface QueryCache {
  key: string;
  result: any;
  timestamp: Date;
  ttl: number;
  hitCount: number;
  size: number;
}

export interface PartitioningStrategy {
  tableName: string;
  strategy: 'range' | 'hash' | 'list' | 'composite';
  partitionKey: string;
  partitionCount: number;
  estimatedReduction: number;
  implementation: string;
}

export class DatabasePerformanceService {
  private queryHistory: QueryPlan[] = [];
  private performanceMetrics: PerformanceMetrics[] = [];
  private queryCache: Map<string, QueryCache> = new Map();
  private slowQueryThreshold: number = 1000; // 1 second
  private maxCacheSize: number = 1000;
  private maxCacheTTL: number = 300000; // 5 minutes

  constructor(
    private pool: Pool,
    private redis: Redis
  ) {
    this.initializeMonitoring();
  }

  // Query optimization
  async analyzeQuery(query: string, params: any[] = []): Promise<QueryPlan> {
    const startTime = Date.now();
    
    try {
      // Get query execution plan
      const explainQuery = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`;
      const result = await this.pool.query(explainQuery, params);
      
      const plan = result.rows[0]['Plan'];
      
      // Extract performance metrics from plan
      const executionTime = this.extractExecutionTime(plan);
      const rowsExamined = this.extractRowsExamined(plan);
      const rowsReturned = this.extractRowsReturned(plan);
      const indexUsed = this.extractIndexUsed(plan);
      const indexScan = this.hasIndexScan(plan);
      const sortUsed = this.hasSortOperation(plan);
      const hashJoin = this.hasHashJoin(plan);
      const nestedLoop = this.hasNestedLoop(plan);
      const cost = plan['Total Cost'] || 0;

      // Generate recommendations
      const recommendations = this.generateQueryRecommendations(plan, query);

      const queryPlan: QueryPlan = {
        query,
        executionTime,
        rowsExamined,
        rowsReturned,
        indexUsed,
        indexScan,
        sortUsed,
        hashJoin,
        nestedLoop,
        cost,
        recommendations
      };

      // Store in history
      this.queryHistory.push(queryPlan);
      if (this.queryHistory.length > 1000) {
        this.queryHistory = this.queryHistory.slice(-1000);
      }

      logger.info(`Query analyzed: ${executionTime}ms, cost: ${cost}`);
      return queryPlan;

    } catch (error) {
      logger.error('Failed to analyze query:', error);
      throw error;
    } finally {
      const totalTime = Date.now() - startTime;
      this.updatePerformanceMetrics(totalTime);
    }
  }

  // Query caching
  async getCachedQuery(cacheKey: string): Promise<any | null> {
    const cached = this.queryCache.get(cacheKey);
    
    if (!cached) {
      return null;
    }

    // Check TTL
    if (Date.now() - cached.timestamp.getTime() > cached.ttl) {
      this.queryCache.delete(cacheKey);
      return null;
    }

    // Update hit count
    cached.hitCount++;
    
    logger.debug(`Cache hit for key: ${cacheKey}`);
    return cached.result;
  }

  async setCachedQuery(cacheKey: string, result: any, ttl: number = this.maxCacheTTL): Promise<void> {
    // Check cache size limit
    if (this.queryCache.size >= this.maxCacheSize) {
      await this.evictOldestCacheEntries();
    }

    const cacheEntry: QueryCache = {
      key: cacheKey,
      result,
      timestamp: new Date(),
      ttl,
      hitCount: 0,
      size: JSON.stringify(result).length
    };

    this.queryCache.set(cacheKey, cacheEntry);
    
    // Also store in Redis for distributed caching
    await this.redis.setex(cacheKey, Math.ceil(ttl / 1000), JSON.stringify(result));
    
    logger.debug(`Cached query with key: ${cacheKey}`);
  }

  private async evictOldestCacheEntries(): Promise<void> {
    const entries = Array.from(this.queryCache.entries());
    entries.sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime());
    
    // Remove oldest 10% of entries
    const toRemove = Math.ceil(this.maxCacheSize * 0.1);
    for (let i = 0; i < toRemove; i++) {
      if (entries[i]) {
        this.queryCache.delete(entries[i][0]);
        await this.redis.del(entries[i][0]);
      }
    }
  }

  // Index optimization
  async analyzeTableIndexes(tableName: string): Promise<IndexRecommendation[]> {
    try {
      // Get table statistics
      const statsQuery = `
        SELECT 
          schemaname,
          tablename,
          attname,
          n_distinct,
          correlation
        FROM pg_stats 
        WHERE tablename = $1
        ORDER BY n_distinct DESC
      `;
      
      const statsResult = await this.pool.query(statsQuery, [tableName]);
      const stats = statsResult.rows;

      // Get current indexes
      const indexQuery = `
        SELECT 
          indexname,
          indexdef,
          schemaname,
          tablename
        FROM pg_indexes 
        WHERE tablename = $1
      `;
      
      const indexResult = await this.pool.query(indexQuery, [tableName]);
      const currentIndexes = indexResult.rows;

      // Generate recommendations
      const recommendations: IndexRecommendation[] = [];

      for (const stat of stats) {
        const selectivity = stat.n_distinct / this.estimateTableRows(tableName);
        
        // High cardinality columns benefit from B-tree indexes
        if (selectivity > 0.1 && !this.hasIndexOnColumn(currentIndexes, stat.attname)) {
          recommendations.push({
            tableName,
            columnName: stat.attname,
            indexType: 'btree',
            estimatedImprovement: this.estimateIndexImprovement(selectivity, 'btree'),
            currentSelectivity: selectivity,
            estimatedSelectivity: selectivity * 0.1, // Estimated improvement
            reason: 'High cardinality column without index',
            priority: selectivity > 0.5 ? 'high' : 'medium'
          });
        }

        // Text columns benefit from GIN indexes
        if (this.isTextColumn(stat.attname) && !this.hasIndexOnColumn(currentIndexes, stat.attname)) {
          recommendations.push({
            tableName,
            columnName: stat.attname,
            indexType: 'gin',
            estimatedImprovement: this.estimateIndexImprovement(selectivity, 'gin'),
            currentSelectivity: selectivity,
            estimatedSelectivity: selectivity * 0.3,
            reason: 'Text column without full-text search index',
            priority: 'medium'
          });
        }

        // Range queries benefit from partial indexes
        if (this.isRangeColumn(stat.attname) && !this.hasIndexOnColumn(currentIndexes, stat.attname)) {
          recommendations.push({
            tableName,
            columnName: stat.attname,
            indexType: 'partial',
            estimatedImprovement: this.estimateIndexImprovement(selectivity, 'partial'),
            currentSelectivity: selectivity,
            estimatedSelectivity: selectivity * 0.2,
            reason: 'Range query column without optimized index',
            priority: 'low'
          });
        }
      }

      // Sort by priority and improvement
      recommendations.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        
        if (priorityDiff !== 0) {
          return priorityDiff;
        }
        
        return b.estimatedImprovement - a.estimatedImprovement;
      });

      return recommendations;

    } catch (error) {
      logger.error(`Failed to analyze indexes for table ${tableName}:`, error);
      return [];
    }
  }

  async createRecommendedIndex(recommendation: IndexRecommendation): Promise<void> {
    try {
      let indexDefinition: string;
      
      switch (recommendation.indexType) {
        case 'btree':
          indexDefinition = `CREATE INDEX CONCURRENTLY idx_${recommendation.tableName}_${recommendation.columnName} ON ${recommendation.tableName} (${recommendation.columnName})`;
          break;
        case 'hash':
          indexDefinition = `CREATE INDEX CONCURRENTLY idx_${recommendation.tableName}_${recommendation.columnName}_hash ON ${recommendation.tableName} USING HASH (${recommendation.columnName})`;
          break;
        case 'gin':
          indexDefinition = `CREATE INDEX CONCURRENTLY idx_${recommendation.tableName}_${recommendation.columnName}_gin ON ${recommendation.tableName} USING GIN (${recommendation.columnName})`;
          break;
        case 'partial':
          indexDefinition = `CREATE INDEX CONCURRENTLY idx_${recommendation.tableName}_${recommendation.columnName}_partial ON ${recommendation.tableName} (${recommendation.columnName}) WHERE ${recommendation.columnName} IS NOT NULL`;
          break;
        default:
          indexDefinition = `CREATE INDEX CONCURRENTLY idx_${recommendation.tableName}_${recommendation.columnName} ON ${recommendation.tableName} (${recommendation.columnName})`;
      }

      await this.pool.query(indexDefinition);
      logger.info(`Created index: ${recommendation.tableName}.${recommendation.columnName} (${recommendation.indexType})`);

    } catch (error) {
      logger.error(`Failed to create index for ${recommendation.tableName}.${recommendation.columnName}:`, error);
      throw error;
    }
  }

  // Partitioning strategies
  async analyzePartitioningStrategy(tableName: string, partitionKey: string): Promise<PartitioningStrategy> {
    try {
      // Get table statistics
      const rowCount = await this.estimateTableRows(tableName);
      const distinctValues = await this.getDistinctValueCount(tableName, partitionKey);
      
      // Determine optimal strategy based on data characteristics
      let strategy: PartitioningStrategy['strategy'];
      let partitionCount: number;
      let estimatedReduction: number;

      if (distinctValues < 100) {
        // List partitioning for low cardinality
        strategy = 'list';
        partitionCount = distinctValues;
        estimatedReduction = 0.9;
      } else if (this.isDateColumn(partitionKey)) {
        // Range partitioning for date columns
        strategy = 'range';
        partitionCount = Math.min(12, Math.ceil(rowCount / 1000000)); // Monthly partitions, max 12
        estimatedReduction = 0.8;
      } else if (distinctValues > rowCount * 0.5) {
        // Hash partitioning for high cardinality
        strategy = 'hash';
        partitionCount = Math.min(32, Math.ceil(Math.sqrt(rowCount / 100000)));
        estimatedReduction = 0.85;
      } else {
        // Composite partitioning
        strategy = 'composite';
        partitionCount = Math.min(16, Math.ceil(rowCount / 500000));
        estimatedReduction = 0.75;
      }

      const implementation = this.generatePartitionImplementation(tableName, strategy, partitionKey, partitionCount);

      return {
        tableName,
        strategy,
        partitionKey,
        partitionCount,
        estimatedReduction,
        implementation
      };

    } catch (error) {
      logger.error(`Failed to analyze partitioning for ${tableName}:`, error);
      throw error;
    }
  }

  // Performance monitoring
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    try {
      const [dbStats, cacheStats, connectionStats] = await Promise.all([
        this.getDatabaseStats(),
        this.getCacheStats(),
        this.getConnectionStats()
      ]);

      const metrics: PerformanceMetrics = {
        timestamp: new Date(),
        queryCount: this.queryHistory.length,
        averageExecutionTime: this.calculateAverageExecutionTime(),
        slowQueries: this.queryHistory.filter(q => q.executionTime > this.slowQueryThreshold).length,
        cacheHitRate: cacheStats.hitRate,
        indexUsage: this.getIndexUsageStats(),
        tableSizes: dbStats.tableSizes,
        connectionPoolUsage: connectionStats.usage,
        memoryUsage: dbStats.memoryUsage,
        diskIOPS: dbStats.diskIOPS
      };

      this.performanceMetrics.push(metrics);
      if (this.performanceMetrics.length > 100) {
        this.performanceMetrics = this.performanceMetrics.slice(-100);
      }

      return metrics;

    } catch (error) {
      logger.error('Failed to get performance metrics:', error);
      throw error;
    }
  }

  // Automated optimization
  async performAutoOptimization(): Promise<void> {
    logger.info('Starting automated database optimization');

    try {
      // 1. Update table statistics
      await this.updateTableStatistics();

      // 2. Rebuild fragmented indexes
      await this.rebuildFragmentedIndexes();

      // 3. Clean up old cache entries
      await this.cleanupExpiredCache();

      // 4. Optimize connection pool
      await this.optimizeConnectionPool();

      // 5. Vacuum and analyze tables
      await this.vacuumAndAnalyzeTables();

      logger.info('Automated optimization completed');

    } catch (error) {
      logger.error('Automated optimization failed:', error);
      throw error;
    }
  }

  // Load testing and capacity planning
  async performLoadTest(
    queries: string[],
    concurrency: number = 10,
    duration: number = 60000 // 1 minute
  ): Promise<any> {
    const startTime = Date.now();
    const results: any[] = [];
    
    try {
      logger.info(`Starting load test: ${concurrency} concurrent connections, ${duration}ms duration`);

      // Create concurrent connections
      const promises = Array.from({ length: concurrency }, async (_, index) => {
        const connection = await this.pool.connect();
        const testResults: any[] = [];

        try {
          for (const query of queries) {
            const queryStart = Date.now();
            await connection.query(query);
            const queryTime = Date.now() - queryStart;
            
            testResults.push({
              query,
              executionTime: queryTime,
              connectionId: index,
              timestamp: new Date()
            });
          }
        } finally {
          connection.release();
        }

        return testResults;
      });

      const allResults = await Promise.all(promises);
      const flatResults = allResults.flat();

      // Analyze results
      const analysis = {
        totalQueries: flatResults.length,
        averageExecutionTime: flatResults.reduce((sum, r) => sum + r.executionTime, 0) / flatResults.length,
        maxExecutionTime: Math.max(...flatResults.map(r => r.executionTime)),
        minExecutionTime: Math.min(...flatResults.map(r => r.executionTime)),
        p95ExecutionTime: this.calculatePercentile(flatResults.map(r => r.executionTime), 0.95),
        queriesPerSecond: flatResults.length / (duration / 1000),
        errors: flatResults.filter(r => r.error).length,
        duration: Date.now() - startTime
      };

      logger.info(`Load test completed: ${analysis.queriesPerSecond} queries/sec, avg: ${analysis.averageExecutionTime}ms`);
      return analysis;

    } catch (error) {
      logger.error('Load test failed:', error);
      throw error;
    }
  }

  // Helper methods
  private extractExecutionTime(plan: any): number {
    return plan['Execution Time'] || plan['Total Runtime'] || 0;
  }

  private extractRowsExamined(plan: any): number {
    return plan['Actual Rows'] || plan['Plan Rows'] || 0;
  }

  private extractRowsReturned(plan: any): number {
    return plan['Actual Rows'] || 0;
  }

  private extractIndexUsed(plan: any): string | undefined {
    return plan['Index Name'] || plan['Index Name'];
  }

  private hasIndexScan(plan: any): boolean {
    return plan['Node Type'] === 'Index Scan' || plan['Node Type'] === 'Index Only Scan';
  }

  private hasSortOperation(plan: any): boolean {
    return plan['Node Type'] === 'Sort' || plan['Sort Key'] !== undefined;
  }

  private hasHashJoin(plan: any): boolean {
    return plan['Node Type'] === 'Hash Join' || plan['Hash Key'] !== undefined;
  }

  private hasNestedLoop(plan: any): boolean {
    return plan['Node Type'] === 'Nested Loop';
  }

  private generateQueryRecommendations(plan: any, query: string): string[] {
    const recommendations: string[] = [];

    if (this.hasNestedLoop(plan)) {
      recommendations.push('Consider adding indexes to avoid nested loops');
    }

    if (!this.hasIndexScan(plan) && this.extractRowsExamined(plan) > 1000) {
      recommendations.push('Table scan detected - consider adding appropriate indexes');
    }

    if (this.hasSortOperation(plan)) {
      recommendations.push('Sort operation detected - consider adding composite index');
    }

    if (query.toLowerCase().includes('select *')) {
      recommendations.push('Avoid SELECT * - specify only needed columns');
    }

    if (query.toLowerCase().includes('order by') && !this.hasIndexScan(plan)) {
      recommendations.push('ORDER BY without index - consider adding index on sort columns');
    }

    return recommendations;
  }

  private generateCacheKey(query: string, params: any[]): string {
    const key = query + JSON.stringify(params);
    return crypto.createHash('md5').update(key).digest('hex');
  }

  private estimateTableRows(tableName: string): number {
    // Simplified estimation - in practice, use pg_class.reltuples
    return 100000; // Mock value
  }

  private hasIndexOnColumn(indexes: any[], columnName: string): boolean {
    return indexes.some(index => 
      index.indexdef && index.indexdef.includes(columnName)
    );
  }

  private isTextColumn(columnName: string): boolean {
    return columnName.toLowerCase().includes('text') || 
           columnName.toLowerCase().includes('description') ||
           columnName.toLowerCase().includes('content');
  }

  private isRangeColumn(columnName: string): boolean {
    return columnName.toLowerCase().includes('date') ||
           columnName.toLowerCase().includes('time') ||
           columnName.toLowerCase().includes('created') ||
           columnName.toLowerCase().includes('updated');
  }

  private isDateColumn(columnName: string): boolean {
    return columnName.toLowerCase().includes('date') ||
           columnName.toLowerCase().includes('time');
  }

  private estimateIndexImprovement(selectivity: number, indexType: string): number {
    const improvements = {
      btree: 0.7,
      hash: 0.6,
      gin: 0.8,
      partial: 0.4
    };
    
    return improvements[indexType as keyof typeof improvements] * (1 - selectivity);
  }

  private async getDistinctValueCount(tableName: string, columnName: string): Promise<number> {
    try {
      const result = await this.pool.query(
        `SELECT COUNT(DISTINCT ${columnName}) FROM ${tableName}`,
        []
      );
      return parseInt(result.rows[0].count);
    } catch (error) {
      return 1000; // Default fallback
    }
  }

  private generatePartitionImplementation(
    tableName: string, 
    strategy: string, 
    partitionKey: string, 
    partitionCount: number
  ): string {
    switch (strategy) {
      case 'list':
        return `-- List partitioning implementation for ${tableName} on ${partitionKey}`;
      case 'range':
        return `-- Range partitioning implementation for ${tableName} on ${partitionKey} (${partitionCount} partitions)`;
      case 'hash':
        return `-- Hash partitioning implementation for ${tableName} on ${partitionKey} (${partitionCount} partitions)`;
      case 'composite':
        return `-- Composite partitioning implementation for ${tableName} on ${partitionKey} (${partitionCount} partitions)`;
      default:
        return `-- Partitioning implementation for ${tableName}`;
    }
  }

  private updatePerformanceMetrics(executionTime: number): void {
    // Update rolling metrics
    const now = new Date();
    const metrics: PerformanceMetrics = {
      timestamp: now,
      queryCount: this.queryHistory.length,
      averageExecutionTime: this.calculateAverageExecutionTime(),
      slowQueries: this.queryHistory.filter(q => q.executionTime > this.slowQueryThreshold).length,
      cacheHitRate: this.calculateCacheHitRate(),
      indexUsage: {},
      tableSizes: {},
      connectionPoolUsage: 0,
      memoryUsage: 0,
      diskIOPS: 0
    };

    this.performanceMetrics.push(metrics);
  }

  private calculateAverageExecutionTime(): number {
    if (this.queryHistory.length === 0) return 0;
    const total = this.queryHistory.reduce((sum, q) => sum + q.executionTime, 0);
    return total / this.queryHistory.length;
  }

  private calculateCacheHitRate(): number {
    const cachedQueries = Array.from(this.queryCache.values());
    if (cachedQueries.length === 0) return 0;
    
    const totalHits = cachedQueries.reduce((sum, cache) => sum + cache.hitCount, 0);
    const totalRequests = totalHits + cachedQueries.length;
    
    return totalRequests > 0 ? totalHits / totalRequests : 0;
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private async getDatabaseStats(): Promise<any> {
    // Mock implementation - in practice, query pg_stat_database, pg_stat_user_tables
    return {
      tableSizes: {},
      memoryUsage: 0,
      diskIOPS: 0
    };
  }

  private async getCacheStats(): Promise<any> {
    return {
      hitRate: this.calculateCacheHitRate()
    };
  }

  private async getConnectionStats(): Promise<any> {
    return {
      usage: this.pool.totalCount - this.pool.idleCount
    };
  }

  private getIndexUsageStats(): Record<string, number> {
    const usage: Record<string, number> = {};
    
    for (const plan of this.queryHistory) {
      if (plan.indexUsed) {
        usage[plan.indexUsed] = (usage[plan.indexUsed] || 0) + 1;
      }
    }
    
    return usage;
  }

  private async updateTableStatistics(): Promise<void> {
    const tables = await this.pool.query(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `);
    
    for (const table of tables.rows) {
      await this.pool.query(`ANALYZE ${table.tablename}`);
    }
  }

  private async rebuildFragmentedIndexes(): Promise<void> {
    // Find and rebuild fragmented indexes
    const fragmentedIndexes = await this.pool.query(`
      SELECT schemaname, tablename, indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public'
    `);
    
    for (const index of fragmentedIndexes.rows) {
      try {
        await this.pool.query(`REINDEX INDEX CONCURRENTLY ${index.indexname}`);
        logger.info(`Rebuilt index: ${index.indexname}`);
      } catch (error) {
        logger.error(`Failed to rebuild index ${index.indexname}:`, error);
      }
    }
  }

  private async cleanupExpiredCache(): Promise<void> {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, cache] of this.queryCache.entries()) {
      if (now - cache.timestamp.getTime() > cache.ttl) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      this.queryCache.delete(key);
      await this.redis.del(key);
    }
    
    logger.info(`Cleaned up ${expiredKeys.length} expired cache entries`);
  }

  private async optimizeConnectionPool(): Promise<void> {
    // Connection pool optimization logic
    const currentUsage = this.pool.totalCount - this.pool.idleCount;
    const targetUsage = Math.max(2, Math.floor(this.pool.totalCount * 0.8));
    
    if (currentUsage > targetUsage) {
      logger.info('Connection pool usage high, consider tuning pool size');
    }
  }

  private async vacuumAndAnalyzeTables(): Promise<void> {
    const tables = await this.pool.query(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `);
    
    for (const table of tables.rows) {
      try {
        await this.pool.query(`VACUUM ANALYZE ${table.tablename}`);
        logger.info(`Vacuumed and analyzed table: ${table.tablename}`);
      } catch (error) {
        logger.error(`Failed to vacuum table ${table.tablename}:`, error);
      }
    }
  }

  // Public API methods
  getSlowQueries(threshold?: number): QueryPlan[] {
    const limit = threshold || this.slowQueryThreshold;
    return this.queryHistory.filter(q => q.executionTime > limit);
  }

  getCacheStatistics(): any {
    const cached = Array.from(this.queryCache.values());
    
    return {
      totalEntries: cached.length,
      totalHits: cached.reduce((sum, cache) => sum + cache.hitCount, 0),
      averageSize: cached.reduce((sum, cache) => sum + cache.size, 0) / cached.length,
      oldestEntry: cached.length > 0 ? Math.min(...cached.map(c => c.timestamp.getTime())) : null,
      newestEntry: cached.length > 0 ? Math.max(...cached.map(c => c.timestamp.getTime())) : null
    };
  }

  async generatePerformanceReport(): Promise<any> {
    const metrics = await this.getPerformanceMetrics();
    const slowQueries = this.getSlowQueries();
    const cacheStats = this.getCacheStatistics();
    
    return {
      timestamp: new Date(),
      summary: {
        totalQueries: metrics.queryCount,
        averageExecutionTime: metrics.averageExecutionTime,
        slowQueriesCount: slowQueries.length,
        cacheHitRate: metrics.cacheHitRate,
        connectionPoolUtilization: metrics.connectionPoolUsage
      },
      recommendations: this.generatePerformanceRecommendations(metrics, slowQueries, cacheStats),
      detailed: {
        metrics,
        slowQueries: slowQueries.slice(0, 10), // Top 10 slow queries
        cacheStatistics: cacheStats
      }
    };
  }

  private generatePerformanceRecommendations(
    metrics: PerformanceMetrics,
    slowQueries: QueryPlan[],
    cacheStats: any
  ): string[] {
    const recommendations: string[] = [];

    if (metrics.averageExecutionTime > 500) {
      recommendations.push('Consider query optimization - average execution time is high');
    }

    if (slowQueries.length > metrics.queryCount * 0.1) {
      recommendations.push('High percentage of slow queries detected - review indexing strategy');
    }

    if (metrics.cacheHitRate < 0.8) {
      recommendations.push('Low cache hit rate - consider increasing cache TTL or size');
    }

    if (metrics.connectionPoolUsage > 0.9) {
      recommendations.push('Connection pool near capacity - consider increasing pool size');
    }

    return recommendations;
  }
}
