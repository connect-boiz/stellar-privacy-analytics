import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { logger } from '../utils/logger';

const router = Router();

// Mock data storage (in production, this would be in a database)
const privacyBudgets = new Map<string, any>();

// Initialize some mock data
const initializeMockData = () => {
  const mockDatasets = [
    {
      id: 'dataset-1',
      name: 'Customer Analytics Dataset',
      maxEpsilon: 1.0,
      currentEpsilon: 0.73,
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'dataset-2', 
      name: 'Financial Transactions Dataset',
      maxEpsilon: 2.0,
      currentEpsilon: 1.45,
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'dataset-3',
      name: 'Healthcare Records Dataset',
      maxEpsilon: 0.5,
      currentEpsilon: 0.12,
      lastUpdated: new Date().toISOString()
    }
  ];

  mockDatasets.forEach(dataset => {
    privacyBudgets.set(dataset.id, dataset);
  });
};

initializeMockData();

/**
 * GET /api/v1/privacy/budget/:datasetId
 * Get privacy budget information for a specific dataset
 */
router.get('/budget/:datasetId', (req: Request, res: Response) => {
  try {
    const { datasetId } = req.params;
    const budget = privacyBudgets.get(datasetId);

    if (!budget) {
      return res.status(404).json({
        success: false,
        error: 'Dataset not found',
        message: `No privacy budget found for dataset: ${datasetId}`
      });
    }

    // Calculate percentage and status
    const percentageUsed = (budget.currentEpsilon / budget.maxEpsilon) * 100;
    let status: 'healthy' | 'warning' | 'critical';

    if (percentageUsed >= 90) {
      status = 'critical';
    } else if (percentageUsed >= 70) {
      status = 'warning';
    } else {
      status = 'healthy';
    }

    // Generate mock history data
    const history = generateHistoryData(budget);

    const response = {
      success: true,
      data: {
        datasetId: budget.id,
        datasetName: budget.name,
        currentEpsilon: budget.currentEpsilon,
        maxEpsilon: budget.maxEpsilon,
        percentageUsed: parseFloat(percentageUsed.toFixed(2)),
        lastUpdated: budget.lastUpdated,
        status
      },
      history
    };

    res.json(response);
    logger.info(`Privacy budget retrieved for dataset: ${datasetId}`);
  } catch (error) {
    logger.error(`Error retrieving privacy budget: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to retrieve privacy budget'
    });
  }
});

/**
 * POST /api/v1/privacy/budget/:datasetId/consume
 * Consume epsilon from the budget (for analytics queries)
 */
router.post('/budget/:datasetId/consume', [
  body('amount').isFloat({ min: 0.001 }).withMessage('Amount must be a positive number'),
  body('operation').notEmpty().withMessage('Operation type is required'),
  body('description').optional().isString()
], (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { datasetId } = req.params;
    const { amount, operation, description } = req.body;

    const budget = privacyBudgets.get(datasetId);
    if (!budget) {
      return res.status(404).json({
        success: false,
        error: 'Dataset not found'
      });
    }

    // Check if consuming would exceed budget
    if (budget.currentEpsilon + amount > budget.maxEpsilon) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient budget',
        message: `Cannot consume ${amount}. Only ${(budget.maxEpsilon - budget.currentEpsilon).toFixed(3)} remaining.`
      });
    }

    // Update budget
    budget.currentEpsilon += amount;
    budget.lastUpdated = new Date().toISOString();

    // Calculate new percentage and status
    const percentageUsed = (budget.currentEpsilon / budget.maxEpsilon) * 100;
    let status: 'healthy' | 'warning' | 'critical';

    if (percentageUsed >= 90) {
      status = 'critical';
    } else if (percentageUsed >= 70) {
      status = 'warning';
    } else {
      status = 'healthy';
    }

    const response = {
      success: true,
      data: {
        datasetId: budget.id,
        datasetName: budget.name,
        currentEpsilon: budget.currentEpsilon,
        maxEpsilon: budget.maxEpsilon,
        percentageUsed: parseFloat(percentageUsed.toFixed(2)),
        lastUpdated: budget.lastUpdated,
        status,
        consumed: amount,
        operation,
        description
      }
    };

    res.json(response);
    logger.info(`Epsilon consumed: ${amount} for dataset: ${datasetId}, operation: ${operation}`);
  } catch (error) {
    logger.error(`Error consuming epsilon: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to consume epsilon'
    });
  }
});

/**
 * GET /api/v1/privacy/budgets
 * Get all privacy budgets
 */
router.get('/budgets', (req: Request, res: Response) => {
  try {
    const budgets = Array.from(privacyBudgets.values()).map(budget => {
      const percentageUsed = (budget.currentEpsilon / budget.maxEpsilon) * 100;
      let status: 'healthy' | 'warning' | 'critical';

      if (percentageUsed >= 90) {
        status = 'critical';
      } else if (percentageUsed >= 70) {
        status = 'warning';
      } else {
        status = 'healthy';
      }

      return {
        datasetId: budget.id,
        datasetName: budget.name,
        currentEpsilon: budget.currentEpsilon,
        maxEpsilon: budget.maxEpsilon,
        percentageUsed: parseFloat(percentageUsed.toFixed(2)),
        lastUpdated: budget.lastUpdated,
        status
      };
    });

    res.json({
      success: true,
      data: budgets,
      total: budgets.length
    });

    logger.info(`Retrieved ${budgets.length} privacy budgets`);
  } catch (error) {
    logger.error(`Error retrieving privacy budgets: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to retrieve privacy budgets'
    });
  }
});

/**
 * POST /api/v1/privacy/budget/:datasetId/reset
 * Reset privacy budget (admin function)
 */
router.post('/budget/:datasetId/reset', (req: Request, res: Response) => {
  try {
    const { datasetId } = req.params;
    const budget = privacyBudgets.get(datasetId);

    if (!budget) {
      return res.status(404).json({
        success: false,
        error: 'Dataset not found'
      });
    }

    // Reset budget
    budget.currentEpsilon = 0;
    budget.lastUpdated = new Date().toISOString();

    const response = {
      success: true,
      data: {
        datasetId: budget.id,
        datasetName: budget.name,
        currentEpsilon: budget.currentEpsilon,
        maxEpsilon: budget.maxEpsilon,
        percentageUsed: 0,
        lastUpdated: budget.lastUpdated,
        status: 'healthy' as const
      }
    };

    res.json(response);
    logger.info(`Privacy budget reset for dataset: ${datasetId}`);
  } catch (error) {
    logger.error(`Error resetting privacy budget: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to reset privacy budget'
    });
  }
});

/**
 * Generate mock history data for the last 30 days
 */
function generateHistoryData(budget: any): any[] {
  const history = [];
  const today = new Date();
  
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    // Simulate gradual consumption over time
    const dayProgress = (30 - i) / 30;
    const epsilon = Math.min(budget.currentEpsilon, budget.maxEpsilon * dayProgress * 0.9);
    const percentageUsed = (epsilon / budget.maxEpsilon) * 100;
    
    history.push({
      date: date.toISOString().split('T')[0],
      epsilon: parseFloat(epsilon.toFixed(3)),
      percentageUsed: parseFloat(percentageUsed.toFixed(2)),
      operation: i % 3 === 0 ? 'Query' : i % 3 === 1 ? 'Analysis' : 'Export'
    });
  }
  
  return history;
}

export { router as privacyBudgetRoutes };
