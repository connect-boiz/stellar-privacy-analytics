/**
 * Queue Monitoring Integration
 * Instructions and code to integrate monitoring routes into main Express app
 */

/**
 * INTEGRATION INSTRUCTIONS
 * 
 * Add this code to your main Express app (backend/src/index.ts)
 * 
 * Step 1: Import the required modules at the top of the file
 */

// Add these imports:
import { WorkerOrchestrator } from './workers/workerOrchestrator';
import { createQueueMonitoringRoutes } from './routes/queueMonitoring';
import { getWorkerConfig, validateConfig } from './config/workerConfig';

/**
 * Step 2: Initialize the worker orchestrator
 * 
 * Add this code after your Express app is created but before routes are defined
 */

// Initialize worker orchestrator
let orchestrator: WorkerOrchestrator | null = null;

async function initializeWorkerOrchestrator() {
  try {
    const config = getWorkerConfig();
    validateConfig(config);
    
    orchestrator = new WorkerOrchestrator(config);
    
    logger.info('Worker orchestrator initialized', {
      minWorkers: config.orchestrator.minWorkers,
      maxWorkers: config.orchestrator.maxWorkers,
    });
  } catch (error) {
    logger.error('Failed to initialize worker orchestrator:', error);
    // Decide if you want to fail startup or continue without orchestrator
    // throw error; // Uncomment to fail startup
  }
}

// Call during app initialization
initializeWorkerOrchestrator();

/**
 * Step 3: Add monitoring routes
 * 
 * Add this code where you define your other routes
 */

// Queue monitoring routes (only if orchestrator is initialized)
if (orchestrator) {
  const { router: queueMonitoringRouter } = createQueueMonitoringRoutes(orchestrator);
  app.use('/api/v1/queue', queueMonitoringRouter);
  logger.info('Queue monitoring routes registered at /api/v1/queue');
} else {
  logger.warn('Queue monitoring routes not registered - orchestrator not initialized');
}

/**
 * Step 4: Graceful shutdown
 * 
 * Add this code to handle graceful shutdown
 */

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  
  // Close orchestrator if it exists
  if (orchestrator) {
    try {
      // The orchestrator has its own shutdown handler
      // Just give it time to clean up
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
      logger.error('Error during orchestrator shutdown:', error);
    }
  }
  
  // Close server
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  
  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
});

/**
 * COMPLETE EXAMPLE
 * 
 * Here's how your index.ts should look with all integrations:
 */

/*
import express from 'express';
import { createServer } from 'http';
import { WorkerOrchestrator } from './workers/workerOrchestrator';
import { createQueueMonitoringRoutes } from './routes/queueMonitoring';
import { getWorkerConfig, validateConfig } from './config/workerConfig';
import { logger } from './utils/logger';

const app = express();
const server = createServer(app);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize worker orchestrator
let orchestrator: WorkerOrchestrator | null = null;

async function initializeWorkerOrchestrator() {
  try {
    const config = getWorkerConfig();
    validateConfig(config);
    orchestrator = new WorkerOrchestrator(config);
    logger.info('Worker orchestrator initialized');
  } catch (error) {
    logger.error('Failed to initialize worker orchestrator:', error);
  }
}

// Initialize on startup
initializeWorkerOrchestrator();

// Your existing routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
// ... other routes ...

// Queue monitoring routes
if (orchestrator) {
  const { router: queueMonitoringRouter } = createQueueMonitoringRoutes(orchestrator);
  app.use('/api/v1/queue', queueMonitoringRouter);
  logger.info('Queue monitoring routes registered');
}

// Error handling middleware
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');
  if (orchestrator) {
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 30000);
});
*/

/**
 * ALTERNATIVE: Run Orchestrator as Separate Process
 * 
 * If you prefer to run the orchestrator as a separate process:
 * 
 * 1. Don't integrate it into the main app
 * 2. Run it separately: npm run orchestrator
 * 3. The monitoring routes will need to connect to the orchestrator via IPC or HTTP
 * 
 * This approach is better for:
 * - Microservices architecture
 * - Independent scaling
 * - Fault isolation
 * 
 * But requires:
 * - Inter-process communication
 * - Service discovery
 * - More complex deployment
 */

export {};
