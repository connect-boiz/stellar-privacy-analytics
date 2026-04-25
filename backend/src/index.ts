import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';

// Import rate limiting
import { initializeRedis, getRedisClient } from './config/redis';
import { createRateLimiter, createPQLRateLimiter, createAdminRateLimiter } from './middleware/rateLimiter';
import { createEnhancedRateLimiter } from './middleware/enhancedRateLimiter';
import { rateLimitMonitor } from './monitoring/rateLimitMonitor';

// Import routes and middleware
import { authRoutes } from './routes/auth';
import { analyticsRoutes } from './routes/analytics';
import { dataRoutes, initializeUploadSocket } from './routes/data';
import { privacyRoutes } from './routes/privacy';
import { queryRoutes } from './routes/query';
import ipfsRoutes from './routes/ipfs';
import hsmRoutes from './routes/hsm';
import { mpcRoutes } from './routes/mpc';
import { auditRoutes } from './routes/audit';
import { privacyNoiseRoutes } from './routes/privacy-noise';
import { zkpRoutes } from './routes/zkp';

import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { privacyMiddleware } from './middleware/privacy';
import { metricsMiddleware } from './middleware/metrics';
import { corsMonitor, corsErrorHandler } from './middleware/corsMonitor';
import { logger } from './utils/logger';

// Import services
import { getHSMIntegration } from './services/hsmIntegration';
import { MemoryMonitorService } from './services/memoryMonitorService';

// Import workers
import { StellarTransactionWatcher } from './workers/StellarTransactionWatcher';
import { privacyBudgetRoutes } from './routes/privacy-budget';
import { createGateway, startGateway } from './gateway';
import { DatabaseService } from './services/databaseService';
import { PrivacyBudgetService } from './services/privacyBudgetService';
import { PrivacyBudgetRepository } from './repositories/privacyBudgetRepository';
import { StorageService } from './services/storageService';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);

// Initialize WebSocket for upload progress
const uploadSocket = initializeUploadSocket(server);


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

// CORS monitoring
app.use(corsMonitor);

// CORS configuration
const allowedOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:3000', 'http://localhost:3001'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Privacy-Level', 
    'X-Requested-With', 
    'Accept', 
    'X-Request-Id',
    'X-Client-Version'
  ],
  exposedHeaders: ['X-Total-Count', 'X-Session-Id'],
  maxAge: 86400, // 24 hours
}));

// Rate limiting - using enhanced distributed rate limiter
let rateLimiter: any;
let pqlRateLimiter: any;
let adminRateLimiter: any;
let enhancedRateLimiter: any;

// Initialize rate limiters after Redis is connected
async function initializeRateLimiters() {
  const redisClient = getRedisClient() as any;
  
  // Create standard rate limiters
  rateLimiter = createRateLimiter(redisClient);
  pqlRateLimiter = createPQLRateLimiter(redisClient);
  adminRateLimiter = createAdminRateLimiter(redisClient);
  
  // Create enhanced rate limiter with advanced features
  enhancedRateLimiter = createEnhancedRateLimiter(redisClient);
  
  // Register rate limiters with monitoring
  rateLimitMonitor.registerRateLimiter('standard', rateLimiter);
  rateLimitMonitor.registerRateLimiter('enhanced', enhancedRateLimiter);
  rateLimitMonitor.registerRateLimiter('pql', pqlRateLimiter);
  rateLimitMonitor.registerRateLimiter('admin', adminRateLimiter);
  
  // Update stellarAuth with redis
  (stellarAuth as any).redis = redisClient;

  logger.info('Enhanced rate limiters and Auth initialized with Redis and monitoring');
}

// General middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Custom middleware
app.use(requestLogger);
app.use(metricsMiddleware);
app.use(privacyMiddleware);

// Apply enhanced rate limiting after authentication middleware
app.use('/api/v1', async (req, res, next) => {
  if (enhancedRateLimiter) {
    return enhancedRateLimiter.enhancedRateLimit({
      enableCollisionDetection: true,
      enableBurstProtection: true,
      enableAdaptiveLimiting: true,
      enableAlerting: true,
      collisionThreshold: 10,
      burstLimit: 200,
      burstWindowMs: 60000,
      alertThreshold: 0.15
    })(req, res, next);
  }
  next();
});

