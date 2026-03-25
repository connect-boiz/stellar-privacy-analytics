# Encrypted Blob Storage Adapter for IPFS/Filecoin

## Overview

This implementation provides a comprehensive encrypted blob storage adapter that handles AES-256-GCM encryption for all outbound data before off-loading them to decentralized storage (IPFS/Filecoin). The adapter includes content addressing, CID management, Stellar ledger integration, and robust error handling with retry mechanisms.

## Features

### 🔐 Encryption & Security
- **AES-256-GCM Encryption**: Industry-standard authenticated encryption for data confidentiality and integrity
- **Key Management**: Secure key generation, storage, and rotation capabilities
- **Integrity Validation**: SHA-256 hash verification for data integrity checks
- **Streaming Decryption**: Efficient buffer-based decryption for large files

### 🌐 Decentralized Storage
- **IPFS Integration**: Support for local IPFS nodes and public gateways
- **Pinata API**: Commercial IPFS pinning service integration
- **Content Addressing**: Automatic CID generation and management
- **Filecoin Support**: Ready for Filecoin storage deals

### ⚡ Reliability & Performance
- **Retry Mechanism**: Exponential backoff retry for failed operations
- **Version Management**: CID rotation and dataset versioning
- **Streaming Support**: Memory-efficient processing of large files
- **Error Handling**: Comprehensive error reporting and recovery

### 📋 Ledger Integration
- **Stellar Integration**: Store CIDs and metadata on Stellar blockchain
- **Audit Trail**: Complete transaction history on immutable ledger
- **Metadata Storage**: Additional dataset information storage

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client Data   │───▶│  AES-256-GCM     │───▶│   IPFS/Filecoin │
│                 │    │  Encryption      │    │   Storage       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   Stellar Ledger │    │   CID Management│
                       │   Integration     │    │   & Versioning  │
                       └──────────────────┘    └─────────────────┘
```

## Installation

### Dependencies

```bash
npm install ipfs-http-client axios form-data crypto-js uuid zod
npm install -D @types/node @types/form-data @types/uuid
```

### Environment Variables

```env
# IPFS Configuration
IPFS_NODE_URL=http://localhost:5001
IPFS_TIMEOUT=30000

# Pinata Configuration (optional)
PINATA_API_KEY=your_pinata_api_key
PINATA_SECRET_KEY=your_pinata_secret_key

# Stellar Configuration
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
```

## Usage

### Basic Usage

```typescript
import { EncryptedBlobStorageAdapter, SimpleKeyManager } from '@stellar/shared';

// Initialize storage adapter
const keyManager = new SimpleKeyManager();
const storageAdapter = new EncryptedBlobStorageAdapter(
  {
    nodeUrl: 'http://localhost:5001',
    pinataApiKey: process.env.PINATA_API_KEY,
    pinataSecretKey: process.env.PINATA_SECRET_KEY
  },
  keyManager
);

// Upload encrypted data
const result = await storageAdapter.uploadEncrypted(
  Buffer.from('Sensitive data to encrypt'),
  {
    datasetId: 'user-analytics-2024',
    storeOnLedger: true,
    metadata: { type: 'analytics', version: '1.0' }
  }
);

console.log('CID:', result.cid);
console.log('Hash:', result.hash);
```

### Download and Decrypt

```typescript
// Download and decrypt data
const decryptedData = await storageAdapter.downloadEncrypted(
  result.cid,
  result.encryptionKeyId
);

console.log('Decrypted data:', decryptedData.data.toString());
console.log('Integrity verified:', decryptedData.integrity.verified);
```

### Streaming for Large Files

```typescript
// Stream decryption for large files
const stream = await storageAdapter.streamDecryption(
  cid,
  encryptionKeyId,
  1024 * 1024 // 1MB chunks
);

for await (const chunk of stream) {
  // Process chunk
  processChunk(chunk);
}
```

### CID Version Management

```typescript
// Get all versions for a dataset
const versions = storageAdapter.getVersions('dataset-id');

// Get specific version
const versionData = await storageAdapter.getVersion('dataset-id', 2);

// Rotate to new CID (create new version)
const newVersion = await storageAdapter.rotateCID(
  'dataset-id',
  Buffer.from('Updated data'),
  { storeOnLedger: true }
);
```

### Key Management

```typescript
// Generate new encryption key
await storageAdapter['keyManager'].generateKey();
await storageAdapter['keyManager'].storeKey('key-id', key);

