# Compliance Automation Quick Start Guide

Get started with the Privacy Compliance Automation Service in 5 minutes!

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Running Stellar Privacy Analytics backend

## Step 1: Database Setup (2 minutes)

Run the compliance automation migration:

```bash
cd stellar-privacy-analytics
psql -U postgres -d stellar_privacy -f backend/src/migrations/compliance_automation_schema.sql
```

Expected output:
```
CREATE TABLE
CREATE TABLE
CREATE TABLE
...
INSERT 0 3
INSERT 0 5
```

## Step 2: Environment Configuration (1 minute)

Add these lines to your `.env` file:

```env
# Compliance Monitoring
COMPLIANCE_MONITORING_ENABLED=true
COMPLIANCE_SCAN_SCHEDULE=0 */6 * * *
COMPLIANCE_ALERT_THRESHOLD=80
```

## Step 3: Start the Backend (1 minute)

```bash
cd backend
npm run dev
```

Look for this log message:
```
✅ Compliance regulations initialized { count: 3, regulations: [ 'gdpr', 'ccpa', 'hipaa' ] }
```

## Step 4: Run Your First Compliance Scan (1 minute)

### Option A: Using curl

```bash
# Run GDPR compliance scan
curl -X POST http://localhost:3001/api/v1/compliance-automation/scan \
  -H "Content-Type: application/json" \
  -d '{"regulationId": "gdpr"}'
```

### Option B: Using the API

Open your browser or Postman:
- URL: `http://localhost:3001/api/v1/compliance-automation/scan`
- Method: POST
- Body: `{"regulationId": "gdpr"}`

### Expected Response

```json
{
  "success": true,
  "data": {
    "scanId": "scan_1234567890_abc123",
    "timestamp": "2024-01-15T10:30:00Z",
    "regulation": "General Data Protection Regulation",
    "status": "partial",
    "score": 85,
    "violations": [
      {
        "id": "violation_1234567890_xyz789",
        "ruleId": "gdpr-002",
        "ruleName": "Consent Management",
        "severity": "high",
        "description": "Consent Management check failed",
        "affectedResources": ["resource_1", "resource_2"],
        "detectedAt": "2024-01-15T10:30:00Z",
        "status": "open"
      }
    ],
    "recommendations": [
      "Implement proper consent collection and management system",
      "Review data collection practices"
    ],
    "auditTrail": [...]
  }
}
```

## Step 5: View Compliance Dashboard

```bash
curl http://localhost:3001/api/v1/compliance-automation/dashboard
```

You'll see:
- Overall compliance score
- Status for each regulation (GDPR, CCPA, HIPAA)
- Recent scans
- Active alerts
- Violation counts

## Common Tasks

### Run All Compliance Scans

```bash
curl -X POST http://localhost:3001/api/v1/compliance-automation/scan/all
```

### Start Automated Monitoring

```bash
curl -X POST http://localhost:3001/api/v1/compliance-automation/monitoring/start \
  -H "Content-Type: application/json" \
  -d '{"schedule": "0 */6 * * *"}'
```

This will run scans every 6 hours automatically.

### Generate Compliance Report

```bash
curl http://localhost:3001/api/v1/compliance-automation/report/gdpr
```

### View Audit Trail

```bash
curl "http://localhost:3001/api/v1/compliance-automation/audit-trail?startDate=2024-01-01"
```

### Get All Regulations

```bash
curl http://localhost:3001/api/v1/compliance-automation/regulations
```

## Testing

Run the test suite to verify everything works:

```bash
cd backend
npm test -- complianceAutomation.test.ts
```

Expected output:
```
PASS  src/tests/complianceAutomation.test.ts
  Compliance Automation Service
    ✓ should load all regulations
    ✓ should run compliance scan for GDPR
    ✓ should get compliance dashboard
    ...
  
Test Suites: 1 passed, 1 total
Tests:       25 passed, 25 total
```

## Understanding Compliance Scores

The compliance score is calculated as follows:

- **100** = Perfect compliance, no violations
- **90-99** = Compliant with minor issues
- **70-89** = Partial compliance, needs attention
- **Below 70** = Non-compliant, immediate action required

Violations are weighted by severity:
- **Critical**: -20 points each
- **High**: -10 points each
- **Medium**: -5 points each
- **Low**: -2 points each

## Next Steps

### 1. Integrate with Your Application

