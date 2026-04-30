#!/usr/bin/env ts-node
/**
 * Worker Orchestrator Entry Point
 * Starts the worker orchestrator for horizontal scaling
 */

import '../config/env';
import { WorkerOrchestrator } from './workerOrchestrator';
import { getWorkerConfig, validateConfig } from '../config/workerConfig';
import { logger } from '../utils/logger';

async function startOrchestrator() {
  try {
    logger.info('Starting worker orchestrator...');

    // Get and validate configuration
    const config = getWorkerConfig();
    validateConfig(config);

    // Create orchestrator instance
    const orchestrator = new WorkerOrchestrator(config);

    logger.info('Worker orchestrator started successfully', {
      minWorkers: config.orchestrator.minWorkers,
      maxWorkers: config.orchestrator.maxWorkers,
      horizontalScaling: config.orchestrator.enableHorizontalScaling,
      environment: process.env.NODE_ENV,
    });

    // Keep process alive
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down orchestrator...');
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down orchestrator...');
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start orchestrator:', error);
    process.exit(1);
  }
}

// Start the orchestrator
startOrchestrator();
