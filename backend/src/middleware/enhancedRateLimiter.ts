import { Request, Response, NextFunction } from 'express';
import Redis from 'redis';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from './stellarAuth';
import { RateLimiterMiddleware, RateLimitConfig } from './rateLimiter';

export interface EnhancedRateLimitConfig extends RateLimitConfig {
  // Collision prevention settings
  enableCollisionDetection?: boolean;
  collisionThreshold?: number;
  
  // Advanced rate limiting features
  enableBurstProtection?: boolean;
  burstLimit?: number;
  burstWindowMs?: number;
  
  // Adaptive rate limiting
  enableAdaptiveLimiting?: boolean;
  adaptiveMultiplier?: number;
  
  // Rate limit bypass settings
  enableWhitelist?: boolean;
  whitelist?: string[];
  
  // Monitoring and alerting
  enableAlerting?: boolean;
  alertThreshold?: number;
}

export interface RateLimitMetrics {
  totalRequests: number;
  blockedRequests: number;
  bypassedRequests: number;
  averageRequestRate: number;
  peakRequestRate: number;
  collisionCount: number;
  adaptiveAdjustments: number;
}

export class EnhancedRateLimiter extends RateLimiterMiddleware {
  private collisionMap: Map<string, number> = new Map();
  private burstMap: Map<string, { count: number; lastReset: number }> = new Map();
  private adaptiveMultipliers: Map<string, number> = new Map();
  private metrics: RateLimitMetrics = {
    totalRequests: 0,
    blockedRequests: 0,
    bypassedRequests: 0,
    averageRequestRate: 0,
    peakRequestRate: 0,
    collisionCount: 0,
    adaptiveAdjustments: 0
  };

  constructor(config: {
    redis: Redis.RedisClientType;
    tierConfigs?: any;
    defaultConfig?: EnhancedRateLimitConfig;
    emergencyBypassKey?: string;
  }) {
    super(config);
    
    // Initialize enhanced features
    this.initializeEnhancedFeatures();
  }

  private initializeEnhancedFeatures(): void {
    // Clean up collision map periodically
    setInterval(() => {
      this.cleanupCollisionMap();
    }, 60000); // Every minute
    
    // Clean up burst map periodically
    setInterval(() => {
      this.cleanupBurstMap();
    }, 10000); // Every 10 seconds
  }

  /**
   * Enhanced rate limiting with collision detection and burst protection
   */
  enhancedRateLimit = (customConfig?: EnhancedRateLimitConfig) => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const config = { ...this.defaultConfig, ...customConfig } as EnhancedRateLimitConfig;
        
        // Update metrics
        this.metrics.totalRequests++;
        
        // Check whitelist first
        if (config.enableWhitelist && this.isWhitelisted(req, config.whitelist || [])) {
          this.metrics.bypassedRequests++;
          return next();
        }

        // Check for emergency bypass
        if (this.checkEmergencyBypass(req)) {
          this.metrics.bypassedRequests++;
          logger.warn('Emergency bypass used', {
            ip: (req as any).ip,
            userAgent: (req as any).get('User-Agent'),
            traceId: req.traceId
          });
          return next();
        }

        // Check custom skip function
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

        // Collision detection
        if (config.enableCollisionDetection) {
          const collisionDetected = this.detectCollision(key, config.collisionThreshold || 10);
          if (collisionDetected) {
            logger.warn('Rate limit collision detected', { key, type, tier });
            this.metrics.collisionCount++;
            
            // Apply stricter limits for potential abuse
            const stricterConfig = { ...config, maxRequests: Math.floor(config.maxRequests * 0.5) };
            await this.applyEnhancedRateLimit(req, res, next, stricterConfig, key, type, tier);
            return;
          }
        }

        // Burst protection
        if (config.enableBurstProtection) {
          const burstExceeded = this.checkBurstProtection(key, config);
          if (burstExceeded) {
            logger.warn('Burst protection triggered', { key, type, tier });
            await this.handleBurstExceeded(req, res, config);
            return;
          }
        }

        // Adaptive rate limiting
        if (config.enableAdaptiveLimiting) {
          const adaptiveConfig = this.applyAdaptiveLimiting(key, config);
          await this.applyEnhancedRateLimit(req, res, next, adaptiveConfig, key, type, tier);
        } else {
          await this.applyEnhancedRateLimit(req, res, next, config, key, type, tier);
        }

