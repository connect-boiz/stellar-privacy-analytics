# HSM Integration for Backend Master Key Management

This document describes the comprehensive HSM (Hardware Security Module) integration implemented for secure master key management in the Stellar Privacy Analytics backend.

## Overview

The HSM integration provides enterprise-grade cryptographic security for managing master encryption keys used throughout the platform. It ensures that master keys never leave the HSM unencrypted while providing seamless key operations for the application.

## Architecture

### Core Components

1. **HSMService** - Direct interface to the HSM provider
2. **MasterKeyManager** - Manages master keys and data key generation
3. **AuditService** - Immutable audit logging for all cryptographic operations
4. **KillSwitchService** - Emergency security controls
5. **HSMIntegration** - Unified service orchestrator

### Security Features

- **Zero-Knowledge Architecture**: Master keys never leave the HSM
- **Mutual TLS Authentication**: Secure communication with HSM provider
- **Automated Key Rotation**: 90-day rotation with zero downtime
- **Immutable Audit Trail**: Cryptographically signed audit logs
- **Emergency Kill Switch**: Instant revocation of all cryptographic operations
- **Strict Access Controls**: Role-based access with comprehensive logging

## Configuration

### Environment Variables

Copy `.env.hsm.example` to `.env` and configure:

```bash
# HSM Provider Configuration
HSM_ENDPOINT=https://your-hsm-provider.com:8443
HSM_API_KEY=your-api-key
HSM_API_SECRET=your-api-secret
HSM_CLIENT_ID=stellar-backend

# Optional Mutual TLS
HSM_CLIENT_CERT_PATH=/path/to/client.crt
HSM_CLIENT_KEY_PATH=/path/to/client.key
HSM_CA_CERT_PATH=/path/to/ca.crt

# Key Management
HSM_KEY_ROTATION_DAYS=90
AUDIT_SIGNATURE_KEY=your-signature-key
```

### HSM Provider Support

The integration supports:
- **Cloud HSM**: AWS CloudHSM, Azure Dedicated HSM, Google Cloud HSM
- **On-Premise HSM**: Thales Network HSM, SafeNet Network HSM
- **Custom HSM**: Any RESTful HSM API compatible service

## API Endpoints

### Key Management

#### Generate Data Key
```http
POST /api/v1/hsm/keys/generate
Content-Type: application/json

{
  "purpose": "user-data-encryption",
  "context": { "userId": "123" },
  "ttl": 3600
}
```

#### Decrypt Data Key
```http
POST /api/v1/hsm/keys/decrypt
Content-Type: application/json

{
  "wrappedKey": {
    "ciphertext": "...",
    "iv": "...",
    "tag": "...",
    "keyId": "...",
    "version": 1,
    "algorithm": "aes-256-gcm"
  },
  "purpose": "user-data-encryption",
  "context": { "userId": "123" }
}
```

### Master Key Operations

#### Rotate Master Key
```http
POST /api/v1/hsm/master-key/rotate
Authorization: Bearer <admin-token>
```

#### Get Master Key Status
```http
GET /api/v1/hsm/master-key/status
Authorization: Bearer <admin-token>
```

### System Management

#### System Status
```http
GET /api/v1/hsm/status
```

#### Health Report
```http
GET /api/v1/hsm/health
```

### Security Controls

#### Activate Kill Switch
```http
POST /api/v1/hsm/kill-switch/activate
Content-Type: application/json

{
  "reason": "Security incident detected"
}
```

#### Deactivate Kill Switch
```http
POST /api/v1/hsm/kill-switch/deactivate
Content-Type: application/json

{
  "reason": "Investigation complete"
}
```

### Audit and Compliance

#### Get Audit Log
```http
GET /api/v1/hsm/audit?startDate=2024-01-01&endDate=2024-01-31&category=key_management
```

#### Export Audit Log
```http
GET /api/v1/hsm/audit/export?format=csv&startDate=2024-01-01
```

#### Verify Audit Integrity
```http
GET /api/v1/hsm/audit/integrity
```

## Usage Examples

### Basic Key Operations

```typescript
import { getHSMIntegration } from './services/hsmIntegration';

const hsm = getHSMIntegration();

// Generate data key for user encryption
const dataKey = await hsm.generateDataKey(
  'user-data-encryption',
  'user-123',
  { department: 'analytics' }
);

// Decrypt data key when needed
const plaintextKey = await hsm.decryptDataKey(
  dataKey.wrappedKey,
  'user-data-encryption',
  'user-123',
  { department: 'analytics' }
);
```

### Emergency Procedures

```typescript
// Emergency shutdown
await hsm.emergencyShutdown(
  'Suspicious activity detected',
  'security-admin'
);

// Manual kill switch activation
await hsm.activateKillSwitch(
  'Manual security lockdown',
  'security-admin'
);

// Deactivate when safe
await hsm.deactivateKillSwitch(
  'Threat neutralized',
  'security-admin'
);
```

### Monitoring and Health

```typescript
// Get comprehensive system status
const status = await hsm.getSystemStatus();

// Get detailed health report
const healthReport = await hsm.getHealthReport();

// Monitor audit metrics
const auditMetrics = await hsm.getAuditMetrics({
  category: 'key_management',
  startDate: new Date('2024-01-01')
});
```

## Security Model

### Key Hierarchy

```
HSM (Master Key)
    ↓
Data Keys (Application Level)
    ↓
Content Encryption (User Data)
```

### Access Controls

1. **HSM Level**: Mutual TLS + API authentication
2. **Application Level**: Role-based access control
3. **Audit Level**: Immutable logging of all operations

