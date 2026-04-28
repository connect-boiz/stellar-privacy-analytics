import { Request, Response } from 'express';
import { LRUCache } from 'lru-cache';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';

export interface CacheOptions {
  maxSize: number;
  ttl: number; // Time to live in milliseconds
  keyPrefix: string;
}

export interface PerformanceMetrics {
  cacheHitRate: number;
  averageResponseTime: number;
  requestThroughput: number;
  memoryUsage: number;
  errorRate: number;
}

export interface OptimizationRule {
  id: string;
  name: string;
  condition: (req: Request) => boolean;
  action: 'cache' | 'compress' | 'batch' | 'skip';
  parameters: Record<string, any>;
  priority: number;
  enabled: boolean;
}

export class PerformanceOptimizer {
  private cache: LRUCache<string, any>;
  private requestMetrics: Map<string, number[]>;
  private optimizationRules: Map<string, OptimizationRule>;
  private performanceHistory: PerformanceMetrics[];
  private maxHistorySize: number;

  constructor(cacheOptions: CacheOptions = {
    maxSize: 1000,
    ttl: 5 * 60 * 1000, // 5 minutes
    keyPrefix: 'privacy_gateway'
  }) {
    this.cache = new LRUCache({
      max: cacheOptions.maxSize,
      ttl: cacheOptions.ttl,
      updateAgeOnGet: true
    });
    
    this.requestMetrics = new Map();
    this.optimizationRules = new Map();
    this.performanceHistory = [];
    this.maxHistorySize = 1000;
    
    this.initializeDefaultRules();
    this.startMetricsCollection();
  }

  async optimizeRequest(req: Request, res: Response): Promise<{
    shouldCache: boolean;
    shouldCompress: boolean;
    shouldBatch: boolean;
    cacheKey?: string;
    cachedResponse?: any;
  }> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(req);
      const cachedResponse = this.cache.get(cacheKey);
      
      if (cachedResponse) {
        this.recordMetrics(req, Date.now() - startTime, true);
        return {
          shouldCache: false,
          shouldCompress: false,
          shouldBatch: false,
          cacheKey,
          cachedResponse
        };
      }
      
      // Apply optimization rules
      const optimizations = await this.applyOptimizationRules(req);
      
      this.recordMetrics(req, Date.now() - startTime, false);
      
