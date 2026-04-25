# Advanced Rate Limiting System

## Overview

This document describes the advanced distributed rate limiting system implemented for the Stellar Privacy Analytics platform. The system provides comprehensive rate limiting capabilities with Redis-based distributed storage, multi-tier support, and emergency bypass functionality.

## Features

### 1. Distributed Rate Limiting with Redis
- **Redis-based storage**: Ensures rate limiting works across multiple server instances
- **Atomic operations**: Uses Redis INCR and EXPIRE for thread-safe rate limiting
- **Automatic cleanup**: Built-in cleanup of expired rate limit keys
- **Fail-safe operation**: Falls back to allow requests if Redis is unavailable

### 2. Multi-Tier Rate Limiting
- **Basic Tier**: 100 requests per 15 minutes
- **Premium Tier**: 500 requests per 15 minutes  
- **Enterprise Tier**: 2000 requests per 15 minutes
- **Custom configurations**: Per-route rate limiting overrides

### 3. Multiple Rate Limiting Strategies
- **User-based**: Limits authenticated users by their tier
- **IP-based**: Limits anonymous requests by IP address
- **API Key-based**: Limits API requests by key with tier detection

### 4. Emergency Bypass System
- **Header-based bypass**: `X-Emergency-Bypass` header
- **Query parameter bypass**: `emergency_bypass` parameter
- **Configurable bypass key**: Set via environment variable
- **Audit logging**: All bypass attempts are logged

### 5. Metrics and Monitoring
- **Prometheus metrics**: Comprehensive rate limiting metrics
- **Request tracking**: Hits, blocks, and bypasses by type/tier
- **Performance monitoring**: Rate limiter performance metrics
- **Alerting support**: Metrics ready for alerting integration

## Configuration

### Environment Variables

```bash
# Redis Configuration
REDIS_URL=redis://localhost:6379

# Rate Limiting Configuration
RATE_LIMIT_WINDOW_MS=900000                    # 15 minutes in milliseconds
RATE_LIMIT_MAX_REQUESTS=100                    # Default limit for basic tier
RATE_LIMIT_EMERGENCY_BYPASS_KEY=secure-key-2024

# Tier-specific limits (optional)
RATE_LIMIT_BASIC_REQUESTS=100
RATE_LIMIT_PREMIUM_REQUESTS=500
RATE_LIMIT_ENTERPRISE_REQUESTS=2000

# PQL Query Limits (stricter for computational resources)
RATE_LIMIT_PQL_BASIC_REQUESTS=50
RATE_LIMIT_PQL_PREMIUM_REQUESTS=200
RATE_LIMIT_PQL_ENTERPRISE_REQUESTS=1000
```

### Redis Setup

```bash
# Install Redis
sudo apt-get install redis-server  # Ubuntu/Debian
brew install redis                 # macOS

# Start Redis
redis-server

# Verify Redis is running
redis-cli ping
```

## API Key Format

API keys should follow these conventions for tier detection:

- **Basic**: `pk_basic_<random-string>`
- **Premium**: `pk_prem_<random-string>`
- **Enterprise**: `pk_ent_<random-string>`

## Usage Examples

### Basic Rate Limiting

```typescript
import { createRateLimiter } from './middleware/rateLimiter';

const rateLimiter = createRateLimiter(redisClient);
app.use('/api/v1', rateLimiter.rateLimit());
```

### Custom Rate Limiting

```typescript
// Stricter limits for sensitive endpoints
app.use('/api/v1/admin', rateLimiter.rateLimit({
  maxRequests: 10,
  windowMs: 60 * 1000 // 1 minute
}));

// Skip rate limiting for health checks
app.use('/health', rateLimiter.rateLimit({
  skip: (req) => req.path === '/health'
}));
```

### Emergency Bypass

```bash
# Using header
curl -H "X-Emergency-Bypass: secure-key-2024" \
     https://api.example.com/api/v1/analytics

# Using query parameter
curl "https://api.example.com/api/v1/analytics?emergency_bypass=secure-key-2024"
```

### API Key Authentication

```bash
# Using Authorization header
curl -H "Authorization: Bearer pk_ent_abc123def456" \
     https://api.example.com/api/v1/query

# Using X-API-Key header
curl -H "X-API-Key: pk_prem_xyz789uvw012" \
     https://api.example.com/api/v1/data

# Using query parameter
curl "https://api.example.com/api/v1/analytics?api_key=pk_basic_ghi345jkl678" \
     https://api.example.com/api/v1/analytics
```

