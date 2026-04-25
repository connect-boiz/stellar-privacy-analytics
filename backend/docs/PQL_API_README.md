# Privacy-Preserving Query Language (PQL) API

This document describes the comprehensive RESTful API implementation for the Privacy-Preserving Query Language (PQL) that provides secure, differentially private data analysis capabilities.

## Overview

The PQL API enables users to execute analytical queries on sensitive data while maintaining strict privacy guarantees through differential privacy. The API includes comprehensive validation, authentication, rate limiting, and observability features.

## Architecture

### Core Components

1. **API Layer** (`routes/pql.ts`) - RESTful endpoints with comprehensive validation
2. **Authentication** (`middleware/stellarAuth.ts`) - Stellar JWT and API key authentication
3. **Rate Limiting** (`middleware/rateLimiter.ts`) - Tier-based rate limiting with Redis
4. **Query Validation** (`services/pqlValidator.ts`) - Syntax and security validation
5. **Complexity Analysis** (`services/queryComplexityAnalyzer.ts`) - Query cost estimation
6. **Error Handling** (`utils/apiErrorHandler.ts`) - Standardized error responses
7. **Observability** (`middleware/observability.ts`) - Distributed tracing and metrics

### Security Features

- **Stellar-Signed JWT Authentication**: Cryptographic verification of user tokens
- **API Key Authentication**: Service-to-service authentication with secure hashing
- **Tier-Based Rate Limiting**: Different limits per user tier (basic/premium/enterprise)
- **Query Validation**: Comprehensive syntax and security validation
- **Complexity Analysis**: Prevents resource exhaustion and DoS attacks
- **Privacy Budget Management**: Enforces differential privacy constraints
- **Audit Logging**: Complete audit trail with trace IDs

## API Endpoints

### Query Execution

#### Execute Query
```http
POST /api/v1/query
Authorization: Bearer <stellar-jwt>
Content-Type: application/json

{
  "query": "SELECT COUNT(*) FROM users WHERE age > 25",
  "privacyBudget": {
    "epsilon": 0.1,
    "delta": 1e-6
  },
  "options": {
    "timeout": 30,
    "maxGroups": 10,
    "maxRows": 1000
  },
  "context": {
    "sessionId": "session_123",
    "metadata": { "source": "dashboard" }
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "results": [
      { "count": 1250 }
    ],
    "metadata": {
      "queryId": "q_1a2b3c4d5e",
      "executionTime": 1250,
      "privacyBudgetUsed": {
        "epsilon": 0.08,
        "delta": 8e-7
      },
      "noiseAdded": true,
      "rowCount": 1,
      "complexity": {
        "score": 25,
        "operations": {
          "scans": 1,
          "joins": 0,
          "aggregations": 1,
          "filters": 1,
          "sorts": 0,
          "subqueries": 0
        }
      }
    }
  },
  "traceId": "trace_abc123def456",
  "warnings": ["Query uses standard aggregation functions"]
}
```

### Query Validation

#### Validate Query Syntax
```http
POST /api/v1/query/validate
Authorization: Bearer <stellar-jwt>
Content-Type: application/json

{
  "query": "SELECT department, AVG(salary) FROM employees GROUP BY department",
  "options": {
    "timeout": 30
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "errors": [],
    "warnings": [
      {
        "code": "EXPENSIVE_OPERATION",
        "message": "Query contains potentially expensive operations: AVG",
        "severity": "warning"
      }
    ],
    "complexity": {
      "tables": 1,
      "columns": 2,
      "functions": 1
    }
  },
  "traceId": "trace_abc123def456"
}
```

### Query Estimation

