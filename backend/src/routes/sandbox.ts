import express from 'express';
import { body, validationResult } from 'express-validator';
import { sandboxConfig } from '../config/sandboxConfig';
import { logger } from '../utils/logger';
import { SandboxService } from '../services/sandboxService';
import { MockPaymentService } from '../services/mockPaymentService';

const router = express.Router();
const sandboxService = new SandboxService();
const mockPaymentService = new MockPaymentService();

// Get current sandbox configuration
router.get('/config', (req, res) => {
  try {
    const config = sandboxConfig.getConfig();
    res.json({
      success: true,
      data: {
        ...config,
        stellarNetwork: {
          ...config.stellarNetwork,
          networkPassphrase: config.stellarNetwork.networkPassphrase 
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get sandbox config', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve sandbox configuration',
      timestamp: new Date().toISOString()
    });
  }
});

// Toggle sandbox mode
router.post('/toggle', [
  body('enabled').isBoolean().withMessage('enabled must be a boolean')
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
        timestamp: new Date().toISOString()
      });
    }

    const { enabled } = req.body;
    sandboxConfig.toggleSandboxMode(enabled);
    
    logger.info('Sandbox mode toggled', { enabled, requestedBy: req.user?.id });
    
    res.json({
      success: true,
      data: {
        enabled,
        environment: sandboxConfig.getConfig().environment,
        message: enabled ? 'Sandbox mode enabled' : 'Sandbox mode disabled'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to toggle sandbox mode', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle sandbox mode',
      timestamp: new Date().toISOString()
    });
  }
});

// Switch Stellar environment
router.post('/environment', [
  body('environment').isIn(['mainnet', 'testnet', 'sandbox']).withMessage('environment must be mainnet, testnet, or sandbox')
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
        timestamp: new Date().toISOString()
      });
    }

    const { environment } = req.body;
    sandboxConfig.updateEnvironment(environment);
    
    logger.info('Stellar environment switched', { environment, requestedBy: req.user?.id });
    
    res.json({
      success: true,
      data: {
        environment,
        stellarConfig: sandboxConfig.getStellarConfig(),
        message: `Switched to ${environment} environment`
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to switch environment', error);
    res.status(500).json({
      success: false,
      error: 'Failed to switch environment',
      timestamp: new Date().toISOString()
    });
  }
});

// Mock payment pull endpoint
router.post('/mock-payment', [
  body('subscriptionId').isUUID().withMessage('subscriptionId must be a valid UUID'),
  body('amount').isFloat({ gt: 0 }).withMessage('amount must be a positive number'),
  body('currency').isString().isLength({ min: 3, max: 3 }).withMessage('currency must be a 3-letter code'),
  body('customerId').optional().isUUID().withMessage('customerId must be a valid UUID'),
  body('shouldFail').optional().isBoolean().withMessage('shouldFail must be a boolean'),
  body('failureType').optional().isIn(['insufficient_funds', 'network_error', 'timeout', 'invalid_signature']).withMessage('invalid failure type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
        timestamp: new Date().toISOString()
      });
    }

    if (!sandboxConfig.isSandboxMode()) {
      return res.status(403).json({
        success: false,
        error: 'Mock payments are only available in sandbox mode',
        timestamp: new Date().toISOString()
      });
    }

    const mockPaymentData = req.body;
    const result = await mockPaymentService.createMockPayment(mockPaymentData);
    
    logger.info('Mock payment created', { 
      paymentId: result.paymentId, 
      subscriptionId: mockPaymentData.subscriptionId,
      amount: mockPaymentData.amount,
      requestedBy: req.user?.id
    });
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to create mock payment', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create mock payment',
      timestamp: new Date().toISOString()
    });
  }
});

