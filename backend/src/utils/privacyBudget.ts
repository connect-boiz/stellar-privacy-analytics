import { createClient, RedisClientType } from 'redis';
import {
  PrivacyBudget,
  RedisPrivacyBudget,
  PrivacyBudgetConfig,
  BudgetExhaustedException
} from '@stellar/shared';

export class PrivacyBudgetManager {
  private redis: RedisClientType;
  private config: PrivacyBudgetConfig;

  constructor(redisUrl: string, config: PrivacyBudgetConfig) {
    this.redis = createClient({ url: redisUrl });
    this.config = config;
  }

  async connect(): Promise<void> {
    if (!this.redis.isOpen) {
      await this.redis.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.redis.isOpen) {
      await this.redis.disconnect();
    }
  }

  private getBudgetKey(userId: string, datasetId: string): string {
    return `privacy_budget:${userId}:${datasetId}`;
  }

  async initializeBudget(userId: string, datasetId: string): Promise<PrivacyBudget> {
    await this.connect();
    
    const key = this.getBudgetKey(userId, datasetId);
    const existingBudget = await this.getBudget(userId, datasetId);
    
    if (existingBudget) {
      return existingBudget;
    }

    const newBudget: PrivacyBudget = {
      userId,
      datasetId,
      totalEpsilon: this.config.defaultEpsilon,
      remainingEpsilon: this.config.defaultEpsilon,
      lastUpdated: new Date(),
      queriesCount: 0
    };

    await this.redis.hSet(key, {
      remainingEpsilon: newBudget.remainingEpsilon.toString(),
      totalEpsilon: newBudget.totalEpsilon.toString(),
      queriesCount: newBudget.queriesCount.toString(),
      lastAccessed: Date.now().toString()
    });

    await this.redis.expire(key, this.config.budgetResetInterval * 3600);

    return newBudget;
  }

  async getBudget(userId: string, datasetId: string): Promise<PrivacyBudget | null> {
    await this.connect();
    
    const key = this.getBudgetKey(userId, datasetId);
    const budgetData = await this.redis.hGetAll(key);

    if (!Object.keys(budgetData).length) {
      return null;
    }

    return {
      userId,
      datasetId,
      totalEpsilon: parseFloat(budgetData.totalEpsilon || '0'),
      remainingEpsilon: parseFloat(budgetData.remainingEpsilon || '0'),
      lastUpdated: new Date(parseInt(budgetData.lastAccessed || '0')),
      queriesCount: parseInt(budgetData.queriesCount || '0')
    };
  }

  async consumeBudget(
    userId: string,
    datasetId: string,
    epsilonRequested: number
  ): Promise<PrivacyBudget> {
    await this.connect();

    if (epsilonRequested > this.config.maxEpsilonPerQuery) {
      throw new BudgetExhaustedException(
        userId,
        datasetId,
        epsilonRequested,
        this.config.maxEpsilonPerQuery
      );
    }

    const budget = await this.getBudget(userId, datasetId);
    
    if (!budget) {
      await this.initializeBudget(userId, datasetId);
      return this.consumeBudget(userId, datasetId, epsilonRequested);
    }

    if (budget.remainingEpsilon < epsilonRequested) {
      throw new BudgetExhaustedException(
        userId,
        datasetId,
        epsilonRequested,
        budget.remainingEpsilon
      );
    }

    const key = this.getBudgetKey(userId, datasetId);
    const newRemainingEpsilon = budget.remainingEpsilon - epsilonRequested;
    const newQueriesCount = budget.queriesCount + 1;

    await this.redis.hSet(key, {
      remainingEpsilon: newRemainingEpsilon.toString(),
      queriesCount: newQueriesCount.toString(),
      lastAccessed: Date.now().toString()
    });

    return {
      ...budget,
      remainingEpsilon: newRemainingEpsilon,
      queriesCount: newQueriesCount,
      lastUpdated: new Date()
    };
  }

  async resetBudget(userId: string, datasetId: string): Promise<PrivacyBudget> {
    await this.connect();
    
    const key = this.getBudgetKey(userId, datasetId);
    const resetBudget: PrivacyBudget = {
      userId,
      datasetId,
      totalEpsilon: this.config.defaultEpsilon,
      remainingEpsilon: this.config.defaultEpsilon,
      lastUpdated: new Date(),
      queriesCount: 0
    };

    await this.redis.hSet(key, {
      remainingEpsilon: resetBudget.remainingEpsilon.toString(),
      totalEpsilon: resetBudget.totalEpsilon.toString(),
      queriesCount: resetBudget.queriesCount.toString(),
      lastAccessed: Date.now().toString()
    });

    await this.redis.expire(key, this.config.budgetResetInterval * 3600);

    return resetBudget;
  }

  async getAllUserBudgets(userId: string): Promise<PrivacyBudget[]> {
    await this.connect();
    
    const pattern = `privacy_budget:${userId}:*`;
    const keys = await this.redis.keys(pattern);
    
    const budgets: PrivacyBudget[] = [];
    
    for (const key of keys) {
      const parts = key.split(':');
      const datasetId = parts[2];
      const budget = await this.getBudget(userId, datasetId);
      if (budget) {
        budgets.push(budget);
      }
    }
    
    return budgets;
  }

  async getDatasetBudgetUsage(datasetId: string): Promise<{ totalEpsilon: number; usedEpsilon: number; userCount: number }> {
    await this.connect();
    
    const pattern = `privacy_budget:*:${datasetId}`;
    const keys = await this.redis.keys(pattern);
    
    let totalEpsilon = 0;
    let usedEpsilon = 0;
    
    for (const key of keys) {
      const budgetData = await this.redis.hGetAll(key);
      if (Object.keys(budgetData).length) {
        totalEpsilon += parseFloat(budgetData.totalEpsilon || '0');
        usedEpsilon += (parseFloat(budgetData.totalEpsilon || '0') - parseFloat(budgetData.remainingEpsilon || '0'));
      }
    }
    
    return {
      totalEpsilon,
      usedEpsilon,
      userCount: keys.length
    };
  }

  async checkBudgetAvailability(
    userId: string,
    datasetId: string,
    epsilonRequired: number
  ): Promise<boolean> {
    const budget = await this.getBudget(userId, datasetId);
    
    if (!budget) {
      return epsilonRequired <= this.config.defaultEpsilon;
    }
    
    return budget.remainingEpsilon >= epsilonRequired;
  }

  async updateBudgetConfig(newConfig: Partial<PrivacyBudgetConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): PrivacyBudgetConfig {
    return { ...this.config };
  }
}
