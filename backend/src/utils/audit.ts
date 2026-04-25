import { Request, Response, NextFunction } from 'express';
import AuditService, { AuditRecord } from '../services/auditService';
import { logger } from './logger';

export const auditService = new AuditService();

/**
 * Middleware for automatic auditing of requests
 */
export const auditMiddleware = (action: string, category: AuditRecord['category'] = 'system_event') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    
    // Override res.send to capture outcome
    res.send = function(body: any): Response {
      const outcome = res.statusCode >= 200 && res.statusCode < 300 ? 'success' : 'failure';
      
      const record: Omit<AuditRecord, 'id' | 'timestamp' | 'signature'> = {
        category,
        action: action || `${req.method} ${req.originalUrl}`,
        actor: {
          userId: (req as any).user?.id || 'anonymous',
          publicKey: (req as any).user?.publicKey,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent'),
        },
        resource: {
          type: req.originalUrl.split('/')[1] || 'api',
          id: req.params.id || req.body.id,
          metadata: {
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
          }
        },
        outcome,
        riskLevel: res.statusCode >= 500 ? 'high' : 'low',
        complianceTags: [],
        details: {
          requestBody: req.body,
          responseBody: body ? (typeof body === 'string' ? JSON.parse(body) : body) : null
        }
      };

      auditService.log(record).catch(err => {
        logger.error('Failed to log audit record in middleware:', err);
      });

      return originalSend.call(this, body);
    };

    next();
  };
};

/**
 * Explicitly log an audit event
 */
export const logAudit = async (record: Omit<AuditRecord, 'id' | 'timestamp' | 'signature'>): Promise<string | undefined> => {
  try {
    return await auditService.log(record);
  } catch (err: any) {
    logger.error('Manual audit log failed:', err);
    return undefined;
  }
};