#### Estimate Query Cost
```http
POST /api/v1/query/estimate
Authorization: Bearer <stellar-jwt>
Content-Type: application/json

{
  "query": "SELECT department, AVG(salary) FROM employees GROUP BY department",
  "privacyBudget": {
    "epsilon": 0.5,
    "delta": 1e-5
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "canExecute": true,
    "estimatedCost": {
      "time": 1500,
      "privacyBudget": {
        "epsilon": 0.55,
        "delta": 1.1e-5
      },
      "computeUnits": 25.5
    },
    "recommendations": [
      "Consider adding WHERE clause to reduce dataset size",
      "Consider limiting number of groups in GROUP BY"
    ],
    "complexity": {
      "score": 35,
      "estimatedTime": 1500,
      "estimatedCost": 25.5,
      "operations": {
        "scans": 1,
        "joins": 0,
        "aggregations": 1,
        "filters": 0,
        "sorts": 0,
        "subqueries": 0
      },
      "memoryUsage": 128,
      "privacyCost": {
        "epsilon": 0.55,
        "delta": 1.1e-5
      }
    }
  },
  "traceId": "trace_abc123def456"
}
```

### Query Management

#### Get Query Status
```http
GET /api/v1/query/status/q_1a2b3c4d5e
Authorization: Bearer <stellar-jwt>
```

#### Get Query History
```http
GET /api/v1/query/history?limit=20&status=completed&startDate=2024-01-01
Authorization: Bearer <stellar-jwt>
```

#### Cancel Query
```http
DELETE /api/v1/query/cancel/q_1a2b3c4d5e
Authorization: Bearer <stellar-jwt>
```

### Privacy Management

#### Get Privacy Budget
```http
GET /api/v1/privacy/budget
Authorization: Bearer <stellar-jwt>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "currentBudget": {
      "epsilon": 0.3,
      "delta": 3e-6
    },
    "totalBudget": {
      "epsilon": 1.0,
      "delta": 1e-5
    },
    "usage": [
      {
        "date": "2024-01-15",
        "epsilon": 0.7,
        "delta": 7e-6,
        "queryCount": 15
      }
    ],
    "resetDate": "2024-02-01T00:00:00Z"
  },
  "traceId": "trace_abc123def456"
}
```

### Schema Information

#### Get Data Schemas
```http
GET /api/v1/schemas
Authorization: Bearer <stellar-jwt>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "schemas": [
      {
        "name": "users",
        "description": "User demographic information",
        "columns": [
          {
            "name": "id",
            "type": "integer",
            "nullable": false,
            "description": "Unique user identifier",
            "sensitivity": "low"
          },
          {
            "name": "age",
            "type": "integer",
            "nullable": true,
            "description": "User age",
            "sensitivity": "medium"
          },
          {
            "name": "salary",
            "type": "float",
            "nullable": true,
            "description": "Annual salary",
            "sensitivity": "high"
          }
        ],
        "rowCount": 100000,
        "privacyLevel": "restricted"
      }
    ]
  },
  "traceId": "trace_abc123def456"
}
```

## Authentication

### Stellar JWT Authentication

The API accepts Stellar-signed JWT tokens in the Authorization header:

```http
Authorization: Bearer <stellar-jwt-token>
```

**JWT Claims:**
```json
{
  "sub": "user-123",
  "email": "user@example.com",
  "permissions": ["read:queries", "write:queries"],
  "rateLimitTier": "premium",
  "organizationId": "org-123",
  "sessionId": "session-456",
  "iat": 1640995200,
  "exp": 1641081600,
  "jti": "jwt-789",
  "iss": "stellar-privacy",
  "aud": "stellar-api"
}
```

### API Key Authentication

For service-to-service communication:

```http
X-API-Key: stellar_api_v1_abc123def456789012345678901234
```

## Rate Limiting

### Rate Limit Tiers

| Tier | Queries/15min | Max Concurrent | Features |
|------|---------------|----------------|----------|
| Basic | 50 | 5 | Standard queries |
| Premium | 200 | 20 | Complex queries, longer timeouts |
| Enterprise | 1000 | 100 | Unlimited complexity, priority execution |

### Rate Limit Headers

```http
X-RateLimit-Limit: 200
X-RateLimit-Remaining: 195
X-RateLimit-Reset: 1640995200
Retry-After: 60
```

## Error Handling

### Standard Error Response Format

