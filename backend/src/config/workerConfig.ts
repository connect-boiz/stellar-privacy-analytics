import { WorkerConfig } from '../workers/optimizedAnonymizationWorker';
import { OrchestratorConfig } from '../workers/workerOrchestrator';

/**
 * Worker configuration for different environments
 */

export const developmentConfig: OrchestratorConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    maxConnections: 10,
    minConnections: 2,
  },
  postgres: {
    readReplica: {
      host: process.env.POSTGRES_READ_HOST || process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'stellar_db',
      username: process.env.POSTGRES_USER || 'stellar',
      password: process.env.POSTGRES_PASSWORD || 'password',
    },
  },
  piiMasking: {
    enableRegex: true,
    enableNER: false, // Disabled in dev for performance
    customPatterns: {},
  },
  sandbox: {
    enableSandbox: false, // Disabled in dev for easier debugging
    memoryLimit: 512 * 1024 * 1024, // 512MB
    timeoutMs: 30000, // 30 seconds
  },
  worker: {
    concurrency: 5,
    maxRetries: 3,
    retryDelay: 2000,
    enableDynamicScaling: false,
    minConcurrency: 3,
    maxConcurrency: 10,
    scalingThreshold: 50,
    enableBatchProcessing: false,
    batchSize: 10,
    batchTimeout: 5000,
  },
  monitoring: {
    enableMetrics: true,
    metricsInterval: 60000, // 1 minute
  },
  orchestrator: {
    enableHorizontalScaling: false,
    minWorkers: 1,
    maxWorkers: 2,
    scaleUpThreshold: 100,
    scaleDownThreshold: 20,
    scaleCheckInterval: 60000, // 1 minute
    workerHealthCheckInterval: 30000, // 30 seconds
  },
};

export const productionConfig: OrchestratorConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    maxConnections: 50,
    minConnections: 10,
  },
  postgres: {
    readReplica: {
      host: process.env.POSTGRES_READ_HOST || process.env.POSTGRES_HOST || 'postgres',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'stellar_db',
      username: process.env.POSTGRES_USER || 'stellar',
      password: process.env.POSTGRES_PASSWORD || 'password',
    },
  },
  piiMasking: {
    enableRegex: true,
    enableNER: true,
    customPatterns: JSON.parse(process.env.CUSTOM_PII_PATTERNS || '{}'),
  },
  sandbox: {
    enableSandbox: true,
    memoryLimit: 1024 * 1024 * 1024, // 1GB
    timeoutMs: 60000, // 60 seconds
  },
  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '20'),
    maxRetries: 5,
    retryDelay: 2000,
    enableDynamicScaling: true,
    minConcurrency: 10,
    maxConcurrency: 50,
    scalingThreshold: 200,
    enableBatchProcessing: true,
    batchSize: 20,
    batchTimeout: 10000,
  },
  monitoring: {
    enableMetrics: true,
    metricsInterval: 30000, // 30 seconds
  },
  orchestrator: {
    enableHorizontalScaling: true,
    minWorkers: parseInt(process.env.MIN_WORKERS || '3'),
    maxWorkers: parseInt(process.env.MAX_WORKERS || '10'),
    scaleUpThreshold: parseInt(process.env.SCALE_UP_THRESHOLD || '500'),
    scaleDownThreshold: parseInt(process.env.SCALE_DOWN_THRESHOLD || '100'),
    scaleCheckInterval: 30000, // 30 seconds
    workerHealthCheckInterval: 15000, // 15 seconds
  },
};

export const testConfig: OrchestratorConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '1'), // Use different DB for tests
    maxConnections: 5,
    minConnections: 1,
  },
  postgres: {
    readReplica: {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_TEST_DB || 'stellar_test_db',
      username: process.env.POSTGRES_USER || 'stellar',
      password: process.env.POSTGRES_PASSWORD || 'password',
    },
  },
  piiMasking: {
    enableRegex: true,
    enableNER: false,
    customPatterns: {},
  },
  sandbox: {
    enableSandbox: false,
    memoryLimit: 256 * 1024 * 1024, // 256MB
    timeoutMs: 10000, // 10 seconds
  },
  worker: {
    concurrency: 2,
    maxRetries: 2,
    retryDelay: 1000,
    enableDynamicScaling: false,
    minConcurrency: 1,
    maxConcurrency: 5,
    scalingThreshold: 20,
    enableBatchProcessing: false,
    batchSize: 5,
    batchTimeout: 2000,
  },
  monitoring: {
    enableMetrics: false,
    metricsInterval: 60000,
  },
  orchestrator: {
    enableHorizontalScaling: false,
    minWorkers: 1,
    maxWorkers: 1,
    scaleUpThreshold: 50,
    scaleDownThreshold: 10,
    scaleCheckInterval: 60000,
    workerHealthCheckInterval: 30000,
  },
};

/**
 * Get configuration based on environment
 */
export function getWorkerConfig(): OrchestratorConfig {
  const env = process.env.NODE_ENV || 'development';

  switch (env) {
    case 'production':
      return productionConfig;
    case 'test':
      return testConfig;
    case 'development':
    default:
      return developmentConfig;
  }
}

/**
 * Validate configuration
 */
export function validateConfig(config: OrchestratorConfig): void {
  // Validate Redis config
  if (!config.redis.host || !config.redis.port) {
    throw new Error('Invalid Redis configuration');
  }

  // Validate PostgreSQL config
  if (!config.postgres.readReplica.host || !config.postgres.readReplica.database) {
    throw new Error('Invalid PostgreSQL configuration');
  }

  // Validate worker config
  if (config.worker.concurrency < 1) {
    throw new Error('Worker concurrency must be at least 1');
  }

  if (config.worker.minConcurrency > config.worker.maxConcurrency) {
    throw new Error('Min concurrency cannot be greater than max concurrency');
  }

  // Validate orchestrator config
  if (config.orchestrator.minWorkers > config.orchestrator.maxWorkers) {
    throw new Error('Min workers cannot be greater than max workers');
  }

  if (config.orchestrator.scaleDownThreshold > config.orchestrator.scaleUpThreshold) {
    throw new Error('Scale down threshold cannot be greater than scale up threshold');
  }
}
