import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { createHash, timingSafeEqual, randomBytes } from 'crypto';
import { RedisClientType } from 'redis';
import { Counter, Histogram } from 'prom-client';

// Auth Metrics
const authDuration = new Histogram({
  name: 'auth_validation_duration_seconds',
  help: 'Duration of authentication validation in seconds',
  labelNames: ['method', 'status']
});

const tokenCacheHits = new Counter({
  name: 'auth_token_cache_hits_total',
  help: 'Total number of auth token cache hits'
});

const tokenCacheMisses = new Counter({
  name: 'auth_token_cache_misses_total',
  help: 'Total number of auth token cache misses'
});

export interface StellarUser {
  id: string;
  email: string;
  permissions: string[];
  rateLimitTier: 'basic' | 'premium' | 'enterprise';
  organizationId?: string;
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  user?: StellarUser;
  traceId?: string;
}

export interface StellarJWTPayload {
  sub: string; // User ID
  email: string;
  permissions: string[];
  rateLimitTier: 'basic' | 'premium' | 'enterprise';
  organizationId?: string;
  sessionId: string;
  iat: number; // Issued at
  exp: number; // Expiration
  jti: string; // JWT ID
  iss: string; // Issuer (should be 'stellar-privacy')
  aud: string; // Audience (should be 'stellar-api')
}

export class StellarAuthMiddleware {
  private stellarPublicKey: string;
  private apiKeySecret: string;
  private allowedIssuers: string[];
  private allowedAudiences: string[];
  private clockSkewTolerance: number;
  private redis: RedisClientType;

  constructor(config: {
    stellarPublicKey: string;
    apiKeySecret: string;
    redis: RedisClientType;
    allowedIssuers?: string[];
    allowedAudiences?: string[];
    clockSkewTolerance?: number;
  }) {
    this.stellarPublicKey = config.stellarPublicKey;
    this.apiKeySecret = config.apiKeySecret;
    this.redis = config.redis;
    this.allowedIssuers = config.allowedIssuers || ['stellar-privacy'];
    this.allowedAudiences = config.allowedAudiences || ['stellar-api'];
    this.clockSkewTolerance = config.clockSkewTolerance || 30; // 30 seconds
  }

  /**
   * Main authentication middleware that handles both JWT and API key authentication
   */
  authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'] as string;
    const traceId = this.generateTraceId();
    
    req.traceId = traceId;

    try {
      // Try JWT authentication first
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const user = await this.authenticateJWT(token, traceId);
        req.user = user;
        
        logger.info('JWT authentication successful', {
          userId: user.id,
          traceId,
          rateLimitTier: user.rateLimitTier
        });
        
        return next();
      }

      // Try API key authentication
      if (apiKeyHeader) {
        const user = await this.authenticateApiKey(apiKeyHeader, traceId);
        req.user = user;
        
        logger.info('API key authentication successful', {
          userId: user.id,
          traceId,
          rateLimitTier: user.rateLimitTier
        });
        
        return next();
      }