// Rate limiting monitoring endpoint
app.get('/api/v1/admin/rate-limit/metrics', (req, res) => {
  if (process.env.NODE_ENV === 'production' && !req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  const metrics = rateLimitMonitor.getMetricsSummary();
  res.json({
    metrics,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Rate limiting configuration endpoint
app.get('/api/v1/admin/rate-limit/config', (req, res) => {
  if (process.env.NODE_ENV === 'production' && !req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  res.json({
    config: {
      standard: {
        windowMs: 15 * 60 * 1000,
        basic: { maxRequests: 100 },
        premium: { maxRequests: 500 },
        enterprise: { maxRequests: 2000 }
      },
      enhanced: {
        collisionDetection: true,
        burstProtection: true,
        adaptiveLimiting: true,
        alerting: true
      },
      monitoring: {
        enabled: true,
        interval: 30000,
        retention: 24 * 60 * 60 * 1000
      }
    },
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  const metrics = rateLimitMonitor.getMetricsSummary();
  
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    rateLimiting: {
      enabled: true,
      type: 'enhanced',
      metrics: {
        totalRequests: metrics.current?.totalRequests || 0,
        blockedRequests: metrics.current?.blockedRequests || 0,
        blockRate: metrics.current ? (metrics.current.blockedRequests / Math.max(1, metrics.current.totalRequests)) : 0
      }
    }
  });
});

// API routes
const apiRouter = express.Router();

// Apply specialized rate limiting to different route groups
apiRouter.use('/auth', authRoutes); // Enhanced rate limiting applied above

// Analytics and Query endpoints - Enhanced PQL rate limiting with stricter controls
apiRouter.use('/analytics', enhancedRateLimiter ? enhancedRateLimiter.enhancedRateLimit({
  enableCollisionDetection: true,
  enableBurstProtection: true,
  enableAdaptiveLimiting: true,
  maxRequests: 50, // Stricter limit for analytics
  collisionThreshold: 5,
  burstLimit: 100,
  alertThreshold: 0.1
}) : (req: any, res: any, next: any) => next(), analyticsRoutes);

apiRouter.use('/query', enhancedRateLimiter ? enhancedRateLimiter.enhancedRateLimit({
  enableCollisionDetection: true,
  enableBurstProtection: true,
  enableAdaptiveLimiting: true,
  maxRequests: 30, // Very strict for queries
  collisionThreshold: 3,
  burstLimit: 50,
  alertThreshold: 0.08
}) : (req: any, res: any, next: any) => next(), queryRoutes);

apiRouter.use('/data', dataRoutes);
apiRouter.use('/privacy', privacyRoutes);
apiRouter.use('/privacy/budget', privacyBudgetRoutes);
apiRouter.use('/ipfs', ipfsRoutes);
apiRouter.use('/hsm', hsmRoutes);
apiRouter.use('/mpc', mpcRoutes);
apiRouter.use('/privacy/noise', privacyNoiseRoutes);
apiRouter.use('/zkp', zkpRoutes);


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
app.use(corsErrorHandler);
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

// Initialize services before starting server
async function initializeServices() {
  try {
    // Initialize Redis first
    await initializeRedis();
    
    // Initialize rate limiters
    await initializeRateLimiters();
    
    const hsmIntegration = getHSMIntegration({
      autoInitializeMasterKey: true,
      enableAutoRecovery: false,
      auditRetentionDays: 90
    });

    await hsmIntegration.initialize();
    logger.info('HSM integration initialized successfully');

    // Initialize Database Service
    const dbService = new DatabaseService({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'stellar_privacy',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      max: 100, // High concurrency
    });
    await dbService.healthCheck();
    logger.info('Database Service initialized');

    // Initialize Privacy Budget Service
    const budgetRepo = new PrivacyBudgetRepository(dbService);
    const budgetService = new PrivacyBudgetService(budgetRepo);
    app.set('budgetService', budgetService);

    // Initialize Storage Service
    const storageService = new StorageService(process.env.STORAGE_MASTER_KEY || 'default-master-key-32-chars-long!!!');
    app.set('storageService', storageService);

    // Start Stellar Transaction Watcher
    const stellarWatcher = new StellarTransactionWatcher(
      process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org',
      process.env.REDIS_URL || 'redis://localhost:6379',
      process.env.SOROBAN_CONTRACT_ID || 'CC...DEFAULT_CONTRACT_ID',
      process.env.WEBHOOK_URLS ? process.env.WEBHOOK_URLS.split(',') : []
    );
    
    // Start memory monitoring
    const memoryMonitor = new MemoryMonitorService();
    memoryMonitor.startMonitoring(10000); // Every 10 seconds
    
    // Start watcher in background
    stellarWatcher.start().catch(err => {
      logger.error('Failed to start Stellar Watcher:', err);
    });

  } catch (error) {
    logger.error('Failed to initialize HSM integration:', error);
    // Continue without HSM for development, but fail in production
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      logger.warn('Continuing without HSM integration in development mode');
    }
  }
}


// Start server after services are initialized
initializeServices().then(async () => {
  server.listen(PORT, async () => {
    logger.info(`🚀 Stellar API Server running on http://${HOST}:${PORT}`);
    logger.info(`📊 Metrics available on port ${process.env.METRICS_PORT || 9090}`);
    logger.info(`🔒 Privacy-first mode: ${process.env.PRIVACY_MODE || 'enabled'}`);
    logger.info(`🔐 HSM integration: ${getHSMIntegration().isInitialized() ? 'enabled' : 'disabled'}`);
    
    // Start Privacy API Gateway if enabled
    if (process.env.GATEWAY_ENABLED !== 'false') {
      const gatewayPort = parseInt(process.env.GATEWAY_PORT || '8080');
      try {
        await startGateway(gatewayPort);
        logger.info(`🌐 Privacy API Gateway running on port ${gatewayPort}`);
      } catch (error) {
        logger.error('Failed to start Privacy API Gateway:', error);
      }
    }
  });
}).catch((error) => {
  logger.error('Failed to initialize services:', error);
  process.exit(1);
});

export default app;
