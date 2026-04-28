import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Middleware to monitor and log CORS-related events
 */
export const corsMonitor = (req: Request, res: Response, next: NextFunction) => {
  const origin = req.get('Origin');
  const method = req.method;

  // Log preflight requests
  if (method === 'OPTIONS') {
    logger.debug(`CORS Preflight request: ${req.url} from origin: ${origin}`);
  }

  // Intercept the finish event to log successful CORS headers
  res.on('finish', () => {
    const acao = res.get('Access-Control-Allow-Origin');
    
    if (origin && !acao && res.statusCode !== 404) {
      logger.warn(`Potential CORS failure: Origin ${origin} requested but no Access-Control-Allow-Origin header was sent. Status: ${res.statusCode}`);
      
      // Here you could integrate with an alerting system like Sentry or PagerDuty
      if (process.env.NODE_ENV === 'production') {
        // Example: sendAlert('CORS_FAILURE', { origin, url: req.url, statusCode: res.statusCode });
      }
    }
  });

  next();
};

/**
 * Enhanced error handler for CORS errors specifically
 */
export const corsErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.message === 'Not allowed by CORS') {
    logger.error(`CORS Access Denied: ${req.get('Origin')} -> ${req.url}`);
    
    return res.status(403).json({
      error: 'CORS Access Denied',
      message: 'The request origin is not allowed to access this resource.',
      origin: req.get('Origin'),
      timestamp: new Date().toISOString()
    });
  }
  
  next(err);
};