```json
{
  "error": {
    "code": "QUERY_TOO_COMPLEX",
    "message": "Query complexity score exceeds threshold",
    "details": {
      "score": 85,
      "threshold": 75,
      "recommendations": ["Reduce number of joins", "Add WHERE clause"]
    },
    "timestamp": "2024-01-15T10:30:00Z",
    "traceId": "trace_abc123def456"
  },
  "traceId": "trace_abc123def456"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| UNAUTHORIZED | 401 | Authentication required or invalid |
| FORBIDDEN | 403 | Insufficient permissions |
| INVALID_QUERY | 400 | Query syntax error |
| QUERY_TOO_COMPLEX | 400 | Query exceeds complexity limits |
| INSUFFICIENT_PRIVACY_BUDGET | 400 | Not enough privacy budget |
| RATE_LIMIT_EXCEEDED | 429 | Rate limit exceeded |
| INTERNAL_ERROR | 500 | Internal server error |

## Observability

### Distributed Tracing

Every request includes a unique trace ID for end-to-end observability:

```http
X-Trace-Id: trace_abc123def4567890
X-Span-Id: span_1234567890abcdef
```

### Trace Context

The API provides comprehensive tracing for query execution:

1. **Request Validation**: Input validation and authentication
2. **Query Parsing**: Syntax analysis and validation
3. **Complexity Analysis**: Cost estimation and resource planning
4. **Privacy Budget Check**: Privacy budget verification
5. **Query Execution**: Actual query processing
6. **Response Formatting**: Result preparation and response

### Metrics

The API tracks comprehensive metrics:

- Request count and duration by endpoint
- Query complexity scores and execution times
- Privacy budget consumption
- Authentication success/failure rates
- Rate limit violations
- Error rates by type

## Security Features

### Query Validation

The API validates queries for:

- **Syntax Errors**: SQL/PQL syntax validation
- **Security Constraints**: Prevention of dangerous operations
- **Privacy Violations**: Detection of privacy-compromising patterns
- **Resource Limits**: Protection against resource exhaustion

### Complexity Analysis

Queries are analyzed for:

- **Execution Time**: Estimated processing time
- **Memory Usage**: Estimated memory requirements
- **Computational Cost**: Complexity score (1-100)
- **Privacy Cost**: Differential privacy budget impact

### Privacy Protection

- **Differential Privacy**: Mathematical privacy guarantees
- **Budget Management**: Per-user privacy budget enforcement
- **Noise Injection**: Automatic noise addition for privacy
- **Aggregation Requirements**: Mandatory aggregation for privacy

## Configuration

### Environment Variables

```bash
# Authentication
STELLAR_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----
API_KEY_SECRET=your-secret-key
STELLAR_ALLOWED_ISSUERS=stellar-privacy
STELLAR_ALLOWED_AUDIENCES=stellar-api
STELLAR_CLOCK_SKEW_TOLERANCE=30

# Rate Limiting
REDIS_URL=redis://localhost:6379

# Observability
ENABLE_TRACING=true
ENABLE_METRICS=true
TRACE_SAMPLE_RATE=1.0

# Query Processing
MAX_QUERY_LENGTH=10000
MAX_JOINS=5
MAX_SUBQUERIES=3
QUERY_TIMEOUT=30000

# Privacy
DEFAULT_EPSILON_BUDGET=1.0
DEFAULT_DELTA_BUDGET=1e-5
PRIVACY_BUDGET_RESET_DAYS=30
```

### Complexity Thresholds

```json
{
  "thresholds": {
    "maxScore": 75,
    "maxEstimatedTime": 30000,
    "maxEstimatedCost": 1000,
    "maxMemoryUsage": 512,
    "maxJoins": 5,
    "maxSubqueries": 3
  }
}
```

## Usage Examples

### Basic Query Execution

```javascript
const response = await fetch('/api/v1/query', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + jwtToken,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: 'SELECT COUNT(*) FROM users WHERE age > 25',
    privacyBudget: {
      epsilon: 0.1,
      delta: 1e-6
    },
    options: {
      timeout: 30
    }
  })
});

