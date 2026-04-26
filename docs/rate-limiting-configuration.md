# Rate Limiting Configuration Guide

## Quick Setup

### 1. Environment Configuration

Add these variables to your `.env` file:

```bash
# Required
REDIS_URL=redis://localhost:6379
RATE_LIMIT_EMERGENCY_BYPASS_KEY=your-secure-bypass-key-2024

# Optional - Custom limits
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_BASIC_REQUESTS=100
RATE_LIMIT_PREMIUM_REQUESTS=500
RATE_LIMIT_ENTERPRISE_REQUESTS=2000
```

### 2. Redis Installation

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install redis-server
sudo systemctl start redis
sudo systemctl enable redis

# macOS
brew install redis
brew services start redis

# Docker
docker run -d -p 6379:6379 --name redis redis:alpine
```

### 3. Application Startup

The application will automatically initialize Redis and rate limiters on startup:

```bash
npm run dev
```

## Configuration Options

### Rate Limit Tiers

| Tier | Requests | Window | Use Case |
|------|----------|--------|----------|
| Basic | 100 | 15 minutes | Free tier users |
| Premium | 500 | 15 minutes | Paid subscribers |
| Enterprise | 2000 | 15 minutes | Enterprise customers |

### Specialized Rate Limiters

#### PQL Query Rate Limiter
- **Basic**: 50 queries per 15 minutes
- **Premium**: 200 queries per 15 minutes  
- **Enterprise**: 1000 queries per 15 minutes

#### Admin Rate Limiter
- **Basic**: 1000 requests per 15 minutes
- **Premium**: 5000 requests per 15 minutes
- **Enterprise**: 10000 requests per 15 minutes

### Route-Specific Configuration

The system automatically applies appropriate rate limiting:

```typescript
// General API endpoints - Standard rate limiting
app.use('/api/v1', rateLimiter.rateLimit());

// Analytics and Query endpoints - PQL rate limiting (stricter)
app.use('/api/v1/analytics', pqlRateLimiter.queryRateLimit);
app.use('/api/v1/query', pqlRateLimiter.queryRateLimit);

// Audit endpoints - Admin rate limiting (lenient)
app.use('/api/v1/audit', adminRateLimiter.rateLimit());
```

## Emergency Bypass Setup

### 1. Set Bypass Key

```bash
# Generate secure bypass key
openssl rand -hex 32

# Set in environment
RATE_LIMIT_EMERGENCY_BYPASS_KEY=generated-key-here
```

### 2. Usage Methods

```bash
# Method 1: Header
curl -H "X-Emergency-Bypass: your-key" https://api.example.com/api/v1/data

# Method 2: Query Parameter
curl "https://api.example.com/api/v1/data?emergency_bypass=your-key"
```

### 3. Monitoring Bypass Usage

Check logs for bypass attempts:

```bash
# Application logs
grep "Emergency bypass used" logs/app.log

# Prometheus metrics
curl http://localhost:9090/metrics | grep rate_limit_bypasses
```

## API Key Configuration

### 1. API Key Format

```bash
# Basic tier
pk_basic_abc123def456

# Premium tier  
pk_prem_xyz789uvw012

# Enterprise tier
pk_ent_ghi345jkl678
```

### 2. Usage Examples

```bash
# Authorization header
curl -H "Authorization: Bearer pk_ent_abc123" https://api.example.com/api/v1

# X-API-Key header
curl -H "X-API-Key: pk_prem_xyz789" https://api.example.com/api/v1

# Query parameter
curl "https://api.example.com/api/v1?api_key=pk_basic_ghi345"
```

## Monitoring Setup

### 1. Prometheus Configuration

Add to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'stellar-api'
    static_configs:
      - targets: ['localhost:9090']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

### 2. Grafana Dashboard

Key panels to create:

1. **Rate Limit Hits** - `rate(rate_limit_hits_total[5m])`
2. **Rate Limit Blocks** - `rate(rate_limit_blocks_total[5m])`
3. **Bypass Usage** - `rate(rate_limit_bypasses_total[5m])`
4. **Block Rate** - `rate_limit_blocks_total / rate_limit_hits_total`
5. **Top Users** - Top 10 users by request count

### 3. Alerting Rules

Create `rate-limiting-rules.yml`:

```yaml
groups:
  - name: rate-limiting
    rules:
      - alert: HighRateLimitBypassUsage
        expr: rate(rate_limit_bypasses_total[5m]) > 5
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High emergency bypass usage detected"
          
      - alert: HighRateLimitBlockRate
        expr: rate(rate_limit_blocks_total[5m]) > 100
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High rate limit block rate"
```

## Performance Tuning

### Redis Configuration

```bash
# redis.conf optimizations for rate limiting
maxmemory 256mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

