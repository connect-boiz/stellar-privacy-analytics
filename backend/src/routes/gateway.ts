import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { getGateway } from '../gateway';
import { logger } from '../utils/logger';

const router = Router();

// Get gateway status and health
router.get('/status', asyncHandler(async (req: Request, res: Response) => {
  const gateway = getGateway();
  
  if (!gateway) {
    return res.status(503).json({
      status: 'unavailable',
      message: 'Privacy API Gateway is not running'
    });
  }

  // In a real implementation, get actual stats from gateway
  res.json({
    status: 'running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    features: {
      policyEnforcement: true,
      abac: true,
      requestTransformation: true,
      loadBalancing: true,
      metrics: true,
      apiKeyManagement: true
    }
  });
}));

// Get gateway metrics
router.get('/metrics', asyncHandler(async (req: Request, res: Response) => {
  const gateway = getGateway();
  
  if (!gateway) {
    return res.status(503).json({
      error: 'Gateway not available'
    });
  }

  // Return mock metrics for now
  res.json({
    totalRequests: 1250,
    successfulRequests: 1180,
    blockedRequests: 70,
    averageResponseTime: 145,
    requestsByPrivacyLevel: {
      high: 800,
      medium: 350,
      low: 100
    },
    requestsByEndpoint: {
      '/gateway/analytics/data': 450,
      '/gateway/data/upload': 320,
      '/gateway/privacy/settings': 280,
      '/gateway/analytics/reports': 200
    },
    alerts: [
      {
        id: 'alert_001',
        type: 'policy_violation',
        severity: 'medium',
        message: 'Multiple access violations from user user123',
        timestamp: new Date().toISOString()
      }
    ]
  });
}));

// Get active policies
router.get('/policies', asyncHandler(async (req: Request, res: Response) => {
  res.json({
    policies: [
      {
        id: 'gdpr-compliance',
        name: 'GDPR Compliance Policy',
        enabled: true,
        priority: 100,
        rules: [
          {
            attribute: 'privacy.jurisdiction',
            operator: 'equals',
            value: 'EU',
            action: 'transform'
          },
          {
            attribute: 'privacy.consent',
            operator: 'equals',
            value: 'false',
            action: 'deny'
          }
        ]
      },
      {
        id: 'data-classification',
        name: 'Data Classification Policy',
        enabled: true,
        priority: 90,
        rules: [
          {
            attribute: 'privacy.dataClassification',
            operator: 'equals',
            value: 'sensitive',
            action: 'transform'
          }
        ]
      }
    ]
  });
}));

// Get service health
router.get('/services', asyncHandler(async (req: Request, res: Response) => {
  res.json({
    services: [
      {
        id: 'analytics',
        name: 'Analytics Service',
        url: 'http://localhost:3002',
        status: 'healthy',
        responseTime: 120,
        uptime: 99.9
      },
      {
        id: 'data',
        name: 'Data Service',
        url: 'http://localhost:3003',
        status: 'healthy',
        responseTime: 95,
        uptime: 99.7
      },
      {
        id: 'privacy',
        name: 'Privacy Service',
        url: 'http://localhost:3004',
        status: 'healthy',
        responseTime: 85,
        uptime: 99.8
      }
    ]
  });
}));

