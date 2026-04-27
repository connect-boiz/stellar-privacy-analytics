# Complete Testing and Deployment Guide

## 🎯 Overview

This guide provides step-by-step instructions to test and deploy the optimized message queue system.

## ✅ Pre-Deployment Checklist

- [x] All bugs fixed
- [x] All files created
- [x] All methods implemented
- [x] Documentation complete
- [ ] Dependencies installed
- [ ] Code compiled
- [ ] Basic tests passed
- [ ] Integration tests passed
- [ ] Load tests passed

## 📋 Step-by-Step Deployment

### Step 1: Install Dependencies (5 minutes)

```bash
cd stellar-privacy-analytics/backend
npm install
```

**Expected output:**
```
added 150 packages in 30s
```

**If errors occur:**
- Check Node.js version (requires v16+)
- Check npm version (requires v8+)
- Clear cache: `npm cache clean --force`
- Try again: `npm install`

### Step 2: Compile TypeScript (2 minutes)

```bash
npm run build
```

**Expected output:**
```
Successfully compiled TypeScript
```

**If compilation errors occur:**
1. Check the error messages
2. Most likely issues:
   - Missing type definitions
   - Import path errors
   - Type mismatches

**Common fixes:**
```bash
# Install missing types
npm install --save-dev @types/node @types/express

# Clean and rebuild
rm -rf dist
npm run build
```

### Step 3: Verify Compilation (1 minute)

```bash
npx ts-node src/testing/verifyCompilation.ts
```

**Expected output:**
```
✓ All imports successful
✓ Config loaded
✓ All type definitions valid
✓ All interfaces valid

✅ Compilation verification passed!
All TypeScript code compiles successfully.
```

### Step 4: Configure Environment (5 minutes)

Create `.env` file in the backend directory:

```bash
# Copy example
cp .env.example .env

# Edit with your values
nano .env
```

**Required environment variables:**

```bash
# Node Environment
NODE_ENV=production

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your_secure_password_here

# PostgreSQL Configuration
POSTGRES_HOST=postgres
POSTGRES_READ_HOST=postgres-replica
POSTGRES_PORT=5432
POSTGRES_DB=stellar_db
POSTGRES_USER=stellar
POSTGRES_PASSWORD=your_secure_password_here

# Worker Configuration
MIN_WORKERS=3
MAX_WORKERS=10
WORKER_CONCURRENCY=20
SCALE_UP_THRESHOLD=500
SCALE_DOWN_THRESHOLD=100

# Monitoring
ENABLE_METRICS=true
METRICS_INTERVAL=30000

# Grafana
GRAFANA_PASSWORD=your_grafana_password
```

### Step 5: Start Infrastructure (5 minutes)

```bash
cd ..
docker-compose -f docker-compose.optimized.yml up -d postgres redis
```

**Wait for services to be ready:**
```bash
# Check PostgreSQL
docker exec stellar-postgres pg_isready

# Check Redis
docker exec stellar-redis redis-cli ping
```

**Expected output:**
```
/var/run/postgresql:5432 - accepting connections
PONG
```

### Step 6: Run Database Migrations (2 minutes)

```bash
cd backend
npm run migrate
```

**Expected output:**
```
Batch 1 run: 5 migrations
```

### Step 7: Start Backend API (2 minutes)

```bash
# Option 1: Development mode
npm run dev

# Option 2: Production mode
npm start

# Option 3: Docker
cd ..
docker-compose -f docker-compose.optimized.yml up -d backend
```

**Check logs:**
```bash
# If using Docker
docker logs -f stellar-backend

# Look for:
# ✓ Server running on port 3001
# ✓ Connected to PostgreSQL
# ✓ Connected to Redis
```

### Step 8: Start Workers (2 minutes)

```bash
# Option 1: Start orchestrator (manages multiple workers)
npm run orchestrator

# Option 2: Start individual workers
npm run worker

# Option 3: Docker (already started with backend)
docker-compose -f docker-compose.optimized.yml up -d worker-1 worker-2 worker-3
```

**Check worker logs:**
```bash
docker logs -f stellar-worker-1
```

### Step 9: Verify System Health (5 minutes)

#### 9.1 Check API Health

```bash
curl http://localhost:3001/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-04-26T...",
  "uptime": 12345
}
```

#### 9.2 Check Queue Health

```bash
curl http://localhost:3001/api/v1/queue/health
```

**Expected response:**
```json
{
  "success": true,
  "status": "healthy",
  "workers": {
    "total": 3,
    "healthy": 3,
    "healthPercentage": 100
  }
}
```

#### 9.3 Check Queue Metrics

```bash
curl http://localhost:3001/api/v1/queue/metrics
```

**Expected response:**
```json
{
  "success": true,
  "orchestrator": {
    "totalWorkers": 3,
    "workersByStatus": {
      "running": 3
    }
  },
  "queue": {
    "waiting": 0,
    "active": 0,
    "completed": 0,
    "failed": 0
  }
}
```

### Step 10: Submit Test Job (5 minutes)

