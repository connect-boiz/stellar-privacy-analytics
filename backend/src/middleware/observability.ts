import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from './stellarAuth';

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startTime: number;
  tags: Record<string, string>;
  logs: Array<{
    timestamp: number;
    level: string;
    message: string;
    fields?: Record<string, any>;
  }>;
}

export interface ObservabilityConfig {
  serviceName: string;
  serviceVersion: string;
  environment: string;
  enableTracing: boolean;
  enableMetrics: boolean;
  sampleRate: number; // 0.0 to 1.0
}

export class ObservabilityMiddleware {
  private config: ObservabilityConfig;
  private activeTraces: Map<string, TraceContext> = new Map();

  constructor(config: Partial<ObservabilityConfig> = {}) {
    this.config = {
      serviceName: 'stellar-pql-api',
      serviceVersion: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      enableTracing: true,
      enableMetrics: true,
      sampleRate: 1.0, // Sample all requests in development
      ...config
    };
  }

  /**
   * Main observability middleware
   */
  observe = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    // Generate trace ID and span ID
    const traceId = this.generateTraceId();
    const spanId = this.generateSpanId();
    
    // Check if we should sample this request
    const shouldSample = this.shouldSampleRequest(req);
    
    // Create trace context
    const traceContext: TraceContext = {
      traceId,
      spanId,
      startTime: Date.now(),
      tags: {
        'service.name': this.config.serviceName,
        'service.version': this.config.serviceVersion,
        'http.method': req.method,
        'http.url': req.originalUrl,
        'http.user_agent': req.headers['user-agent'] || 'unknown',
        'http.remote_addr': req.ip || 'unknown',
        'user.id': req.user?.id || 'anonymous',
        'user.rate_limit_tier': req.user?.rateLimitTier || 'basic'
      },
      logs: []
    };

    // Add trace context to request
    req.traceId = traceId;
    (req as any).traceContext = traceContext;

    // Store active trace
    if (shouldSample) {
      this.activeTraces.set(traceId, traceContext);
    }

    // Add trace headers to response
    res.setHeader('X-Trace-Id', traceId);
    res.setHeader('X-Span-Id', spanId);

    // Log request start
    this.logEvent(traceContext, 'info', 'Request started', {
      method: req.method,
      url: req.originalUrl,
      userAgent: req.headers['user-agent'],
      userId: req.user?.id
    });

    // Override res.end to capture response completion
    const originalEnd = res.end;
    res.end = (chunk?: any, encoding?: any) => {
      const duration = Date.now() - traceContext.startTime;
      
      // Update trace context with response info
      traceContext.tags['http.status_code'] = res.statusCode.toString();
      traceContext.tags['http.duration_ms'] = duration.toString();
      
      // Log request completion
      this.logEvent(traceContext, 'info', 'Request completed', {
        statusCode: res.statusCode,
        duration,
        contentLength: res.get('content-length')
      });

      // Record metrics
      if (this.config.enableMetrics) {
        this.recordMetrics(req, res, duration);
      }

      // Clean up trace
      this.activeTraces.delete(traceId);

      // Call original end
      originalEnd.call(res, chunk, encoding);
    };

    // Handle errors
    res.on('error', (error) => {
      this.logEvent(traceContext, 'error', 'Response error', {
        error: error.message
      });
    });

    next();
  };

  /**
   * Generate trace ID
   */
  private generateTraceId(): string {
    return uuidv4().replace(/-/g, '');
  }

  /**
   * Generate span ID
   */
  private generateSpanId(): string {
    return uuidv4().replace(/-/g, '').substring(0, 16);
  }

  /**
   * Determine if request should be sampled
   */
  private shouldSampleRequest(req: Request): boolean {
    if (!this.config.enableTracing) {
      return false;
    }

    // Always sample health checks and metrics endpoints
    if (req.originalUrl.includes('/health') || req.originalUrl.includes('/metrics')) {
      return false;
    }

    // Sample based on configured rate
    return Math.random() < this.config.sampleRate;
  }

  /**
   * Log event to trace context
   */
  private logEvent(
    traceContext: TraceContext,
    level: string,
    message: string,
    fields?: Record<string, any>
  ): void {
    const logEntry = {
      timestamp: Date.now(),
      level,
      message,
      fields
    };

    traceContext.logs.push(logEntry);

    // Also log to standard logger with trace context
    const logData = {
      traceId: traceContext.traceId,
      spanId: traceContext.spanId,
      ...fields
    };

    switch (level) {
      case 'error':
        logger.error(message, logData);
        break;
      case 'warn':
        logger.warn(message, logData);
        break;
      case 'info':
        logger.info(message, logData);
        break;
      case 'debug':
        logger.debug(message, logData);
        break;
      default:
        logger.info(message, logData);
    }
  }

  /**
   * Record metrics
   */
  private recordMetrics(req: Request, res: Response, duration: number): void {
    // This would integrate with your metrics system (Prometheus, etc.)
    // For now, we'll just log the metrics
    
    const metricData = {
      method: req.method,
      route: this.getRoutePattern(req),
      statusCode: res.statusCode,
      duration,
      userId: (req as AuthenticatedRequest).user?.id,
      rateLimitTier: (req as AuthenticatedRequest).user?.rateLimitTier
    };

    logger.info('Request metrics', metricData);

    // In production, you would send these to Prometheus/DataDog/etc.
    // Example:
    // this.metricsClient.increment('http_requests_total', metricData);
    // this.metricsClient.histogram('http_request_duration_ms', duration, metricData);
  }

  /**
   * Extract route pattern from request
   */
  private getRoutePattern(req: Request): string {
    // This would ideally come from your router (Express doesn't expose this easily)
    // For now, we'll use a simplified approach
    const url = req.originalUrl;
    
    // Common patterns
    if (url.includes('/query/')) return '/query/{id}';
    if (url.includes('/query')) return '/query';
    if (url.includes('/privacy/budget')) return '/privacy/budget';
    if (url.includes('/schemas')) return '/schemas';
    if (url.includes('/query/history')) return '/query/history';
    
    return url.split('?')[0]; // Remove query parameters
  }

  /**
   * Get trace context by ID
   */
  getTraceContext(traceId: string): TraceContext | undefined {
    return this.activeTraces.get(traceId);
  }

  /**
   * Add custom tag to trace
   */
  addTraceTag(traceId: string, key: string, value: string): void {
    const trace = this.activeTraces.get(traceId);
    if (trace) {
      trace.tags[key] = value;
    }
  }

  /**
   * Add custom log to trace
   */
  addTraceLog(
    traceId: string,
    level: string,
    message: string,
    fields?: Record<string, any>
  ): void {
    const trace = this.activeTraces.get(traceId);
    if (trace) {
      this.logEvent(trace, level, message, fields);
    }
  }

  /**
   * Get active traces count
   */
  getActiveTracesCount(): number {
    return this.activeTraces.size;
  }

  /**
   * Clean up old traces (prevent memory leaks)
   */
  cleanup(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [traceId, trace] of this.activeTraces.entries()) {
      if (now - trace.startTime > maxAge) {
        this.activeTraces.delete(traceId);
      }
    }
  }

  /**
   * Export trace data for external systems
   */
  exportTrace(traceId: string): object | null {
    const trace = this.activeTraces.get(traceId);
    if (!trace) {
      return null;
    }

    return {
      traceId: trace.traceId,
      spanId: trace.spanId,
      parentSpanId: trace.parentSpanId,
      startTime: trace.startTime,
      duration: Date.now() - trace.startTime,
      tags: trace.tags,
      logs: trace.logs,
      service: {
        name: this.config.serviceName,
        version: this.config.serviceVersion,
        environment: this.config.environment
      }
    };
  }

  /**
   * Get observability statistics
   */
  getStats(): {
    activeTraces: number;
    sampleRate: number;
    config: ObservabilityConfig;
  } {
    return {
      activeTraces: this.activeTraces.size,
      sampleRate: this.config.sampleRate,
      config: { ...this.config }
    };
  }
}

