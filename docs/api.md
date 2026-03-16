# Stellar API Documentation

## Overview

The Stellar API provides privacy-first data analytics and visualization capabilities. All endpoints are designed with privacy protection as a primary concern.

## Base URL

```
Development: http://localhost:3001/api/v1
Production: https://your-domain.com/api/v1
```

## Authentication

Stellar uses JWT-based authentication with privacy-enhanced features:

```http
Authorization: Bearer <jwt_token>
X-Privacy-Level: high|maximum|standard|minimal
X-Consent: true|false
```

### Authentication Endpoints

#### Register User
```http
POST /auth/register
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "secure_password",
  "privacySettings": {
    "level": "high",
    "dataRetentionDays": 365,
    "allowDataExport": true
  }
}
```

**Response:**
```json
{
  "userId": "uuid",
  "token": "jwt_token",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "privacyLevel": "high"
  }
}
```

#### Login
```http
POST /auth/login
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "secure_password"
}
```

**Response:**
```json
{
  "token": "jwt_token",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "privacyLevel": "high"
  },
  "expiresIn": "24h"
}
```

## Data Management

### Upload Dataset
```http
POST /data/upload
```

**Headers:**
- `Content-Type: multipart/form-data`
- `X-Privacy-Level: high`

**Request Body:**
```
file: <dataset_file>
privacyLevel: "high"
encryptionRequired: true
```

**Response:**
```json
{
  "datasetId": "uuid",
  "status": "uploaded",
  "encrypted": true,
  "privacyScore": 0.85,
  "recordsProcessed": 1000
}
```

### Get Datasets
```http
GET /data
```

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)
- `privacyLevel`: Filter by privacy level
- `status`: Filter by status

**Response:**
```json
{
  "datasets": [
    {
      "id": "uuid",
      "name": "Customer Data",
      "size": "2.4GB",
      "records": 125000,
      "encrypted": true,
      "privacyLevel": "high",
      "uploadedAt": "2024-01-15T10:00:00Z",
      "status": "processed"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  }
}
```

### Get Dataset Details
```http
GET /data/{datasetId}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "Customer Data",
  "description": "Customer behavior analysis dataset",
  "schema": {
    "fields": [
      {
        "name": "customer_id",
        "type": "string",
        "encrypted": true,
        "sensitive": false
      },
      {
        "name": "purchase_amount",
        "type": "numerical",
        "encrypted": true,
        "sensitive": true
      }
    ]
  },
  "privacyMetrics": {
    "encryptionStrength": "AES-256",
    "anonymizationLevel": "high",
    "differentialPrivacyEpsilon": 1.0,
    "reidentificationRisk": 0.02
  }
}
```

### Delete Dataset
```http
DELETE /data/{datasetId}
```

**Response:**
```json
{
  "message": "Dataset deleted successfully",
  "auditLog": {
    "id": "uuid",
    "action": "delete",
    "timestamp": "2024-01-15T10:00:00Z"
  }
}
```

## X-Ray Analytics

### Create Analysis
```http
POST /analytics
```

**Request Body:**
```json
{
  "name": "Customer Behavior Analysis",
  "type": "descriptive",
  "datasetId": "uuid",
  "parameters": {
    "fields": ["purchase_amount", "frequency"],
    "privacyBudget": 1.0,
    "minimumSampleSize": 50,
    "aggregations": ["mean", "count", "std_dev"]
  },
  "privacySettings": {
    "differentialPrivacyEpsilon": 0.5,
    "noiseMechanism": "laplace",
    "anonymizationLevel": "high"
  }
}
```

**Response:**
```json
{
  "analysisId": "uuid",
  "status": "pending",
  "estimatedDuration": "5-10 minutes",
  "privacyBudgetReserved": 0.5,
  "jobId": "job_uuid"
}
```

### Get Analyses
```http
GET /analytics
```

**Query Parameters:**
- `status`: Filter by status
- `type`: Filter by analysis type
- `datasetId`: Filter by dataset

**Response:**
```json
{
  "analyses": [
    {
      "id": "uuid",
      "name": "Customer Behavior Analysis",
      "type": "descriptive",
      "status": "completed",
      "createdAt": "2024-01-15T10:00:00Z",
      "completedAt": "2024-01-15T10:05:00Z",
      "privacyScore": 0.92,
      "accuracy": 0.94
    }
  ]
}
```

