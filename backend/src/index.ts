import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer } from 'http';

// Import routes and middleware
import { authRoutes } from './routes/auth';
import { analyticsRoutes } from './routes/analytics';
import { dataRoutes } from './routes/data';
import { privacyRoutes } from './routes/privacy';
import { queryRoutes } from './routes/query';
import ipfsRoutes from './routes/ipfs';
import hsmRoutes from './routes/hsm';
import { mpcRoutes } from './routes/mpc';
import { auditRoutes } from './routes/audit';
import serviceDiscoveryRoutes, { initializeServiceDiscovery } from './routes/serviceDiscovery';

import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { privacyMiddleware } from './middleware/privacy';
import { metricsMiddleware } from './middleware/metrics';
import { logger } from './utils/logger';

// Import HSM integration
import { getHSMIntegration } from './services/hsmIntegration';

// Import workers
import { StellarTransactionWatcher } from './workers/StellarTransactionWatcher';
import { privacyBudgetRoutes } from './routes/privacy-budget';

// Import Service Discovery
import { ServiceDiscovery } from './services/ServiceDiscovery';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Privacy-Level'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// General middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Custom middleware
app.use(requestLogger);
app.use(metricsMiddleware);
app.use(privacyMiddleware);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  });
});

// API routes
const apiRouter = express.Router();
apiRouter.use('/auth', authRoutes);
apiRouter.use('/analytics', analyticsRoutes);
apiRouter.use('/data', dataRoutes);
apiRouter.use('/privacy', privacyRoutes);
apiRouter.use('/privacy/budget', privacyBudgetRoutes);
apiRouter.use('/query', queryRoutes);
apiRouter.use('/ipfs', ipfsRoutes);
apiRouter.use('/hsm', hsmRoutes);
apiRouter.use('/mpc', mpcRoutes);
apiRouter.use('/audit', auditRoutes);
apiRouter.use('/service-discovery', serviceDiscoveryRoutes);

app.use('/api/v1', apiRouter);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start server
const PORT = process.env.API_PORT || 3001;
const HOST = process.env.API_HOST || 'localhost';

// Initialize HSM and Stellar Watcher integration before starting server
async function initializeServices() {
  try {
    // Initialize Service Discovery
    const serviceDiscovery = new ServiceDiscovery({
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      autoRegister: true,
      enableFailover: true,
      enableMonitoring: true,
      healthCheckInterval: 30000,
      serviceMesh: {
        requestTimeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000,
        enableLoadBalancing: true,
        enableCircuitBreaker: true,
        enableMetrics: true
      }
    });

    // Initialize service discovery with current service info
    await serviceDiscovery.initialize({
      name: 'stellar-backend',
      host: process.env.SERVICE_HOST || 'localhost',
      port: parseInt(process.env.API_PORT || '3001'),
      version: '1.0.0',
      weight: 1,
      tags: ['api', 'backend', 'privacy'],
      metadata: {
        environment: process.env.NODE_ENV || 'development',
        region: process.env.AWS_REGION || 'us-east-1'
      }
    });

    // Initialize service discovery routes
    initializeServiceDiscovery(serviceDiscovery);

    logger.info('Service Discovery initialized successfully');

    const hsmIntegration = getHSMIntegration({
      autoInitializeMasterKey: true,
      enableAutoRecovery: false,
      auditRetentionDays: 90
    });

    await hsmIntegration.initialize();
    logger.info('HSM integration initialized successfully');

    // Initialize Stellar Transaction Watcher
    const stellarWatcher = new StellarTransactionWatcher(
      process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org',
      process.env.REDIS_URL || 'redis://localhost:6379',
      process.env.SOROBAN_CONTRACT_ID || 'CC...DEFAULT_CONTRACT_ID',
      process.env.WEBHOOK_URLS ? process.env.WEBHOOK_URLS.split(',') : []
    );
    
    // Start watcher in background
    stellarWatcher.start().catch(err => {
      logger.error('Failed to start Stellar Watcher:', err);
    });

  } catch (error) {
    logger.error('Failed to initialize services:', error);
    // Continue without HSM for development, but fail in production
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      logger.warn('Continuing with limited services in development mode');
    }
  }
}


// Start server after services are initialized
initializeServices().then(() => {
  server.listen(PORT, () => {
    logger.info(`🚀 Stellar API Server running on http://${HOST}:${PORT}`);
    logger.info(`📊 Metrics available on port ${process.env.METRICS_PORT || 9090}`);
    logger.info(`🔒 Privacy-first mode: ${process.env.PRIVACY_MODE || 'enabled'}`);
    logger.info(`🔐 HSM integration: ${getHSMIntegration().isInitialized() ? 'enabled' : 'disabled'}`);
  });
}).catch((error) => {
  logger.error('Failed to initialize services:', error);
  process.exit(1);
});

export default app;