// Create API key
router.post('/api-keys', asyncHandler(async (req: Request, res: Response) => {
  const { name, permissions, restrictions, metadata } = req.body;
  
  if (!name || !permissions || !metadata) {
    return res.status(400).json({
      error: 'Missing required fields: name, permissions, metadata'
    });
  }

  // Mock API key creation
  const apiKey = `stellar_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
  const keyInfo = {
    id: `key_${Date.now()}`,
    name,
    keyPrefix: apiKey.substring(0, 12),
    permissions,
    restrictions: restrictions || {},
    metadata: {
      ...metadata,
      createdAt: new Date(),
      isActive: true
    }
  };

  logger.info('API key created via gateway management', {
    keyId: keyInfo.id,
    name,
    permissions
  });

  res.status(201).json({
    apiKey,
    keyInfo,
    message: 'API key created successfully'
  });
}));

// List API keys
router.get('/api-keys', asyncHandler(async (req: Request, res: Response) => {
  // Mock API keys list
  res.json({
    keys: [
      {
        id: 'key_001',
        name: 'Analytics Client Key',
        keyPrefix: 'stellar_an_',
        permissions: ['analytics:read', 'analytics:write'],
        metadata: {
          owner: 'analytics-team',
          department: 'data-analytics',
          createdAt: new Date('2024-01-15'),
          lastUsedAt: new Date(),
          isActive: true
        }
      }
    ]
  });
}));

// Revoke API key
router.delete('/api-keys/:keyId', asyncHandler(async (req: Request, res: Response) => {
  const { keyId } = req.params;
  
  logger.info('API key revoked via gateway management', { keyId });
  
  res.json({
    message: 'API key revoked successfully',
    keyId
  });
}));

// Get privacy alerts
router.get('/alerts', asyncHandler(async (req: Request, res: Response) => {
  const { severity, resolved } = req.query;
  
  // Mock alerts
  const alerts = [
    {
      id: 'alert_001',
      timestamp: new Date(),
      type: 'policy_violation',
      severity: 'medium',
      message: 'Multiple access violations from user user123',
      details: {
        userId: 'user123',
        violationCount: 5,
        timeWindow: '1 hour'
      },
      resolved: false
    },
    {
      id: 'alert_002',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      type: 'rate_limit_exceeded',
      severity: 'low',
      message: 'Rate limit exceeded for API key stellar_an_123',
      details: {
        apiKeyId: 'stellar_an_123',
        limit: 100,
        actual: 150
      },
      resolved: true,
      resolvedAt: new Date(Date.now() - 1 * 60 * 60 * 1000)
    }
  ];

  let filteredAlerts = alerts;
  
  if (severity) {
    filteredAlerts = filteredAlerts.filter(a => a.severity === severity);
  }
  
  if (resolved !== undefined) {
    const isResolved = resolved === 'true';
    filteredAlerts = filteredAlerts.filter(a => a.resolved === isResolved);
  }

  res.json({ alerts: filteredAlerts });
}));

// Resolve alert
router.post('/alerts/:alertId/resolve', asyncHandler(async (req: Request, res: Response) => {
  const { alertId } = req.params;
  
  logger.info('Privacy alert resolved', { alertId });
  
  res.json({
    message: 'Alert resolved successfully',
    alertId,
    resolvedAt: new Date()
  });
}));

// Get transformation rules
router.get('/transformations', asyncHandler(async (req: Request, res: Response) => {
  res.json({
    transformations: [
      {
        id: 'email_masking',
        name: 'Email Masking',
        type: 'mask',
        field: 'email',
        parameters: {
          type: 'partial',
          visibleChars: 3,
          maskChar: '*'
        },
        enabled: true
      },
      {
        id: 'ssn_masking',
        name: 'SSN Masking',
        type: 'mask',
        field: 'ssn',
        parameters: {
          type: 'full',
          maskChar: '*'
        },
        enabled: true
      },
      {
        id: 'data_encryption',
        name: 'Sensitive Data Encryption',
        type: 'encrypt',
        field: 'personalData',
        parameters: {
          algorithm: 'aes-256-gcm',
          keyId: 'sensitive_data_key'
        },
        enabled: true
      }
    ]
  });
}));

// Update gateway configuration
router.put('/config', asyncHandler(async (req: Request, res: Response) => {
  const { policies, rateLimiting, loadBalancing } = req.body;
  
  logger.info('Gateway configuration updated', {
    updatedSections: Object.keys(req.body)
  });
  
  res.json({
    message: 'Gateway configuration updated successfully',
    updatedAt: new Date()
  });
}));

export { router as gatewayRoutes };
