import { Router, Request, Response } from 'express';
import { getHSMIntegration } from '../services/hsmIntegration';
import { logger } from '../utils/logger';
import { body, param, query, validationResult } from 'express-validator';

const router = Router();

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

// Extract user context for audit logging
const extractUserContext = (req: Request) => ({
  userId: (req as any).user?.id || req.headers['x-user-id'] as string,
  sessionId: (req as any).sessionId || req.headers['x-session-id'] as string,
  ipAddress: req.ip || req.connection.remoteAddress,
  userAgent: req.headers['user-agent']
});

// Generate data key
router.post('/keys/generate',
  [
    body('purpose').isString().isLength({ min: 1, max: 100 }),
    body('context').optional().isObject(),
    body('ttl').optional().isInt({ min: 60, max: 86400 }) // 1 min to 24 hours
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { purpose, context, ttl } = req.body;
      const userContext = extractUserContext(req);

      const hsmIntegration = getHSMIntegration();
      const result = await hsmIntegration.generateDataKey(
        purpose,
        userContext.userId,
        context
      );

      logger.info('Data key generated', {
        purpose,
        userId: userContext.userId,
        keyId: result.keyId
      });

      res.json({
        success: true,
        data: {
          plaintextKey: result.plaintextKey,
          wrappedKey: result.wrappedKey,
          keyId: result.keyId,
          expiresAt: result.expiresAt
        }
      });
    } catch (error: any) {
      logger.error('Failed to generate data key:', error);
      res.status(500).json({
        error: 'Failed to generate data key',
        message: error.message
      });
    }
  }
);

// Decrypt data key
router.post('/keys/decrypt',
  [
    body('wrappedKey').isObject(),
    body('purpose').isString().isLength({ min: 1, max: 100 }),
    body('context').optional().isObject()
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { wrappedKey, purpose, context } = req.body;
      const userContext = extractUserContext(req);

      const hsmIntegration = getHSMIntegration();
      const plaintextKey = await hsmIntegration.decryptDataKey(
        wrappedKey,
        purpose,
        userContext.userId,
        context
      );

      logger.info('Data key decrypted', {
        purpose,
        userId: userContext.userId,
        keyId: wrappedKey.keyId
      });

      res.json({
        success: true,
        data: { plaintextKey }
      });
    } catch (error: any) {
      logger.error('Failed to decrypt data key:', error);
      res.status(500).json({
        error: 'Failed to decrypt data key',
        message: error.message
      });
    }
  }
);

// Rotate master key
router.post('/master-key/rotate',
  async (req: Request, res: Response) => {
    try {
      const userContext = extractUserContext(req);

      const hsmIntegration = getHSMIntegration();
      const newKeyId = await hsmIntegration.rotateMasterKey();

      logger.warn('Master key rotated', {
        userId: userContext.userId,
        newKeyId
      });

      res.json({
        success: true,
        data: { newKeyId }
      });
    } catch (error: any) {
      logger.error('Failed to rotate master key:', error);
      res.status(500).json({
        error: 'Failed to rotate master key',
        message: error.message
      });
    }
  }
);

// Get system status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const hsmIntegration = getHSMIntegration();
    const status = await hsmIntegration.getSystemStatus();

    res.json({
      success: true,
      data: status
    });
  } catch (error: any) {
    logger.error('Failed to get system status:', error);
    res.status(500).json({
      error: 'Failed to get system status',
      message: error.message
    });
  }
});

// Get health report
router.get('/health', async (req: Request, res: Response) => {
  try {
    const hsmIntegration = getHSMIntegration();
    const healthReport = await hsmIntegration.getHealthReport();

    res.json({
      success: true,
      data: healthReport
    });
  } catch (error: any) {
    logger.error('Failed to get health report:', error);
    res.status(500).json({
      error: 'Failed to get health report',
      message: error.message
    });
  }
});

// Activate kill switch
router.post('/kill-switch/activate',
  [
    body('reason').isString().isLength({ min: 1, max: 500 })
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { reason } = req.body;
      const userContext = extractUserContext(req);

      const hsmIntegration = getHSMIntegration();
      await hsmIntegration.activateKillSwitch(reason, userContext.userId);

      logger.error('Kill switch activated via API', {
        reason,
        userId: userContext.userId
      });

      res.json({
        success: true,
        message: 'Kill switch activated'
      });
    } catch (error: any) {
      logger.error('Failed to activate kill switch:', error);
      res.status(500).json({
        error: 'Failed to activate kill switch',
        message: error.message
      });
    }
  }
);

// Deactivate kill switch
router.post('/kill-switch/deactivate',
  [
    body('reason').isString().isLength({ min: 1, max: 500 })
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { reason } = req.body;
      const userContext = extractUserContext(req);

      const hsmIntegration = getHSMIntegration();
      await hsmIntegration.deactivateKillSwitch(reason, userContext.userId);

      logger.info('Kill switch deactivated via API', {
        reason,
        userId: userContext.userId
      });

      res.json({
        success: true,
        message: 'Kill switch deactivated'
      });
    } catch (error: any) {
      logger.error('Failed to deactivate kill switch:', error);
      res.status(500).json({
        error: 'Failed to deactivate kill switch',
        message: error.message
      });
    }
  }
);

