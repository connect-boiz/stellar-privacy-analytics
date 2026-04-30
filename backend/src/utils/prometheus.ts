import * as promClient from 'prom-client';
import { register, Counter, Histogram, Gauge } from 'prom-client';

export { promClient };

// Create a registry for our metrics
export const prometheusRegister = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({ register: prometheusRegister });

// Custom metrics for service discovery
export const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  registers: [prometheusRegister],
});

export const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [prometheusRegister],
});

export const activeConnections = new promClient.Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  registers: [prometheusRegister],
});

export const databaseConnections = new promClient.Gauge({
  name: 'database_connections',
  help: 'Number of database connections',
  registers: [prometheusRegister],
});

export const cacheHitRate = new promClient.Gauge({
  name: 'cache_hit_rate',
  help: 'Cache hit rate',
  registers: [prometheusRegister],
});

// Create metrics for rate limiting
export const rateLimitMetrics = {
  requestsTotal: new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [prometheusRegister]
  }),
  
  requestDuration: new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route'],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
    registers: [prometheusRegister]
  }),
  
  activeConnections: new Gauge({
    name: 'active_connections',
    help: 'Number of active connections',
    registers: [prometheusRegister]
  })
};

// Service discovery specific metrics
export const serviceDiscoveryMetrics = {
  serviceUp: new Gauge({
    name: 'stellar_service_up',
    help: 'Service availability status',
    labelNames: ['service_name', 'instance_id'],
    registers: [prometheusRegister]
  }),
  
  serviceResponseTime: new Histogram({
    name: 'stellar_service_response_time_seconds',
    help: 'Service response time in seconds',
    labelNames: ['service_name', 'instance_id'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
    registers: [prometheusRegister]
  }),
  
  serviceErrorRate: new Gauge({
    name: 'stellar_service_error_rate',
    help: 'Service error rate',
    labelNames: ['service_name', 'instance_id'],
    registers: [prometheusRegister]
  }),
  
  circuitBreakerState: new Gauge({
    name: 'stellar_circuit_breaker_state',
    help: 'Circuit breaker state (0=CLOSED, 1=OPEN, 2=HALF_OPEN)',
    labelNames: ['service_name'],
    registers: [prometheusRegister]
  })
};

export default promClient;