## Monitoring

### Prometheus Metrics

The system exposes the following metrics:

- `rate_limit_hits_total`: Total rate limit checks by type, tier, and identifier
- `rate_limit_blocks_total`: Total rate limit blocks by type, tier, and identifier  
- `rate_limit_bypasses_total`: Total emergency bypasses by reason

### Grafana Dashboard

Key metrics to monitor:

1. **Rate Limit Hit Rate**: `rate_limit_hits_total / rate_limit_blocks_total`
2. **Bypass Usage**: `rate_limit_bypasses_total`
3. **Tier Distribution**: Hits and blocks by tier
4. **Top Consumers**: Users/IPs with highest request counts

### Alerting Rules

```yaml
# High bypass usage alert
- alert: RateLimitBypassHigh
  expr: rate(rate_limit_bypasses_total[5m]) > 10
  for: 2m
  labels:
    severity: warning
  annotations:
    summary: "High rate limit bypass usage detected"

# High block rate alert
- alert: RateLimitBlockHigh
  expr: rate(rate_limit_blocks_total[5m]) > 100
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "High rate limit block rate detected"
```

## Performance Considerations

### Redis Optimization

1. **Connection Pooling**: Use Redis connection pooling for high traffic
2. **Memory Management**: Monitor Redis memory usage for rate limit keys
3. **Persistence**: Configure appropriate Redis persistence settings
4. **Clustering**: Consider Redis clustering for high availability

### Rate Limiting Optimization

1. **Key Expiration**: Ensure proper TTL settings to prevent memory leaks
2. **Batch Operations**: Use Redis pipelines for multiple operations
3. **Cleanup Strategy**: Regular cleanup of expired keys
4. **Monitoring**: Track Redis performance metrics

## Security Considerations

### Bypass Key Security

1. **Regular Rotation**: Rotate emergency bypass keys regularly
2. **Limited Distribution**: Only share bypass keys with authorized personnel
3. **Audit Logging**: Monitor all bypass usage
4. **Time-limited Bypass**: Consider implementing time-limited bypass tokens

### API Key Security

1. **Key Rotation**: Implement regular API key rotation
2. **Scope Limitation**: Limit API key scopes and permissions
3. **Revocation**: Implement API key revocation mechanisms
4. **Encryption**: Store API keys securely in database

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**
   - Check Redis server status
   - Verify connection URL and credentials
   - Check network connectivity

2. **Rate Limiting Not Working**
   - Verify Redis is connected
   - Check rate limiter initialization
   - Review middleware order

3. **High Memory Usage**
   - Check for expired keys without TTL
   - Verify cleanup process is running
   - Monitor Redis memory usage

4. **Bypass Not Working**
   - Verify bypass key configuration
   - Check header/query parameter format
   - Review bypass logic

### Debug Commands

```bash
# Check Redis rate limit keys
redis-cli keys "rate_limit:*"

# Monitor rate limit usage
redis-cli monitor | grep "rate_limit"

# Check specific user rate limit
redis-cli get "rate_limit:user:123:1640995200000"
```

## Migration Guide

### From Basic Rate Limiting

1. **Install Redis**: Set up Redis server
2. **Update Configuration**: Add Redis URL to environment
3. **Replace Middleware**: Replace express-rate-limit with new system
4. **Test Thoroughly**: Verify rate limiting works correctly
5. **Monitor Performance**: Watch Redis and application performance

### Configuration Migration

```typescript
// Old configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

// New configuration
const rateLimiter = createRateLimiter(redisClient);
app.use(rateLimiter.rateLimit());
```

## Best Practices

1. **Start Conservative**: Begin with stricter limits and relax as needed
2. **Monitor Continuously**: Track rate limiting metrics and user feedback
3. **Document Exceptions**: Document any rate limiting exceptions or bypasses
4. **Test Regularly**: Test rate limiting under various load conditions
5. **Plan for Scale**: Design rate limiting for expected peak loads
6. **User Communication**: Clearly communicate rate limits to users
7. **Graceful Degradation**: Ensure system works even if rate limiting fails

## Support

For issues or questions about the rate limiting system:

1. Check this documentation first
2. Review application logs for rate limiting errors
3. Monitor Redis performance and connectivity
4. Contact the development team with specific issues

## Version History

- **v2.0.0**: Complete rewrite with Redis distributed rate limiting
- **v1.0.0**: Basic express-rate-limit implementation
