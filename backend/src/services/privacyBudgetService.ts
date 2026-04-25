import { PrivacyBudgetRepository, PrivacyBudget, BudgetConsumption } from '../repositories/privacyBudgetRepository';
import { logger } from '../utils/logger';

export class PrivacyBudgetService {
  constructor(private repository: PrivacyBudgetRepository) {}

  async getBudgetForDataset(datasetId: string, organizationId: string): Promise<PrivacyBudget | null> {
    return this.repository.getBudgetByDatasetId(datasetId, organizationId);
  }

  async getAllBudgets(organizationId: string): Promise<PrivacyBudget[]> {
    return this.repository.getAllBudgets(organizationId);
  }

  async allocateBudget(data: {
    datasetId: string;
    name: string;
    maxEpsilon: number;
    organizationId: string;
  }): Promise<PrivacyBudget> {
    // Check if budget already exists
    const existing = await this.repository.getBudgetByDatasetId(data.datasetId, data.organizationId);
    if (existing) {
      throw new Error('Budget already allocated for this dataset');
    }

    logger.info('Allocating new privacy budget', { datasetId: data.datasetId, maxEpsilon: data.maxEpsilon });
    return this.repository.createBudget(data);
  }

  async consumeBudget(budgetId: string, amount: number, details: {
    operation: string;
    description?: string;
    userId: string;
  }): Promise<PrivacyBudget> {
    logger.info('Consuming privacy budget', { budgetId, amount, operation: details.operation });
    return this.repository.consumeBudget(budgetId, amount, details);
  }

  async enforceBudget(datasetId: string, organizationId: string, requiredEpsilon: number): Promise<boolean> {
    const budget = await this.repository.getBudgetByDatasetId(datasetId, organizationId);
    
    if (!budget) {
      logger.warn('Access denied: No privacy budget found for dataset', { datasetId, organizationId });
      return false;
    }

    if (budget.status !== 'active') {
      logger.warn('Access denied: Privacy budget is not active', { datasetId, budgetId: budget.id, status: budget.status });
      return false;
    }

    if (budget.currentEpsilon + requiredEpsilon > budget.maxEpsilon) {
      logger.warn('Access denied: Privacy budget exhausted', { 
        datasetId, 
        budgetId: budget.id, 
        current: budget.currentEpsilon, 
        required: requiredEpsilon, 
        max: budget.maxEpsilon 
      });
      return false;
    }

    return true;
  }

  async getBudgetAnalytics(budgetId: string): Promise<any> {
    const history = await this.repository.getConsumptionHistory(budgetId);
    
    // Group consumption by day
    const dailyUsage: Record<string, number> = {};
    history.forEach(c => {
      const date = c.timestamp.toISOString().split('T')[0];
      dailyUsage[date] = (dailyUsage[date] || 0) + c.amount;
    });

    // Calculate recommendations
    const avgConsumption = history.length > 0 ? history.reduce((s, c) => s + c.amount, 0) / 30 : 0; // Avg over last month approx
    const recommendations = [];
    
    if (avgConsumption > 0.1) {
      recommendations.push('High epsilon consumption detected. Consider increasing noise levels or optimizing queries.');
    }

    return {
      dailyUsage,
      history: history.slice(0, 10), // Last 10 operations
      recommendations,
      summary: {
        totalOperations: history.length,
        avgConsumptionPerOp: history.length > 0 ? history.reduce((s, c) => s + c.amount, 0) / history.length : 0
      }
    };
  }
}
