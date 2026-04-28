import winston from 'winston';
import { randomUUID } from 'crypto';

// Custom format for structured logging with correlation IDs
const structuredLogFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, service, correlationId, userId, traceId, ...meta }) => {
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      service: service || 'stellar-api',
      correlationId: correlationId || randomUUID().substring(0, 8),
      ...meta
    };

    // Add user context if available
    if (userId) logEntry.userId = userId;
    if (traceId) logEntry.traceId = traceId;

    return JSON.stringify(logEntry);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, correlationId, userId, traceId, ...meta }) => {
    let logMessage = `${timestamp} [${level}]`;
    
    if (correlationId) logMessage += ` [${correlationId}]`;
    if (traceId) logMessage += ` [${traceId}]`;
    if (userId) logMessage += ` [user:${userId}]`;
    
    logMessage += `: ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      logMessage += ` ${JSON.stringify(meta)}`;
    }
    
    return logMessage;
  })
);

// Create the main logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: structuredLogFormat,
  defaultMeta: { 
    service: 'stellar-api',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Error log file
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    
    // Combined log file
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      format: structuredLogFormat
    }),
    
    // Audit log for security events
    new winston.transports.File({
      filename: 'logs/audit.log',
      level: 'info',
      maxsize: 10485760, // 10MB
      maxFiles: 20,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format((info) => {
          // Only log audit-related events
          return info.category === 'audit' || info.type === 'security' ? info : false;
        })()
      )
    })
  ],
  
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: 'logs/exceptions.log',
      maxsize: 10485760,
      maxFiles: 3
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({ 
      filename: 'logs/rejections.log',
      maxsize: 10485760,
      maxFiles: 3
    })
  ]
});

// Add console transport for non-production environments
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: process.env.CONSOLE_LOG_LEVEL || 'debug'
  }));
}

// Enhanced logging methods with context
export const createChildLogger = (context: {
  correlationId?: string;
  userId?: string;
  traceId?: string;
  module?: string;
  [key: string]: any;
}) => {
  return logger.child(context);
};

// Security event logger
export const securityLogger = logger.child({ category: 'audit', type: 'security' });

// Performance logger
export const performanceLogger = logger.child({ category: 'performance' });

// Business logic logger
export const businessLogger = logger.child({ category: 'business' });

// Request logger helper
export const logRequest = (req: any, message: string, level: string = 'info') => {
  logger.log(level, message, {
    type: 'http_request',
    method: req.method,
    url: req.url,
    userAgent: req.headers['user-agent'],
    ip: req.ip || req.connection.remoteAddress,
    traceId: req.traceId,
    userId: req.user?.id,
    correlationId: req.headers['x-correlation-id']
  });
};

// Response logger helper
export const logResponse = (req: any, res: any, duration: number) => {
  logger.info('HTTP Response', {
    type: 'http_response',
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    duration: `${duration}ms`,
    traceId: req.traceId,
    userId: req.user?.id,
    correlationId: req.headers['x-correlation-id']
  });
};

// Error logger helper
export const logError = (error: Error, context?: any) => {
  logger.error('Application Error', {
    type: 'error',
    message: error.message,
    stack: error.stack,
    ...context
  });
};

// Middleware for request logging
export const requestLoggerMiddleware = (req: any, res: any, next: any) => {
  const startTime = Date.now();
  
  // Log request
  logRequest(req, 'Incoming request');
  
  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any) {
    const duration = Date.now() - startTime;
    logResponse(req, res, duration);
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
};

export default logger;
