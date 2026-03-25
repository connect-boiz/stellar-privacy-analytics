import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import Redis from 'redis';
import { 
  stellarAuth, 
  AuthenticatedRequest 
} from '../middleware/stellarAuth';
import { 
  createPQLRateLimiter,
  PQLRateLimiter 
} from '../middleware/rateLimiter';
import { 
  observability, 
  addTraceLog, 
  createQueryTracer 
} from '../middleware/observability';
import { 
  errorHandler, 
  asyncHandler, 
  createValidationError, 
  sendSuccessResponse,
  QueryError,
  PrivacyError,
  NotFoundError,
  ValidationError as APIValidationError
} from '../utils/apiErrorHandler';
import PQLValidator from '../services/pqlValidator';
import QueryComplexityAnalyzer from '../services/queryComplexityAnalyzer';

const router = Router();

// Initialize services
const pqlValidator = new PQLValidator({
  maxQueryLength: 10000,
  maxJoins: 5,
  maxSubqueries: 3
});

const complexityAnalyzer = new QueryComplexityAnalyzer({
  thresholds: {
    maxScore: 75,
    maxEstimatedTime: 30000,
    maxEstimatedCost: 1000,
    maxMemoryUsage: 512,
    maxJoins: 5,
    maxSubqueries: 3
  }
});

// Initialize Redis client (in production, this would be properly configured)
const redisClient = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

const rateLimiter = new PQLRateLimiter(redisClient);

// Middleware for validation errors
const handleValidationErrors = (req: AuthenticatedRequest, res: Response, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw createValidationError(errors.array(), req.traceId);
  }
  next();
};

// POST /api/v1/query - Execute a privacy-preserving query
router.post('/',
  stellarAuth.authenticate,
  rateLimiter.queryRateLimit,
  observability.observe,
  [
    body('query')
      .isString()
      .isLength({ min: 10, max: 10000 })
      .withMessage('Query must be between 10 and 10000 characters'),
    body('privacyBudget.epsilon')
      .isFloat({ min: 0.0001, max: 1.0 })
      .withMessage('Epsilon must be between 0.0001 and 1.0'),
    body('privacyBudget.delta')
      .optional()
      .isFloat({ min: 1e-12, max: 1e-3 })
      .withMessage('Delta must be between 1e-12 and 1e-3'),
    body('options.timeout')
      .optional()
      .isInt({ min: 1, max: 300 })
      .withMessage('Timeout must be between 1 and 300 seconds'),
    body('options.maxGroups')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Max groups must be between 1 and 1000'),
    body('options.maxRows')
      .optional()
      .isInt({ min: 1, max: 10000 })
      .withMessage('Max rows must be between 1 and 10000')
  ],
  handleValidationErrors,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { query, privacyBudget, options = {}, context } = req.body;
    const tracer = createQueryTracer(req);

    if (!tracer) {
      throw new Error('Trace context not available');
    }

    // Add query metadata to trace
    tracer.addTag('query.type', 'execute');
    tracer.addTag('query.length', query.length.toString());
    tracer.addTag('privacy.epsilon', privacyBudget.epsilon.toString());
    tracer.addTag('user.rate_limit_tier', req.user!.rateLimitTier);

    // Step 1: Validate query syntax
    const validationSpan = tracer.startStep('query_validation');
    const validationResult = await pqlValidator.validate(query);
    
    if (!validationResult.valid) {
      tracer.failStep(validationSpan, 'query_validation', new Error('Query validation failed'));
      throw new QueryError(
        'INVALID_QUERY',
        'Query syntax is invalid',
        { errors: validationResult.errors },
        req.traceId
      );
    }
    
    tracer.endStep(validationSpan, 'query_validation');

    // Step 2: Analyze query complexity
    const complexitySpan = tracer.startStep('complexity_analysis');
    const complexityAnalysis = await complexityAnalyzer.analyze(
      validationResult.normalizedQuery ? 
        pqlValidator.parseQuery(validationResult.normalizedQuery) : 
        pqlValidator.parseQuery(query),
      privacyBudget
    );

    if (!complexityAnalysis.canExecute) {
      tracer.failStep(complexitySpan, 'complexity_analysis', new Error(complexityAnalysis.reason!));
      throw new QueryError(
        'QUERY_TOO_COMPLEX',
        complexityAnalysis.reason!,
        {
          metrics: complexityAnalysis.metrics,
          recommendations: complexityAnalysis.recommendations
        },
        req.traceId
      );
    }

    tracer.endStep(complexitySpan, 'complexity_analysis', complexityAnalysis.metrics);

    // Step 3: Check privacy budget
    const privacySpan = tracer.startStep('privacy_budget_check');
    // This would integrate with your privacy budget service
    const hasBudget = await checkPrivacyBudget(req.user!.id, privacyBudget);
    
    if (!hasBudget) {
      tracer.failStep(privacySpan, 'privacy_budget_check', new Error('Insufficient privacy budget'));
      throw new PrivacyError(
        'Insufficient privacy budget',
        { availableBudget: 0, requestedBudget: privacyBudget },
        req.traceId
      );
    }

    tracer.endStep(privacySpan, 'privacy_budget_check');

    // Step 4: Execute query
    const executionSpan = tracer.startStep('query_execution');
    
    try {
      const queryId = generateQueryId();
      const startTime = Date.now();

      // This would integrate with your differential privacy engine
      const results = await executeQuery(
        query,
        privacyBudget,
        options,
        req.user!,
        req.traceId
      );

      const executionTime = Date.now() - startTime;

      tracer.endStep(executionSpan, 'query_execution', { 
        executionTime,
        resultCount: results.length 
      });

      // Log successful query execution
      addTraceLog(req, 'info', 'Query executed successfully', {
        queryId,
        executionTime,
        resultCount: results.length,
        privacyBudgetUsed: complexityAnalysis.metrics.privacyCost
      });

      sendSuccessResponse(res, {
        results,
        metadata: {
          queryId,
          executionTime,
          privacyBudgetUsed: complexityAnalysis.metrics.privacyCost,
          noiseAdded: true,
          rowCount: results.length,
          complexity: complexityAnalysis.metrics
        }
      }, req.traceId, {
        warnings: validationResult.warnings.map(w => w.message),
        metadata: {
          queryType: validationResult.metadata?.queryType,
          tables: validationResult.metadata?.tables,
          recommendations: complexityAnalysis.recommendations
        }
      });

    } catch (error) {
      tracer.failStep(executionSpan, 'query_execution', error as Error);
      throw error;
    }
  })
);