      return {
        shouldCache: optimizations.shouldCache,
        shouldCompress: optimizations.shouldCompress,
        shouldBatch: optimizations.shouldBatch,
        cacheKey: optimizations.shouldCache ? cacheKey : undefined
      };
      
    } catch (error) {
      logger.error('Performance optimization error:', error);
      return {
        shouldCache: false,
        shouldCompress: false,
        shouldBatch: false
      };
    }
  }

  async cacheResponse(cacheKey: string, response: any, ttl?: number): Promise<void> {
    if (!cacheKey) return;
    
    try {
      this.cache.set(cacheKey, {
        data: response,
        timestamp: Date.now(),
        ttl: ttl || this.cache.options.ttl
      });
      
      logger.debug('Response cached', { cacheKey });
    } catch (error) {
      logger.error('Cache storage error:', error);
    }
  }

  async compressResponse(data: any): Promise<Buffer> {
    // Simple compression implementation
    // In production, use gzip or brotli
    try {
      const jsonString = JSON.stringify(data);
      return Buffer.from(jsonString, 'utf8');
    } catch (error) {
      logger.error('Compression error:', error);
      return data;
    }
  }

  async batchRequests(requests: Request[]): Promise<any[]> {
    // Batch processing for multiple similar requests
    try {
      const batchKey = this.generateBatchKey(requests);
      const cachedBatch = this.cache.get(batchKey);
      
      if (cachedBatch) {
        return cachedBatch.results;
      }
      
      // Process batch (mock implementation)
      const results = await Promise.all(
        requests.map(req => this.processBatchedRequest(req))
      );
      
      // Cache batch results
      this.cache.set(batchKey, {
        results,
        timestamp: Date.now(),
        batch: true
      });
      
      return results;
    } catch (error) {
      logger.error('Batch processing error:', error);
      throw error;
    }
  }

  private async applyOptimizationRules(req: Request): Promise<{
    shouldCache: boolean;
    shouldCompress: boolean;
    shouldBatch: boolean;
  }> {
    const applicableRules = Array.from(this.optimizationRules.values())
      .filter(rule => rule.enabled && rule.condition(req))
      .sort((a, b) => b.priority - a.priority);
    
    let optimizations = {
      shouldCache: false,
      shouldCompress: false,
      shouldBatch: false
    };
    
    for (const rule of applicableRules) {
      switch (rule.action) {
        case 'cache':
          optimizations.shouldCache = true;
          break;
        case 'compress':
          optimizations.shouldCompress = true;
          break;
        case 'batch':
          optimizations.shouldBatch = true;
          break;
      }
      
      // Stop after first matching rule of each type
      if (optimizations.shouldCache && optimizations.shouldCompress && optimizations.shouldBatch) {
        break;
      }
    }
    
    return optimizations;
  }

  private generateCacheKey(req: Request): string {
    const keyData = {
      method: req.method,
      path: req.path,
      query: req.query,
      headers: {
        'x-privacy-level': req.headers['x-privacy-level'],
        'x-jurisdiction': req.headers['x-jurisdiction'],
        'x-consent': req.headers['x-consent']
      },
      user: (req as any).userId || 'anonymous'
    };
    
    const keyString = JSON.stringify(keyData);
    return createHash('sha256').update(keyString).digest('hex');
  }

  private generateBatchKey(requests: Request[]): string {
    const paths = requests.map(req => req.path).sort();
    const keyString = JSON.stringify({ paths, batch: true });
    return createHash('sha256').update(keyString).digest('hex');
  }

  private async processBatchedRequest(req: Request): Promise<any> {
    // Mock implementation - in reality, this would process the actual request
    return {
      path: req.path,
      method: req.method,
      processedAt: new Date(),
      batched: true
    };
  }

  private recordMetrics(req: Request, responseTime: number, cacheHit: boolean): void {
    const path = req.path;
    
    if (!this.requestMetrics.has(path)) {
      this.requestMetrics.set(path, []);
    }
    
    const metrics = this.requestMetrics.get(path)!;
    metrics.push(responseTime);
    
    // Keep only last 100 measurements per path
    if (metrics.length > 100) {
      metrics.splice(0, metrics.length - 100);
    }
    
    // Update performance history periodically
    if (this.requestMetrics.size % 10 === 0) {
      this.updatePerformanceHistory();
    }
  }

  private updatePerformanceHistory(): void {
    const allResponseTimes: number[] = [];
    let totalRequests = 0;
    let cacheHits = 0;
    
    this.requestMetrics.forEach((times, path) => {
      allResponseTimes.push(...times);
      totalRequests += times.length;
    });
    
    const averageResponseTime = allResponseTimes.length > 0
      ? allResponseTimes.reduce((sum, time) => sum + time, 0) / allResponseTimes.length
      : 0;
    
    const cacheHitRate = this.cache.size > 0
      ? (this.cache.hitCount / (this.cache.hitCount + this.cache.missCount)) * 100
      : 0;
    
    const memoryUsage = process.memoryUsage();
    const requestThroughput = totalRequests / (Date.now() / 1000); // Requests per second
    
    const metrics: PerformanceMetrics = {
      cacheHitRate,
      averageResponseTime,
      requestThroughput,
      memoryUsage: memoryUsage.heapUsed,
      errorRate: 0 // Would be calculated from error tracking
    };
    
    this.performanceHistory.push(metrics);
    
    // Keep history size limited
    if (this.performanceHistory.length > this.maxHistorySize) {
      this.performanceHistory.splice(0, this.performanceHistory.length - this.maxHistorySize);
    }
  }

  private startMetricsCollection(): void {
    setInterval(() => {
      this.updatePerformanceHistory();
      this.cleanupOldMetrics();
    }, 60000); // Update every minute
  }

  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - 5 * 60 * 1000; // 5 minutes ago
    
    // Clean old request metrics
    this.requestMetrics.forEach((times, path) => {
      const recentTimes = times.filter(time => time > cutoff);
      if (recentTimes.length === 0) {
        this.requestMetrics.delete(path);
      } else {
        this.requestMetrics.set(path, recentTimes);
      }
    });
    
    // Clean old cache entries
    this.cache.purgeStale();
  }

  private initializeDefaultRules(): void {
    // Cache GET requests with privacy level low/medium
    const cacheRule: OptimizationRule = {
      id: 'cache-safe-requests',
      name: 'Cache Safe Requests',
      condition: (req) => {
        return req.method === 'GET' && 
               ['low', 'medium'].includes(req.headers['x-privacy-level'] as string || 'medium');
      },
      action: 'cache',
      parameters: { ttl: 5 * 60 * 1000 }, // 5 minutes
      priority: 100,
      enabled: true
    };
    
    // Compress large responses
    const compressRule: OptimizationRule = {
      id: 'compress-large-responses',
      name: 'Compress Large Responses',
      condition: (req) => {
        return req.headers['accept-encoding']?.includes('gzip') === true;
      },
      action: 'compress',
      parameters: { threshold: 1024 }, // 1KB
      priority: 80,
      enabled: true
    };
    
    // Batch analytics requests
    const batchRule: OptimizationRule = {
      id: 'batch-analytics-requests',
      name: 'Batch Analytics Requests',
      condition: (req) => {
        return req.path.startsWith('/gateway/analytics') && 
               req.method === 'GET';
      },
      action: 'batch',
      parameters: { batchSize: 10, windowMs: 1000 },
      priority: 90,
      enabled: true
    };
    
    this.optimizationRules.set(cacheRule.id, cacheRule);
    this.optimizationRules.set(compressRule.id, compressRule);
    this.optimizationRules.set(batchRule.id, batchRule);
  }

  public addOptimizationRule(rule: OptimizationRule): void {
    this.optimizationRules.set(rule.id, rule);
    logger.info('Optimization rule added', { ruleId: rule.id, name: rule.name });
  }

  public removeOptimizationRule(ruleId: string): void {
    this.optimizationRules.delete(ruleId);
    logger.info('Optimization rule removed', { ruleId });
  }

  public getPerformanceMetrics(): PerformanceMetrics | null {
    return this.performanceHistory.length > 0
      ? this.performanceHistory[this.performanceHistory.length - 1]
      : null;
  }

  public getPerformanceHistory(limit?: number): PerformanceMetrics[] {
    return limit
      ? this.performanceHistory.slice(-limit)
      : this.performanceHistory;
  }

  public getOptimizationRules(): OptimizationRule[] {
    return Array.from(this.optimizationRules.values());
  }

  public getCacheStats(): {
    size: number;
    hitRate: number;
    memoryUsage: number;
  } {
    return {
      size: this.cache.size,
      hitRate: this.cache.hitCount / (this.cache.hitCount + this.cache.missCount) * 100,
      memoryUsage: this.cache.calculatedSize
    };
  }

  public clearCache(): void {
    this.cache.clear();
    logger.info('Performance cache cleared');
  }

  public optimizeCache(): void {
    // Remove least recently used items if cache is full
    if (this.cache.size >= this.cache.max * 0.9) {
      const purgeCount = Math.floor(this.cache.max * 0.2);
      this.cache.purgeStale();
      logger.debug(`Cache optimization: purged ${purgeCount} items`);
    }
  }

  public getRecommendations(): Array<{
    type: 'cache' | 'compression' | 'batching' | 'scaling';
    priority: 'low' | 'medium' | 'high';
    description: string;
    action: string;
  }> {
    const recommendations = [];
    const metrics = this.getPerformanceMetrics();
    
    if (!metrics) return recommendations;
    
    // Cache recommendations
    if (metrics.cacheHitRate < 50) {
      recommendations.push({
        type: 'cache',
        priority: 'high',
        description: `Low cache hit rate: ${metrics.cacheHitRate.toFixed(1)}%`,
        action: 'Consider increasing cache TTL or expanding cacheable endpoints'
      });
    }
    
    // Performance recommendations
    if (metrics.averageResponseTime > 500) {
      recommendations.push({
        type: 'compression',
        priority: 'medium',
        description: `High average response time: ${metrics.averageResponseTime.toFixed(1)}ms`,
        action: 'Enable response compression or optimize slow endpoints'
      });
    }
    
    // Memory recommendations
    if (metrics.memoryUsage > 500 * 1024 * 1024) { // 500MB
      recommendations.push({
        type: 'scaling',
        priority: 'high',
        description: `High memory usage: ${(metrics.memoryUsage / 1024 / 1024).toFixed(1)}MB`,
        action: 'Consider horizontal scaling or memory optimization'
      });
    }
    
    return recommendations;
  }
}
