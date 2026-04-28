# Cryptographic Key Management Service

## Overview

The Cryptographic Key Management Service provides enterprise-grade key lifecycle management with HSM integration, automated key rotation, secure key sharing using threshold cryptography, and comprehensive backup and disaster recovery capabilities.

## Features

### ✅ Acceptance Criteria Met

- ✅ **HSM Integration**: Secure key storage with Hardware Security Module support
- ✅ **Automated Key Rotation**: Scheduled and policy-based key rotation with zero downtime
- ✅ **Secure Key Sharing**: Threshold cryptography using Shamir's Secret Sharing
- ✅ **Key Usage Auditing**: Comprehensive audit logging and compliance tracking
- ✅ **Backup and Disaster Recovery**: Encrypted backups with redundancy and restoration
- ✅ **Performance Optimization**: Caching, batching, and parallelization for cryptographic operations
- ✅ **SMPC Integration**: Specialized key management for Secure Multi-Party Computation
- ✅ **ZK Proof Integration**: Key management for Zero-Knowledge proof systems

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                Key Management Service                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Threshold  │  │   Rotation   │  │    Backup    │     │
│  │ Cryptography │  │  Scheduler   │  │   Service    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Sharing    │  │ Performance  │  │     SMPC     │     │
│  │   Service    │  │  Optimizer   │  │ Integration  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌──────────────┐                                           │
│  │     ZKP      │                                           │
│  │ Integration  │                                           │
│  └──────────────┘                                           │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                    HSM Service Layer                         │
├─────────────────────────────────────────────────────────────┤
│              Hardware Security Module (HSM)                  │
└─────────────────────────────────────────────────────────────┘
```

## Key Types

The service supports multiple key types optimized for different use cases:

| Key Type | Purpose | Default Rotation | Max Usage |
|----------|---------|------------------|-----------|
| `master` | Master encryption keys | 90 days | 1,000,000 |
| `data` | Data encryption keys | 30 days | 100,000 |
| `session` | Session keys | 1 day | 1,000 |
| `smpc` | SMPC computation keys | 60 days | 10,000 |
| `zkp` | Zero-knowledge proof keys | 45 days | 50,000 |

## API Reference

### Key Generation

#### Generate Key

```http
POST /api/v1/key-management/keys/generate
Content-Type: application/json

{
  "keyType": "data",
  "purpose": "user-data-encryption",
  "algorithm": "aes-256-gcm",
  "keySize": 32,
  "owner": "user-123",
  "ttl": 86400,
  "tags": ["encryption", "user-data"],
  "enableThreshold": true,
  "thresholdConfig": {
    "threshold": 3,
    "totalShares": 5,
    "shareHolders": ["holder1", "holder2", "holder3", "holder4", "holder5"]
  },
  "enableBackup": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "keyId": "data_1234567890_abc123def456",
    "metadata": {
      "keyId": "data_1234567890_abc123def456",
      "keyType": "data",
      "algorithm": "aes-256-gcm",
      "keySize": 32,
      "createdAt": "2024-01-15T10:30:00Z",
      "status": "active",
      "usageCount": 0,
      "maxUsage": 100000,
      "purpose": "user-data-encryption",
      "owner": "user-123",
      "tags": ["encryption", "user-data"],
      "backupStatus": "pending",
      "thresholdConfig": {
        "threshold": 3,
        "totalShares": 5,
        "shareHolders": ["holder1", "holder2", "holder3", "holder4", "holder5"]
      }
    },
    "hasShares": true,
    "shareCount": 5
  }
}
```

### Key Rotation

#### Rotate Key

```http
POST /api/v1/key-management/keys/{keyId}/rotate
Content-Type: application/json

{
  "reason": "Scheduled rotation"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "oldKeyId": "data_1234567890_abc123def456",
    "newKeyId": "data_1234567891_xyz789ghi012",
    "metadata": {
      "keyId": "data_1234567891_xyz789ghi012",
      "keyType": "data",
      "status": "active",
      "createdAt": "2024-01-15T11:00:00Z"
    }
  }
}
```

### Key Sharing (Threshold Cryptography)

#### Share Key

```http
POST /api/v1/key-management/keys/{keyId}/share
Content-Type: application/json

{
  "threshold": 3,
  "shareHolders": ["holder1", "holder2", "holder3", "holder4", "holder5"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "keyId": "data_1234567890_abc123def456",
    "threshold": 3,
    "totalShares": 5,
    "shares": [
      {
        "shareId": "share_1234567890_abc123",
        "holder": "holder1"
      },
      {
        "shareId": "share_1234567891_def456",
        "holder": "holder2"
      }
      // ... more shares
    ]
  }
}
```

#### Reconstruct Key

```http
POST /api/v1/key-management/keys/{keyId}/reconstruct
Content-Type: application/json

