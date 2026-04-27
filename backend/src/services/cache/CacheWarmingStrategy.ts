import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { DistributedCacheManager } from './DistributedCacheManager';

export interface WarmingStrategy {
  name: string;
  enabled: boolean;
  priority: number;
  schedule?: string; // Cron expression
  trigger?: 'startup' | 'scheduled' | 'manual' | 'threshold';
  threshold?: number;
}

export interface WarmingTask {
  id: string;
  strategy: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: Date;
  endTime?: Date;
  itemsWarmed: number;
  errors: number;
  duration?: number;
}

export interface WarmingConfig {
  strategies: WarmingStrategy[];
  batchSize: number;
  concurrency: number;
  retryAttempts: number;
  retryDelay: number;
}

/**
 * Cache Warming Strategy Manager
 * Implements intelligent cache warming based on usage patterns
 */
export class CacheWarmingStrategy extends EventEmitter {
  private config: WarmingConfig;
  private cacheManager: DistributedCacheManager;
  private tasks: Map<string, WarmingTask> = new Map();
  private accessPatterns: Map<string, number> = new Map();
  private warmingTimers: Map<string, NodeJS.Timeout> = new Map();
  private isInitialized: boolean = false;

  constructor(
    cacheManager: DistributedCacheManager,
    config?: Partial<WarmingConfig>
  ) {
    super();

    this.cacheManager = cacheManager;
    this.config = {
      strategies: config?.strategies || this.getDefaultStrategies(),
      batchSize: config?.batchSize || 100,
      concurrency: config?.concurrency || 5,
      retryAttempts: config?.retryAttempts || 3,
      retryDelay: config?.retryDelay || 1000
    };
  }

  /**
   * Initialize warming strategies
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Cache warming strategy already initialized');
      return;
    }

    // Schedule warming tasks
    for (const strategy of this.config.strategies) {
      if (strategy.enabled && strategy.trigger === 'startup') {
        await this.executeStrategy(strategy.name);
      }

      if (strategy.enabled && strategy.schedule) {
        this.scheduleStrategy(strategy);
      }
    }

    this.isInitialized = true;

    logger.info('Cache warming strategy initialized', {
      strategies: this.config.strategies.length
    });

    this.emit('initialized');
  }

  /**
   * Shutdown warming strategies
   */
  async shutdown(): Promise<void> {
    // Clear all timers
    for (const [name, timer] of this.warmingTimers.entries()) {
      clearInterval(timer);
      this.warmingTimers.delete(name);
    }

    this.isInitialized = false;

    logger.info('Cache warming strategy shutdown completed');
    this.emit('shutdown');
  }

  /**
   * Execute warming strategy
   */
  async executeStrategy(strategyName: string): Promise<WarmingTask> {
    const strategy = this.config.strategies.find(s => s.name === strategyName);
    
    if (!strategy) {
      throw new Error(`Strategy not found: ${strategyName}`);
    }

    if (!strategy.enabled) {
      throw new Error(`Strategy is disabled: ${strategyName}`);
    }

    const task: WarmingTask = {
      id: this.generateTaskId(),
      strategy: strategyName,
      status: 'pending',
      itemsWarmed: 0,
      errors: 0
    };

    this.tasks.set(task.id, task);

    try {
      task.status = 'running';
      task.startTime = new Date();

      logger.info(`Executing warming strategy: ${strategyName}`);
      this.emit('strategyStarted', { task, strategy });

      // Execute strategy-specific warming logic
      switch (strategyName) {
        case 'frequently-accessed':
          await this.warmFrequentlyAccessed(task);
          break;
        case 'predictive':
          await this.warmPredictive(task);
          break;
        case 'time-based':
          await this.warmTimeBased(task);
          break;
        case 'user-specific':
          await this.warmUserSpecific(task);
          break;
        case 'critical-data':
          await this.warmCriticalData(task);
          break;
        default:
          throw new Error(`Unknown strategy: ${strategyName}`);
      }

      task.status = 'completed';
      task.endTime = new Date();
      task.duration = task.endTime.getTime() - task.startTime.getTime();

      logger.info(`Warming strategy completed: ${strategyName}`, {
        itemsWarmed: task.itemsWarmed,
        duration: task.duration,
        errors: task.errors
      });

      this.emit('strategyCompleted', { task, strategy });

      return task;
    } catch (error) {
      task.status = 'failed';
      task.endTime = new Date();
      task.duration = task.endTime ? task.endTime.getTime() - (task.startTime?.getTime() || 0) : 0;

      logger.error(`Warming strategy failed: ${strategyName}`, error);
      this.emit('strategyFailed', { task, strategy, error });

      throw error;
    }
  }