### Get Analysis Results
```http
GET /analytics/{analysisId}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "Customer Behavior Analysis",
  "status": "completed",
  "results": {
    "summary": {
      "totalRecords": 1000,
      "processedRecords": 950,
      "privacyBudgetUsed": 0.45,
      "executionTimeMs": 120000
    },
    "data": [
      {
        "field": "purchase_amount",
        "metrics": {
          "mean": 125.50,
          "count": 950,
          "stdDev": 45.25,
          "privacyNoise": 2.1,
          "confidence": 0.95
        }
      }
    ],
    "visualizations": [
      {
        "type": "histogram",
        "title": "Purchase Amount Distribution",
        "config": {
          "bins": 20,
          "xAxis": "purchase_amount",
          "yAxis": "frequency"
        },
        "privacyAnnotations": [
          {
            "type": "noise_level",
            "message": "Data includes differential privacy noise (ε=0.5)",
            "level": "info"
          }
        ]
      }
    ],
    "privacyMetrics": {
      "epsilonUsed": 0.45,
      "remainingBudget": 0.55,
      "anonymizationStrength": 0.92,
      "dataUtilityScore": 0.88,
      "reidentificationRisk": 0.01
    }
  }
}
```

### Run Analysis
```http
POST /analytics/{analysisId}/run
```

**Request Body:**
```json
{
  "privacyBudget": 0.5,
  "parameters": {
    "filters": [
      {
        "field": "purchase_amount",
        "operator": "gt",
        "value": 0
      }
    ]
  }
}
```

**Response:**
```json
{
  "jobId": "uuid",
  "status": "running",
  "estimatedCompletion": "2024-01-15T10:10:00Z",
  "privacyBudgetAllocated": 0.5
}
```

## Privacy Settings

### Get Privacy Settings
```http
GET /privacy/settings
```

**Response:**
```json
{
  "level": "high",
  "dataRetentionDays": 365,
  "allowDataExport": true,
  "allowSharing": false,
  "differentialPrivacyEpsilon": 1.0,
  "minimumParticipants": 5,
  "anonymizationTechnique": "differential_privacy",
  "privacyScore": 0.92
}
```

### Update Privacy Settings
```http
PUT /privacy/settings
```

**Request Body:**
```json
{
  "level": "maximum",
  "dataRetentionDays": 180,
  "allowDataExport": false,
  "differentialPrivacyEpsilon": 0.5,
  "minimumParticipants": 10
}
```

**Response:**
```json
{
  "message": "Privacy settings updated successfully",
  "privacyScore": 0.96,
  "changesApplied": [
    "privacy_level",
    "data_retention",
    "differential_privacy_epsilon"
  ]
}
```

### Get Privacy Audit Logs
```http
GET /privacy/audit
```

**Query Parameters:**
- `startDate`: Filter by start date
- `endDate`: Filter by end date
- `action`: Filter by action type
- `userId`: Filter by user

**Response:**
```json
{
  "logs": [
    {
      "id": "uuid",
      "userId": "uuid",
      "action": "data_access",
      "resource": "dataset_uuid",
      "privacyLevel": "high",
      "dataAccessed": ["customer_id", "purchase_amount"],
      "timestamp": "2024-01-15T10:00:00Z",
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0...",
      "success": true,
      "privacyImpact": "low"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1000
  }
}
```

### Get Consent Records
```http
GET /privacy/consent
```

**Response:**
```json
{
  "consents": [
    {
      "id": "uuid",
      "userId": "uuid",
      "dataSchemaId": "uuid",
      "purposes": ["analytics", "research"],
      "granted": true,
      "timestamp": "2024-01-15T10:00:00Z",
      "expiresAt": "2025-01-15T10:00:00Z",
      "version": 1,
      "ipAddress": "192.168.1.100"
    }
  ]
}
```

### Update Consent
```http
POST /privacy/consent
```

**Request Body:**
```json
{
  "dataSchemaId": "uuid",
  "purposes": ["analytics", "research", "marketing"],
  "granted": true,
  "version": 2
}
```

**Response:**
```json
{
  "consentId": "uuid",
  "message": "Consent updated successfully",
  "version": 2,
  "timestamp": "2024-01-15T10:00:00Z"
}
```

## Error Handling

Stellar API uses standard HTTP status codes and provides detailed error information:

