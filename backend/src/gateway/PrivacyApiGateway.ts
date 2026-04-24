import express, { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { PrivacyPolicyEngine } from './PrivacyPolicyEngine';
import { ABACService } from './ABACService';
import { APIKeyManager } from './APIKeyManager';
import { RequestTransformer } from './RequestTransformer';
import { PrivacyMetrics } from './PrivacyMetrics';
import { LoadBalancer } from './LoadBalancer';
import { logger } from '../utils/logger';

export interface GatewayConfig {
  services: ServiceConfig[];
  policies: PolicyConfig[];
  rateLimiting: RateLimitConfig;
  loadBalancing: LoadBalancingConfig;
  metrics: MetricsConfig;
}

export interface ServiceConfig {
  id: string;
  name: string;
  baseUrl: string;
  healthCheckPath?: string;
  privacyRequirements: {
    minPrivacyLevel: string;
    dataClassification: string;
    encryptionRequired: boolean;
    auditRequired: boolean;
  };
  routes: RouteConfig[];
}

export interface RouteConfig {
  path: string;
  methods: string[];
  privacyLevel: string;
  requiresAuth: boolean;
  rateLimitOverride?: {
    windowMs: number;
    maxRequests: number;
  };
  transformationRules?: TransformationRule[];
}

export interface PolicyConfig {
  id: string;
  name: string;
  rules: PolicyRule[];
  priority: number;
  enabled: boolean;
}

export interface PolicyRule {
  attribute: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex';
  value: string;
  action: 'allow' | 'deny' | 'transform' | 'log';
  transformation?: TransformationRule;
}

export interface TransformationRule {
  type: 'mask' | 'encrypt' | 'hash' | 'remove' | 'pseudonymize';
  field: string;
  algorithm?: string;
  parameters?: Record<string, any>;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
}

export interface LoadBalancingConfig {
  strategy: 'round-robin' | 'least-connections' | 'weighted' | 'random';
  healthCheckInterval: number;
  unhealthyThreshold: number;
  healthyThreshold: number;
}

export interface MetricsConfig {
  enabled: boolean;
  collectionInterval: number;
  retentionPeriod: number;
  exportFormat: 'prometheus' | 'json' | 'csv';
}

export class PrivacyApiGateway {
  private app: express.Application;
  private config: GatewayConfig;
  private policyEngine: PrivacyPolicyEngine;
  private abacService: ABACService;
  private apiKeyManager: APIKeyManager;
  private requestTransformer: RequestTransformer;
  private privacyMetrics: PrivacyMetrics;
  private loadBalancer: LoadBalancer;
  private rateLimiters: Map<string, RateLimiterMemory>;

  constructor(config: GatewayConfig) {
    this.app = express();
    this.config = config;
    this.rateLimiters = new Map();
    
    // Initialize core components
    this.policyEngine = new PrivacyPolicyEngine(config.policies);
    this.abacService = new ABACService();
    this.apiKeyManager = new APIKeyManager();
    this.requestTransformer = new RequestTransformer();
    this.privacyMetrics = new PrivacyMetrics(config.metrics);
    this.loadBalancer = new LoadBalancer(config.loadBalancing, config.services);
    
    this.setupMiddleware();
    this.setupRoutes();
    this.initializeRateLimiters();
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Custom middleware for privacy enforcement
    this.app.use(this.privacyEnforcementMiddleware.bind(this));
    this.app.use(this.abacMiddleware.bind(this));
    this.app.use(this.metricsMiddleware.bind(this));
  }

  private setupRoutes(): void {
    // Gateway management endpoints
    this.app.get('/gateway/health', this.healthCheck.bind(this));
    this.app.get('/gateway/metrics', this.getMetrics.bind(this));
    this.app.get('/gateway/policies', this.getPolicies.bind(this));
    this.app.post('/gateway/policies', this.updatePolicy.bind(this));
    this.app.get('/gateway/services', this.getServices.bind(this));
    
    // Setup proxy routes for each service
    this.config.services.forEach(service => {
      this.setupServiceProxy(service);
    });
  }

  private setupServiceProxy(service: ServiceConfig): void {
    const proxy = createProxyMiddleware({
      target: service.baseUrl,
      changeOrigin: true,
      pathRewrite: (path, req) => {
        // Remove gateway prefix and preserve the rest
        return path.replace(`/gateway/${service.id}`, '');
      },
      onProxyReq: (proxyReq, req, res) => {
        // Add privacy headers
        proxyReq.setHeader('X-Gateway-Privacy-Level', (req as any).privacyLevel);
        proxyReq.setHeader('X-Gateway-User-Attributes', JSON.stringify((req as any).userAttributes));
        proxyReq.setHeader('X-Gateway-Request-ID', (req as any).requestId);
      },
      onProxyRes: (proxyRes, req, res) => {
        // Log response for audit
        this.privacyMetrics.recordResponse(req as any, proxyRes);
      },
      onError: (err, req, res) => {
        logger.error('Proxy error:', err);
        res.status(502).json({
          error: 'Service Unavailable',
          message: 'Backend service is currently unavailable',
          service: service.name
        });
      }
    });

    // Apply rate limiting and privacy checks to each route
    service.routes.forEach(route => {
      const routePath = `/gateway/${service.id}${route.path}`;
      
      // Create route-specific middleware chain
      const middlewareChain = [];
      
      // Add custom rate limiting if specified
      if (route.rateLimitOverride) {
        const limiter = new RateLimiterMemory({
          keyGenerator: (req) => `${req.ip}:${(req as any).apiKey}`,
          points: route.rateLimitOverride.maxRequests,
          duration: route.rateLimitOverride.windowMs / 1000,
        });
        middlewareChain.push(this.createRateLimitMiddleware(limiter));
      }
      
      // Add authentication middleware if required
      if (route.requiresAuth) {
        middlewareChain.push(this.authMiddleware.bind(this));
      }
      
      // Add privacy transformation middleware
      if (route.transformationRules && route.transformationRules.length > 0) {
        middlewareChain.push(this.createTransformationMiddleware(route.transformationRules));
      }
      
      // Apply middleware and proxy
      this.app.use(routePath, ...middlewareChain, proxy);
    });
  }

  private async privacyEnforcementMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Generate unique request ID
      (req as any).requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      
      // Extract privacy context
      const privacyLevel = req.headers['x-privacy-level'] as string || 'high';
      const userAttributes = await this.extractUserAttributes(req);
      
      (req as any).privacyLevel = privacyLevel;
      (req as any).userAttributes = userAttributes;
      
      // Apply privacy policies
      const policyResult = await this.policyEngine.evaluateRequest(req, privacyLevel, userAttributes);
      
      if (!policyResult.allowed) {
        res.status(403).json({
          error: 'Privacy Policy Violation',
          message: policyResult.reason,
          policyId: policyResult.policyId
        });
        return;
      }
      
      // Apply transformations if required
      if (policyResult.transformations && policyResult.transformations.length > 0) {
        await this.requestTransformer.applyRequestTransformations(req, policyResult.transformations);
      }
      
      next();
    } catch (error) {
      logger.error('Privacy enforcement error:', error);
      res.status(500).json({
        error: 'Privacy Enforcement Failed',
        message: 'Unable to enforce privacy policies'
      });
    }
  }

  private async abacMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userAttributes = (req as any).userAttributes;
      const resource = {
        path: req.path,
        method: req.method,
        service: this.extractServiceFromPath(req.path)
      };
      
      const accessDecision = await this.abacService.evaluateAccess(userAttributes, resource);
      
      if (!accessDecision.allowed) {
        res.status(403).json({
          error: 'Access Denied',
          message: accessDecision.reason,
          policy: accessDecision.policy
        });
        return;
      }
      
      // Add context for downstream services
      (req as any).accessContext = accessDecision.context;
      next();
    } catch (error) {
      logger.error('ABAC evaluation error:', error);
      res.status(500).json({
        error: 'Access Control Failed',
        message: 'Unable to evaluate access permissions'
      });
    }
  }

  private async authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const apiKey = req.headers['x-api-key'] as string;
      
      if (!apiKey) {
        res.status(401).json({
          error: 'Authentication Required',
          message: 'API key is required for this endpoint'
        });
        return;
      }
      
      const keyValidation = await this.apiKeyManager.validateKey(apiKey);
      
      if (!keyValidation.valid) {
        res.status(401).json({
          error: 'Invalid API Key',
          message: keyValidation.reason
        });
        return;
      }
      
      (req as any).apiKey = apiKey;
      (req as any).apiKeyInfo = keyValidation.keyInfo;
      next();
    } catch (error) {
      logger.error('Authentication error:', error);
      res.status(500).json({
        error: 'Authentication Failed',
        message: 'Unable to validate credentials'
      });
    }
  }

  private metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      this.privacyMetrics.recordRequest(req as any, res, duration);
    });
    
    next();
  }

  private createRateLimitMiddleware(limiter: RateLimiterMemory) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const key = `${req.ip}:${(req as any).apiKey || 'anonymous'}`;
        await limiter.consume(key);
        next();
      } catch (rejRes: any) {
        const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
        res.set('Retry-After', String(secs));
        res.status(429).json({
          error: 'Rate Limit Exceeded',
          message: `Too many requests. Try again in ${secs} seconds.`,
          retryAfter: secs
        });
      }
    };
  }

  private createTransformationMiddleware(rules: TransformationRule[]) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        await this.requestTransformer.applyRequestTransformations(req, rules);
        next();
      } catch (error) {
        logger.error('Transformation error:', error);
        res.status(500).json({
          error: 'Data Transformation Failed',
          message: 'Unable to apply privacy transformations'
        });
      }
    };
  }

  private async extractUserAttributes(req: Request): Promise<Record<string, any>> {
    const attributes: Record<string, any> = {};
    
    // Extract from JWT token if present
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        // In a real implementation, decode and verify JWT
        const token = authHeader.substring(7);
        // attributes.userId = decodedToken.sub;
        // attributes.roles = decodedToken.roles;
        // attributes.department = decodedToken.department;
        attributes.userId = 'demo-user';
        attributes.roles = ['analyst'];
        attributes.department = 'data-analytics';
      } catch (error) {
        logger.warn('Failed to decode JWT token:', error);
      }
    }
    
    // Extract from API key if present
    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey) {
      const keyInfo = await this.apiKeyManager.getKeyInfo(apiKey);
      if (keyInfo) {
        attributes.apiKeyId = keyInfo.id;
        attributes.apiKeyPermissions = keyInfo.permissions;
        attributes.apiKeyOwner = keyInfo.owner;
      }
    }
    
    // Extract from headers
    attributes.ipAddress = req.ip;
    attributes.userAgent = req.headers['user-agent'];
    attributes.privacyLevel = req.headers['x-privacy-level'] || 'high';
    
    return attributes;
  }

  private extractServiceFromPath(path: string): string {
    const match = path.match(/\/gateway\/([^\/]+)/);
    return match ? match[1] : 'unknown';
  }

  private initializeRateLimiters(): void {
    this.config.services.forEach(service => {
      service.routes.forEach(route => {
        if (route.rateLimitOverride) {
          const key = `${service.id}:${route.path}`;
          this.rateLimiters.set(key, new RateLimiterMemory({
            points: route.rateLimitOverride.maxRequests,
            duration: route.rateLimitOverride.windowMs / 1000,
          }));
        }
      });
    });
  }

  // Management endpoints
  private async healthCheck(req: Request, res: Response): Promise<void> {
    const health = await this.loadBalancer.getServicesHealth();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: health
    });
  }

  private async getMetrics(req: Request, res: Response): Promise<void> {
    const metrics = await this.privacyMetrics.getMetrics();
    res.json(metrics);
  }

  private async getPolicies(req: Request, res: Response): Promise<void> {
    const policies = this.policyEngine.getPolicies();
    res.json({ policies });
  }

  private async updatePolicy(req: Request, res: Response): Promise<void> {
    try {
      const policy = req.body;
      await this.policyEngine.updatePolicy(policy);
      res.json({
        message: 'Policy updated successfully',
        policyId: policy.id
      });
    } catch (error) {
      res.status(400).json({
        error: 'Policy Update Failed',
        message: error.message
      });
    }
  }

  private async getServices(req: Request, res: Response): Promise<void> {
    const services = this.config.services.map(service => ({
      id: service.id,
      name: service.name,
      baseUrl: service.baseUrl,
      status: 'active', // In real implementation, check health
      privacyRequirements: service.privacyRequirements
    }));
    res.json({ services });
  }

  public getApp(): express.Application {
    return this.app;
  }

  public async start(port: number): Promise<void> {
    await this.privacyMetrics.start();
    await this.loadBalancer.start();
    
    this.app.listen(port, () => {
      logger.info(`🚀 Privacy API Gateway running on port ${port}`);
      logger.info(`📊 Privacy metrics enabled: ${this.config.metrics.enabled}`);
      logger.info(`🔒 ABAC enforcement enabled: true`);
      logger.info(`⚖️ Policy engine active with ${this.config.policies.length} policies`);
    });
  }

  public async stop(): Promise<void> {
    await this.privacyMetrics.stop();
    await this.loadBalancer.stop();
  }
}
