#!/usr/bin/env ts-node
/**
 * Worker Process Entry Point
 * Starts a single optimized anonymization worker
 */

import '../config/env';
import { OptimizedAnonymizationWorker } from './optimizedAnonymizationWorker';
import { getWorkerConfig, validateConfig } from '../config/workerConfig';
import { logger } from '../utils/logger';

async function startWorker() {
  try {
    logger.info('Starting anonymization worker...');

    // Get and validate configuration
    const config = getWorkerConfig();
    validateConfig(config);

    // Create worker instance
    const worker = new OptimizedAnonymizationWorker(config);

    logger.info('Anonymization worker started successfully', {
      workerId: process.env.WORKER_ID || 'default',
      concurrency: config.worker.concurrency,
      environment: process.env.NODE_ENV,
    });

    // Keep process alive
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down worker...');
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down worker...');
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start worker:', error);
    process.exit(1);
  }
}

// Start the worker
startWorker();