// POST /api/v1/query/validate - Validate a PQL query
router.post('/validate',
  stellarAuth.authenticate,
  rateLimiter.validationRateLimit,
  observability.observe,
  [
    body('query')
      .isString()
      .isLength({ min: 10, max: 10000 })
      .withMessage('Query must be between 10 and 10000 characters'),
    body('options.timeout')
      .optional()
      .isInt({ min: 1, max: 300 })
      .withMessage('Timeout must be between 1 and 300 seconds')
  ],
  handleValidationErrors,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { query, options = {} } = req.body;
    const tracer = createQueryTracer(req);

    if (!tracer) {
      throw new Error('Trace context not available');
    }

    tracer.addTag('query.type', 'validate');

    // Validate query
    const validationResult = await pqlValidator.validate(query);

    addTraceLog(req, 'info', 'Query validation completed', {
      valid: validationResult.valid,
      errorCount: validationResult.errors.length,
      warningCount: validationResult.warnings.length
    });

    sendSuccessResponse(res, {
      valid: validationResult.valid,
      errors: validationResult.errors,
      warnings: validationResult.warnings,
      complexity: validationResult.metadata ? {
        tables: validationResult.metadata.tables.length,
        columns: validationResult.metadata.columns.length,
        functions: validationResult.metadata.functions.length
      } : undefined
    }, req.traceId);
  })
);