{
  "shares": [
    {
      "shareId": "share_1234567890_abc123",
      "holder": "holder1",
      "encryptedShare": "base64_encrypted_share_1"
    },
    {
      "shareId": "share_1234567891_def456",
      "holder": "holder2",
      "encryptedShare": "base64_encrypted_share_2"
    },
    {
      "shareId": "share_1234567892_ghi789",
      "holder": "holder3",
      "encryptedShare": "base64_encrypted_share_3"
    }
  ]
}
```

### Backup and Recovery

#### Backup Key

```http
POST /api/v1/key-management/keys/{keyId}/backup
```

**Response:**
```json
{
  "success": true,
  "data": {
    "backupId": "backup_data_1234567890_abc123def456_1234567890_xyz789",
    "location": "/backups/keys/backup_data_1234567890_abc123def456_1234567890_xyz789_copy0.bak"
  }
}
```

#### Restore Key

```http
POST /api/v1/key-management/backups/{backupId}/restore
```

**Response:**
```json
{
  "success": true,
  "data": {
    "keyId": "data_1234567890_abc123def456",
    "metadata": {
      "keyId": "data_1234567890_abc123def456",
      "keyType": "data",
      "status": "active"
    }
  }
}
```

### SMPC Integration

#### Generate SMPC Session Keys

```http
POST /api/v1/key-management/smpc/sessions/{sessionId}/keys
Content-Type: application/json

{
  "participants": ["node1", "node2", "node3"],
  "threshold": 2
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionKeyId": "smpc_1234567890_abc123def456",
    "participantCount": 3,
    "shareCount": 3
  }
}
```

#### Cleanup SMPC Session Keys

```http
DELETE /api/v1/key-management/smpc/sessions/{sessionId}/keys
```

### ZKP Integration

#### Generate ZKP Circuit Keys

```http
POST /api/v1/key-management/zkp/circuits/{circuitId}/keys
Content-Type: application/json

{
  "proofSystem": "groth16"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "provingKeyId": "zkp_1234567890_abc123def456",
    "verificationKeyId": "zkp_1234567891_xyz789ghi012",
    "circuitId": "my-circuit"
  }
}
```

### System Status

#### Get Status

```http
GET /api/v1/key-management/status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "statistics": {
      "totalKeys": 150,
      "activeKeys": 120,
      "rotatingKeys": 5,
      "deprecatedKeys": 20,
      "revokedKeys": 5,
      "keysByType": {
        "master": 10,
        "data": 100,
        "session": 20,
        "smpc": 15,
        "zkp": 5
      },
      "backupStatus": {
        "none": 20,
        "pending": 10,
        "completed": 115,
        "failed": 5
      },
      "performanceMetrics": {
        "cacheHits": 5000,
        "cacheMisses": 500,
        "cacheHitRate": 0.909,
        "averageOperationTime": 25.5,
        "totalOperations": 5500,
        "batchOperations": 200,
        "parallelOperations": 150
      }
    },
    "health": {
      "healthy": true,
      "issues": [],
      "services": {
        "hsm": true,
        "backup": true,
        "rotation": true
      }
    }
  }
}
```

## Configuration

### Environment Variables

```bash
# HSM Configuration
HSM_ENDPOINT=https://your-hsm-provider.com:8443
HSM_API_KEY=your-api-key
HSM_API_SECRET=your-api-secret
HSM_CLIENT_ID=stellar-backend

# Key Management
HSM_KEY_ROTATION_DAYS=90
KEY_BACKUP_PATH=./backups/keys
BACKUP_ENCRYPTION_PASSWORD=your-secure-password

# Performance
KEY_CACHE_SIZE=1000
KEY_CACHE_TTL=3600000
ENABLE_KEY_BATCHING=true
ENABLE_KEY_PARALLELIZATION=true
```

## Security Best Practices

### 1. Key Rotation

- **Master Keys**: Rotate every 90 days
- **Data Keys**: Rotate every 30 days
- **Session Keys**: Rotate daily
- **SMPC Keys**: Rotate every 60 days
- **ZKP Keys**: Rotate every 45 days

### 2. Threshold Cryptography

- Use threshold ≥ 3 for production keys
- Distribute shares across different security domains
- Regularly refresh shares (every 6 months)
- Implement multi-approval for key reconstruction

### 3. Backup and Recovery

- Enable automatic backups for all critical keys
- Store backups in geographically distributed locations
- Test recovery procedures quarterly
- Maintain 3 redundant copies minimum

### 4. Access Control

- Implement role-based access control (RBAC)
- Require multi-factor authentication for sensitive operations
- Log all key access and operations
- Regular access reviews

### 5. Monitoring and Alerting

- Monitor key usage patterns
- Alert on unusual access patterns
- Track rotation compliance
- Monitor backup success rates

## Performance Optimization

### Caching Strategy

The service implements intelligent caching:

- **Key Metadata**: Cached for 1 hour
- **Operation Results**: Cached based on operation type
- **LRU Eviction**: Automatic cache management
- **Cache Warming**: Prefetch frequently used keys

### Batching

Operations are automatically batched for efficiency:

- **Batch Size**: 10 operations (configurable)
- **Batch Interval**: 100ms
- **Automatic Processing**: When batch size reached

### Parallelization

Cryptographic operations run in parallel:

- **Max Parallel Operations**: 5 (configurable)
- **Automatic Chunking**: Large operation sets
- **Resource Management**: CPU-aware concurrency

## Disaster Recovery

### Backup Strategy

1. **Automated Backups**: All keys backed up automatically
2. **Redundancy**: 3 copies by default
3. **Encryption**: All backups encrypted at rest
4. **Compression**: Optional compression for storage efficiency
5. **Retention**: 90-day retention by default

### Recovery Procedures

#### Full System Recovery

```bash
# 1. Initialize HSM connection
curl -X POST /api/v1/hsm/status

