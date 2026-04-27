# Quick Start Guide - Cryptographic Key Management Service

## 🚀 Get Started in 5 Minutes

This guide will help you quickly set up and start using the Cryptographic Key Management Service.

## Prerequisites

- Node.js 18+
- HSM provider (AWS CloudHSM, Azure HSM, or compatible)
- PostgreSQL 14+
- Redis 6+ (optional, for caching)

## Installation

### 1. Install Dependencies

```bash
cd stellar-privacy-analytics/backend
npm install
```

### 2. Configure HSM

```bash
# Copy HSM configuration template
cp .env.hsm.example .env

# Edit with your HSM credentials
nano .env
```

Required environment variables:
```bash
HSM_ENDPOINT=https://your-hsm-provider.com:8443
HSM_API_KEY=your-api-key
HSM_API_SECRET=your-api-secret
HSM_CLIENT_ID=stellar-backend
HSM_KEY_ROTATION_DAYS=90
KEY_BACKUP_PATH=./backups/keys
BACKUP_ENCRYPTION_PASSWORD=your-secure-password
```

### 3. Initialize Database

```bash
npm run migrate
```

### 4. Start the Service

```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

## Basic Usage

### Generate a Key

```bash
curl -X POST http://localhost:3000/api/v1/key-management/keys/generate \
  -H "Content-Type: application/json" \
  -d '{
    "keyType": "data",
    "purpose": "user-data-encryption",
    "owner": "user-123",
    "enableBackup": true
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "keyId": "data_1234567890_abc123def456",
    "metadata": {
      "keyType": "data",
      "status": "active",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  }
}
```

### Generate a Key with Threshold Cryptography

```bash
curl -X POST http://localhost:3000/api/v1/key-management/keys/generate \
  -H "Content-Type: application/json" \
  -d '{
    "keyType": "data",
    "purpose": "sensitive-data",
    "enableThreshold": true,
    "thresholdConfig": {
      "threshold": 3,
      "totalShares": 5,
      "shareHolders": ["holder1", "holder2", "holder3", "holder4", "holder5"]
    }
  }'
```

### Rotate a Key

```bash
curl -X POST http://localhost:3000/api/v1/key-management/keys/{keyId}/rotate \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Scheduled rotation"
  }'
```

### Backup a Key

```bash
curl -X POST http://localhost:3000/api/v1/key-management/keys/{keyId}/backup
```

### Check System Health

```bash
curl http://localhost:3000/api/v1/key-management/health
```

## Code Examples

### TypeScript/JavaScript

```typescript
import { getKeyManagementService } from './services/keyManagement';

async function example() {
  // Initialize service
  const kms = await getKeyManagementService();

  // Generate a key
  const result = await kms.generateKey({
    keyType: 'data',
    purpose: 'user-data-encryption',
    owner: 'user-123',
    enableBackup: true
  });

  console.log('Key generated:', result.keyId);

  // Rotate the key
  const rotated = await kms.rotateKey(result.keyId, 'Manual rotation');
  console.log('New key:', rotated.newKeyId);

  // Backup the key
  const backup = await kms.backupKey(rotated.newKeyId);
  console.log('Backup ID:', backup.backupId);
}
```

### SMPC Integration

```typescript
import { SMPCKeyIntegration } from './services/keyManagement';

async function smpcExample() {
  const kms = await getKeyManagementService();
  const smpc = new SMPCKeyIntegration(kms);

  // Generate session keys
  const result = await smpc.generateSessionKeys(
    'session-123',
    ['node1', 'node2', 'node3'],
    2 // threshold
  );

  console.log('Session key:', result.sessionKeyId);
  console.log('Participant keys:', result.participantKeys.size);

  // Cleanup when done
  await smpc.cleanupSessionKeys('session-123');
}
```

### ZKP Integration

```typescript
import { ZKPKeyIntegration } from './services/keyManagement';

async function zkpExample() {
  const kms = await getKeyManagementService();
  const zkp = new ZKPKeyIntegration(kms);

  // Generate circuit keys
  const keyPair = await zkp.generateCircuitKeys(
    'my-circuit',
    'groth16'
  );

  console.log('Proving key:', keyPair.provingKeyId);
  console.log('Verification key:', keyPair.verificationKeyId);
}
```

## Common Operations

### List All Keys

```bash
curl http://localhost:3000/api/v1/key-management/keys
```

### List Keys by Type

```bash
curl "http://localhost:3000/api/v1/key-management/keys?keyType=data"
```

### Get Key Metadata

```bash
curl http://localhost:3000/api/v1/key-management/keys/{keyId}
```

### Revoke a Key

```bash
curl -X POST http://localhost:3000/api/v1/key-management/keys/{keyId}/revoke \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Key compromised",
    "actor": "security-team"
  }'