// POST /api/v1/query/estimate - Estimate query cost and complexity
router.post('/estimate',
  stellarAuth.authenticate,
  rateLimiter.validationRateLimit,
  observability.observe,
  [
    body('query')
      .isString()
      .isLength({ min: 10, max: 10000 })
      .withMessage('Query must be between 10 and 10000 characters'),
    body('privacyBudget.epsilon')
      .isFloat({ min: 0.0001, max: 1.0 })
      .withMessage('Epsilon must be between 0.0001 and 1.0'),
    body('privacyBudget.delta')
      .optional()
      .isFloat({ min: 1e-12, max: 1e-3 })
      .withMessage('Delta must be between 1e-12 and 1e-3')
  ],
  handleValidationErrors,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { query, privacyBudget, options = {} } = req.body;
    const tracer = createQueryTracer(req);

    if (!tracer) {
      throw new Error('Trace context not available');
    }

    tracer.addTag('query.type', 'estimate');

    // First validate the query
    const validationResult = await pqlValidator.validate(query);
    
    if (!validationResult.valid) {
      throw new QueryError(
        'INVALID_QUERY',
        'Query syntax is invalid',
        { errors: validationResult.errors },
        req.traceId
      );
    }

    // Analyze complexity
    const parseTree = pqlValidator.parseQuery(query);
    const complexityAnalysis = await complexityAnalyzer.analyze(parseTree, privacyBudget);

    addTraceLog(req, 'info', 'Query estimation completed', {
      canExecute: complexityAnalysis.canExecute,
      complexityScore: complexityAnalysis.metrics.score,
      estimatedTime: complexityAnalysis.metrics.estimatedTime
    });

    sendSuccessResponse(res, {
      canExecute: complexityAnalysis.canExecute,
      reason: complexityAnalysis.reason,
      estimatedCost: {
        time: complexityAnalysis.metrics.estimatedTime,
        privacyBudget: complexityAnalysis.metrics.privacyCost,
        computeUnits: complexityAnalysis.metrics.estimatedCost
      },
      recommendations: complexityAnalysis.recommendations,
      complexity: complexityAnalysis.metrics
    }, req.traceId);
  })
);

// GET /api/v1/query/status/:queryId - Get query execution status
router.get('/status/:queryId',
  stellarAuth.authenticate,
  rateLimiter.validationRateLimit,
  observability.observe,
  [
    param('queryId')
      .isString()
      .matches(/^q_[a-zA-Z0-9]{10}$/)
      .withMessage('Invalid query ID format')
  ],
  handleValidationErrors,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { queryId } = req.params;
    const tracer = createQueryTracer(req);

    if (!tracer) {
      throw new Error('Trace context not available');
    }

    tracer.addTag('query.type', 'status');
    tracer.addTag('query.id', queryId);

    // This would integrate with your query execution service
    const status = await getQueryStatus(queryId, req.user!.id);

    if (!status) {
      throw new NotFoundError('Query', queryId, req.traceId);
    }

    addTraceLog(req, 'info', 'Query status retrieved', {
      queryId,
      status: status.status,
      progress: status.progress
    });

    sendSuccessResponse(res, status, req.traceId);
  })
);

// GET /api/v1/query/history - Get user's query history
router.get('/history',
  stellarAuth.authenticate,
  rateLimiter.validationRateLimit,
  observability.observe,
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be non-negative'),
    query('status')
      .optional()
      .isIn(['completed', 'failed', 'running', 'cancelled'])
      .withMessage('Invalid status filter'),
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid start date format'),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid end date format')
  ],
  handleValidationErrors,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      limit = 20,
      offset = 0,
      status,
      startDate,
      endDate
    } = req.query;

    const tracer = createQueryTracer(req);

    if (!tracer) {
      throw new Error('Trace context not available');
    }

    tracer.addTag('query.type', 'history');

    // This would integrate with your query history service
    const history = await getQueryHistory(req.user!.id, {
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      status: status as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined
    });

    addTraceLog(req, 'info', 'Query history retrieved', {
      resultCount: history.queries.length,
      total: history.total,
      hasMore: history.hasMore
    });

    sendSuccessResponse(res, history, req.traceId);
  })
);

