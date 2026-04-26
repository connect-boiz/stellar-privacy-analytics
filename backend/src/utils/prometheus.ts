import { register, Counter, Histogram, Gauge } from 'prom-client';

// Create a Registry which registers the metrics
const promClient = {
  register,
  Counter,
  Histogram,
  Gauge
};

// Create metrics for rate limiting
export const rateLimitMetrics = {
  requestsTotal: new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code']
  }),
  
  requestDuration: new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route'],
    buckets: [0.1, 0.5, 1, 2, 5, 10]
  }),
  
  activeConnections: new Gauge({
    name: 'active_connections',
    help: 'Number of active connections'
  })
};

// Register all metrics
register.registerMetric(rateLimitMetrics.requestsTotal);
register.registerMetric(rateLimitMetrics.requestDuration);
register.registerMetric(rateLimitMetrics.activeConnections);

export { promClient };
export default promClient;