```

### Get System Status

```bash
curl http://localhost:3000/api/v1/key-management/status
```

## Testing

### Run Unit Tests

```bash
npm test -- --testPathPattern=keyManagement
```

### Run Integration Tests

```bash
npm run test:integration -- keyManagement
```

### Run Security Tests

```bash
npm run security:pentest
```

## Monitoring

### Prometheus Metrics

The service exposes Prometheus metrics at:
```
http://localhost:9090/metrics
```

Key metrics:
- `key_generation_total` - Total keys generated
- `key_rotation_total` - Total key rotations
- `cache_hit_rate` - Cache hit rate
- `backup_success_rate` - Backup success rate

### Health Check

```bash
# Simple health check
curl http://localhost:3000/api/v1/key-management/health

# Detailed status
curl http://localhost:3000/api/v1/key-management/status
```

## Troubleshooting

### HSM Connection Failed

```bash
# Check HSM status
curl http://localhost:3000/api/v1/hsm/status

# Verify configuration
cat .env | grep HSM_
```

### Key Generation Fails

```bash
# Check logs
tail -f logs/key-management.log

# Verify HSM connection
curl http://localhost:3000/api/v1/hsm/health
```

### Backup Failures

```bash
# Check backup directory
ls -la ./backups/keys

# Verify disk space
df -h

# Check permissions
ls -ld ./backups/keys
```

## Configuration Options

### Key Types and Rotation Policies

| Key Type | Default Rotation | Max Usage | TTL |
|----------|------------------|-----------|-----|
| master | 90 days | 1,000,000 | None |
| data | 30 days | 100,000 | None |
| session | 1 day | 1,000 | 24 hours |
| smpc | 60 days | 10,000 | 24 hours |
| zkp | 45 days | 50,000 | None |

### Performance Tuning

```bash
# Cache configuration
KEY_CACHE_SIZE=1000
KEY_CACHE_TTL=3600000

# Batch processing
ENABLE_KEY_BATCHING=true
KEY_BATCH_SIZE=10

# Parallelization
ENABLE_KEY_PARALLELIZATION=true
MAX_PARALLEL_OPS=5
```

### Backup Configuration

```bash
# Backup settings
KEY_BACKUP_PATH=./backups/keys
BACKUP_ENCRYPTION_PASSWORD=your-secure-password
BACKUP_REDUNDANCY_LEVEL=3
BACKUP_RETENTION_DAYS=90
```

## Security Best Practices

1. **Rotate HSM credentials regularly** (every 90 days)
2. **Use strong backup encryption passwords** (32+ characters)
3. **Enable multi-factor authentication** for sensitive operations
4. **Monitor audit logs** for suspicious activity
5. **Test disaster recovery** procedures quarterly
6. **Keep backups** in geographically distributed locations
7. **Use threshold cryptography** for critical keys (K ≥ 3)

## Next Steps

1. **Read the full documentation**: [KEY_MANAGEMENT_SERVICE.md](backend/docs/KEY_MANAGEMENT_SERVICE.md)
2. **Review security guide**: [KEY_MANAGEMENT_SECURITY_AUDIT.md](backend/docs/KEY_MANAGEMENT_SECURITY_AUDIT.md)
3. **Explore API reference**: All 15 endpoints documented
4. **Set up monitoring**: Configure Prometheus and Grafana
5. **Run security audit**: Follow the security checklist

## Support

- **Documentation**: [docs.stellar-ecosystem.com](https://docs.stellar-ecosystem.com)
- **GitHub Issues**: Tag with `key-management`
- **Email**: support@stellar-ecosystem.com

## Quick Reference

### API Endpoints

```
POST   /api/v1/key-management/keys/generate
POST   /api/v1/key-management/keys/:keyId/rotate
POST   /api/v1/key-management/keys/:keyId/revoke
GET    /api/v1/key-management/keys/:keyId
GET    /api/v1/key-management/keys
POST   /api/v1/key-management/keys/:keyId/share
POST   /api/v1/key-management/keys/:keyId/reconstruct
POST   /api/v1/key-management/keys/:keyId/backup
POST   /api/v1/key-management/backups/:backupId/restore
POST   /api/v1/key-management/smpc/sessions/:sessionId/keys
DELETE /api/v1/key-management/smpc/sessions/:sessionId/keys
POST   /api/v1/key-management/zkp/circuits/:circuitId/keys
GET    /api/v1/key-management/zkp/circuits/:circuitId/keys
GET    /api/v1/key-management/status
GET    /api/v1/key-management/health
```

### Environment Variables

```bash
# Required
HSM_ENDPOINT=https://your-hsm-provider.com:8443
HSM_API_KEY=your-api-key
HSM_API_SECRET=your-api-secret

# Optional
HSM_KEY_ROTATION_DAYS=90
KEY_BACKUP_PATH=./backups/keys
KEY_CACHE_SIZE=1000
ENABLE_KEY_BATCHING=true
```

---

**Ready to go!** 🚀

For detailed information, see the [full documentation](backend/docs/KEY_MANAGEMENT_SERVICE.md).
