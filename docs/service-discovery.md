# Service Discovery Implementation

This document describes the comprehensive service discovery solution implemented for the Stellar Privacy Analytics microservices architecture.

## Overview

The service discovery system provides:
- **Robust Service Registration**: Automatic service registration and deregistration
- **Health Monitoring**: Continuous health checks with configurable intervals
- **Service Mesh**: Intelligent load balancing and request routing
- **Circuit Breaker Pattern**: Fault tolerance and automatic recovery
- **Failover Management**: Multiple failover strategies and disaster recovery
- **Monitoring & Alerting**: Real-time metrics and alerting system

## Architecture

### Core Components

1. **ServiceRegistry**: Central registry for service instances using Redis
2. **ServiceMesh**: Inter-service communication with load balancing
3. **CircuitBreaker**: Fault tolerance with automatic recovery
4. **HealthMonitor**: Continuous health monitoring and alerting
5. **FailoverManager**: Failover strategies and disaster recovery

### Data Flow

```
Service Instance → ServiceRegistry → HealthMonitor → ServiceMesh → Target Service
                     ↓                ↓              ↓
                Redis Storage    Alerts/Events  Circuit Breaker
```

## Features

### 1. Service Registration & Discovery

Services can automatically register themselves with the registry:

```typescript
const serviceDiscovery = new ServiceDiscovery({
  redisUrl: 'redis://localhost:6379',
  autoRegister: true,
  enableFailover: true,
  enableMonitoring: true
});

await serviceDiscovery.initialize({
  name: 'my-service',
  host: 'localhost',
  port: 3000,
  version: '1.0.0',
  tags: ['api', 'microservice'],
  metadata: { region: 'us-east-1' }
});
```

### 2. Health Monitoring

Continuous health checks with configurable intervals:

```typescript
serviceDiscovery.addHealthCheck('my-service', '/health', 30000);
```

Health check endpoints should return:
- Status 200 for healthy services
- Response time < 5 seconds
- JSON format with service status

### 3. Service Mesh Communication

Inter-service communication with automatic load balancing:

```typescript
const response = await serviceDiscovery.get('user-service', '/api/users/123');
const data = await serviceDiscovery.post('order-service', '/api/orders', orderData);
```

### 4. Circuit Breaker Pattern

Automatic circuit breaking for failing services:

```typescript
// Automatically configured with default thresholds
// - Opens after 5 failures
// - Half-open after 60 seconds
// - Closes after 3 consecutive successes
```

### 5. Failover Strategies

Multiple failover strategies available:

- **Round Robin**: Distribute load evenly across backup instances
- **Weighted**: Route to instances based on weight
- **Priority**: Try backup instances in priority order
- **Geographic**: Route to instances in preferred regions

### 6. Monitoring & Metrics

Comprehensive monitoring with Prometheus metrics:

- Service availability metrics
- Response time histograms
- Error rate gauges
- Circuit breaker state tracking

## API Endpoints

### Service Management

- `POST /api/v1/service-discovery/services/register` - Register a service
- `DELETE /api/v1/service-discovery/services/:id` - Deregister a service
- `GET /api/v1/service-discovery/services/:name` - Get service instances
- `GET /api/v1/service-discovery/services` - List all services

### Health & Monitoring

- `GET /api/v1/service-discovery/health` - Get overall health status
- `GET /api/v1/service-discovery/metrics` - Get service metrics
- `GET /api/v1/service-discovery/alerts` - Get active alerts
- `GET /api/v1/service-discovery/prometheus` - Prometheus metrics endpoint

### Failover Management

- `POST /api/v1/service-discovery/failover/policies` - Add failover policy
- `POST /api/v1/service-discovery/disaster-recovery/plans` - Add disaster recovery plan
- `GET /api/v1/service-discovery/failover/status` - Get failover status
- `POST /api/v1/service-discovery/failover/manual/:service` - Manual failover

## Configuration

### Environment Variables

