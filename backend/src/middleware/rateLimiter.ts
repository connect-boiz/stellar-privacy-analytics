import { Request, Response, NextFunction } from 'express';
import Redis from 'redis';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from './stellarAuth';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (req: AuthenticatedRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  onLimitReached?: (req: AuthenticatedRequest, res: Response) => void;
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

  constructor(config: {
    redis: Redis.RedisClientType;
    tierConfigs?: Partial<RateLimitTier>;
    defaultConfig?: RateLimitConfig;
  }) {
    this.redis = config.redis;
    
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
        const user = req.user;
        if (!user) {
          // If no user, use IP-based rate limiting
          await this.applyRateLimit(req, res, next, this.defaultConfig, this.ipKeyGenerator(req));
          return;
        }

        // Get configuration based on user's rate limit tier
        const config = this.getConfigForTier(user.rateLimitTier, customConfig);
        const key = this.userKeyGenerator(req, config);

        await this.applyRateLimit(req, res, next, config, key);
      } catch (error) {
        logger.error('Rate limiting error', {
          error: error.message,
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
    key: string
  ): Promise<void> {
    const now = Date.now();
    const windowStart = now - (now % config.windowMs);
    const windowEnd = windowStart + config.windowMs;
    
    // Redis key for this window
    const redisKey = `rate_limit:${key}:${windowStart}`;
    
    try {
      // Get current count
      const currentCount = await this.redis.get(redisKey);
      const count = parseInt(currentCount || '0');
      
      // Check if limit exceeded
      if (count >= config.maxRequests) {
        const ttl = await this.redis.ttl(redisKey);
        const retryAfter = Math.ceil(ttl);
        
        await this.handleRateLimitExceeded(req, res, config, {
          limit: config.maxRequests,
          remaining: 0,
          reset: windowEnd,
          retryAfter
        });
        return;
      }

      // Increment counter
      const newCount = await this.redis.incr(redisKey);
      
      // Set expiry if this is the first request in the window
      if (newCount === 1) {
        await this.redis.expire(redisKey, Math.ceil(config.windowMs / 1000));
      }

      const remaining = Math.max(0, config.maxRequests - newCount);
      
      // Add rate limit headers
      this.addRateLimitHeaders(res, {
        limit: config.maxRequests,
        remaining,
        reset: windowEnd
      });

      // Call onLimitReached callback if approaching limit
      if (remaining === 0 && config.onLimitReached) {
        config.onLimitReached(req, res);
      }

      next();
    } catch (error) {
      logger.error('Redis rate limiting error', {
        error: error.message,
        redisKey,
        traceId: req.traceId
      });
      
      // Fail open - allow request but log error
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
      ip: req.ip,
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
   * Generate rate limit key for users
   */
  private userKeyGenerator(req: AuthenticatedRequest, config: RateLimitConfig): string {
    if (config.keyGenerator) {
      return config.keyGenerator(req);
    }

    // Default: user ID + session ID
    const baseKey = req.user?.id || 'anonymous';
    const sessionId = req.user?.sessionId || 'no-session';
    return `user:${baseKey}:${sessionId}`;
  }

  /**
   * Generate rate limit key for IP-based limiting
   */
  private ipKeyGenerator(req: AuthenticatedRequest): string {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    return `ip:${ip}`;
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
        reset: resetTime
      };
    } catch (error) {
      logger.error('Error getting rate limit status', {
        error: error.message,
        userId,
        tier
      });

      // Return default values on error
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
        error: error.message,
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
        error: error.message
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
        error: error.message
      });
    }
  }
}

/**
 * Specialized rate limiter for PQL queries
 */
export class PQLRateLimiter extends RateLimiterMiddleware {
  constructor(redis: Redis.RedisClientType) {
    super(redis, {
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

export default RateLimiterMiddleware;