```typescript
import { complianceAutomationService } from './services/complianceAutomationService';

// Run scan
const result = await complianceAutomationService.runComplianceScan('gdpr');

// Check compliance status
if (result.status === 'non-compliant') {
  // Handle non-compliance
  console.log('Violations:', result.violations);
  console.log('Recommendations:', result.recommendations);
}
```

### 2. Set Up Automated Monitoring

Enable monitoring to run scans automatically:

```typescript
// Start monitoring (runs every 6 hours)
complianceAutomationService.startMonitoring('0 */6 * * *');

// Or customize the schedule
complianceAutomationService.startMonitoring('0 0 * * *'); // Daily at midnight
```

### 3. Create Workflows for Violations

```typescript
import { complianceWorkflowService } from './services/complianceWorkflowService';

// Create workflow for a violation
const workflow = await complianceWorkflowService.createWorkflow(
  violationId,
  'data_minimization',
  'high',
  'admin@example.com'
);

// Track progress
console.log(`Workflow ${workflow.workflowId} created`);
console.log(`Due date: ${workflow.dueDate}`);
console.log(`Steps: ${workflow.steps.length}`);
```

### 4. Access Legal Requirements

```typescript
import { legalRequirementsService } from './services/legalRequirementsService';

// Get GDPR requirements
const gdprReqs = legalRequirementsService.getRequirementsByRegulation('gdpr');

// Search requirements
const consentReqs = legalRequirementsService.searchRequirements('consent');

// Check applicability
const isApplicable = legalRequirementsService.isRequirementApplicable(
  'gdpr_art_6',
  'EU'
);
```

## Troubleshooting

### Issue: "Regulation not found"

**Solution**: Make sure the database migration ran successfully and regulations were inserted.

```bash
psql -U postgres -d stellar_privacy -c "SELECT * FROM regulations;"
```

### Issue: "Redis connection failed"

**Solution**: Ensure Redis is running:

```bash
redis-cli ping
# Should return: PONG
```

### Issue: "No violations detected"

**Solution**: This is normal! The service uses simulated checks. In production, implement actual compliance checks in the `performRuleCheck` method.

### Issue: Monitoring not starting

**Solution**: Check that cron expression is valid:

```typescript
// Valid cron expressions:
'0 */6 * * *'  // Every 6 hours
'0 0 * * *'    // Daily at midnight
'*/30 * * * *' // Every 30 minutes
```

## API Testing with Postman

Import this collection to test all endpoints:

1. Create new collection: "Compliance Automation"
2. Add these requests:

**Get Regulations**
- GET `http://localhost:3001/api/v1/compliance-automation/regulations`

**Run GDPR Scan**
- POST `http://localhost:3001/api/v1/compliance-automation/scan`
- Body: `{"regulationId": "gdpr"}`

**Get Dashboard**
- GET `http://localhost:3001/api/v1/compliance-automation/dashboard`

**Generate Report**
- GET `http://localhost:3001/api/v1/compliance-automation/report/gdpr`

**Start Monitoring**
- POST `http://localhost:3001/api/v1/compliance-automation/monitoring/start`
- Body: `{"schedule": "0 */6 * * *"}`

## Production Checklist

Before deploying to production:

- [ ] Run database migration
- [ ] Configure environment variables
- [ ] Set up notification channels (email, Slack, PagerDuty)
- [ ] Implement actual compliance checks (replace simulated checks)
- [ ] Configure monitoring schedule
- [ ] Set up audit log retention
- [ ] Test all API endpoints
- [ ] Run load tests
- [ ] Configure backup and recovery
- [ ] Set up monitoring and alerting
- [ ] Document custom compliance rules
- [ ] Train team on compliance workflows

## Resources

- [Full Documentation](./docs/compliance-automation.md)
- [API Reference](./docs/compliance-automation.md#api-endpoints)
- [Database Schema](./backend/src/migrations/compliance_automation_schema.sql)
- [Test Suite](./backend/src/tests/complianceAutomation.test.ts)

## Support

Need help? Contact us:
- Email: compliance@stellar-ecosystem.com
- Documentation: https://docs.stellar-ecosystem.com/compliance
- GitHub Issues: https://github.com/stellar/issues

---

**You're all set! 🎉**

Your Privacy Compliance Automation Service is now running. Start scanning, monitoring, and maintaining compliance across GDPR, CCPA, and HIPAA regulations.
