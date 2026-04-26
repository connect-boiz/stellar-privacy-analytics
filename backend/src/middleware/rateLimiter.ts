import { Request, Response, NextFunction } from 'express';
import Redis from 'redis';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from './stellarAuth';
import { promClient } from '../utils/prometheus';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (req: AuthenticatedRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  onLimitReached?: (req: AuthenticatedRequest, res: Response) => void;
  skip?: (req: AuthenticatedRequest) => boolean | Promise<boolean>;
  emergencyBypassKey?: string;
}

export interface RateLimitTier {
  basic: RateLimitConfig;
  premium: RateLimitConfig;
  enterprise: RateLimitConfig;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

export class RateLimiterMiddleware {
  private redis: Redis.RedisClientType;
  private tierConfigs: RateLimitTier;
  private defaultConfig: RateLimitConfig;
  private emergencyBypassKey: string;
  private metrics: {
    rateLimitHits: promClient.Counter<'type' | 'tier' | 'identifier'>;
    rateLimitBlocks: promClient.Counter<'type' | 'tier' | 'identifier'>;
    rateLimitBypasses: promClient.Counter<'reason'>;
  };

  constructor(config: {
    redis: Redis.RedisClientType;
    tierConfigs?: Partial<RateLimitTier>;
    defaultConfig?: RateLimitConfig;
    emergencyBypassKey?: string;
  }) {
    this.redis = config.redis;
    this.emergencyBypassKey = config.emergencyBypassKey || process.env.RATE_LIMIT_EMERGENCY_BYPASS_KEY || 'emergency-bypass-2024';
    
    // Initialize metrics
    this.metrics = {
      rateLimitHits: new promClient.Counter({
        name: 'rate_limit_hits_total',
        help: 'Total number of rate limit checks',
        labelNames: ['type', 'tier', 'identifier']
      }),
      rateLimitBlocks: new promClient.Counter({
        name: 'rate_limit_blocks_total',
        help: 'Total number of rate limit blocks',
        labelNames: ['type', 'tier', 'identifier']
      }),
      rateLimitBypasses: new promClient.Counter({
        name: 'rate_limit_bypasses_total',
        help: 'Total number of rate limit bypasses',
        labelNames: ['reason']
      })
    };
    
    // Register metrics
    promClient.register.registerMetric(this.metrics.rateLimitHits);
    promClient.register.registerMetric(this.metrics.rateLimitBlocks);
    promClient.register.registerMetric(this.metrics.rateLimitBypasses);
    
    this.defaultConfig = config.defaultConfig || {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 100,
      skipSuccessfulRequests: false,
      skipFailedRequests: false
    };

    this.tierConfigs = {
      basic: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 100,
        ...config.tierConfigs?.basic
      },
      premium: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 500,
        ...config.tierConfigs?.premium
      },
      enterprise: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 2000,
        ...config.tierConfigs?.enterprise
      }
    };
  }

  /**
   * Main rate limiting middleware
   */
  rateLimit = (customConfig?: Partial<RateLimitConfig>) => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        // Check for emergency bypass
        if (this.checkEmergencyBypass(req)) {
          this.metrics.rateLimitBypasses.inc({ reason: 'emergency_key' });
          logger.warn('Emergency bypass used', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            traceId: req.traceId
          });
          return next();
        }

        // Check custom skip function
        const config = { ...this.defaultConfig, ...customConfig };
        if (config.skip && await config.skip(req)) {
          return next();
        }

        const user = req.user;
        let key: string;
        let tier: 'basic' | 'premium' | 'enterprise' = 'basic';
        let type: 'user' | 'ip' | 'apikey' = 'ip';

        if (!user) {
          // Check for API key rate limiting
          const apiKey = this.extractApiKey(req);
          if (apiKey) {
            key = this.apiKeyKeyGenerator(req, apiKey);
            type = 'apikey';
            tier = await this.getApiKeyTier(apiKey);
          } else {
            // IP-based rate limiting
            key = this.ipKeyGenerator(req);
            type = 'ip';
          }
        } else {
          // User-based rate limiting
          tier = user.rateLimitTier || 'basic';
          key = this.userKeyGenerator(req, config);
          type = 'user';
        }

        // Get configuration based on tier
        const rateLimitConfig = this.getConfigForTier(tier, customConfig);

        // Record metrics
        this.metrics.rateLimitHits.inc({ type, tier, identifier: this.sanitizeIdentifier(key) });

        await this.applyRateLimit(req, res, next, rateLimitConfig, key, type, tier);
      } catch (error) {
        logger.error('Rate limiting error', {
          error: error instanceof Error ? error.message : String(error),
          traceId: req.traceId,
          userId: req.user?.id
        });
        
        // Fail open - allow request but log error
        next();
      }
    };
  };

  /**
   * Apply rate limiting for a specific key and configuration
   */
  private async applyRateLimit(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
    config: RateLimitConfig,
    key: string,
    type: 'user' | 'ip' | 'apikey',
    tier: 'basic' | 'premium' | 'enterprise'
  ): Promise<void> {
    // Use atomic Redis operations with proper window calculation
    const now = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
    const windowSeconds = Math.ceil(config.windowMs / 1000);
    const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
    const windowEnd = windowStart + windowSeconds;
    
    // Redis key for this window with consistent naming
    const redisKey = `rate_limit:${type}:${this.sanitizeIdentifier(key)}:${windowStart}`;
    
    try {
      // Use atomic Redis script to prevent race conditions
      const luaScript = `
        local key = KEYS[1]
        local limit = tonumber(ARGV[1])
        local window = tonumber(ARGV[2])
        local current = redis.call('GET', key)
        
        if current and tonumber(current) >= limit then
          local ttl = redis.call('TTL', key)
          return {0, limit - tonumber(current), ttl}
        end
        
        local count = redis.call('INCR', key)
        if count == 1 then
          redis.call('EXPIRE', key, window)
        end
        
        local ttl = redis.call('TTL', key)
        return {1, limit - count, ttl}
      `;
      
      const result = await this.redis.eval(luaScript, {
        keys: [redisKey],
        arguments: [config.maxRequests.toString(), windowSeconds.toString()]
      });
      
      const [allowed, remaining, ttl] = result as [number, number, number];
      
      // Record metrics
      this.metrics.rateLimitHits.inc({ type, tier, identifier: this.sanitizeIdentifier(key) });
      
      if (allowed === 0) {
        // Record block metrics
        this.metrics.rateLimitBlocks.inc({ type, tier, identifier: this.sanitizeIdentifier(key) });
        
        await this.handleRateLimitExceeded(req, res, config, {
          limit: config.maxRequests,
          remaining: Math.max(0, remaining),
          reset: windowEnd * 1000, // Convert back to milliseconds
          retryAfter: ttl
        });
        return;
      }

      // Add rate limit headers
      this.addRateLimitHeaders(res, {
        limit: config.maxRequests,
        remaining: Math.max(0, remaining),
        reset: windowEnd * 1000
      });

      // Call onLimitReached callback if at limit
      if (remaining === 0 && config.onLimitReached) {
        config.onLimitReached(req, res);
      }

      next();
    } catch (error) {
      logger.error('Redis rate limiting error', {
        error: error instanceof Error ? error.message : String(error),
        redisKey,
        traceId: req.traceId
      });
      
      // Fail-closed for production, fail-open for development
      if (process.env.NODE_ENV === 'production') {
        await this.handleRateLimitExceeded(req, res, config, {
          limit: config.maxRequests,
          remaining: 0,
          reset: windowEnd * 1000,
          retryAfter: windowSeconds
        });
        return;
      }
      
      // Fail open in development
      next();
    }
  }

  /**
   * Handle rate limit exceeded
   */
  private async handleRateLimitExceeded(
    req: AuthenticatedRequest,
    res: Response,
    config: RateLimitConfig,
    info: RateLimitInfo
  ): Promise<void> {
    // Add rate limit headers
    this.addRateLimitHeaders(res, info);

    // Log rate limit violation
    logger.warn('Rate limit exceeded', {
      userId: req.user?.id,
      ip: (req as any).ip,
      traceId: req.traceId,
      limit: info.limit,
      retryAfter: info.retryAfter
    });

    // Send error response
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded. Try again later.',
        details: {
          retryAfter: info.retryAfter,
          limit: info.limit,
          reset: new Date(info.reset).toISOString()
        }
      },
      traceId: req.traceId
    });
  }

  /**
   * Add rate limit headers to response
   */
  private addRateLimitHeaders(res: Response, info: RateLimitInfo): void {
    res.setHeader('X-RateLimit-Limit', info.limit);
    res.setHeader('X-RateLimit-Remaining', info.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(info.reset / 1000));
    
    if (info.retryAfter) {
      res.setHeader('Retry-After', info.retryAfter);
    }
  }

  /**
   * Generate rate limit key for IP-based limiting with proxy support
   */
  private ipKeyGenerator(req: AuthenticatedRequest): string {
    // Check multiple headers for real IP (proxy-aware)
    const xForwardedFor = (req as any).headers['x-forwarded-for'];
    const xRealIp = (req as any).headers['x-real-ip'];
    const cfConnectingIp = (req as any).headers['cf-connecting-ip']; // Cloudflare
    const xClientIp = (req as any).headers['x-client-ip'];
    
    let ip = 'unknown';
    
    if (xForwardedFor) {
      // X-Forwarded-For can contain multiple IPs, take the first one (original client)
      ip = xForwardedFor.split(',')[0].trim();
    } else if (xRealIp) {
      ip = xRealIp;
    } else if (cfConnectingIp) {
      ip = cfConnectingIp;
    } else if (xClientIp) {
      ip = xClientIp;
    } else {
      // Fallback to direct connection IP
      ip = (req as any).ip || (req as any).connection?.remoteAddress || (req as any).socket?.remoteAddress || 'unknown';
    }
    
    // Normalize IP (remove IPv6 prefix for IPv4-mapped addresses)
    if (ip.startsWith('::ffff:')) {
      ip = ip.substring(7);
    }
    
    // Hash IP for privacy and consistency
    return this.hashString(ip);
  }

  /**
   * Generate rate limit key for users with consistent format
   */
  private userKeyGenerator(req: AuthenticatedRequest, config: RateLimitConfig): string {
    if (config.keyGenerator) {
      return config.keyGenerator(req);
    }

    // Use user ID and session for consistent identification
    const userId = req.user?.id || 'anonymous';
    const sessionId = req.user?.sessionId || 'no-session';
    const identifier = `${userId}:${sessionId}`;
    
    return this.hashString(identifier);
  }

  /**
   * Generate rate limit key for API keys with consistent format
   */
  private apiKeyKeyGenerator(req: AuthenticatedRequest, apiKey: string): string {
    return this.hashString(apiKey);
  }

  /**
   * Hash string for consistent key generation
   */
  private hashString(input: string): string {
    // Use a simple but consistent hash for key generation
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Check for emergency bypass
   */
  private checkEmergencyBypass(req: AuthenticatedRequest): boolean {
    const bypassKey = (req as any).headers['x-emergency-bypass'] as string;
    const queryBypass = (req as any).query.emergency_bypass as string;
    
    return bypassKey === this.emergencyBypassKey || queryBypass === this.emergencyBypassKey;
  }

  /**
   * Extract API key from request
   */
  private extractApiKey(req: AuthenticatedRequest): string | null {
    // Check Authorization header (Bearer token)
    const authHeader = (req as any).headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    
    // Check X-API-Key header
    const apiKeyHeader = (req as any).headers['x-api-key'] as string;
    if (apiKeyHeader) {
      return apiKeyHeader;
    }
    
    // Check query parameter
    const apiKeyQuery = (req as any).query.api_key as string;
    if (apiKeyQuery) {
      return apiKeyQuery;
    }
    
    return null;
  }

  /**
   * Sanitize identifier for metrics
   */
  private sanitizeIdentifier(identifier: string): string {
    // Remove sensitive information and limit length
    return identifier.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
  }

  /**
   * Get tier for API key (simplified - in production, look up from database)
   */
  private async getApiKeyTier(apiKey: string): Promise<'basic' | 'premium' | 'enterprise'> {
    // For now, determine tier based on API key prefix
    if (apiKey.startsWith('pk_ent_')) return 'enterprise';
    if (apiKey.startsWith('pk_prem_')) return 'premium';
    return 'basic';
  }

  /**
   * Get configuration for user's rate limit tier
   */
  private getConfigForTier(tier: 'basic' | 'premium' | 'enterprise', customConfig?: Partial<RateLimitConfig>): RateLimitConfig {
    const baseConfig = this.tierConfigs[tier] || this.defaultConfig;
    
    return {
      ...baseConfig,
      ...customConfig
    };
  }

  /**
   * Get current rate limit status for a user
   */
  async getRateLimitStatus(userId: string, tier: 'basic' | 'premium' | 'enterprise'): Promise<RateLimitInfo> {
    const config = this.getConfigForTier(tier);
    const now = Date.now();
    const windowStart = now - (now % config.windowMs);
    const windowEnd = windowStart + config.windowMs;
    const redisKey = `rate_limit:user:${userId}:*`;

    try {
      // Get all keys for current user
      const keys = await this.redis.keys(redisKey);
      
      let totalRequests = 0;
      let resetTime = windowEnd;

      for (const key of keys) {
        const count = await this.redis.get(key);
        totalRequests += parseInt(count || '0');
        
        // Find the latest reset time
        const keyWindowStart = parseInt(key.split(':')[3]) * config.windowMs;
        const keyWindowEnd = keyWindowStart + config.windowMs;
        if (keyWindowEnd > resetTime) {
          resetTime = keyWindowEnd;
        }
      }

      const remaining = Math.max(0, config.maxRequests - totalRequests);

      return {
        limit: config.maxRequests,
        remaining,
        reset: windowEnd
      };
    } catch (error) {
      logger.error('Error getting rate limit status', {
        error: error instanceof Error ? error.message : String(error),
        userId
      });
      
      return {
        limit: config.maxRequests,
        remaining: config.maxRequests,
        reset: windowEnd
      };
    }
  }

  /**
   * Reset rate limit for a user (admin function)
   */
  async resetRateLimit(userId: string): Promise<void> {
    try {
      const pattern = `rate_limit:user:${userId}:*`;
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(keys);
        logger.info('Rate limit reset for user', { userId, keysDeleted: keys.length });
      }
    } catch (error) {
      logger.error('Error resetting rate limit', {
        error: error instanceof Error ? error.message : String(error),
        userId
      });
      throw error;
    }
  }

  /**
   * Get rate limit statistics
   */
  async getRateLimitStats(): Promise<{
    totalUsers: number;
    usersByTier: Record<string, number>;
    averageUsage: number;
    topUsers: Array<{ userId: string; requests: number; tier: string }>;
  }> {
    try {
      const pattern = 'rate_limit:user:*';
      const keys = await this.redis.keys(pattern);
      
      const usersByTier: Record<string, number> = {
        basic: 0,
        premium: 0,
        enterprise: 0
      };
      
      let totalRequests = 0;
      const userRequests: Record<string, { requests: number; tier: string }> = {};

      for (const key of keys) {
        const count = await this.redis.get(key);
        const requests = parseInt(count || '0');
        totalRequests += requests;

        // Extract user ID and tier from key
        const keyParts = key.split(':');
        const userId = keyParts[2];
        
        // This is a simplified approach - in reality, you'd need to look up user tier
        const tier = 'basic'; // Default assumption
        usersByTier[tier] = (usersByTier[tier] || 0) + 1;
        
        if (!userRequests[userId]) {
          userRequests[userId] = { requests: 0, tier };
        }
        userRequests[userId].requests += requests;
      }

      // Sort users by request count
      const topUsers = Object.entries(userRequests)
        .sort(([, a], [, b]) => b.requests - a.requests)
        .slice(0, 10)
        .map(([userId, data]) => ({ userId, ...data }));

      return {
        totalUsers: Object.keys(userRequests).length,
        usersByTier,
        averageUsage: Object.keys(userRequests).length > 0 ? totalRequests / Object.keys(userRequests).length : 0,
        topUsers
      };
    } catch (error) {
      logger.error('Error getting rate limit stats', {
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        totalUsers: 0,
        usersByTier: { basic: 0, premium: 0, enterprise: 0 },
        averageUsage: 0,
        topUsers: []
      };
    }
  }

  /**
   * Clean up expired rate limit keys
   */
  async cleanup(): Promise<void> {
    try {
      const pattern = 'rate_limit:*';
      const keys = await this.redis.keys(pattern);
      let deletedCount = 0;

      for (const key of keys) {
        const ttl = await this.redis.ttl(key);
        if (ttl === -1) { // No expiry set - clean it up
          await this.redis.del(key);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        logger.info('Rate limit cleanup completed', { deletedCount });
      }
    } catch (error) {
      logger.error('Rate limit cleanup error', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

/**
 * Specialized rate limiter for PQL queries
 */
export class PQLRateLimiter extends RateLimiterMiddleware {
  constructor(redis: Redis.RedisClientType) {
    super({
      redis,
      tierConfigs: {
        basic: {
          windowMs: 15 * 60 * 1000, // 15 minutes
          maxRequests: 50, // Stricter limit for queries
        },
        premium: {
          windowMs: 15 * 60 * 1000, // 15 minutes
          maxRequests: 200,
        },
        enterprise: {
          windowMs: 15 * 60 * 1000, // 15 minutes
          maxRequests: 1000,
        }
      },
      defaultConfig: {
        windowMs: 15 * 60 * 1000,
        maxRequests: 50
      }
    });
  }

  /**
   * Rate limiter specifically for query execution
   */
  queryRateLimit = this.rateLimit();

  /**
   * Rate limiter for query validation (more lenient)
   */
  validationRateLimit = this.rateLimit({
    maxRequests: 200 // Allow more validations
  });

  /**
   * Rate limiter for schema requests (very lenient)
   */
  schemaRateLimit = this.rateLimit({
    maxRequests: 500
  });
}

/**
 * Create rate limiter middleware factory
 */
export function createRateLimiter(redis: Redis.RedisClientType): RateLimiterMiddleware {
  return new RateLimiterMiddleware({ redis });
}

/**
 * Create PQL-specific rate limiter
 */
export function createPQLRateLimiter(redis: Redis.RedisClientType): PQLRateLimiter {
  return new PQLRateLimiter(redis);
}

/**
 * Create admin rate limiter (more lenient)
 */
export function createAdminRateLimiter(redis: Redis.RedisClientType): RateLimiterMiddleware {
  return new RateLimiterMiddleware({
    redis,
    tierConfigs: {
      basic: {
        windowMs: 15 * 60 * 1000,
        maxRequests: 1000,
      },
      premium: {
        windowMs: 15 * 60 * 1000,
        maxRequests: 5000,
      },
      enterprise: {
        windowMs: 15 * 60 * 1000,
        maxRequests: 10000,
      }
    }
  });
}

export default RateLimiterMiddleware;