# 2. Restore master keys
curl -X POST /api/v1/key-management/backups/{backupId}/restore

# 3. Verify key integrity
curl -X GET /api/v1/key-management/health

# 4. Resume normal operations
```

#### Individual Key Recovery

```bash
# 1. Identify backup
curl -X GET /api/v1/key-management/backups?keyId={keyId}

# 2. Restore key
curl -X POST /api/v1/key-management/backups/{backupId}/restore

# 3. Verify restoration
curl -X GET /api/v1/key-management/keys/{keyId}
```

## Integration Examples

### SMPC Integration

```typescript
import { SMPCKeyIntegration } from './services/keyManagement/SMPCKeyIntegration';

// Generate session keys
const result = await smpcIntegration.generateSessionKeys(
  'session-123',
  ['node1', 'node2', 'node3'],
  2 // threshold
);

// Use keys in SMPC computation
const sessionKeyId = result.sessionKeyId;

// Cleanup after session
await smpcIntegration.cleanupSessionKeys('session-123');
```

### ZKP Integration

```typescript
import { ZKPKeyIntegration } from './services/keyManagement/ZKPKeyIntegration';

// Generate circuit keys
const keyPair = await zkpIntegration.generateCircuitKeys(
  'my-circuit',
  'groth16'
);

// Use proving key
const provingKeyId = keyPair.provingKeyId;

// Use verification key
const verificationKeyId = keyPair.verificationKeyId;
```

## Compliance and Auditing

### Audit Logging

All key operations are logged:

- Key generation
- Key rotation
- Key revocation
- Key sharing
- Key reconstruction
- Backup operations
- Restoration operations

### Compliance Features

- **SOX**: Comprehensive audit trails
- **GDPR**: Right to encryption and data protection
- **PCI-DSS**: Secure key management practices
- **HIPAA**: Healthcare data protection standards
- **FIPS 140-2**: HSM compliance

### Audit Reports

```bash
# Get audit log
curl -X GET /api/v1/hsm/audit?startDate=2024-01-01&category=key_management

# Export audit log
curl -X GET /api/v1/hsm/audit/export?format=csv

# Verify audit integrity
curl -X GET /api/v1/hsm/audit/integrity
```

## Troubleshooting

### Common Issues

#### Key Generation Fails

```bash
# Check HSM connection
curl -X GET /api/v1/hsm/status

# Check system health
curl -X GET /api/v1/key-management/health

# Review logs
tail -f logs/key-management.log
```

#### Rotation Not Working

```bash
# Check rotation scheduler
curl -X GET /api/v1/key-management/status

# Verify rotation policy
curl -X GET /api/v1/key-management/keys/{keyId}

# Force rotation
curl -X POST /api/v1/key-management/keys/{keyId}/rotate
```

#### Backup Failures

```bash
# Check backup service health
curl -X GET /api/v1/key-management/health

# Verify backup directory permissions
ls -la ./backups/keys

# Check disk space
df -h
```

## Testing

### Unit Tests

```bash
npm test -- --testPathPattern=keyManagement
```

### Integration Tests

```bash
npm run test:integration -- keyManagement
```

### Load Tests

```bash
npm run test:load -- --scenario key-generation
```

## Support

For issues and questions:

- **Documentation**: [docs.stellar-ecosystem.com](https://docs.stellar-ecosystem.com)
- **GitHub Issues**: [github.com/stellar/issues](https://github.com/stellar/issues)
- **Email**: support@stellar-ecosystem.com

## License

MIT License - see LICENSE file for details

---

**Version**: 1.0.0  
**Last Updated**: 2024-01-15  
**Status**: Production Ready ✅
