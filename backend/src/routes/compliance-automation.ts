import { Router, Request, Response } from 'express';
import { complianceAutomationService } from '../services/complianceAutomationService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/v1/compliance-automation/regulations
 * Get all available compliance regulations
 */
router.get('/regulations', async (req: Request, res: Response) => {
  try {
    const regulations = complianceAutomationService.getRegulations();
    res.json({
      success: true,
      data: regulations,
      count: regulations.length
    });
  } catch (error) {
    logger.error('Error fetching regulations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch regulations'
    });
  }
});

/**
 * GET /api/v1/compliance-automation/regulations/:id
 * Get specific regulation details
 */
router.get('/regulations/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const regulation = complianceAutomationService.getRegulation(id);
    
    if (!regulation) {
      return res.status(404).json({
        success: false,
        error: 'Regulation not found'
      });
    }

    res.json({
      success: true,
      data: regulation
    });
  } catch (error) {
    logger.error('Error fetching regulation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch regulation'
    });
  }
});

/**
 * POST /api/v1/compliance-automation/scan
 * Run compliance scan for specific regulation
 */
router.post('/scan', async (req: Request, res: Response) => {
  try {
    const { regulationId } = req.body;

    if (!regulationId) {
      return res.status(400).json({
        success: false,
        error: 'regulationId is required'
      });
    }

    const result = await complianceAutomationService.runComplianceScan(regulationId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error running compliance scan:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to run compliance scan'
    });
  }
});

/**
 * POST /api/v1/compliance-automation/scan/all
 * Run compliance scan for all regulations
 */
router.post('/scan/all', async (req: Request, res: Response) => {
  try {
    const regulations = complianceAutomationService.getRegulations();
    const results = [];

    for (const regulation of regulations) {
      try {
        const result = await complianceAutomationService.runComplianceScan(regulation.id);
        results.push(result);
      } catch (error) {
        logger.error(`Error scanning ${regulation.id}:`, error);
        results.push({
          regulation: regulation.name,
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    res.json({
      success: true,
      data: results,
      count: results.length
    });
  } catch (error) {
    logger.error('Error running all compliance scans:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run compliance scans'
    });
  }
});

/**
 * GET /api/v1/compliance-automation/dashboard
 * Get compliance dashboard data
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const dashboard = await complianceAutomationService.getComplianceDashboard();

    res.json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    logger.error('Error fetching compliance dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch compliance dashboard'
    });
  }
});

/**
 * GET /api/v1/compliance-automation/audit-trail
 * Get audit trail for compliance activities
 */
router.get('/audit-trail', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, regulation, action } = req.query;

    const filters: any = {};
    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);
    if (regulation) filters.regulation = regulation as string;
    if (action) filters.action = action as string;

    const auditTrail = await complianceAutomationService.getAuditTrail(filters);

    res.json({
      success: true,
      data: auditTrail,
      count: auditTrail.length
    });
  } catch (error) {
    logger.error('Error fetching audit trail:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit trail'
    });
  }
});

/**
 * GET /api/v1/compliance-automation/report/:regulationId
 * Generate compliance report for specific regulation
 */
router.get('/report/:regulationId', async (req: Request, res: Response) => {
  try {
    const { regulationId } = req.params;
    const report = await complianceAutomationService.generateComplianceReport(regulationId);

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Error generating compliance report:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate compliance report'
    });
  }
});

/**
 * POST /api/v1/compliance-automation/monitoring/start
 * Start real-time compliance monitoring
 */
router.post('/monitoring/start', async (req: Request, res: Response) => {
  try {
    const { schedule } = req.body;
    
    complianceAutomationService.startMonitoring(schedule);

    res.json({
      success: true,
      message: 'Compliance monitoring started',
      schedule: schedule || '0 */6 * * *'
    });
  } catch (error) {
    logger.error('Error starting compliance monitoring:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start compliance monitoring'
    });
  }
});

/**
 * POST /api/v1/compliance-automation/monitoring/stop
 * Stop real-time compliance monitoring
 */
router.post('/monitoring/stop', async (req: Request, res: Response) => {
  try {
    complianceAutomationService.stopMonitoring();

    res.json({
      success: true,
      message: 'Compliance monitoring stopped'
    });
  } catch (error) {
    logger.error('Error stopping compliance monitoring:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop compliance monitoring'
    });
  }
});

export const complianceAutomationRoutes = router;