```env
# Service Discovery
REDIS_URL=redis://localhost:6379
SERVICE_HOST=localhost
API_PORT=3001
METRICS_PORT=9090
AWS_REGION=us-east-1

# Health Check Intervals
HEALTH_CHECK_INTERVAL=30000

# Service Mesh
REQUEST_TIMEOUT=30000
RETRY_ATTEMPTS=3
RETRY_DELAY=1000
```

### Docker Compose

The system includes comprehensive Docker Compose configuration:

```yaml
services:
  redis:
    image: redis:7-alpine
    volumes:
      - ./redis/redis.conf:/usr/local/etc/redis/redis.conf
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]

  backend:
    environment:
      - REDIS_URL=redis://redis:6379
      - SERVICE_HOST=backend
    depends_on:
      redis:
        condition: service_healthy

  service-discovery-dashboard:
    ports:
      - "3003:3000"
    depends_on:
      - backend
```

## Usage Examples

### Registering a Service

```bash
curl -X POST http://localhost:3001/api/v1/service-discovery/services/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "user-service",
    "host": "localhost",
    "port": 3002,
    "version": "1.0.0",
    "tags": ["api", "users"],
    "metadata": {"region": "us-east-1"}
  }'
```

### Getting Service Health

```bash
curl http://localhost:3001/api/v1/service-discovery/health
```

### Manual Failover

```bash
curl -X POST http://localhost:3001/api/v1/service-discovery/failover/manual/user-service
```

## Monitoring Dashboard

Access the service discovery dashboard at `http://localhost:3003`

Features:
- Real-time service status
- Health metrics and alerts
- Failover status and controls
- Performance graphs
- Service topology visualization

## Performance Optimization

### Redis Configuration

Optimized Redis settings for service discovery:

```conf
# Memory management
maxmemory 256mb
maxmemory-policy allkeys-lru

# Service discovery optimizations
notify-keyspace-events Ex
hash-max-ziplist-entries 512
list-max-ziplist-size -2
```

### Service Mesh Tuning

- Request timeout: 30 seconds
- Retry attempts: 3 with exponential backoff
- Circuit breaker thresholds: 5 failures
- Health check intervals: 30 seconds

## Security Considerations

### Network Security

- Redis authentication in production
- TLS encryption for inter-service communication
- Network segmentation for service discovery traffic

### Access Control

- API authentication for service registration
- Role-based access for failover operations
- Audit logging for all service operations

## Troubleshooting

### Common Issues

1. **Service Not Discoverable**
   - Check Redis connectivity
   - Verify service registration
   - Check health check endpoint

2. **High Error Rates**
   - Review circuit breaker status
   - Check service health
   - Verify network connectivity

3. **Failover Not Working**
   - Check failover policy configuration
   - Verify backup instances
   - Review disaster recovery plan

### Debug Commands

```bash
# Check Redis connectivity
redis-cli ping

# View registered services
redis-cli keys "service:*"

# Get service health status
curl http://localhost:3001/api/v1/service-discovery/health

# View active alerts
curl http://localhost:3001/api/v1/service-discovery/alerts
```

## Best Practices

### Service Registration

1. Register services on startup
2. Include version and metadata
3. Set appropriate health check intervals
4. Deregister on graceful shutdown

### Health Checks

1. Implement comprehensive health endpoints
2. Check dependencies (database, external APIs)
3. Return appropriate HTTP status codes
4. Include response time metrics

### Failover Configuration

1. Define clear failover policies
2. Test backup instances regularly
3. Implement disaster recovery plans
4. Monitor failover events

### Monitoring

1. Set up alerting for service failures
2. Monitor circuit breaker states
3. Track response times and error rates
4. Regular performance reviews

## Future Enhancements

Planned improvements:

1. **Service Mesh Integration**: Istio/Linkerd integration
2. **Advanced Load Balancing**: Consistent hashing, maglev
3. **Multi-Region Support**: Cross-region service discovery
4. **GraphQL Gateway**: Unified API gateway
5. **Auto-Scaling**: Dynamic service scaling based on load

## Support

For support and questions:

- Documentation: `/docs/service-discovery.md`
- API Reference: `/docs/api.md`
- Issues: GitHub repository issues
- Monitoring Dashboard: `http://localhost:3003`
