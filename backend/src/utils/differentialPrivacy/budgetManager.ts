import { createClient, RedisClientType } from 'redis';
import { logger } from '../logger';
import { PrivacyBudget, BudgetExhaustedException } from './types';

export class PrivacyBudgetManager {
  private redis: RedisClientType;
  private static instance: PrivacyBudgetManager;
  
  private constructor() {
    this.redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 500)
      }
    });
    
    this.redis.on('error', (err) => {
      logger.error('Redis connection error:', err);
    });
    
    this.redis.on('connect', () => {
      logger.info('Connected to Redis for privacy budget management');
    });
  }

  public static async getInstance(): Promise<PrivacyBudgetManager> {
    if (!PrivacyBudgetManager.instance) {
      PrivacyBudgetManager.instance = new PrivacyBudgetManager();
      await PrivacyBudgetManager.instance.connect();
    }
    return PrivacyBudgetManager.instance;
  }

  private async connect(): Promise<void> {
    try {
      await this.redis.connect();
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async initializeBudget(
    dataset: string, 
    epsilon: number, 
    delta: number = 1e-10
  ): Promise<void> {
    const budget: PrivacyBudget = {
      epsilon,
      delta,
      remaining: epsilon,
      dataset,
      lastUpdated: new Date()
    };

    await this.redis.setEx(
      `privacy_budget:${dataset}`,
      86400 * 30, // 30 days TTL
      JSON.stringify(budget)
    );

    logger.info(`Initialized privacy budget for dataset: ${dataset}, epsilon: ${epsilon}`);
  }

  async getBudget(dataset: string): Promise<PrivacyBudget | null> {
    try {
      const data = await this.redis.get(`privacy_budget:${dataset}`);
      if (!data) {
        return null;
      }

      const budget: PrivacyBudget = JSON.parse(data);
      budget.lastUpdated = new Date(budget.lastUpdated);
      return budget;
    } catch (error) {
      logger.error(`Error retrieving budget for dataset ${dataset}:`, error);
      return null;
    }
  }

  async consumeBudget(
    dataset: string, 
    epsilonCost: number
  ): Promise<PrivacyBudget> {
    const budget = await this.getBudget(dataset);
    
    if (!budget) {
      throw new Error(`No budget found for dataset: ${dataset}`);
    }

    if (budget.remaining < epsilonCost) {
      throw new BudgetExhaustedException(
        `Insufficient privacy budget. Required: ${epsilonCost}, Available: ${budget.remaining}`,
        dataset,
        budget.remaining
      );
    }

    budget.remaining -= epsilonCost;
    budget.lastUpdated = new Date();

    await this.redis.setEx(
      `privacy_budget:${dataset}`,
      86400 * 30,
      JSON.stringify(budget)
    );

    logger.info(`Consumed ${epsilonCost} epsilon from dataset ${dataset}. Remaining: ${budget.remaining}`);
    
    return budget;
  }

  async resetBudget(dataset: string, newEpsilon?: number): Promise<void> {
    const budget = await this.getBudget(dataset);
    
    if (!budget) {
      throw new Error(`No budget found for dataset: ${dataset}`);
    }

    budget.remaining = newEpsilon || budget.epsilon;
    budget.lastUpdated = new Date();

    await this.redis.setEx(
      `privacy_budget:${dataset}`,
      86400 * 30,
      JSON.stringify(budget)
    );

    logger.info(`Reset privacy budget for dataset: ${dataset} to ${budget.remaining}`);
  }

  async getAllBudgets(): Promise<PrivacyBudget[]> {
    try {
      const keys = await this.redis.keys('privacy_budget:*');
      const budgets: PrivacyBudget[] = [];

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const budget: PrivacyBudget = JSON.parse(data);
          budget.lastUpdated = new Date(budget.lastUpdated);
          budgets.push(budget);
        }
      }

      return budgets;
    } catch (error) {
      logger.error('Error retrieving all budgets:', error);
      return [];
    }
  }

  async deleteBudget(dataset: string): Promise<void> {
    await this.redis.del(`privacy_budget:${dataset}`);
    logger.info(`Deleted privacy budget for dataset: ${dataset}`);
  }

  async checkBudget(dataset: string, epsilonCost: number): Promise<boolean> {
    const budget = await this.getBudget(dataset);
    
    if (!budget) {
      return false;
    }

    return budget.remaining >= epsilonCost;
  }

  async getBudgetUsage(dataset: string): Promise<number> {
    const budget = await this.getBudget(dataset);
    
    if (!budget) {
      return 0;
    }

    return ((budget.epsilon - budget.remaining) / budget.epsilon) * 100;
  }

  async disconnect(): Promise<void> {
    await this.redis.disconnect();
    logger.info('Disconnected from Redis');
  }
}
