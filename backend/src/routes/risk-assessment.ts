import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { logger } from '../utils/logger';
import { PrivacyRiskAssessmentService, DataWorkflow, RiskAssessmentCriteria } from '../services/privacyRiskAssessment';
import { DatabaseService } from '../services/databaseService';
import { auditService } from '../services/auditService';

const router = Router();

// Initialize the risk assessment service
let riskAssessmentService: PrivacyRiskAssessmentService;

// Initialize service when database is available
const initializeService = async (req: Request) => {
  if (!riskAssessmentService) {
    const dbService = req.app.get('dbService') as DatabaseService;
    if (!dbService) {
      throw new Error('Database service not available');
    }
    riskAssessmentService = new PrivacyRiskAssessmentService(dbService);
  }
  return riskAssessmentService;
};

// Middleware to handle validation errors
const handleValidationErrors = (req: Request, res: Response, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// POST /api/v1/risk-assessment/assess
// Assess privacy risk for a data workflow
router.post('/assess',
  [
    body('workflow.id').notEmpty().withMessage('Workflow ID is required'),
    body('workflow.name').notEmpty().withMessage('Workflow name is required'),
    body('workflow.dataTypes').isArray().withMessage('Data types must be an array'),
    body('workflow.processingSteps').isArray().withMessage('Processing steps must be an array'),
    body('workflow.retentionPeriod').isInt({ min: 0 }).withMessage('Retention period must be a positive integer'),
    body('workflow.encryptionLevel').isIn(['none', 'basic', 'standard', 'advanced']).withMessage('Invalid encryption level'),
    body('assessorId').notEmpty().withMessage('Assessor ID is required')
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      await initializeService(req);
      
      const { workflow, assessorId } = req.body;
      
      logger.info(`Starting risk assessment for workflow: ${workflow.id}`);
      
      const assessment = await riskAssessmentService.assessWorkflowRisk(workflow, assessorId);
      
      res.status(201).json({
        success: true,
        data: assessment,
        message: 'Risk assessment completed successfully'
      });
      
    } catch (error) {
      logger.error('Error in risk assessment:', error);
      res.status(500).json({
        error: 'Risk assessment failed',
        message: error.message
      });
    }
  }
);