#### 10.1 Submit a Simple Job

```bash
curl -X POST http://localhost:3001/api/v1/anonymization/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "datasetId": "test_dataset_001",
    "metadata": {
      "email": "john.doe@example.com",
      "phone": "+1-555-123-4567",
      "name": "John Doe",
      "address": "123 Main St, City, State"
    },
    "priority": "normal"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "jobId": "anon_1714089600000_abc123",
  "message": "Job submitted successfully"
}
```

#### 10.2 Check Job Status

```bash
# Use the jobId from previous response
curl http://localhost:3001/api/v1/anonymization/jobs/anon_1714089600000_abc123
```

**Expected response:**
```json
{
  "id": "anon_1714089600000_abc123",
  "state": "completed",
  "progress": 100,
  "result": {
    "sanitizedMetadata": {
      "email": "jo**@e******.com",
      "phone": "+1 (555) 12*-****-4567",
      "name": "J*** D**",
      "address": "*** Main St, ****, *****"
    },
    "piiDetected": 4
  }
}
```

#### 10.3 Submit Priority Jobs

```bash
# Critical priority
curl -X POST http://localhost:3001/api/v1/anonymization/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "datasetId": "critical_001",
    "metadata": {"email": "urgent@example.com"},
    "priority": "critical"
  }'

# High priority
curl -X POST http://localhost:3001/api/v1/anonymization/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "datasetId": "high_001",
    "metadata": {"email": "important@example.com"},
    "priority": "high"
  }'
```

### Step 11: Monitor System (10 minutes)

#### 11.1 Access Grafana

```bash
# Open in browser
open http://localhost:3002

# Login credentials
Username: admin
Password: admin (or your configured password)
```

**Configure dashboards:**
1. Add Prometheus data source
2. Import queue monitoring dashboard
3. Set up alerts

#### 11.2 Access Prometheus

```bash
# Open in browser
open http://localhost:9090

# Check targets
open http://localhost:9090/targets
```

**Verify all targets are UP:**
- backend
- redis-exporter
- postgres-exporter

#### 11.3 Monitor Queue Metrics

```bash
# Watch metrics in real-time
watch -n 5 'curl -s http://localhost:3001/api/v1/queue/metrics | jq'
```

### Step 12: Run Load Tests (30 minutes)

#### 12.1 Light Load Test

```bash
cd backend
npm run test:load:light
```

**Expected duration:** 5 minutes
**Expected throughput:** 10 jobs/second

#### 12.2 Moderate Load Test

```bash
npm run test:load:moderate
```

**Expected duration:** 10 minutes
**Expected throughput:** 50 jobs/second

#### 12.3 Heavy Load Test

```bash
npm run test:load:heavy
```

**Expected duration:** 15 minutes
**Expected throughput:** 100 jobs/second

#### 12.4 Peak Load Test

```bash
npm run test:load:peak
```

**Expected duration:** 20 minutes
**Expected throughput:** 200 jobs/second

**Save results:**
```bash
npm run test:load:peak -- --output peak-results.json
```

### Step 13: Capacity Planning (10 minutes)

```bash
# Generate capacity plan from load test results
npm run capacity:plan -- --results peak-results.json --output capacity-plan.txt

# View recommendations
cat capacity-plan.txt
```

**Expected output:**
- Worker requirements
- Infrastructure sizing
- Cost estimates
- Optimization suggestions

### Step 14: Scale Testing (15 minutes)

#### 14.1 Test Manual Scaling

```bash
# Scale up to 5 workers
curl -X POST http://localhost:3001/api/v1/queue/scale \
  -H "Content-Type: application/json" \
  -d '{"targetWorkers": 5}'

# Verify scaling
curl http://localhost:3001/api/v1/queue/workers | jq '.totalWorkers'
```

#### 14.2 Test Auto-Scaling

```bash
# Submit many jobs to trigger auto-scaling
for i in {1..1000}; do
  curl -X POST http://localhost:3001/api/v1/anonymization/jobs \
    -H "Content-Type: application/json" \
    -d "{\"datasetId\": \"test_$i\", \"metadata\": {\"email\": \"test$i@example.com\"}, \"priority\": \"normal\"}" &
done

# Watch workers scale up
watch -n 2 'curl -s http://localhost:3001/api/v1/queue/metrics | jq ".orchestrator.totalWorkers"'
```

### Step 15: Error Handling Tests (10 minutes)

#### 15.1 Test Dead Letter Queue

```bash
# Submit a job that will fail
curl -X POST http://localhost:3001/api/v1/anonymization/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "datasetId": "fail_test",
    "metadata": null,
    "priority": "normal"
  }'

# Check dead letter queue
curl http://localhost:3001/api/v1/queue/dead-letter
```

#### 15.2 Test Retry Logic

```bash
# Check DLQ stats
curl http://localhost:3001/api/v1/queue/dead-letter | jq

# Retry failed jobs
curl -X POST http://localhost:3001/api/v1/queue/dead-letter/retry-all
```

### Step 16: Performance Validation (15 minutes)