// Rotate existing key
const newKey = await storageAdapter['keyManager'].rotateKey('key-id');
```

## API Endpoints

### Upload Encrypted Data
```
POST /api/v1/ipfs/encrypted/upload
Content-Type: application/json

{
  "datasetId": "user-analytics-2024",
  "data": "base64-encoded-data",
  "encryptionKeyId": "optional-key-id",
  "storeOnLedger": true,
  "metadata": { "type": "analytics" }
}
```

### Download Encrypted Data
```
GET /api/v1/ipfs/encrypted/download/{cid}?encryptionKeyId={keyId}

Response:
{
  "success": true,
  "data": {
    "data": "base64-decrypted-data",
    "integrity": {
      "verified": true,
      "expectedHash": "hash",
      "actualHash": "hash"
    },
    "metadata": { ... }
  }
}
```

### Stream Decryption
```
GET /api/v1/ipfs/encrypted/stream/{cid}?encryptionKeyId={keyId}&chunkSize=1048576

Response: Binary stream (application/octet-stream)
```

### Rotate CID
```
POST /api/v1/ipfs/encrypted/rotate/{datasetId}
Content-Type: application/json

{
  "data": "base64-encoded-new-data",
  "storeOnLedger": true
}
```

### Get Versions
```
GET /api/v1/ipfs/encrypted/versions/{datasetId}

Response:
{
  "success": true,
  "data": [
    {
      "cid": "QmHash...",
      "size": 1024,
      "hash": "sha256-hash",
      "timestamp": "2024-01-01T00:00:00Z",
      "version": 1,
      "keyId": "encryption-key-id"
    }
  ]
}
```

## Security Considerations

### Encryption
- **AES-256-GCM**: Provides both confidentiality and authenticity
- **Random IV**: Unique IV for each encryption operation
- **Auth Tag**: Ensures data integrity and authenticity
- **Key Rotation**: Regular key rotation for enhanced security

### Key Management
- **Secure Storage**: Keys stored in memory with optional persistence
- **Key Derivation**: PBKDF2 for key derivation from passwords
- **Access Control**: Implement proper access controls for key operations

### Data Integrity
- **SHA-256**: Cryptographic hash for integrity verification
- **Pre-upload Validation**: Hash verification before storage
- **Post-download Verification**: Hash verification after retrieval

## Error Handling & Retry Logic

### Retry Configuration
```typescript
const retryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2
};
```

### Error Types
- **Network Errors**: Temporary connectivity issues
- **IPFS Errors**: Node unavailability or pinning failures
- **Encryption Errors**: Key management or cryptographic failures
- **Ledger Errors**: Stellar transaction failures

## Performance Optimization

### Streaming
- **Chunked Processing**: Process large files in memory-efficient chunks
- **Backpressure Handling**: Proper flow control for streaming operations
- **Concurrent Operations**: Parallel processing when possible

### Caching
- **CID Caching**: Cache frequently accessed CIDs
- **Key Caching**: In-memory key storage for performance
- **Metadata Caching**: Cache dataset metadata

## Testing

### Unit Tests
```bash
npm test -- --testPathPattern=blob-storage
```

### Integration Tests
```bash
npm run test:integration
```

### Test Coverage
- **Encryption/Decryption**: Verify cryptographic operations
- **IPFS Integration**: Test upload/download flows
- **Error Handling**: Verify retry mechanisms
- **Performance**: Test streaming and large file handling

## Monitoring & Logging

### Metrics
- **Upload/Download Count**: Track storage operations
- **Success/Failure Rates**: Monitor operation reliability
- **Performance Metrics**: Track operation duration
- **Error Rates**: Monitor error frequency and types

### Logging
- **Operation Logs**: Detailed logs for all operations
- **Error Logs**: Comprehensive error information
- **Security Logs**: Audit trail for security events
- **Performance Logs**: Performance monitoring data

## Deployment

### Docker Configuration
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: encrypted-storage
spec:
  replicas: 3
  selector:
    matchLabels:
      app: encrypted-storage
  template:
    metadata:
      labels:
        app: encrypted-storage
    spec:
      containers:
      - name: encrypted-storage
        image: stellar/encrypted-storage:latest
        ports:
        - containerPort: 3001
        env:
        - name: IPFS_NODE_URL
          value: "http://ipfs-node:5001"
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This implementation is licensed under the MIT License.

## Support

For issues and questions:
- Create an issue on GitHub
- Check the documentation
- Review the test cases for usage examples