// DELETE /api/v1/query/cancel/:queryId - Cancel a running query
router.delete('/cancel/:queryId',
  stellarAuth.authenticate,
  rateLimiter.validationRateLimit,
  observability.observe,
  [
    param('queryId')
      .isString()
      .matches(/^q_[a-zA-Z0-9]{10}$/)
      .withMessage('Invalid query ID format')
  ],
  handleValidationErrors,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { queryId } = req.params;
    const tracer = createQueryTracer(req);

    if (!tracer) {
      throw new Error('Trace context not available');
    }

    tracer.addTag('query.type', 'cancel');
    tracer.addTag('query.id', queryId);

    // This would integrate with your query execution service
    const cancelled = await cancelQuery(queryId, req.user!.id);

    if (!cancelled) {
      throw new NotFoundError('Query', queryId, req.traceId);
    }

    addTraceLog(req, 'info', 'Query cancelled', { queryId });

    sendSuccessResponse(res, {
      success: true,
      queryId,
      message: 'Query cancelled successfully'
    }, req.traceId);
  })
);

// GET /api/v1/privacy/budget - Get user's privacy budget status
router.get('/privacy/budget',
  stellarAuth.authenticate,
  rateLimiter.validationRateLimit,
  observability.observe,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tracer = createQueryTracer(req);

    if (!tracer) {
      throw new Error('Trace context not available');
    }

    tracer.addTag('query.type', 'privacy_budget');

    // This would integrate with your privacy budget service
    const budget = await getPrivacyBudget(req.user!.id);

    addTraceLog(req, 'info', 'Privacy budget retrieved', {
      currentEpsilon: budget.currentBudget.epsilon,
      totalEpsilon: budget.totalBudget.epsilon
    });

    sendSuccessResponse(res, budget, req.traceId);
  })
);

// GET /api/v1/schemas - Get available data schemas
router.get('/schemas',
  stellarAuth.authenticate,
  rateLimiter.schemaRateLimit,
  observability.observe,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tracer = createQueryTracer(req);

    if (!tracer) {
      throw new Error('Trace context not available');
    }

    tracer.addTag('query.type', 'schemas');

    // This would integrate with your schema service
    const schemas = await getDataSchemas(req.user!.id);

    addTraceLog(req, 'info', 'Data schemas retrieved', {
      schemaCount: schemas.schemas.length
    });

    sendSuccessResponse(res, schemas, req.traceId);
  })
);

// Helper functions (these would be implemented in separate services)
async function checkPrivacyBudget(userId: string, budget: { epsilon: number; delta: number }): Promise<boolean> {
  // Placeholder implementation
  return true;
}

async function executeQuery(
  query: string,
  privacyBudget: { epsilon: number; delta: number },
  options: any,
  user: any,
  traceId: string
): Promise<any[]> {
  // Placeholder implementation - this would integrate with your differential privacy engine
  return [
    { count: 100 },
    { category: 'A', value: 50 },
    { category: 'B', value: 75 }
  ];
}

function generateQueryId(): string {
  return `q_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 12)}`;
}

async function getQueryStatus(queryId: string, userId: string): Promise<any> {
  // Placeholder implementation
  return {
    queryId,
    status: 'completed',
    progress: 100,
    startedAt: new Date(),
    completedAt: new Date(),
    result: { results: [{ count: 100 }] }
  };
}

async function getQueryHistory(userId: string, options: any): Promise<any> {
  // Placeholder implementation
  return {
    queries: [],
    total: 0,
    hasMore: false
  };
}

async function cancelQuery(queryId: string, userId: string): Promise<boolean> {
  // Placeholder implementation
  return true;
}

async function getPrivacyBudget(userId: string): Promise<any> {
  // Placeholder implementation
  return {
    currentBudget: { epsilon: 0.5, delta: 1e-6 },
    totalBudget: { epsilon: 1.0, delta: 1e-5 },
    usage: [],
    resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  };
}

async function getDataSchemas(userId: string): Promise<any> {
  // Placeholder implementation
  return {
    schemas: [
      {
        name: 'users',
        columns: [
          { name: 'id', type: 'integer', nullable: false },
          { name: 'age', type: 'integer', nullable: true },
          { name: 'department', type: 'string', nullable: true }
        ]
      }
    ]
  };
}

export default router;
