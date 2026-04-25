import { DatabaseService } from '../services/databaseService';
import { logger } from '../utils/logger';

export interface PrivacyBudget {
  id: string;
  datasetId: string;
  name: string;
  maxEpsilon: number;
  currentEpsilon: number;
  organizationId: string;
  status: 'active' | 'exhausted' | 'paused';
  createdAt: Date;
  updatedAt: Date;
}

export interface BudgetConsumption {
  id: string;
  budgetId: string;
  amount: number;
  operation: string;
  description?: string;
  userId: string;
  timestamp: Date;
}

export class PrivacyBudgetRepository {
  constructor(private db: DatabaseService) {}

  async getBudgetByDatasetId(datasetId: string, organizationId: string): Promise<PrivacyBudget | null> {
    const rows = await this.db.query<any>(
      'SELECT * FROM privacy_budgets WHERE dataset_id = $1 AND organization_id = $2',
      [datasetId, organizationId]
    );

    if (rows.length === 0) return null;
    return this.mapRowToBudget(rows[0]);
  }

  async getAllBudgets(organizationId: string): Promise<PrivacyBudget[]> {
    const rows = await this.db.query<any>(
      'SELECT * FROM privacy_budgets WHERE organization_id = $1',
      [organizationId]
    );

    return rows.map(row => this.mapRowToBudget(row));
  }

  async createBudget(budget: Partial<PrivacyBudget>): Promise<PrivacyBudget> {
    const id = `budget_${Date.now()}`;
    const now = new Date();

    const query = `
      INSERT INTO privacy_budgets (
        id, dataset_id, name, max_epsilon, current_epsilon, 
        organization_id, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      id,
      budget.datasetId,
      budget.name,
      budget.maxEpsilon || 1.0,
      0,
      budget.organizationId,
      'active',
      now,
      now
    ];

    const rows = await this.db.query<any>(query, values);
    return this.mapRowToBudget(rows[0]);
  }

  async consumeBudget(budgetId: string, amount: number, details: {
    operation: string;
    description?: string;
    userId: string;
  }): Promise<PrivacyBudget> {
    return await this.db.transaction(async (client) => {
      // 1. Check current budget
      const budgetRes = await client.query(
        'SELECT * FROM privacy_budgets WHERE id = $1 FOR UPDATE',
        [budgetId]
      );

      if (budgetRes.rows.length === 0) {
        throw new Error('Budget not found');
      }

      const budget = budgetRes.rows[0];
      if (budget.current_epsilon + amount > budget.max_epsilon) {
        throw new Error('Privacy budget exceeded');
      }

      // 2. Record consumption
      const consumptionId = `cons_${Date.now()}`;
      await client.query(
        `INSERT INTO budget_consumption_history (
          id, budget_id, amount, operation, description, user_id, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [consumptionId, budgetId, amount, details.operation, details.description, details.userId, new Date()]
      );

      // 3. Update budget
      const updateRes = await client.query(
        `UPDATE privacy_budgets 
         SET current_epsilon = current_epsilon + $1, updated_at = $2,
             status = CASE WHEN current_epsilon + $1 >= max_epsilon THEN 'exhausted' ELSE status END
         WHERE id = $3
         RETURNING *`,
        [amount, new Date(), budgetId]
      );

      return this.mapRowToBudget(updateRes.rows[0]);
    });
  }

  async getConsumptionHistory(budgetId: string, limit: number = 100): Promise<BudgetConsumption[]> {
    const rows = await this.db.query<any>(
      `SELECT * FROM budget_consumption_history 
       WHERE budget_id = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [budgetId, limit]
    );

    return rows.map(row => ({
      id: row.id,
      budgetId: row.budget_id,
      amount: parseFloat(row.amount),
      operation: row.operation,
      description: row.description,
      userId: row.user_id,
      timestamp: row.timestamp
    }));
  }

  private mapRowToBudget(row: any): PrivacyBudget {
    return {
      id: row.id,
      datasetId: row.dataset_id,
      name: row.name,
      maxEpsilon: parseFloat(row.max_epsilon),
      currentEpsilon: parseFloat(row.current_epsilon),
      organizationId: row.organization_id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