// GET /api/v1/risk-assessment/workflow/:workflowId/history
// Get assessment history for a specific workflow
router.get('/workflow/:workflowId/history',
  [
    param('workflowId').notEmpty().withMessage('Workflow ID is required'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      await initializeService(req);
      
      const { workflowId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;
      
      const history = await riskAssessmentService.getAssessmentHistory(workflowId, limit);
      
      res.json({
        success: true,
        data: history,
        count: history.length
      });
      
    } catch (error) {
      logger.error(`Error fetching assessment history for workflow ${req.params.workflowId}:`, error);
      res.status(500).json({
        error: 'Failed to fetch assessment history',
        message: error.message
      });
    }
  }
);

// GET /api/v1/risk-assessment/heatmap
// Generate risk heat map for visualization
router.get('/heatmap',
  [
    query('organizationId').optional().isUUID().withMessage('Invalid organization ID format')
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      await initializeService(req);
      
      const { organizationId } = req.query;
      
      const heatMapData = await riskAssessmentService.generateRiskHeatMap(organizationId as string);
      
      res.json({
        success: true,
        data: heatMapData,
        generatedAt: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Error generating risk heat map:', error);
      res.status(500).json({
        error: 'Failed to generate risk heat map',
        message: error.message
      });
    }
  }
);

// PUT /api/v1/risk-assessment/criteria
// Update risk assessment criteria
router.put('/criteria',
  [
    body('dataSensitivityWeights').optional().isObject().withMessage('Data sensitivity weights must be an object'),
    body('processingWeights').optional().isObject().withMessage('Processing weights must be an object'),
    body('securityWeights').optional().isObject().withMessage('Security weights must be an object'),
    body('complianceWeights').optional().isObject().withMessage('Compliance weights must be an object'),
    body('customFactors').optional().isArray().withMessage('Custom factors must be an array')
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      await initializeService(req);
      
      const criteriaUpdate = req.body as Partial<RiskAssessmentCriteria>;
      
      await riskAssessmentService.updateAssessmentCriteria(criteriaUpdate);
      
      // Log the criteria update for audit
      await auditService.logEvent({
        eventType: 'ASSESSMENT_CRITERIA_UPDATED',
        userId: req.user?.id || 'system',
        resourceId: 'assessment_criteria',
        details: {
          updatedFields: Object.keys(criteriaUpdate),
          timestamp: new Date().toISOString()
        }
      });
      
      res.json({
        success: true,
        message: 'Assessment criteria updated successfully'
      });
      
    } catch (error) {
      logger.error('Error updating assessment criteria:', error);
      res.status(500).json({
        error: 'Failed to update assessment criteria',
        message: error.message
      });
    }
  }
);

// GET /api/v1/risk-assessment/criteria
// Get current risk assessment criteria
router.get('/criteria', async (req: Request, res: Response) => {
  try {
    await initializeService(req);
    
    // This would need to be implemented in the service
    const criteria = await getCurrentAssessmentCriteria();
    
    res.json({
      success: true,
      data: criteria
    });
    
  } catch (error) {
    logger.error('Error fetching assessment criteria:', error);
    res.status(500).json({
      error: 'Failed to fetch assessment criteria',
      message: error.message
    });
  }
});

// GET /api/v1/risk-assessment/dashboard
// Get dashboard data for risk assessment overview
router.get('/dashboard',
  [
    query('timeframe').optional().isIn(['7d', '30d', '90d', '1y']).withMessage('Invalid timeframe'),
    query('organizationId').optional().isUUID().withMessage('Invalid organization ID format')
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      await initializeService(req);
      
      const { timeframe = '30d', organizationId } = req.query;
      
      const dashboardData = await generateDashboardData(timeframe as string, organizationId as string);
      
      res.json({
        success: true,
        data: dashboardData,
        timeframe,
        generatedAt: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Error generating dashboard data:', error);
      res.status(500).json({
        error: 'Failed to generate dashboard data',
        message: error.message
      });
    }
  }
);

// GET /api/v1/risk-assessment/trends
// Get risk trends over time
router.get('/trends',
  [
    query('workflowId').optional().isUUID().withMessage('Invalid workflow ID format'),
    query('organizationId').optional().isUUID().withMessage('Invalid organization ID format'),
    query('period').optional().isIn(['daily', 'weekly', 'monthly']).withMessage('Invalid period')
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      await initializeService(req);
      
      const { workflowId, organizationId, period = 'weekly' } = req.query;
      
      const trendsData = await generateTrendsData(
        workflowId as string,
        organizationId as string,
        period as string
      );
      
      res.json({
        success: true,
        data: trendsData,
        period,
        generatedAt: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Error generating trends data:', error);
      res.status(500).json({
        error: 'Failed to generate trends data',
        message: error.message
      });
    }
  }
);

// POST /api/v1/risk-assessment/batch
// Batch assess multiple workflows
router.post('/batch',
  [
    body('workflows').isArray({ min: 1, max: 50 }).withMessage('Workflows must be an array with 1-50 items'),
    body('assessorId').notEmpty().withMessage('Assessor ID is required')
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      await initializeService(req);
      
      const { workflows, assessorId } = req.body;
      
      logger.info(`Starting batch risk assessment for ${workflows.length} workflows`);
      
      const assessments = await Promise.allSettled(
        workflows.map((workflow: DataWorkflow) => 
          riskAssessmentService.assessWorkflowRisk(workflow, assessorId)
        )
      );
      
      const results = assessments.map((result, index) => ({
        workflowId: workflows[index].id,
        success: result.status === 'fulfilled',
        assessment: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected' ? result.reason.message : null
      }));
      
      const successful = results.filter(r => r.success).length;
      const failed = results.length - successful;
      
      // Log batch assessment for audit
      await auditService.logEvent({
        eventType: 'BATCH_RISK_ASSESSMENT_COMPLETED',
        userId: req.user?.id || assessorId,
        resourceId: 'batch_assessment',
        details: {
          totalWorkflows: workflows.length,
          successful,
          failed,
          timestamp: new Date().toISOString()
        }
      });
      
      res.json({
        success: true,
        data: results,
        summary: {
          total: workflows.length,
          successful,
          failed
        }
      });
      
    } catch (error) {
      logger.error('Error in batch risk assessment:', error);
      res.status(500).json({
        error: 'Batch risk assessment failed',
        message: error.message
      });
    }
  }
);

// GET /api/v1/risk-assessment/compliance-report
// Generate compliance report
router.get('/compliance-report',
  [
    query('framework').isIn(['gdpr', 'ccpa', 'all']).withMessage('Invalid compliance framework'),
    query('organizationId').optional().isUUID().withMessage('Invalid organization ID format'),
    query('format').optional().isIn(['json', 'pdf']).withMessage('Invalid format')
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      await initializeService(req);
      
      const { framework, organizationId, format = 'json' } = req.query;
      
      const reportData = await generateComplianceReport(
        framework as string,
        organizationId as string
      );
      
      if (format === 'pdf') {
        // Generate PDF report (would need PDF generation library)
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="compliance-report-${framework}.pdf"`);
        return res.send(await generatePDFReport(reportData));
      }
      
      res.json({
        success: true,
        data: reportData,
        framework,
        generatedAt: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Error generating compliance report:', error);
      res.status(500).json({
        error: 'Failed to generate compliance report',
        message: error.message
      });
    }
  }
);

// Helper functions (these would need to be implemented)
async function getCurrentAssessmentCriteria(): Promise<RiskAssessmentCriteria> {
  // This would fetch the current criteria from the database
  throw new Error('Not implemented');
}

async function generateDashboardData(timeframe: string, organizationId?: string): Promise<any> {
  // This would generate dashboard statistics and charts data
  throw new Error('Not implemented');
}

async function generateTrendsData(workflowId?: string, organizationId?: string, period?: string): Promise<any> {
  // This would generate trends analysis data
  throw new Error('Not implemented');
}

async function generateComplianceReport(framework: string, organizationId?: string): Promise<any> {
  // This would generate detailed compliance reports
  throw new Error('Not implemented');
}

async function generatePDFReport(data: any): Promise<Buffer> {
  // This would generate PDF reports using a library like puppeteer
  throw new Error('Not implemented');
}

export { router as riskAssessmentRoutes };