        // Check for alerting conditions
        if (config.enableAlerting && this.shouldTriggerAlert(config)) {
          await this.triggerRateLimitAlert(req, config);
        }

      } catch (error) {
        logger.error('Enhanced rate limiting error', {
          error: error instanceof Error ? error.message : String(error),
          traceId: req.traceId,
          userId: req.user?.id
        });
        
        // Fail-closed for production, fail-open for development
        if (process.env.NODE_ENV === 'production') {
          res.status(503).json({
            error: {
              code: 'RATE_LIMIT_SERVICE_UNAVAILABLE',
              message: 'Rate limiting service temporarily unavailable'
            },
            traceId: req.traceId
          });
          return;
        }
        
        next();
      }
    };
  };

  /**
   * Enhanced rate limit application with better error handling
   */
  private async applyEnhancedRateLimit(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
    config: EnhancedRateLimitConfig,
    key: string,
    type: 'user' | 'ip' | 'apikey',
    tier: 'basic' | 'premium' | 'enterprise'
  ): Promise<void> {
    // Use the parent class's applyRateLimit method with enhanced features
    await super.applyRateLimit(req, res, (error?: any) => {
      if (error) {
        this.metrics.blockedRequests++;
      } else {
        next();
      }
    }, config, key, type, tier);
  }

  /**
   * Collision detection to prevent rate limit evasion
   */
  private detectCollision(key: string, threshold: number): boolean {
    const currentCount = this.collisionMap.get(key) || 0;
    this.collisionMap.set(key, currentCount + 1);
    
    return currentCount > threshold;
  }

  /**
   * Burst protection for sudden traffic spikes
   */
  private checkBurstProtection(key: string, config: EnhancedRateLimitConfig): boolean {
    const now = Date.now();
    const burstWindow = config.burstWindowMs || 60000; // 1 minute default
    const burstLimit = config.burstLimit || Math.floor(config.maxRequests * 2);
    
    const burstData = this.burstMap.get(key);
    
    if (!burstData || now - burstData.lastReset > burstWindow) {
      this.burstMap.set(key, { count: 1, lastReset: now });
      return false;
    }
    
    burstData.count++;
    
    return burstData.count > burstLimit;
  }

  /**
   * Adaptive rate limiting based on request patterns
   */
  private applyAdaptiveLimiting(key: string, config: EnhancedRateLimitConfig): EnhancedRateLimitConfig {
    const currentMultiplier = this.adaptiveMultipliers.get(key) || 1.0;
    const adaptiveMultiplier = config.adaptiveMultiplier || 0.8;
    
    // Gradually reduce limits for high-frequency users
    const newMultiplier = Math.max(0.5, currentMultiplier * adaptiveMultiplier);
    this.adaptiveMultipliers.set(key, newMultiplier);
    
    this.metrics.adaptiveAdjustments++;
    
    return {
      ...config,
      maxRequests: Math.floor(config.maxRequests * newMultiplier)
    };
  }

  /**
   * Check if request is from whitelisted source
   */
  private isWhitelisted(req: AuthenticatedRequest, whitelist: string[]): boolean {
    const ip = (req as any).ip;
    const userAgent = (req as any).get('User-Agent');
    
    return whitelist.some(item => {
      if (item.includes('/')) {
        // CIDR notation for IP ranges
        return this.isIpInRange(ip, item);
      } else {
        // Exact match for IP or user agent
        return ip === item || userAgent === item;
      }
    });
  }

  /**
   * Check if IP is in CIDR range
   */
  private isIpInRange(ip: string, cidr: string): boolean {
    // Simplified CIDR check - in production, use proper IP range library
    const [network, prefixLength] = cidr.split('/');
    return ip.startsWith(network.split('.').slice(0, Math.floor(parseInt(prefixLength) / 8)).join('.'));
  }

  /**
   * Handle burst exceeded scenario
   */
  private async handleBurstExceeded(req: AuthenticatedRequest, res: Response, config: EnhancedRateLimitConfig): Promise<void> {
    this.metrics.blockedRequests++;
    
    logger.warn('Burst protection exceeded', {
      ip: (req as any).ip,
      traceId: req.traceId,
      burstLimit: config.burstLimit
    });

    res.status(429).json({
      error: {
        code: 'BURST_LIMIT_EXCEEDED',
        message: 'Too many requests in short time. Please slow down.',
        details: {
          burstLimit: config.burstLimit,
          burstWindowMs: config.burstWindowMs
        }
      },
      traceId: req.traceId
    });
  }

  /**
   * Check if alert should be triggered
   */
  private shouldTriggerAlert(config: EnhancedRateLimitConfig): boolean {
    const alertThreshold = config.alertThreshold || 0.8;
    const blockRate = this.metrics.blockedRequests / this.metrics.totalRequests;
    
    return blockRate > alertThreshold;
  }

  /**
   * Trigger rate limit alert
   */
  private async triggerRateLimitAlert(req: AuthenticatedRequest, config: EnhancedRateLimitConfig): Promise<void> {
    logger.error('Rate limit alert triggered', {
      metrics: this.metrics,
      config: {
        alertThreshold: config.alertThreshold,
        maxRequests: config.maxRequests
      },
      request: {
        ip: (req as any).ip,
        userAgent: (req as any).get('User-Agent'),
        traceId: req.traceId
      }
    });

    // In production, this would integrate with alerting systems
    // like PagerDuty, Slack, or custom webhook
  }

  /**
   * Clean up collision map periodically
   */
  private cleanupCollisionMap(): void {
    const now = Date.now();
    const expiryTime = 5 * 60 * 1000; // 5 minutes
    
    for (const [key, count] of this.collisionMap.entries()) {
      if (count === 0 || now - parseInt(key.split(':')[key.split(':').length - 1]) > expiryTime) {
        this.collisionMap.delete(key);
      }
    }
  }

  /**
   * Clean up burst map periodically
   */
  private cleanupBurstMap(): void {
    const now = Date.now();
    const expiryTime = 2 * 60 * 1000; // 2 minutes
    
    for (const [key, data] of this.burstMap.entries()) {
      if (now - data.lastReset > expiryTime) {
        this.burstMap.delete(key);
      }
    }
  }

  /**
   * Get comprehensive rate limiting metrics
   */
  getEnhancedMetrics(): RateLimitMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset enhanced metrics
   */
  resetEnhancedMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      blockedRequests: 0,
      bypassedRequests: 0,
      averageRequestRate: 0,
      peakRequestRate: 0,
      collisionCount: 0,
      adaptiveAdjustments: 0
    };
  }
}

/**
 * Create enhanced rate limiter factory
 */
export function createEnhancedRateLimiter(redis: Redis.RedisClientType): EnhancedRateLimiter {
  return new EnhancedRateLimiter({ redis });
}

export default EnhancedRateLimiter;