// Get mock payment history
router.get('/mock-payments', async (req, res) => {
  try {
    if (!sandboxConfig.isSandboxMode()) {
      return res.status(403).json({
        success: false,
        error: 'Mock payment history is only available in sandbox mode',
        timestamp: new Date().toISOString()
      });
    }

    const { subscriptionId, limit = 50, offset = 0 } = req.query;
    const history = await mockPaymentService.getMockPaymentHistory({
      subscriptionId: subscriptionId as string,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
    
    res.json({
      success: true,
      data: history,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get mock payment history', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve mock payment history',
      timestamp: new Date().toISOString()
    });
  }
});

// Simulate subscription billing event
router.post('/mock-subscription-billed', [
  body('subscriptionId').isUUID().withMessage('subscriptionId must be a valid UUID'),
  body('amount').isFloat({ gt: 0 }).withMessage('amount must be a positive number'),
  body('currency').isString().isLength({ min: 3, max: 3 }).withMessage('currency must be a 3-letter code'),
  body('billingPeriodStart').isISO8601().withMessage('billingPeriodStart must be a valid ISO date'),
  body('billingPeriodEnd').isISO8601().withMessage('billingPeriodEnd must be a valid ISO date'),
  body('paymentStatus').optional().isIn(['success', 'failed', 'pending']).withMessage('invalid payment status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
        timestamp: new Date().toISOString()
      });
    }

    if (!sandboxConfig.isSandboxMode()) {
      return res.status(403).json({
        success: false,
        error: 'Mock subscription events are only available in sandbox mode',
        timestamp: new Date().toISOString()
      });
    }

    const billingEventData = req.body;
    const result = await sandboxService.simulateSubscriptionBilledEvent(billingEventData);
    
    logger.info('Mock subscription billed event created', { 
      eventId: result.eventId,
      subscriptionId: billingEventData.subscriptionId,
      requestedBy: req.user?.id
    });
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to create mock subscription billed event', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create mock subscription billed event',
      timestamp: new Date().toISOString()
    });
  }
});

// Simulate grace period
router.post('/mock-grace-period', [
  body('subscriptionId').isUUID().withMessage('subscriptionId must be a valid UUID'),
  body('gracePeriodDays').isInt({ min: 1, max: 30 }).withMessage('gracePeriodDays must be between 1 and 30'),
  body('reason').optional().isString().withMessage('reason must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
        timestamp: new Date().toISOString()
      });
    }

    if (!sandboxConfig.isSandboxMode()) {
      return res.status(403).json({
        success: false,
        error: 'Mock grace periods are only available in sandbox mode',
        timestamp: new Date().toISOString()
      });
    }

    const gracePeriodData = req.body;
    const result = await sandboxService.simulateGracePeriod(gracePeriodData);
    
    logger.info('Mock grace period created', { 
      gracePeriodId: result.gracePeriodId,
      subscriptionId: gracePeriodData.subscriptionId,
      days: gracePeriodData.gracePeriodDays,
      requestedBy: req.user?.id
    });
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to create mock grace period', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create mock grace period',
      timestamp: new Date().toISOString()
    });
  }
});

// Simulate dunning process
router.post('/mock-dunning', [
  body('subscriptionId').isUUID().withMessage('subscriptionId must be a valid UUID'),
  body('dunningLevel').isInt({ min: 1, max: 5 }).withMessage('dunningLevel must be between 1 and 5'),
  body('contactMethod').isIn(['email', 'sms', 'push', 'webhook']).withMessage('invalid contact method'),
  body('message').optional().isString().withMessage('message must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
        timestamp: new Date().toISOString()
      });
    }

    if (!sandboxConfig.isSandboxMode()) {
      return res.status(403).json({
        success: false,
        error: 'Mock dunning processes are only available in sandbox mode',
        timestamp: new Date().toISOString()
      });
    }

    const dunningData = req.body;
    const result = await sandboxService.simulateDunningProcess(dunningData);
    
    logger.info('Mock dunning process created', { 
      dunningId: result.dunningId,
      subscriptionId: dunningData.subscriptionId,
      level: dunningData.dunningLevel,
      requestedBy: req.user?.id
    });
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to create mock dunning process', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create mock dunning process',
      timestamp: new Date().toISOString()
    });
  }
});

// Get sandbox status and health
router.get('/status', (req, res) => {
  try {
    const config = sandboxConfig.getConfig();
    const status = {
      sandboxEnabled: config.enabled,
      environment: config.environment,
      features: config.features,
      mockData: config.mockData,
      stellarNetwork: {
        rpcUrl: config.stellarNetwork.rpcUrl,
        horizonUrl: config.stellarNetwork.horizonUrl,
        networkType: config.environment
      },
      database: {
        schemaPrefix: config.database.schemaPrefix,
        isolationEnabled: config.database.isolationEnabled
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get sandbox status', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve sandbox status',
      timestamp: new Date().toISOString()
    });
  }
});

export { router as sandboxRoutes };
