import { PrivacyApiGateway, GatewayConfig } from './PrivacyApiGateway';
import { logger } from '../utils/logger';

// Default configuration for the Privacy API Gateway
export const defaultGatewayConfig: GatewayConfig = {
  services: [
    {
      id: 'analytics',
      name: 'Analytics Service',
      baseUrl: 'http://localhost:3002',
      healthCheckPath: '/health',
      privacyRequirements: {
        minPrivacyLevel: 'medium',
        dataClassification: 'internal',
        encryptionRequired: true,
        auditRequired: true
      },
      routes: [
        {
          path: '/analytics/*',
          methods: ['GET', 'POST'],
          privacyLevel: 'medium',
          requiresAuth: true,
          rateLimitOverride: {
            windowMs: 60000, // 1 minute
            maxRequests: 100
          },
          transformationRules: [
            {
              type: 'mask',
              field: 'user.email',
              parameters: {
                type: 'partial',
                visibleChars: 3,
                maskChar: '*'
              }
            },
            {
              type: 'pseudonymize',
              field: 'user.id',
              parameters: {
                salt: 'analytics_salt_2024',
                algorithm: 'sha256',
                deterministic: true
              }
            }
          ]
        },
        {
          path: '/analytics/reports/*',
          methods: ['GET'],
          privacyLevel: 'high',
          requiresAuth: true,
          rateLimitOverride: {
            windowMs: 300000, // 5 minutes
            maxRequests: 20
          }
        }
      ]
    },
    {
      id: 'data',
      name: 'Data Service',
      baseUrl: 'http://localhost:3003',
      healthCheckPath: '/health',
      privacyRequirements: {
        minPrivacyLevel: 'high',
        dataClassification: 'sensitive',
        encryptionRequired: true,
        auditRequired: true
      },
      routes: [
        {
          path: '/data/upload',
          methods: ['POST'],
          privacyLevel: 'high',
          requiresAuth: true,
          rateLimitOverride: {
            windowMs: 60000,
            maxRequests: 50
          },
          transformationRules: [
            {
              type: 'encrypt',
              field: 'personalData',
              parameters: {
                algorithm: 'aes-256-gcm',
                keyId: 'default',
                ivLength: 16
              }
            }
          ]
        },
        {
          path: '/data/query',
          methods: ['POST'],
          privacyLevel: 'high',
          requiresAuth: true,
          transformationRules: [
            {
              type: 'mask',
              field: 'results.*.ssn',
              parameters: {
                type: 'full',
                maskChar: '*'
              }
            }
          ]
        }
      ]
    },
    {
      id: 'privacy',
      name: 'Privacy Service',
      baseUrl: 'http://localhost:3004',
      healthCheckPath: '/health',
      privacyRequirements: {
        minPrivacyLevel: 'high',
        dataClassification: 'confidential',
        encryptionRequired: true,
        auditRequired: true
      },
      routes: [
        {
          path: '/privacy/*',
          methods: ['GET', 'POST', 'PUT', 'DELETE'],
          privacyLevel: 'high',
          requiresAuth: true,
          rateLimitOverride: {
            windowMs: 60000,
            maxRequests: 200
          }
        }
      ]
    }
  ],
  policies: [
    {
      id: 'gdpr-compliance',
      name: 'GDPR Compliance Policy',
      rules: [
        {
          attribute: 'privacy.jurisdiction',
          operator: 'equals',
          value: 'EU',
          action: 'transform',
          transformation: {
            type: 'pseudonymize',
            field: 'personalData',
            parameters: {
              salt: 'gdpr_salt_2024',
              algorithm: 'sha256',
              deterministic: true
            }
          }
        },
        {
          attribute: 'privacy.consent',
          operator: 'equals',
          value: 'false',
          action: 'deny'
        }
      ],
      priority: 100,
      enabled: true
    },
    {
      id: 'data-classification',
      name: 'Data Classification Policy',
      rules: [
        {
          attribute: 'privacy.dataClassification',
          operator: 'equals',
          value: 'sensitive',
          action: 'transform',
          transformation: {
            type: 'encrypt',
            field: 'sensitiveFields',
            parameters: {
              algorithm: 'aes-256-gcm',
              keyId: 'sensitive_data_key',
              ivLength: 16
            }
          }
        },
        {
          attribute: 'user.clearanceLevel',
          operator: 'not_equals',
          value: 'high',
          action: 'deny'
        }
      ],
      priority: 90,
      enabled: true
    },
    {
      id: 'rate-limiting',
      name: 'Rate Limiting Policy',
      rules: [
        {
          attribute: 'user.role',
          operator: 'equals',
          value: 'anonymous',
          action: 'log'
        }
      ],
      priority: 50,
      enabled: true
    }
  ],
  rateLimiting: {
    windowMs: 900000, // 15 minutes
    maxRequests: 1000,
    skipSuccessfulRequests: false,
    skipFailedRequests: false
  },
  loadBalancing: {
    strategy: 'least-connections',
    healthCheckInterval: 30000, // 30 seconds
    unhealthyThreshold: 3,
    healthyThreshold: 2
  },
  metrics: {
    enabled: true,
    collectionInterval: 60000, // 1 minute
    retentionPeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
    exportFormat: 'prometheus'
  }
};

let gatewayInstance: PrivacyApiGateway | null = null;

export function createGateway(config: GatewayConfig = defaultGatewayConfig): PrivacyApiGateway {
  if (gatewayInstance) {
    logger.warn('Gateway instance already exists. Returning existing instance.');
    return gatewayInstance;
  }

  gatewayInstance = new PrivacyApiGateway(config);
  return gatewayInstance;
}

export function getGateway(): PrivacyApiGateway | null {
  return gatewayInstance;
}

export async function startGateway(port: number = 8080): Promise<void> {
  if (!gatewayInstance) {
    gatewayInstance = createGateway();
  }

  try {
    await gatewayInstance.start(port);
    logger.info(`Privacy API Gateway started successfully on port ${port}`);
  } catch (error) {
    logger.error('Failed to start Privacy API Gateway:', error);
    throw error;
  }
}

export async function stopGateway(): Promise<void> {
  if (gatewayInstance) {
    try {
      await gatewayInstance.stop();
      gatewayInstance = null;
      logger.info('Privacy API Gateway stopped successfully');
    } catch (error) {
      logger.error('Failed to stop Privacy API Gateway:', error);
      throw error;
    }
  }
}

// Export for standalone usage
export { PrivacyApiGateway };
export * from './PrivacyPolicyEngine';
export * from './ABACService';
export * from './APIKeyManager';
export * from './RequestTransformer';
export * from './PrivacyMetrics';
export * from './LoadBalancer';