### Threat Mitigation

| Threat | Mitigation |
|--------|------------|
| Key Extraction | Keys never leave HSM |
| Unauthorized Access | Mutual TLS + RBAC |
| Key Compromise | Automated rotation |
| Audit Tampering | Cryptographic signatures |
| System Compromise | Emergency kill switch |

## Compliance Features

### Regulatory Support

- **SOX**: Comprehensive audit trails and access controls
- **GDPR**: Right to encryption and data protection
- **PCI-DSS**: Secure key management practices
- **HIPAA**: Healthcare data protection standards

### Audit Capabilities

- **Immutable Logs**: Cryptographically signed audit records
- **Complete Traceability**: Every operation logged with user context
- **Retention Management**: Configurable log retention policies
- **Export Capabilities**: JSON/CSV export for compliance reporting

## Testing

### Unit Tests

```bash
npm test -- --testPathPattern=hsm
```

### Integration Tests

```bash
npm run test:integration -- hsm
```

### Mock HSM Testing

The integration includes a comprehensive mock HSM for testing:

```typescript
import { MockHSM } from './tests/mockHSM';

const mockHSM = new MockHSM();
// Test with mock implementation
```

## Deployment

### Production Deployment

1. **Configure HSM Provider**: Set up cloud or on-premise HSM
2. **Configure TLS**: Install client certificates for mutual authentication
3. **Set Environment**: Configure all required environment variables
4. **Test Integration**: Verify HSM connectivity and operations
5. **Monitor Health**: Set up monitoring for HSM service health

### High Availability

- **HSM Redundancy**: Configure multiple HSM endpoints
- **Failover Logic**: Automatic failover on HSM unavailability
- **Health Monitoring**: Continuous health checks and alerts
- **Graceful Degradation**: Safe operation during HSM maintenance

### Monitoring and Alerting

Monitor these key metrics:

- HSM connection health
- Key rotation status
- Audit log integrity
- Kill switch status
- Security event rates

## Troubleshooting

### Common Issues

#### HSM Connection Failed
```bash
# Check network connectivity
curl -v https://your-hsm-provider.com:8443/health

# Verify certificates
openssl s_client -connect your-hsm-provider.com:8443 \
  -cert client.crt -key client.key -CAfile ca.crt
```

#### Key Rotation Failed
```bash
# Check HSM service logs
kubectl logs hsm-service-pod

# Verify key permissions
GET /api/v1/hsm/master-key/status
```

#### Audit Integrity Issues
```bash
# Verify audit log integrity
GET /api/v1/hsm/audit/integrity

# Check for tampering
grep "signature.*invalid" logs/audit.log
```

### Emergency Procedures

#### Complete System Lockdown
```bash
# Activate kill switch
curl -X POST /api/v1/hsm/kill-switch/activate \
  -H "Content-Type: application/json" \
  -d '{"reason": "Emergency lockdown"}'

# Verify activation
curl /api/v1/hsm/status
```

#### Recovery from Kill Switch
```bash
# Investigate security incident
curl /api/v1/hsm/audit?category=security_violation

# Deactivate when safe
curl -X POST /api/v1/hsm/kill-switch/deactivate \
  -H "Content-Type: application/json" \
  -d '{"reason": "Threat neutralized"}'
```

## Performance Considerations

### Optimization Strategies

1. **Caching**: Data key caching reduces HSM calls
2. **Batch Operations**: Process multiple keys together
3. **Connection Pooling**: Reuse HSM connections
4. **Async Operations**: Non-blocking cryptographic operations

### Benchmarks

Typical performance metrics:

- **Key Generation**: ~50ms per key
- **Key Wrapping**: ~30ms per operation
- **Key Unwrapping**: ~25ms per operation
- **Audit Logging**: ~5ms per entry

## Security Best Practices

### Operational Security

1. **Regular Rotation**: Maintain 90-day key rotation schedule
2. **Access Reviews**: Quarterly review of HSM access permissions
3. **Audit Reviews**: Monthly review of audit logs for anomalies
4. **Testing**: Regular testing of kill switch procedures

### Development Security

1. **Environment Separation**: Different HSM instances per environment
2. **Credential Management**: Secure storage of HSM credentials
3. **Code Review**: Security review of all HSM-related code
4. **Testing**: Comprehensive testing of all security controls

## Support and Maintenance

### Regular Maintenance

- **Monthly**: Review audit logs and security metrics
- **Quarterly**: Update HSM client certificates
- **Annually**: Review and update security policies

### Vendor Support

For HSM-specific issues:
- **AWS CloudHSM**: AWS Support
- **Azure Dedicated HSM**: Azure Support
- **Google Cloud HSM**: Google Cloud Support
- **On-Premise HSM**: Hardware vendor support

### Internal Support

For integration issues:
1. Check system status: `GET /api/v1/hsm/health`
2. Review audit logs: `GET /api/v1/hsm/audit`
3. Verify configuration: Check environment variables
4. Contact security team: For security incidents

## Version History

- **v1.0.0**: Initial HSM integration implementation
- **v1.1.0**: Added automated key rotation
- **v1.2.0**: Enhanced audit logging and kill switch
- **v1.3.0**: Performance optimizations and caching

## Contributing

When contributing to the HSM integration:

1. **Security First**: All changes must maintain security guarantees
2. **Testing**: Comprehensive tests for all new features
3. **Documentation**: Update documentation for all changes
4. **Review**: Security review required for all changes

## License

This HSM integration is part of the Stellar Privacy Analytics platform and is subject to the same license terms.