  /**
   * Warm frequently accessed keys
   */
  private async warmFrequentlyAccessed(task: WarmingTask): Promise<void> {
    try {
      // Get top accessed keys from access patterns
      const topKeys = this.getTopAccessedKeys(100);

      logger.info(`Warming ${topKeys.length} frequently accessed keys`);

      // Warm in batches
      const batches = this.createBatches(topKeys, this.config.batchSize);

      for (const batch of batches) {
        await this.warmBatch(batch, task);
      }
    } catch (error) {
      logger.error('Error warming frequently accessed keys:', error);
      throw error;
    }
  }

  /**
   * Warm based on predictive analysis
   */
  private async warmPredictive(task: WarmingTask): Promise<void> {
    try {
      // Analyze access patterns and predict likely keys
      const predictedKeys = this.predictLikelyKeys();

      logger.info(`Warming ${predictedKeys.length} predicted keys`);

      const batches = this.createBatches(predictedKeys, this.config.batchSize);

      for (const batch of batches) {
        await this.warmBatch(batch, task);
      }
    } catch (error) {
      logger.error('Error warming predicted keys:', error);
      throw error;
    }
  }

  /**
   * Warm based on time patterns
   */
  private async warmTimeBased(task: WarmingTask): Promise<void> {
    try {
      // Get keys that are typically accessed at this time
      const timeBasedKeys = this.getTimeBasedKeys();

      logger.info(`Warming ${timeBasedKeys.length} time-based keys`);

      const batches = this.createBatches(timeBasedKeys, this.config.batchSize);

      for (const batch of batches) {
        await this.warmBatch(batch, task);
      }
    } catch (error) {
      logger.error('Error warming time-based keys:', error);
      throw error;
    }
  }

  /**
   * Warm user-specific data
   */
  private async warmUserSpecific(task: WarmingTask): Promise<void> {
    try {
      // Get active users and warm their data
      const userKeys = await this.getUserSpecificKeys();

      logger.info(`Warming ${userKeys.length} user-specific keys`);

      const batches = this.createBatches(userKeys, this.config.batchSize);

      for (const batch of batches) {
        await this.warmBatch(batch, task);
      }
    } catch (error) {
      logger.error('Error warming user-specific keys:', error);
      throw error;
    }
  }

  /**
   * Warm critical data
   */
  private async warmCriticalData(task: WarmingTask): Promise<void> {
    try {
      // Get critical data keys (configuration, metadata, etc.)
      const criticalKeys = this.getCriticalDataKeys();

      logger.info(`Warming ${criticalKeys.length} critical data keys`);

      const batches = this.createBatches(criticalKeys, this.config.batchSize);

      for (const batch of batches) {
        await this.warmBatch(batch, task);
      }
    } catch (error) {
      logger.error('Error warming critical data:', error);
      throw error;
    }
  }

  /**
   * Warm a batch of keys
   */
  private async warmBatch(
    keys: Array<{ key: string; loader: () => Promise<any> }>,
    task: WarmingTask
  ): Promise<void> {
    const promises = keys.map(async ({ key, loader }) => {
      try {
        // Check if already cached
        const cached = await this.cacheManager.get(key);
        if (cached !== null) {
          return; // Already cached
        }

        // Load and cache data
        const data = await loader();
        await this.cacheManager.set(key, data);

        task.itemsWarmed++;
      } catch (error) {
        task.errors++;
        logger.error(`Error warming key ${key}:`, error);
      }
    });

    await Promise.all(promises);
  }