```json
{
  "error": {
    "message": "Privacy budget exceeded",
    "code": "PRIVACY_BUDGET_EXCEEDED",
    "statusCode": 429,
    "timestamp": "2024-01-15T10:00:00Z",
    "details": {
      "remainingBudget": 0.1,
      "requestedBudget": 0.5,
      "suggestion": "Wait for budget renewal or reduce privacy requirements"
    }
  }
}
```

### Common Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `UNAUTHORIZED` | Invalid or missing authentication | 401 |
| `FORBIDDEN` | Insufficient permissions | 403 |
| `NOT_FOUND` | Resource not found | 404 |
| `VALIDATION_ERROR` | Invalid request data | 400 |
| `PRIVACY_BUDGET_EXCEEDED` | Privacy budget insufficient | 429 |
| `ENCRYPTION_ERROR` | Data encryption/decryption failed | 500 |
| `CONSENT_REQUIRED` | User consent not granted | 403 |
| `DATA_RETENTION_EXPIRED` | Data retention period exceeded | 410 |

## Rate Limiting

API endpoints are rate-limited to ensure fair usage and privacy protection:

- **Standard endpoints**: 100 requests per 15 minutes
- **Analytics endpoints**: 10 requests per 15 minutes
- **Data upload**: 5 requests per hour

Rate limit headers are included in responses:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642248000
```

## Privacy Headers

All API responses include privacy-related headers:

```http
X-Privacy-Level: high
X-Data-Encrypted: true
X-Differential-Privacy: true
X-Privacy-Budget-Used: 0.45
X-Privacy-Budget-Remaining: 0.55
```

## Webhooks

Stellar supports webhooks for real-time notifications:

### Configure Webhook
```http
POST /webhooks
```

**Request Body:**
```json
{
  "url": "https://your-webhook-endpoint.com/stellar",
  "events": ["analysis_completed", "data_uploaded", "privacy_alert"],
  "secret": "webhook_secret",
  "active": true
}
```

### Webhook Events

#### Analysis Completed
```json
{
  "event": "analysis_completed",
  "timestamp": "2024-01-15T10:00:00Z",
  "data": {
    "analysisId": "uuid",
    "status": "completed",
    "privacyScore": 0.92,
    "resultsAvailable": true
  }
}
```

#### Privacy Alert
```json
{
  "event": "privacy_alert",
  "timestamp": "2024-01-15T10:00:00Z",
  "data": {
    "type": "unusual_access_pattern",
    "severity": "medium",
    "userId": "uuid",
    "description": "Multiple data access requests detected"
  }
}
```

## SDK Integration

### JavaScript/TypeScript

```typescript
import { StellarClient } from '@stellar/sdk';

const client = new StellarClient({
  baseURL: 'http://localhost:3001/api/v1',
  token: 'your_jwt_token',
  privacyLevel: 'high'
});

// Upload data
const dataset = await client.data.upload(file, {
  privacyLevel: 'high',
  encryptionRequired: true
});

// Run analysis
const analysis = await client.analytics.create({
  name: 'Customer Analysis',
  type: 'descriptive',
  datasetId: dataset.id,
  privacyBudget: 1.0
});
```

### Python

```python
from stellar_sdk import StellarClient

client = StellarClient(
    base_url='http://localhost:3001/api/v1',
    token='your_jwt_token',
    privacy_level='high'
)

# Upload data
dataset = client.data.upload(file, privacy_level='high')

# Run analysis
analysis = client.analytics.create(
    name='Customer Analysis',
    type='descriptive',
    dataset_id=dataset.id,
    privacy_budget=1.0
)
```

## Testing

### Test Environment

Stellar provides a test environment at `https://api-test.stellar-ecosystem.com` with:

- Test data and datasets
- Simulated privacy operations
- Rate limit overrides
- Debug logging

### Test API Keys

Generate test API keys in the Stellar dashboard or use:

```bash
curl -X POST https://api-test.stellar-ecosystem.com/api/v1/auth/test-key \
  -H "Authorization: Bearer your_admin_token"
```

## Support

For API support:

- **Documentation**: https://docs.stellar-ecosystem.com
- **API Status**: https://status.stellar-ecosystem.com
- **Support**: api-support@stellar-ecosystem.com
- **GitHub Issues**: https://github.com/your-org/stellar/issues

## Changelog

### v1.0.0 (2024-01-15)
- Initial API release
- Core privacy features
- X-Ray analytics endpoints
- Data management capabilities

### v1.1.0 (Upcoming)
- Enhanced differential privacy
- Advanced visualization types
- Real-time analytics streaming
- Improved SDK support
