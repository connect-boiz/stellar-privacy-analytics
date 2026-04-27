# Queue Optimization - Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### 1. Start the Optimized System

```bash
cd stellar-privacy-analytics
docker-compose -f docker-compose.optimized.yml up -d
```

This starts:
- PostgreSQL with read replica
- Redis with optimized configuration
- 3 worker instances
- Backend API
- Prometheus monitoring
- Grafana dashboards

### 2. Verify System Health

```bash
# Check system health
curl http://localhost:3001/api/v1/queue/health

# Expected response:
# {
#   "success": true,
#   "status": "healthy",
#   "workers": {
#     "total": 3,
#     "healthy": 3,
#     "healthPercentage": 100
#   }
# }
```

### 3. View Real-Time Metrics

**Grafana Dashboard:**
- URL: http://localhost:3002
- Username: admin
- Password: admin (change in production)

**Prometheus:**
- URL: http://localhost:9090

### 4. Submit a Test Job

```bash
curl -X POST http://localhost:3001/api/v1/anonymization/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "datasetId": "test_dataset_001",
    "metadata": {
      "email": "user@example.com",
      "phone": "+1234567890",
      "name": "John Doe"
    },
    "priority": "high"
  }'
```

### 5. Monitor Queue Status

```bash
# Get queue metrics
curl http://localhost:3001/api/v1/queue/metrics

# Get queue statistics
curl http://localhost:3001/api/v1/queue/stats
```

## 📊 Key Monitoring Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/v1/queue/health` | System health status |
| `/api/v1/queue/metrics` | Comprehensive metrics |
| `/api/v1/queue/stats` | Queue statistics |
| `/api/v1/queue/workers` | Worker information |
| `/api/v1/queue/dead-letter` | Failed jobs |

## 🔧 Common Operations

### Scale Workers

```bash
# Scale to 5 workers
curl -X POST http://localhost:3001/api/v1/queue/scale \
  -H "Content-Type: application/json" \
  -d '{"targetWorkers": 5}'
```

### View Worker Logs

```bash
# View logs for worker 1
docker logs -f stellar-worker-1

# View logs for all workers
docker-compose -f docker-compose.optimized.yml logs -f worker-1 worker-2 worker-3
```

### Check Redis Status

```bash
docker exec stellar-redis redis-cli INFO stats
```

### Check PostgreSQL Status

```bash
docker exec stellar-postgres psql -U stellar -d stellar_db -c "SELECT count(*) FROM jobs;"
```

## 🧪 Run Load Tests

```bash
cd backend

# Light load test (10 jobs/s, 5 min)
npm run test:load:light

# Moderate load test (50 jobs/s, 10 min)
npm run test:load:moderate

# Heavy load test (100 jobs/s, 15 min)
npm run test:load:heavy

# Peak load test (200 jobs/s, 20 min)
npm run test:load:peak
```

## 📈 Performance Benchmarks

### Expected Performance:

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Throughput | 20 jobs/s | 150+ jobs/s | **7.5x** |
| Queue Depth | 2000+ jobs | <200 jobs | **10x** |
| P95 Processing Time | 5+ min | <30 sec | **10x** |
| Error Rate | 8-10% | <2% | **4x** |

## ⚙️ Configuration

### Environment Variables

Create a `.env` file:

```bash
# Worker Configuration
MIN_WORKERS=3
MAX_WORKERS=10
WORKER_CONCURRENCY=20
SCALE_UP_THRESHOLD=500
SCALE_DOWN_THRESHOLD=100

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your_secure_password

# PostgreSQL
POSTGRES_HOST=postgres
POSTGRES_READ_HOST=postgres-replica
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=stellar_db
POSTGRES_USER=stellar

# Monitoring
ENABLE_METRICS=true
METRICS_INTERVAL=30000
```

### Adjust Worker Concurrency

Edit `docker-compose.optimized.yml`:

```yaml
worker-1:
  environment:
    - WORKER_CONCURRENCY=30  # Increase from 20
```

## 🚨 Troubleshooting

### High Queue Depth

```bash
# Check current queue depth
curl http://localhost:3001/api/v1/queue/stats

# Scale up workers
curl -X POST http://localhost:3001/api/v1/queue/scale \
  -d '{"targetWorkers": 8}'
```

### High Error Rate

```bash
# Check dead letter queue
curl http://localhost:3001/api/v1/queue/dead-letter

# View worker logs
docker logs stellar-worker-1
```

### Worker Not Responding

```bash
# Restart specific worker
docker restart stellar-worker-1

# Restart all workers
docker-compose -f docker-compose.optimized.yml restart worker-1 worker-2 worker-3
```

### Redis Connection Issues

```bash
# Check Redis status
docker exec stellar-redis redis-cli ping

# Restart Redis
docker restart stellar-redis
```

## 📚 Additional Resources

- **Full Documentation**: `MESSAGE_QUEUE_OPTIMIZATION.md`
- **Implementation Summary**: `QUEUE_OPTIMIZATION_SUMMARY.md`
- **API Documentation**: `docs/api.md`

## 🎯 Priority Levels

When submitting jobs, use appropriate priority:

| Priority | Use Case | Retry Attempts |
|----------|----------|----------------|
| `critical` | SLA-critical operations | 5 |
| `high` | Important operations | 3 |
| `normal` | Standard operations | 3 |
| `low` | Background operations | 3 |

Example:

```bash
curl -X POST http://localhost:3001/api/v1/anonymization/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "datasetId": "dataset_001",
    "metadata": {...},
    "priority": "critical"  # Use critical for time-sensitive jobs
  }'
```

## 🔍 Monitoring Best Practices

1. **Check health every 5 minutes**: `GET /api/v1/queue/health`
2. **Monitor queue depth**: Alert if >1000 jobs
3. **Track error rate**: Alert if >5%
4. **Watch processing time**: Alert if P95 >60s
5. **Monitor worker health**: Alert if <80% healthy

## 💡 Tips

- **Use priority queues**: Assign appropriate priorities to jobs
- **Monitor continuously**: Use Grafana dashboards
- **Scale proactively**: Don't wait for SLA violations
- **Review DLQ regularly**: Check dead letter queue daily
- **Run load tests**: Test before major releases
- **Tune configuration**: Adjust based on metrics

## 🆘 Need Help?

1. Check the logs: `docker-compose logs -f`
2. Review metrics: http://localhost:3002
3. Check health: `curl http://localhost:3001/api/v1/queue/health`
4. Read full docs: `MESSAGE_QUEUE_OPTIMIZATION.md`

## ✅ Success Checklist

- [ ] System started successfully
- [ ] All workers are healthy
- [ ] Grafana dashboards accessible
- [ ] Test job submitted and processed
- [ ] Metrics are being collected
- [ ] Alerts configured (production)
- [ ] Load tests passed
- [ ] Documentation reviewed

---

**Ready to go!** Your optimized message queue system is now running. 🎉