  /**
   * Record access pattern
   */
  recordAccess(key: string): void {
    const count = this.accessPatterns.get(key) || 0;
    this.accessPatterns.set(key, count + 1);

    // Keep only top 10000 keys
    if (this.accessPatterns.size > 10000) {
      const sorted = Array.from(this.accessPatterns.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10000);
      
      this.accessPatterns = new Map(sorted);
    }
  }

  /**
   * Get top accessed keys
   */
  private getTopAccessedKeys(limit: number): Array<{ key: string; loader: () => Promise<any> }> {
    const sorted = Array.from(this.accessPatterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    return sorted.map(([key]) => ({
      key,
      loader: () => this.loadData(key)
    }));
  }

  /**
   * Predict likely keys based on patterns
   */
  private predictLikelyKeys(): Array<{ key: string; loader: () => Promise<any> }> {
    // Simple prediction: keys with increasing access frequency
    const predictions: Array<{ key: string; loader: () => Promise<any> }> = [];

    // This is a simplified implementation
    // In production, use ML models or more sophisticated algorithms
    const topKeys = this.getTopAccessedKeys(50);
    
    // Add related keys (e.g., if user:123 is accessed, predict user:123:profile)
    for (const { key } of topKeys) {
      predictions.push({ key, loader: () => this.loadData(key) });
      
      // Add related keys
      const relatedKeys = this.getRelatedKeys(key);
      for (const relatedKey of relatedKeys) {
        predictions.push({
          key: relatedKey,
          loader: () => this.loadData(relatedKey)
        });
      }
    }

    return predictions;
  }

  /**
   * Get time-based keys
   */
  private getTimeBasedKeys(): Array<{ key: string; loader: () => Promise<any> }> {
    const hour = new Date().getHours();
    const dayOfWeek = new Date().getDay();

    // This is a simplified implementation
    // In production, analyze historical access patterns by time
    const keys: Array<{ key: string; loader: () => Promise<any> }> = [];

    // Example: warm analytics data during business hours
    if (hour >= 9 && hour <= 17) {
      keys.push({
        key: 'analytics:dashboard',
        loader: () => this.loadData('analytics:dashboard')
      });
    }

    // Example: warm reports on Monday mornings
    if (dayOfWeek === 1 && hour >= 8 && hour <= 10) {
      keys.push({
        key: 'reports:weekly',
        loader: () => this.loadData('reports:weekly')
      });
    }

    return keys;
  }

  /**
   * Get user-specific keys
   */
  private async getUserSpecificKeys(): Promise<Array<{ key: string; loader: () => Promise<any> }>> {
    // This would typically query active users from database
    // Simplified implementation
    const activeUsers = ['user:1', 'user:2', 'user:3']; // Mock data

    const keys: Array<{ key: string; loader: () => Promise<any> }> = [];

    for (const userId of activeUsers) {
      keys.push(
        {
          key: `${userId}:profile`,
          loader: () => this.loadData(`${userId}:profile`)
        },
        {
          key: `${userId}:preferences`,
          loader: () => this.loadData(`${userId}:preferences`)
        },
        {
          key: `${userId}:recent-activity`,
          loader: () => this.loadData(`${userId}:recent-activity`)
        }
      );
    }

    return keys;
  }

  /**
   * Get critical data keys
   */
  private getCriticalDataKeys(): Array<{ key: string; loader: () => Promise<any> }> {
    return [
      {
        key: 'config:app',
        loader: () => this.loadData('config:app')
      },
      {
        key: 'config:features',
        loader: () => this.loadData('config:features')
      },
      {
        key: 'metadata:schema',
        loader: () => this.loadData('metadata:schema')
      },
      {
        key: 'privacy:policies',
        loader: () => this.loadData('privacy:policies')
      }
    ];
  }

  /**
   * Get related keys
   */
  private getRelatedKeys(key: string): string[] {
    // Simple pattern matching for related keys
    const related: string[] = [];

    if (key.includes(':')) {
      const parts = key.split(':');
      const prefix = parts[0];
      
      // Add common related suffixes
      const suffixes = ['profile', 'settings', 'metadata', 'stats'];
      for (const suffix of suffixes) {
        related.push(`${prefix}:${suffix}`);
      }
    }

    return related;
  }

  /**
   * Load data (placeholder for actual data loading logic)
   */
  private async loadData(key: string): Promise<any> {
    // This would be replaced with actual data loading logic
    // For now, return mock data
    return { key, data: `mock-data-for-${key}`, timestamp: Date.now() };
  }

  /**
   * Create batches
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Schedule strategy
   */
  private scheduleStrategy(strategy: WarmingStrategy): void {
    if (!strategy.schedule) {
      return;
    }

    // Simple interval-based scheduling
    // In production, use a proper cron library
    const interval = this.parseCronToInterval(strategy.schedule);
    
    const timer = setInterval(async () => {
      try {
        await this.executeStrategy(strategy.name);
      } catch (error) {
        logger.error(`Scheduled warming strategy failed: ${strategy.name}`, error);
      }
    }, interval);

    this.warmingTimers.set(strategy.name, timer);

    logger.info(`Scheduled warming strategy: ${strategy.name}`, {
      schedule: strategy.schedule,
      interval
    });
  }

  /**
   * Parse cron expression to interval (simplified)
   */
  private parseCronToInterval(cron: string): number {
    // Simplified cron parsing
    // In production, use a proper cron parser
    if (cron === '0 * * * *') return 3600000; // Every hour
    if (cron === '*/15 * * * *') return 900000; // Every 15 minutes
    if (cron === '0 0 * * *') return 86400000; // Daily
    
    return 3600000; // Default to 1 hour
  }

  /**
   * Get default strategies
   */
  private getDefaultStrategies(): WarmingStrategy[] {
    return [
      {
        name: 'frequently-accessed',
        enabled: true,
        priority: 1,
        trigger: 'startup',
        schedule: '*/15 * * * *' // Every 15 minutes
      },
      {
        name: 'predictive',
        enabled: true,
        priority: 2,
        schedule: '0 * * * *' // Every hour
      },
      {
        name: 'time-based',
        enabled: true,
        priority: 3,
        schedule: '0 * * * *' // Every hour
      },
      {
        name: 'user-specific',
        enabled: false,
        priority: 4,
        trigger: 'manual'
      },
      {
        name: 'critical-data',
        enabled: true,
        priority: 5,
        trigger: 'startup'
      }
    ];
  }

  /**
   * Generate task ID
   */
  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get task status
   */
  getTask(taskId: string): WarmingTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): WarmingTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get active tasks
   */
  getActiveTasks(): WarmingTask[] {
    return Array.from(this.tasks.values()).filter(
      task => task.status === 'running' || task.status === 'pending'
    );
  }

  /**
   * Update strategy
   */
  updateStrategy(name: string, updates: Partial<WarmingStrategy>): void {
    const index = this.config.strategies.findIndex(s => s.name === name);
    
    if (index === -1) {
      throw new Error(`Strategy not found: ${name}`);
    }

    this.config.strategies[index] = {
      ...this.config.strategies[index],
      ...updates
    };

    // Reschedule if needed
    if (updates.schedule || updates.enabled !== undefined) {
      const timer = this.warmingTimers.get(name);
      if (timer) {
        clearInterval(timer);
        this.warmingTimers.delete(name);
      }

      if (this.config.strategies[index].enabled && this.config.strategies[index].schedule) {
        this.scheduleStrategy(this.config.strategies[index]);
      }
    }

    logger.info(`Strategy updated: ${name}`, updates);
    this.emit('strategyUpdated', { name, updates });
  }

  /**
   * Get strategies
   */
  getStrategies(): WarmingStrategy[] {
    return [...this.config.strategies];
  }
}

export default CacheWarmingStrategy;
