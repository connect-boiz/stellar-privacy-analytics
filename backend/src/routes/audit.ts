import express from 'express';
import AuditService, { AuditQuery } from '../services/auditService';
import { logger } from '../utils/logger';

const router = express.Router();
const auditService = new AuditService();

/**
 * GET /api/v1/audit/logs
 * Fetch paginated audit logs with filtering
 */
router.get('/logs', async (req, res, next) => {
  try {
    const query: AuditQuery = {
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,import express from 'express';
import { query as queryValidator } from 'express-validator';
import AuditService, { AuditQuery } from '../services/auditService';
import { validateRequest } from '../middleware/validation';

const router = express.Router();
const auditService = new AuditService();

const AUDIT_CATEGORIES = [
  'key_management',
  'access_control',
  'system_event',
  'security_violation',
  'privacy_query',
  'data_access',
  'data_modification',
] as const;

const AUDIT_OUTCOMES = ['success', 'failure', 'attempted'] as const;
const AUDIT_RISK = ['low', 'medium', 'high', 'critical'] as const;

/**
 * GET /api/v1/audit/logs
 * Fetch paginated audit logs with filtering
 */
router.get('/logs', [
  queryValidator('startDate').optional().isISO8601(),
  queryValidator('endDate').optional().isISO8601(),
  queryValidator('category').optional().isIn(AUDIT_CATEGORIES),
  queryValidator('action').optional().trim().isLength({ max: 200 }),
  queryValidator('userId').optional().trim().isLength({ max: 256 }),
  queryValidator('resourceType').optional().trim().isLength({ max: 128 }),
  queryValidator('outcome').optional().isIn(AUDIT_OUTCOMES),
  queryValidator('riskLevel').optional().isIn(AUDIT_RISK),
  queryValidator('limit').optional().isInt({ min: 1, max: 1000 }),
  queryValidator('offset').optional().isInt({ min: 0, max: 10_000_000 }),
  validateRequest,
], async (req, res, next) => {
  try {
    const query: AuditQuery = {
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      category: req.query.category as any,
      action: req.query.action as string,
      userId: req.query.userId as string,
      resourceType: req.query.resourceType as string,
      outcome: req.query.outcome as any,
      riskLevel: req.query.riskLevel as any,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };

    const logs = await auditService.query(query);
    const metrics = await auditService.getMetrics(query);

    res.json({
      success: true,
      data: logs,
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total: metrics.totalRecords
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/audit/export/csv
 * Export audit logs as CSV
 */
router.get('/export/csv', [
  queryValidator('startDate').optional().isISO8601(),
  queryValidator('endDate').optional().isISO8601(),
  queryValidator('category').optional().isIn(AUDIT_CATEGORIES),
  validateRequest,
], async (req, res, next) => {
  try {
    const query: AuditQuery = {
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      category: req.query.category as any,
      limit: 10000 // Export limit
    };

    const csvContent = await auditService.exportAuditLog(query, 'csv');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=audit-log-${Date.now()}.csv`);
    res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/audit/metrics
 * Fetch audit metrics for dashboard
 */
router.get('/metrics', async (req, res, next) => {
  try {
    const metrics = await auditService.getMetrics();
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    next(error);
  }
});

export { router as auditRoutes };

      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      category: req.query.category as any,
      action: req.query.action as string,
      userId: req.query.userId as string,
      resourceType: req.query.resourceType as string,
      outcome: req.query.outcome as any,
      riskLevel: req.query.riskLevel as any,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };

    const logs = await auditService.query(query);
    const metrics = await auditService.getMetrics(query);

    res.json({
      success: true,
      data: logs,
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total: metrics.totalRecords
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/audit/export/csv
 * Export audit logs as CSV
 */
router.get('/export/csv', async (req, res, next) => {
  try {
    const query: AuditQuery = {
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      category: req.query.category as any,
      limit: 10000 // Export limit
    };

    const csvContent = await auditService.exportAuditLog(query, 'csv');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=audit-log-${Date.now()}.csv`);
    res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/audit/metrics
 * Fetch audit metrics for dashboard
 */
router.get('/metrics', async (req, res, next) => {
  try {
    const metrics = await auditService.getMetrics();
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    next(error);
  }
});

export { router as auditRoutes };