const result = await response.json();
console.log('Query result:', result.data.results);
```

### Query Validation Before Execution

```javascript
// First validate the query
const validationResponse = await fetch('/api/v1/query/validate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + jwtToken,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: 'SELECT department, AVG(salary) FROM employees GROUP BY department'
  })
});

const validation = await validationResponse.json();

if (!validation.data.valid) {
  console.error('Query validation failed:', validation.data.errors);
  return;
}

// Then estimate cost
const estimationResponse = await fetch('/api/v1/query/estimate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + jwtToken,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: 'SELECT department, AVG(salary) FROM employees GROUP BY department',
    privacyBudget: { epsilon: 0.5, delta: 1e-5 }
  })
});

const estimation = await estimationResponse.json();

if (!estimation.data.canExecute) {
  console.error('Query too complex:', estimation.data.reason);
  return;
}

// Finally execute the query
const executeResponse = await fetch('/api/v1/query', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + jwtToken,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: 'SELECT department, AVG(salary) FROM employees GROUP BY department',
    privacyBudget: { epsilon: 0.5, delta: 1e-5 }
  })
});

const result = await executeResponse.json();
console.log('Query results:', result.data.results);
```

### Monitoring Query Status

```javascript
const queryId = 'q_1a2b3c4d5e';

// Poll for completion
const pollStatus = async () => {
  const response = await fetch(`/api/v1/query/status/${queryId}`, {
    headers: {
      'Authorization': 'Bearer ' + jwtToken
    }
  });
  
  const status = await response.json();
  
  if (status.data.status === 'completed') {
    console.log('Query completed:', status.data.result);
  } else if (status.data.status === 'failed') {
    console.error('Query failed:', status.data.error);
  } else {
    console.log('Query progress:', status.data.progress);
    setTimeout(pollStatus, 1000);
  }
};

pollStatus();
```

## Testing

### Unit Tests

```bash
npm test -- --testPathPattern=pql
```

### Integration Tests

```bash
npm run test:integration -- pql
```

### Load Testing

```bash
npm run test:load -- pql-api
```

## Troubleshooting

### Common Issues

#### Authentication Failures
```bash
# Check JWT token format
echo $JWT_TOKEN | jq .

# Verify Stellar public key
openssl x509 -in stellar.pub -noout -text
```

#### Rate Limiting
```bash
# Check Redis connection
redis-cli ping

# Monitor rate limit keys
redis-cli keys "rate_limit:*"
```

#### Query Validation
```bash
# Validate query syntax
curl -X POST /api/v1/query/validate \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT * FROM users"}'
```

### Debugging

Enable debug logging:

```bash
export LOG_LEVEL=debug
export ENABLE_TRACING=true
export TRACE_SAMPLE_RATE=1.0
```

Check trace information:

```bash
# Get trace details
curl -H "X-Trace-Id: trace_abc123def456" \
  /api/v1/debug/trace/trace_abc123def456
```

## Performance

### Benchmarks

- **Simple Query**: ~50ms
- **Complex Aggregation**: ~500ms
- **Multi-Join Query**: ~2000ms
- **Large Dataset**: ~5000ms

### Optimization Tips

1. **Use Specific Columns**: Avoid `SELECT *`
2. **Add WHERE Clauses**: Reduce dataset size early
3. **Limit Groups**: Use reasonable `GROUP BY` limits
4. **Index Columns**: Query on indexed columns when possible
5. **Batch Queries**: Combine multiple operations

## Monitoring and Alerting

### Key Metrics

- Query execution time (p95, p99)
- Error rate by endpoint
- Privacy budget consumption
- Rate limit violations
- Authentication failures

### Alerts

- High error rate (>5%)
- Slow queries (>10s)
- Privacy budget exhaustion
- Rate limit abuse
- Authentication failures

## Support

For support:

1. Check the trace ID in error responses
2. Review query validation errors
3. Verify privacy budget status
4. Check rate limit headers
5. Contact support with trace ID

## License

This PQL API implementation is part of the Stellar Privacy Analytics platform and is subject to the same license terms.
