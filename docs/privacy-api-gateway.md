# Privacy API Gateway

A specialized API gateway that enforces privacy policies, manages access controls, and provides privacy-aware request routing and rate limiting for the Stellar Privacy Analytics ecosystem.

## 🌟 Core Features

- **Privacy Policy Enforcement**: Real-time policy evaluation and enforcement at API level
- **Attribute-Based Access Control (ABAC)**: Fine-grained access control based on user attributes and context
- **Privacy-Aware Request Routing**: Intelligent routing with privacy considerations
- **Load Balancing**: Multiple strategies with health monitoring
- **API Key Management**: Secure key creation, validation, and lifecycle management
- **Request/Response Transformation**: Privacy-preserving data transformations
- **Privacy Metrics Collection**: Comprehensive monitoring and alerting
- **Performance Optimization**: Caching and efficient request processing

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client API    │───▶│ Privacy Gateway  │───▶│ Backend Services│
│                 │    │                  │    │                 │
│ - API Key      │    │ - Policy Engine  │    │ - Analytics    │
│ - Privacy Level │    │ - ABAC Service  │    │ - Data         │
│ - Consent      │    │ - Transformer   │    │ - Privacy      │
└─────────────────┘    │ - Load Balancer │    │                 │
                       │ - Metrics       │    └─────────────────┘
                       └──────────────────┘
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Redis for caching
- PostgreSQL for metrics storage
- Backend services running on configured ports

### Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Start the gateway
npm run dev
```

### Configuration

Environment variables for the gateway:

```env
# Gateway Configuration
GATEWAY_ENABLED=true
GATEWAY_PORT=8080

# Privacy Settings
DEFAULT_PRIVACY_LEVEL=high
ENFORCE_GDPR=true
DATA_RETENTION_DAYS=365

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000

# Load Balancing
LOAD_BALANCING_STRATEGY=least-connections
HEALTH_CHECK_INTERVAL=30000

# Metrics
METRICS_ENABLED=true
METRICS_COLLECTION_INTERVAL=60000
METRICS_RETENTION_PERIOD=604800000
```

## 📋 API Documentation

### Gateway Management Endpoints

#### Get Gateway Status
```http
GET /api/v1/gateway/status
```

#### Get Metrics
```http
GET /api/v1/gateway/metrics
```

#### Manage API Keys
```http
POST   /api/v1/gateway/api-keys    # Create key
GET    /api/v1/gateway/api-keys    # List keys
DELETE /api/v1/gateway/api-keys/:id # Revoke key
```

#### Privacy Policies
```http
GET /api/v1/gateway/policies     # List policies
PUT /api/v1/gateway/policies     # Update policy
```

#### Service Health
```http
GET /api/v1/gateway/services      # Service health status
```

### Proxy Endpoints

All backend services are accessible through the gateway with privacy enforcement:

```http
# Analytics Service
GET    /gateway/analytics/data
POST   /gateway/analytics/query
GET    /gateway/analytics/reports

# Data Service
POST   /gateway/data/upload
POST   /gateway/data/query