      // No authentication provided
      this.sendAuthError(res, 'UNAUTHORIZED', 'Authentication required', traceId);
    } catch (error) {
      logger.error('Authentication failed', {
        error: error.message,
        traceId,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      this.sendAuthError(res, 'UNAUTHORIZED', 'Invalid authentication', traceId);
    }
  };

  /**
   * JWT authentication with Stellar signature verification
   */
  private async authenticateJWT(token: string, traceId: string): Promise<StellarUser> {
    const startTime = process.hrtime();
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const cacheKey = `auth:token:${tokenHash}`;

    try {
      // 1. Check Cache first
      const cachedUser = await this.redis.get(cacheKey);
      if (cachedUser) {
        tokenCacheHits.inc();
        const user = JSON.parse(cachedUser);
        this.recordAuthMetrics(startTime, 'jwt', 'success');
        return user;
      }

      tokenCacheMisses.inc();

      // 2. Verify JWT signature and claims
      const decoded = jwt.verify(token, this.stellarPublicKey, {
        algorithms: ['ES256'],
        issuer: this.allowedIssuers,
        audience: this.allowedAudiences,
        clockTolerance: this.clockSkewTolerance
      }) as StellarJWTPayload;

      // 3. Validate required claims
      this.validateJWTPayload(decoded);

      // 4. Check if JWT is revoked
      await this.checkJWTRevocation(decoded.jti);

      const user: StellarUser = {
        id: decoded.sub,
        email: decoded.email,
        permissions: decoded.permissions,
        rateLimitTier: decoded.rateLimitTier,
        organizationId: decoded.organizationId,
        sessionId: decoded.sessionId
      };

      // 5. Cache the result (expires when JWT expires)
      const ttl = Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
      if (ttl > 0) {
        await this.redis.setEx(cacheKey, Math.min(ttl, 3600), JSON.stringify(user)); // Max cache 1 hour
      }

      this.recordAuthMetrics(startTime, 'jwt', 'success');
      return user;
    } catch (error) {
      this.recordAuthMetrics(startTime, 'jwt', 'error');
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('JWT token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid JWT token');
      } else {
        throw error;
      }
    }
  }

  private recordAuthMetrics(startTime: [number, number], method: string, status: string): void {
    const diff = process.hrtime(startTime);
    const duration = diff[0] + diff[1] / 1e9;
    authDuration.observe({ method, status }, duration);
  }

  /**
   * API key authentication for service-to-service communication
   */
  private async authenticateApiKey(apiKey: string, traceId: string): Promise<StellarUser> {
    // API keys should be in format: stellar_api_<version>_<hash>
    const apiKeyPattern = /^stellar_api_v[0-9]+_[a-zA-Z0-9]{32,}$/;
    
    if (!apiKeyPattern.test(apiKey)) {
      throw new Error('Invalid API key format');
    }

    // Extract and verify API key hash
    const [, version, hash] = apiKey.split('_');
    const expectedHash = this.hashApiKey(apiKey.replace(`_${hash}`, ''), this.apiKeySecret);

    if (!timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash))) {
      throw new Error('Invalid API key');
    }

    // For API keys, we need to look up the associated service account
    // This would typically involve a database call or cache lookup
    const serviceAccount = await this.lookupServiceAccount(apiKey);
    
    if (!serviceAccount) {
      throw new Error('API key not found or inactive');
    }

    return {
      id: serviceAccount.id,
      email: serviceAccount.email,
      permissions: serviceAccount.permissions,
      rateLimitTier: serviceAccount.rateLimitTier,
      organizationId: serviceAccount.organizationId,
      sessionId: `api_${serviceAccount.id}`
    };
  }

  /**
   * Validate JWT payload structure and required fields
   */
  private validateJWTPayload(payload: StellarJWTPayload): void {
    const requiredFields = ['sub', 'email', 'permissions', 'rateLimitTier', 'sessionId', 'iat', 'exp', 'jti', 'iss', 'aud'];
    
    for (const field of requiredFields) {
      if (!(field in payload)) {
        throw new Error(`Missing required JWT claim: ${field}`);
      }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(payload.email)) {
      throw new Error('Invalid email format in JWT');
    }

    // Validate rate limit tier
    const validTiers = ['basic', 'premium', 'enterprise'];
    if (!validTiers.includes(payload.rateLimitTier)) {
      throw new Error('Invalid rate limit tier in JWT');
    }

    // Validate permissions array
    if (!Array.isArray(payload.permissions) || payload.permissions.length === 0) {
      throw new Error('Invalid permissions in JWT');
    }

    // Check if expiration is reasonable (not too far in the future)
    const maxExpiration = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours max
    if (payload.exp > maxExpiration) {
      throw new Error('JWT expiration too far in the future');
    }
  }

  /**
   * Check if JWT has been revoked (implement your revocation logic)
   */
  private async checkJWTRevocation(jti: string): Promise<void> {
    const isRevoked = await this.redis.get(`auth:revoked:${jti}`);
    if (isRevoked) {
      throw new Error('JWT token has been revoked');
    }
  }

  /**
   * Revoke a JWT token
   */
  async revokeToken(jti: string, expirationTimestamp: number): Promise<void> {
    const ttl = Math.max(0, expirationTimestamp - Math.floor(Date.now() / 1000));
    if (ttl > 0) {
      await this.redis.setEx(`auth:revoked:${jti}`, ttl, '1');
      logger.info('JWT token revoked', { jti });
    }
  }

  /**
   * Look up service account for API key
   */
  private async lookupServiceAccount(apiKey: string): Promise<any> {
    // This would typically query your database or cache
    // For now, we'll return a mock service account
    
    // In a real implementation, you would:
    // 1. Hash the API key and look it up in your database
    // 2. Check if the API key is active and not expired
    // 3. Return the associated service account details
    
    // Placeholder implementation
    return {
      id: 'service-account-123',
      email: 'api-service@stellar-privacy.com',
      permissions: ['read:queries', 'write:queries'],
      rateLimitTier: 'enterprise' as const,
      organizationId: 'org-123'
    };
  }

  /**
   * Hash API key for secure comparison
   */
  private hashApiKey(apiKeyPrefix: string, secret: string): string {
    return createHash('sha256')
      .update(`${apiKeyPrefix}:${secret}`)
      .digest('hex')
      .substring(0, 32);
  }

  /**
   * Generate unique trace ID for request tracking
   */
  private generateTraceId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    return `trace_${timestamp}${random}`;
  }

  /**
   * Send standardized authentication error response
   */
  private sendAuthError(res: Response, code: string, message: string, traceId: string): void {
    res.status(401).json({
      error: {
        code,
        message,
        details: {
          timestamp: new Date().toISOString(),
          traceId
        }
      },
      traceId
    });
  }

  /**
   * Middleware to check specific permissions
   */
  requirePermission = (permission: string) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
        return this.sendAuthError(res, 'UNAUTHORIZED', 'Authentication required', req.traceId || 'unknown');
      }

      if (!req.user.permissions.includes(permission)) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Insufficient permissions',
            details: {
              requiredPermission: permission,
              userPermissions: req.user.permissions,
              traceId: req.traceId
            }
          },
          traceId: req.traceId
        });
        return;
      }

      next();
    };
  };

  /**
   * Middleware to check multiple permissions (any of them)
   */
  requireAnyPermission = (permissions: string[]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
        return this.sendAuthError(res, 'UNAUTHORIZED', 'Authentication required', req.traceId || 'unknown');
      }

      const hasPermission = permissions.some(permission => req.user!.permissions.includes(permission));
      
      if (!hasPermission) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Insufficient permissions',
            details: {
              requiredPermissions: permissions,
              userPermissions: req.user.permissions,
              traceId: req.traceId
            }
          },
          traceId: req.traceId
        });
        return;
      }

      next();
    };
  };

  /**
   * Middleware to check rate limit tier
   */
  requireRateLimitTier = (minimumTier: 'basic' | 'premium' | 'enterprise') => {
    const tierHierarchy = { basic: 0, premium: 1, enterprise: 2 };
    
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
        return this.sendAuthError(res, 'UNAUTHORIZED', 'Authentication required', req.traceId || 'unknown');
      }

      const userTierLevel = tierHierarchy[req.user.rateLimitTier];
      const requiredTierLevel = tierHierarchy[minimumTier];

      if (userTierLevel < requiredTierLevel) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Insufficient rate limit tier',
            details: {
              requiredTier: minimumTier,
              userTier: req.user.rateLimitTier,
              traceId: req.traceId
            }
          },
          traceId: req.traceId
        });
        return;
      }

      next();
    };
  };

  /**
   * Middleware to validate organization access
   */
  requireOrganizationAccess = (organizationId: string) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
        return this.sendAuthError(res, 'UNAUTHORIZED', 'Authentication required', req.traceId || 'unknown');
      }

      // Users can access their own organization or if they have cross-org permissions
      const canAccess = req.user.organizationId === organizationId || 
                       req.user.permissions.includes('cross:org:access');

      if (!canAccess) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Insufficient organization access',
            details: {
              requiredOrganizationId: organizationId,
              userOrganizationId: req.user.organizationId,
              traceId: req.traceId
            }
          },
          traceId: req.traceId
        });
        return;
      }

      next();
    };
  };
}

// Factory function to create middleware instance
export function createStellarAuth(config: {
  stellarPublicKey: string;
  apiKeySecret: string;
  allowedIssuers?: string[];
  allowedAudiences?: string[];
  clockSkewTolerance?: number;
}): StellarAuthMiddleware {
  return new StellarAuthMiddleware(config);
}

// Default middleware instance using environment variables
export const stellarAuth = createStellarAuth({
  stellarPublicKey: process.env.STELLAR_PUBLIC_KEY || '',
  apiKeySecret: process.env.API_KEY_SECRET || '',
  allowedIssuers: process.env.STELLAR_ALLOWED_ISSUERS?.split(',') || ['stellar-privacy'],
  allowedAudiences: process.env.STELLAR_ALLOWED_AUDIENCES?.split(',') || ['stellar-api'],
  clockSkewTolerance: parseInt(process.env.STELLAR_CLOCK_SKEW_TOLERANCE || '30')
});

export default stellarAuth;