### Application Tuning

```typescript
// Connection pooling for high traffic
const redisClient = Redis.createClient({
  url: process.env.REDIS_URL,
  socket: {
    connectTimeout: 5000,
    lazyConnect: true
  }
});

// Rate limiter configuration
const rateLimiter = createRateLimiter(redisClient, {
  tierConfigs: {
    basic: { windowMs: 15 * 60 * 1000, maxRequests: 100 },
    premium: { windowMs: 15 * 60 * 1000, maxRequests: 500 },
    enterprise: { windowMs: 15 * 60 * 1000, maxRequests: 2000 }
  }
});
```

## Testing Configuration

### 1. Unit Tests

```typescript
// Test rate limiting behavior
describe('Rate Limiter', () => {
  it('should limit requests after threshold', async () => {
    // Make requests up to limit
    for (let i = 0; i < 100; i++) {
      await request(app).get('/api/v1/data').expect(200);
    }
    
    // Next request should be blocked
    await request(app).get('/api/v1/data').expect(429);
  });
});
```

### 2. Load Testing

```bash
# Use artillery for load testing
artillery run load-test-config.yml

# Test rate limiting under load
artillery run rate-limit-test.yml
```

### 3. Integration Tests

```bash
# Test Redis connectivity
redis-cli ping

# Test rate limit keys
redis-cli keys "rate_limit:*"

# Test emergency bypass
curl -H "X-Emergency-Bypass: test-key" http://localhost:3001/api/v1/health
```

## Troubleshooting

### Common Issues and Solutions

#### Redis Connection Issues
```bash
# Check Redis status
sudo systemctl status redis

# Test connection
redis-cli -h localhost -p 6379 ping

# Check logs
sudo journalctl -u redis
```

#### Rate Limiting Not Working
```bash
# Check application logs
grep "rate limiter" logs/app.log

# Verify Redis keys
redis-cli keys "rate_limit:*"

# Test with bypass
curl -H "X-Emergency-Bypass: your-key" http://localhost:3001/api/v1
```

#### High Memory Usage
```bash
# Check Redis memory
redis-cli info memory

# Clean up expired keys
redis-cli --eval cleanup.lua

# Monitor key expiration
redis-cli monitor | grep "EXPIRE"
```

## Security Best Practices

### 1. Bypass Key Management
- Rotate bypass keys monthly
- Use environment variables, not code
- Limit bypass key distribution
- Monitor bypass usage alerts

### 2. API Key Security
- Use HTTPS for all API calls
- Implement key rotation policies
- Store keys encrypted in database
- Log all API key usage

### 3. Redis Security
- Enable Redis authentication
- Use Redis TLS for connections
- Network isolation for Redis
- Regular Redis security updates

## Migration Checklist

### From Basic Rate Limiting

- [ ] Install and configure Redis
- [ ] Update environment variables
- [ ] Replace rate limiting middleware
- [ ] Test emergency bypass
- [ ] Verify API key rate limiting
- [ ] Set up monitoring
- [ ] Configure alerting
- [ ] Document procedures
- [ ] Train team on new system

### Production Deployment

- [ ] Redis cluster setup
- [ ] Load balancer configuration
- [ ] Monitoring deployment
- [ ] Alert configuration
- [ ] Performance testing
- [ ] Security review
- [ ] Documentation update
- [ ] Team training

## Support and Maintenance

### Regular Tasks

1. **Weekly**: Review rate limiting metrics
2. **Monthly**: Rotate emergency bypass keys
3. **Quarterly**: Performance tuning review
4. **Annually**: Security audit of rate limiting

### Emergency Procedures

1. **High Bypass Usage**: Investigate immediately
2. **Redis Failure**: Fail-safe mode activates
3. **Performance Issues**: Check Redis metrics
4. **Security Incidents**: Review bypass logs

### Contact Information

- **Development Team**: dev-team@company.com
- **Operations**: ops-team@company.com  
- **Security**: security@company.com

For additional support, see the main rate limiting documentation.