# Privacy Service
GET    /gateway/privacy/settings
PUT    /gateway/privacy/settings
POST   /gateway/privacy/forget
```

## 🔐 Privacy Features

### Policy Enforcement

The gateway enforces privacy policies in real-time:

```json
{
  "id": "gdpr-compliance",
  "name": "GDPR Compliance Policy",
  "rules": [
    {
      "attribute": "privacy.jurisdiction",
      "operator": "equals",
      "value": "EU",
      "action": "transform",
      "transformation": {
        "type": "pseudonymize",
        "field": "personalData"
      }
    }
  ],
  "priority": 100,
  "enabled": true
}
```

### ABAC System

Attribute-Based Access Control evaluates:

- User attributes (roles, department, clearance)
- Resource attributes (classification, sensitivity)
- Environmental attributes (IP, time, jurisdiction)

### Data Transformations

Privacy-preserving transformations:

- **Masking**: Partial or full data masking
- **Encryption**: AES-256-GCM encryption for sensitive data
- **Hashing**: One-way hashing for identifiers
- **Pseudonymization**: Reversible pseudonyms with salt
- **Removal**: Complete field removal

### API Key Management

Secure API key lifecycle:

1. **Creation**: Generate cryptographically secure keys
2. **Validation**: Real-time key validation with rate limits
3. **Usage Tracking**: Comprehensive usage analytics
4. **Revocation**: Immediate key deactivation

## 📊 Monitoring & Metrics

### Privacy Metrics

- Total requests and success/block rates
- Requests by privacy level and endpoint
- Policy violations and alerts
- Transformation statistics
- Performance metrics

### Alerts

Real-time alerts for:

- Policy violations
- Rate limit exceeded
- Unauthorized access attempts
- Data breach risks
- Service health issues

### Export Formats

Metrics available in:
- JSON (default)
- CSV for analysis
- Prometheus for monitoring

## ⚖️ Compliance Features

### GDPR Compliance

- Right to be forgotten enforcement
- Data minimization
- Consent management
- Privacy by design

### Data Classification

- Automatic classification enforcement
- Access control based on sensitivity
- Audit trail for compliance

### Audit Logging

Complete audit trail for:
- All API requests
- Policy decisions
- Data transformations
- Access violations

## 🔧 Configuration Examples

### Service Configuration

```json
{
  "id": "analytics",
  "name": "Analytics Service",
  "baseUrl": "http://localhost:3002",
  "privacyRequirements": {
    "minPrivacyLevel": "medium",
    "dataClassification": "internal",
    "encryptionRequired": true,
    "auditRequired": true
  },
  "routes": [
    {
      "path": "/analytics/*",
      "methods": ["GET", "POST"],
      "privacyLevel": "medium",
      "requiresAuth": true,
      "transformationRules": [
        {
          "type": "mask",
          "field": "user.email",
          "parameters": {
            "type": "partial",
            "visibleChars": 3
          }
        }
      ]
    }
  ]
}
```

### Transformation Rules

```json
{
  "type": "encrypt",
  "field": "personalData",
  "parameters": {
    "algorithm": "aes-256-gcm",
    "keyId": "sensitive_data_key",
    "ivLength": 16
  }
}
```

## 🚀 Performance Optimization

### Caching

- Policy evaluation results cached for 5 minutes
- Service health status cached
- API key validation cached

### Load Balancing Strategies

- **Round Robin**: Sequential distribution
- **Least Connections**: Route to least busy service
- **Weighted**: Weight-based distribution
- **Random**: Random selection

### Rate Limiting

- Global rate limits
- Per-API-key limits
- Route-specific overrides
- Sliding window implementation

## 🛡️ Security Features

### API Security

- API key authentication
- Request signing
- IP-based restrictions
- Origin validation

### Data Protection

- End-to-end encryption
- Secure key management
- Data in transit protection
- Memory sanitization

### Attack Prevention

- Rate limiting
- Request size limits
- Malicious pattern detection
- DDoS protection

## 📈 Scalability

### Horizontal Scaling

- Stateless gateway design
- Redis for shared state
- Database for persistent data
- Load balancer friendly

### Performance

- Sub-millisecond policy evaluation
- Efficient transformation algorithms
- Optimized routing decisions
- Minimal memory footprint

## 🧪 Testing

### Unit Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Integration Tests

```bash
# Run integration tests
npm run test:integration

# Test with mock services
npm run test:mock
```

### Load Testing

```bash
# Load test with artillery
npm run test:load

# Performance benchmarks
npm run test:performance
```

## 📚 Examples

### Making a Privacy-Aware Request

```javascript
const headers = {
  'X-API-Key': 'your-api-key',
  'X-Privacy-Level': 'high',
  'X-Consent': 'true',
  'X-Jurisdiction': 'US',
  'X-Purpose': 'analytics'
};

fetch('/gateway/analytics/data', {
  method: 'GET',
  headers
});
```

### Creating an API Key

```javascript
const keyRequest = {
  name: 'Analytics Client',
  permissions: ['analytics:read', 'analytics:write'],
  restrictions: {
    allowedIPs: ['192.168.1.0/24'],
    allowedOrigins: ['https://app.example.com']
  },
  metadata: {
    owner: 'analytics-team',
    department: 'data-analytics',
    purpose: 'Analytics dashboard access'
  }
};

const response = await fetch('/api/v1/gateway/api-keys', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(keyRequest)
});
```

## 🔍 Troubleshooting

### Common Issues

1. **Gateway not starting**
   - Check port availability
   - Verify environment variables
   - Check Redis connection

2. **Policy violations**
   - Review policy configuration
   - Check user attributes
   - Verify consent status

3. **Performance issues**
   - Monitor cache hit rates
   - Check service health
   - Review transformation rules

### Debug Mode

```env
DEBUG=privacy-gateway:*
LOG_LEVEL=debug
```

### Health Checks

```bash
# Gateway health
curl http://localhost:8080/gateway/health

# Service health
curl http://localhost:8080/api/v1/gateway/services

# Metrics status
curl http://localhost:8080/api/v1/gateway/metrics
```

## 🤝 Contributing

Please see the [Contributing Guide](../CONTRIBUTING.md) for details on:

- Code style and standards
- Testing requirements
- Security considerations
- Documentation guidelines

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

## 🙋‍♂️ Support

- 📧 Email: support@stellar-ecosystem.com
- 💬 Discord: [Join our community](https://discord.gg/stellar)
- 📖 Documentation: [docs.stellar-ecosystem.com](https://docs.stellar-ecosystem.com)
- 🐛 Issues: [GitHub Issues](https://github.com/your-org/stellar/issues)

---

**Built with ❤️ for privacy-conscious organizations**
