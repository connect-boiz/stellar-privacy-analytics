# Deployment Guide

## Overview

Stellar is designed for easy deployment in various environments. This guide covers deployment using Docker Compose for development and production scenarios.

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- Node.js 18+ (for local development)
- PostgreSQL 14+ (if not using Docker)
- Redis 6+ (if not using Docker)

## Quick Start with Docker Compose

### Development Environment

```bash
# Clone the repository
git clone https://github.com/your-org/stellar.git
cd stellar

# Copy environment file
cp .env.example .env

# Update environment variables
# Edit .env with your configuration

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Production Environment

```bash
# Use production configuration
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Scale services if needed
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --scale backend=3
```

## Environment Configuration

### Required Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/stellar_db
REDIS_URL=redis://localhost:6379

# Security
ENCRYPTION_KEY=your-256-bit-encryption-key
JWT_SECRET=your-jwt-secret-key
HOMOMORPHIC_KEY=your-homomorphic-encryption-key

# API Configuration
API_PORT=3001
FRONTEND_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000

# Privacy Settings
DEFAULT_PRIVACY_LEVEL=high
DATA_RETENTION_DAYS=365
DIFFERENTIAL_PRIVACY_EPSILON=1.0
```

### Security Configuration

1. **Generate Encryption Keys**:
   ```bash
   # Generate 256-bit encryption key
   openssl rand -hex 32
   
   # Generate JWT secret
   openssl rand -hex 64
   ```

2. **Database Security**:
   ```bash
   # Create database user with limited permissions
   psql -c "CREATE USER stellar WITH PASSWORD 'secure_password';"
   psql -c "GRANT CONNECT, CREATE ON DATABASE stellar_db TO stellar;"
   ```

## Deployment Options

### Option 1: Docker Compose (Recommended)

**Pros**: Easy setup, included dependencies, consistent environments
**Cons**: Less flexible for custom configurations

```bash
# Production deployment
docker-compose -f docker-compose.prod.yml up -d
```

### Option 2: Kubernetes

**Pros**: Scalability, high availability, advanced features
**Cons**: More complex setup

```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: stellar-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: stellar-backend
  template:
    metadata:
      labels:
        app: stellar-backend
    spec:
      containers:
      - name: backend
        image: stellar/backend:latest
        ports:
        - containerPort: 3001
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: stellar-secrets
              key: database-url
```

### Option 3: Manual Deployment

**Pros**: Full control, custom optimizations
**Cons**: More maintenance required

```bash
# Backend
cd backend
npm install --production
npm run build
npm start

# Frontend
cd frontend
npm install --production
npm run build
# Serve dist/ with nginx or similar
```

## Monitoring and Logging

### Health Checks

- **Backend**: `GET /health`
- **Frontend**: `GET /` (should return 200)
- **Database**: Connection status
- **Redis**: Connection status

### Metrics

Stellar exposes Prometheus metrics on port 9090:

- HTTP request metrics
- Privacy operation metrics
- Database performance metrics
- Custom business metrics

### Logging

Logs are structured JSON and include:

- Request/response logs
- Privacy audit trails
- Error logs with stack traces
- Performance metrics

## Scaling Considerations

### Horizontal Scaling

1. **Backend Services**:
   - Stateless design enables easy scaling
   - Use load balancer for distribution
   - Consider read replicas for database

2. **Database**:
   - PostgreSQL replication for read scaling
   - Connection pooling (PgBouncer)
   - Regular backups and point-in-time recovery

3. **Redis**:
   - Redis Cluster for high availability
   - Persistent storage for critical data
   - Memory optimization for large datasets

### Performance Optimization

1. **Caching**:
   - Redis for session storage
   - Application-level caching
   - CDN for static assets

2. **Database**:
   - Proper indexing strategy
   - Query optimization
   - Connection pooling

3. **Privacy Operations**:
   - Batch processing for encryption
   - Parallel differential privacy calculations
   - Optimized homomorphic operations

## Security Best Practices

### Network Security

1. **Firewall Rules**:
   ```bash
   # Allow only necessary ports
   ufw allow 80/tcp    # HTTP
   ufw allow 443/tcp   # HTTPS
   ufw allow 22/tcp    # SSH (if needed)
   ```

2. **SSL/TLS**:
   - Use Let's Encrypt or commercial certificates
   - Force HTTPS redirection
   - Implement HSTS headers

### Application Security

1. **Environment Variables**:
   - Never commit secrets to version control
   - Use Docker secrets or Kubernetes secrets
   - Regular key rotation

2. **Database Security**:
   - Encrypted connections
   - Limited user permissions
   - Regular security updates

### Privacy Compliance

1. **Data Protection**:
   - Encryption at rest and in transit
   - Regular privacy audits
   - Data retention policies

2. **Access Control**:
   - Role-based permissions
   - Multi-factor authentication
   - Audit logging

## Troubleshooting

### Common Issues

1. **Database Connection**:
   ```bash
   # Check database connectivity
   docker-compose exec backend npm run db:check
   
   # View database logs
   docker-compose logs postgres
   ```

2. **Redis Connection**:
   ```bash
   # Test Redis connection
   docker-compose exec backend npm run redis:check
   
   # View Redis logs
   docker-compose logs redis
   ```

3. **Privacy Operations**:
   ```bash
   # Check encryption keys
   docker-compose exec backend npm run privacy:check-keys
   
   # Test differential privacy
   docker-compose exec backend npm run privacy:test-dp
   ```

### Performance Issues

1. **Slow Queries**:
   ```sql
   -- Identify slow queries
   SELECT query, mean_time, calls 
   FROM pg_stat_statements 
   ORDER BY mean_time DESC 
   LIMIT 10;
   ```

2. **Memory Usage**:
   ```bash
   # Monitor memory usage
   docker stats stellar-backend
   
   # Check for memory leaks
   docker-compose exec backend npm run memory:profile
   ```

## Backup and Recovery

### Database Backups

```bash
# Create backup
docker-compose exec postgres pg_dump -U stellar stellar_db > backup.sql

# Restore backup
docker-compose exec -T postgres psql -U stellar stellar_db < backup.sql

# Automated backups
0 2 * * * docker-compose exec postgres pg_dump -U stellar stellar_db | gzip > /backups/stellar_$(date +\%Y\%m\%d).sql.gz
```

### Configuration Backups

```bash
# Backup environment configuration
cp .env .env.backup.$(date +%Y%m%d)

# Backup Docker volumes
docker run --rm -v stellar_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_data.tar.gz -C /data .
```

## Maintenance

### Regular Tasks

1. **Weekly**:
   - Update dependencies
   - Review security advisories
   - Check disk space usage

2. **Monthly**:
   - Rotate encryption keys
   - Update SSL certificates
   - Performance tuning

3. **Quarterly**:
   - Security audits
   - Privacy compliance review
   - Disaster recovery testing

### Updates and Patches

```bash
# Update Docker images
docker-compose pull
docker-compose up -d

# Update Node.js dependencies
npm update
npm audit fix

# Database updates
docker-compose exec postgres npm run db:migrate
```

## Support

For deployment issues:

1. Check the [troubleshooting guide](#troubleshooting)
2. Review [GitHub Issues](https://github.com/your-org/stellar/issues)
3. Contact support at support@stellar-ecosystem.com

## Next Steps

After successful deployment:

1. Configure monitoring and alerting
2. Set up automated backups
3. Implement security scanning
4. Configure CI/CD pipelines
5. Set up disaster recovery procedures