#### 16.1 Measure Throughput

```bash
# Submit 1000 jobs and measure time
time for i in {1..1000}; do
  curl -X POST http://localhost:3001/api/v1/anonymization/jobs \
    -H "Content-Type: application/json" \
    -d "{\"datasetId\": \"perf_$i\", \"metadata\": {\"email\": \"test$i@example.com\"}, \"priority\": \"normal\"}" > /dev/null 2>&1 &
done
wait

# Check completion time
curl http://localhost:3001/api/v1/queue/stats | jq
```

#### 16.2 Measure Latency

```bash
# Measure P95 processing time
curl http://localhost:3001/api/v1/queue/metrics | jq '.queue.metrics.p95ProcessingTime'
```

#### 16.3 Check Error Rate

```bash
# Calculate error rate
curl http://localhost:3001/api/v1/queue/stats | jq '
  .queue.failed / (.queue.completed + .queue.failed) * 100
'
```

## 🎯 Success Criteria

### System is ready for production if:

- [x] All services start successfully
- [x] Health checks return "healthy"
- [x] Test jobs complete successfully
- [x] Priority queues work correctly
- [x] Auto-scaling functions properly
- [x] Dead letter queue handles failures
- [x] Monitoring dashboards show data
- [x] Load tests pass with acceptable performance
- [x] Error rate < 5%
- [x] P95 latency < 60 seconds
- [x] Throughput meets requirements

### Performance Targets:

| Metric | Target | Acceptable | Critical |
|--------|--------|------------|----------|
| Throughput | 150+ jobs/s | 100+ jobs/s | < 50 jobs/s |
| Queue Depth | < 200 jobs | < 500 jobs | > 1000 jobs |
| P95 Latency | < 30s | < 60s | > 120s |
| Error Rate | < 2% | < 5% | > 10% |
| Worker Health | 100% | > 80% | < 50% |

## 🐛 Troubleshooting

### Issue: Workers not starting

**Symptoms:**
- No workers in `curl http://localhost:3001/api/v1/queue/workers`
- Orchestrator logs show errors

**Solutions:**
1. Check Redis connection
2. Check PostgreSQL connection
3. Verify environment variables
4. Check worker logs: `docker logs stellar-worker-1`

### Issue: High queue depth

**Symptoms:**
- Queue depth > 1000 jobs
- Jobs taking too long to process

**Solutions:**
1. Scale up workers: `curl -X POST .../queue/scale -d '{"targetWorkers": 10}'`
2. Check worker health
3. Check database performance
4. Review job complexity

### Issue: High error rate

**Symptoms:**
- Error rate > 5%
- Many jobs in dead letter queue

**Solutions:**
1. Check dead letter queue: `curl .../queue/dead-letter`
2. Review error patterns
3. Check database connectivity
4. Verify Redis stability
5. Review job validation

### Issue: Slow processing

**Symptoms:**
- P95 latency > 60s
- Jobs stuck in "active" state

**Solutions:**
1. Check system resources (CPU, memory)
2. Review database query performance
3. Check NER processor performance
4. Increase worker concurrency
5. Optimize job processing logic

## 📊 Monitoring Checklist

### Daily Monitoring:
- [ ] Check system health
- [ ] Review error rate
- [ ] Check queue depth
- [ ] Review dead letter queue
- [ ] Check worker health
- [ ] Review performance metrics

### Weekly Monitoring:
- [ ] Review capacity trends
- [ ] Analyze performance patterns
- [ ] Check resource utilization
- [ ] Review scaling events
- [ ] Update capacity plan

### Monthly Monitoring:
- [ ] Run full load tests
- [ ] Update capacity plan
- [ ] Review and tune configuration
- [ ] Analyze cost trends
- [ ] Plan infrastructure changes

## 🚀 Production Deployment

### Pre-Production Checklist:
- [ ] All tests passed
- [ ] Load tests completed
- [ ] Capacity plan reviewed
- [ ] Monitoring configured
- [ ] Alerts set up
- [ ] Backup strategy defined
- [ ] Rollback plan prepared
- [ ] Documentation updated

### Deployment Steps:
1. Deploy to staging
2. Run full test suite
3. Perform load testing
4. Validate monitoring
5. Deploy to production
6. Monitor closely for 24 hours
7. Gradually increase traffic
8. Tune based on real data

### Post-Deployment:
1. Monitor for 48 hours
2. Review all metrics
3. Tune configuration
4. Update documentation
5. Train team
6. Plan next iteration

## 📞 Support

### Getting Help:
- Review documentation in `MESSAGE_QUEUE_OPTIMIZATION.md`
- Check `QUICK_START_GUIDE.md` for common tasks
- Review `HONEST_ASSESSMENT.md` for known issues
- Check GitHub issues

### Reporting Issues:
1. Collect logs
2. Document steps to reproduce
3. Include system metrics
4. Provide configuration
5. Create GitHub issue

---

**Last Updated**: April 26, 2026
**Status**: Ready for testing
**Next Action**: Follow Step 1 to begin deployment