// Get audit log
router.get('/audit',
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('category').optional().isIn(['key_management', 'access_control', 'system_event', 'security_violation']),
    query('action').optional().isString(),
    query('userId').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
    query('offset').optional().isInt({ min: 0 })
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const {
        startDate,
        endDate,
        category,
        action,
        userId,
        limit = 100,
        offset = 0
      } = req.query;

      const hsmIntegration = getHSMIntegration();
      const auditLog = await hsmIntegration.exportAuditLog({
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        category: category as any,
        action: action as string,
        userId: userId as string,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      });

      res.json({
        success: true,
        data: JSON.parse(auditLog)
      });
    } catch (error: any) {
      logger.error('Failed to get audit log:', error);
      res.status(500).json({
        error: 'Failed to get audit log',
        message: error.message
      });
    }
  }
);

// Get audit metrics
router.get('/audit/metrics',
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('category').optional().isIn(['key_management', 'access_control', 'system_event', 'security_violation'])
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, category } = req.query;

      const hsmIntegration = getHSMIntegration();
      const metrics = await hsmIntegration.getAuditMetrics({
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        category: category as any
      });

      res.json({
        success: true,
        data: metrics
      });
    } catch (error: any) {
      logger.error('Failed to get audit metrics:', error);
      res.status(500).json({
        error: 'Failed to get audit metrics',
        message: error.message
      });
    }
  }
);

// Verify audit integrity
router.get('/audit/integrity', async (req: Request, res: Response) => {
  try {
    const hsmIntegration = getHSMIntegration();
    const integrity = await hsmIntegration.verifyAuditIntegrity();

    res.json({
      success: true,
      data: integrity
    });
  } catch (error: any) {
    logger.error('Failed to verify audit integrity:', error);
    res.status(500).json({
      error: 'Failed to verify audit integrity',
      message: error.message
    });
  }
);

// Export audit log (CSV/JSON)
router.get('/audit/export',
  [
    query('format').optional().isIn(['json', 'csv']),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('category').optional().isIn(['key_management', 'access_control', 'system_event', 'security_violation'])
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const {
        format = 'json',
        startDate,
        endDate,
        category
      } = req.query;

      const hsmIntegration = getHSMIntegration();
      const exportData = await hsmIntegration.exportAuditLog({
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        category: category as any
      }, format as 'json' | 'csv');

      const filename = `audit-export-${new Date().toISOString().split('T')[0]}.${format}`;
      
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      }

      res.send(exportData);
    } catch (error: any) {
      logger.error('Failed to export audit log:', error);
      res.status(500).json({
        error: 'Failed to export audit log',
        message: error.message
      });
    }
  }
);

// Emergency shutdown
router.post('/emergency/shutdown',
  [
    body('reason').isString().isLength({ min: 1, max: 500 })
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { reason } = req.body;
      const userContext = extractUserContext(req);

      const hsmIntegration = getHSMIntegration();
      await hsmIntegration.emergencyShutdown(reason, userContext.userId);

      logger.error('Emergency shutdown triggered via API', {
        reason,
        userId: userContext.userId
      });

      res.json({
        success: true,
        message: 'Emergency shutdown initiated'
      });
    } catch (error: any) {
      logger.error('Failed to initiate emergency shutdown:', error);
      res.status(500).json({
        error: 'Failed to initiate emergency shutdown',
        message: error.message
      });
    }
  }
);

// Get master key status
router.get('/master-key/status', async (req: Request, res: Response) => {
  try {
    const hsmIntegration = getHSMIntegration();
    const masterKeyManager = hsmIntegration.getMasterKeyManager();
    const status = masterKeyManager.getMasterKeyStatus();

    res.json({
      success: true,
      data: status
    });
  } catch (error: any) {
    logger.error('Failed to get master key status:', error);
    res.status(500).json({
      error: 'Failed to get master key status',
      message: error.message
    });
  }
);

// List all master keys
router.get('/master-keys', async (req: Request, res: Response) => {
  try {
    const hsmIntegration = getHSMIntegration();
    const masterKeyManager = hsmIntegration.getMasterKeyManager();
    const keys = masterKeyManager.getAllMasterKeys();

    res.json({
      success: true,
      data: keys
    });
  } catch (error: any) {
    logger.error('Failed to list master keys:', error);
    res.status(500).json({
      error: 'Failed to list master keys',
      message: error.message
    });
  }
);

// Clear data key cache
router.post('/cache/clear', async (req: Request, res: Response) => {
  try {
    const userContext = extractUserContext(req);

    const hsmIntegration = getHSMIntegration();
    const masterKeyManager = hsmIntegration.getMasterKeyManager();
    masterKeyManager.clearCache();

    logger.info('Data key cache cleared', {
      userId: userContext.userId
    });

    res.json({
      success: true,
      message: 'Data key cache cleared'
    });
  } catch (error: any) {
    logger.error('Failed to clear cache:', error);
    res.status(500).json({
      error: 'Failed to clear cache',
      message: error.message
    });
  }
);

export default router;