/**
 * Middleware factory function
 */
export function createObservability(config?: Partial<ObservabilityConfig>): ObservabilityMiddleware {
  const middleware = new ObservabilityMiddleware(config);
  
  // Set up cleanup interval
  setInterval(() => {
    middleware.cleanup();
  }, 60000); // Clean up every minute

  return middleware;
}

/**
 * Default observability middleware instance
 */
export const observability = createObservability({
  serviceName: 'stellar-pql-api',
  serviceVersion: '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  enableTracing: process.env.ENABLE_TRACING !== 'false',
  enableMetrics: process.env.ENABLE_METRICS !== 'false',
  sampleRate: parseFloat(process.env.TRACE_SAMPLE_RATE || '1.0')
});

/**
 * Helper functions for adding trace information
 */
export function addTraceTag(req: AuthenticatedRequest, key: string, value: string): void {
  if (req.traceId) {
    observability.addTraceTag(req.traceId, key, value);
  }
}

export function addTraceLog(
  req: AuthenticatedRequest,
  level: string,
  message: string,
  fields?: Record<string, any>
): void {
  if (req.traceId) {
    observability.addTraceLog(req.traceId, level, message, fields);
  }
}

/**
 * Performance monitoring decorator
 */
export function monitorPerformance(operationName: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const req = args.find(arg => arg && arg.traceId) as AuthenticatedRequest;
      const traceId = req?.traceId || 'unknown';
      
      const startTime = Date.now();
      
      if (req) {
        addTraceLog(req, 'info', `Starting ${operationName}`);
      }

      try {
        const result = await method.apply(this, args);
        const duration = Date.now() - startTime;
        
        if (req) {
          addTraceLog(req, 'info', `Completed ${operationName}`, { duration });
        }

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        if (req) {
          addTraceLog(req, 'error', `Failed ${operationName}`, {
            duration,
            error: error.message
          });
        }

        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Query execution tracer
 */
export class QueryTracer {
  constructor(private traceId: string, private observability: ObservabilityMiddleware) {}

  startStep(stepName: string): string {
    const spanId = this.observability.generateSpanId();
    
    this.observability.addTraceLog(this.traceId, 'info', `Starting ${stepName}`, {
      spanId,
      stepName
    });

    return spanId;
  }

  endStep(spanId: string, stepName: string, result?: any): void {
    this.observability.addTraceLog(this.traceId, 'info', `Completed ${stepName}`, {
      spanId,
      stepName,
      success: true,
      result: result ? 'success' : 'undefined'
    });
  }

  failStep(spanId: string, stepName: string, error: Error): void {
    this.observability.addTraceLog(this.traceId, 'error', `Failed ${stepName}`, {
      spanId,
      stepName,
      error: error.message,
      stack: error.stack
    });
  }

  addTag(key: string, value: string): void {
    this.observability.addTraceTag(this.traceId, key, value);
  }

  addLog(level: string, message: string, fields?: Record<string, any>): void {
    this.observability.addTraceLog(this.traceId, level, message, fields);
  }
}

/**
 * Create query tracer from request
 */
export function createQueryTracer(req: AuthenticatedRequest): QueryTracer | null {
  if (!req.traceId) {
    return null;
  }

  return new QueryTracer(req.traceId, observability);
}

export default {
  observability,
  createObservability,
  addTraceTag,
  addTraceLog,
  monitorPerformance,
  QueryTracer,
  createQueryTracer
};
