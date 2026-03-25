# IPFS/Filecoin Integration Documentation

## Overview

This document describes the integration of IPFS and Filecoin storage with the Stellar Privacy Analytics platform. This integration enables secure, decentralized storage of large datasets while maintaining privacy and data availability guarantees.

## Architecture

### Components

1. **Smart Contract Layer** (Soroban)
   - Stores IPFS CIDs on-chain
   - Manages data availability checks
   - Handles dataset versioning
   - Controls access to decryption keys

2. **Backend Service Layer**
   - IPFS client for file operations
   - Pinata integration for persistent pinning
   - Filecoin deal monitoring
   - Encryption/decryption key management

3. **Storage Layer**
   - IPFS network for content addressing
   - Pinata for pinning service
   - Filecoin for long-term storage deals

## Smart Contract Implementation

### Data Structures

#### IPFSDataset
```rust
pub struct IPFSDataset {
    pub cid: String,
    pub dataset_hash: BytesN<32>,
    pub uploader: Address,
    pub timestamp: u64,
    pub size_bytes: u64,
    pub encrypted: bool,
    pub version: u32,
    pub pinned: bool,
    pub decryption_key_hash: Option<BytesN<32>>,
}
```

#### DataAvailability
```rust
pub struct DataAvailability {
    pub cid: String,
    pub available: bool,
    pub last_checked: u64,
    pub pin_count: u32,
    pub filecoin_deal_id: Option<u64>,
}
```

### Key Functions

#### Dataset Registration
- `register_dataset()` - Register new IPFS dataset
- `create_dataset_version()` - Create new version of existing dataset
- `pin_dataset()` - Mark dataset as pinned
- `get_dataset()` - Retrieve dataset information

#### Data Availability
- `check_data_availability()` - Verify dataset availability
- `update_data_availability()` - Update availability status
- `get_data_availability()` - Get availability information

#### Analysis Integration
- Modified `request_analysis()` to include IPFS CID
- CID immutability enforcement after analysis starts
- Automatic availability checks before processing

## Backend Implementation

### IPFS Service (`ipfsService.ts`)

#### Core Functions

1. **Upload and Pin**
   ```typescript
   async uploadAndPinFile(file: Buffer, fileName: string, options: {
     encrypted?: boolean;
     version?: number;
     uploader?: string;
     decryptionKeyHash?: string;
   }): Promise<{ cid: string; size: number }>
   ```

2. **Data Availability**
   ```typescript
   async checkAvailability(cid: string): Promise<boolean>
   async createDataAvailabilityRecord(cid: string, filecoinDealId?: number): Promise<DataAvailability>
   ```

3. **Pinata Integration**
   ```typescript
   async pinToPinata(cid: string, fileName?: string): Promise<PinataResponse>
   async getPinInfo(cid: string): Promise<any>
   async unpinFromPinata(cid: string): Promise<void>
   ```

4. **Filecoin Integration**
   ```typescript
   async getFilecoinDeals(cid: string): Promise<FilecoinDeal[]>
   ```

5. **Encryption Key Management**
   ```typescript
   generateDecryptionKeyHash(decryptionKey: string): string
   verifyDecryptionKey(decryptionKey: string, keyHash: string): boolean
   ```

### API Routes

#### File Operations
- `POST /api/v1/ipfs/upload` - Upload and pin file
- `GET /api/v1/ipfs/retrieve/:cid` - Retrieve file from IPFS
- `GET /api/v1/ipfs/gateway/:cid` - Get gateway URL

#### Pin Management
- `POST /api/v1/ipfs/pin/:cid` - Pin existing CID
- `DELETE /api/v1/ipfs/unpin/:cid` - Unpin CID
- `POST /api/v1/ipfs/batch-pin` - Pin multiple CIDs

#### Data Availability
- `GET /api/v1/ipfs/availability/:cid` - Check availability
- `GET /api/v1/ipfs/deals/:cid` - Get Filecoin deals

#### Key Management
- `POST /api/v1/ipfs/verify-key` - Verify decryption key

## Security Features

### Encryption
- All datasets are encrypted before IPFS upload
- Decryption keys are stored as hashes on-chain
- Hybrid on-chain/off-chain key management model

### Access Control
- Only authorized users can register datasets
- Admin-only pinning operations
- Role-based access to sensitive operations

### Data Integrity
- Content addressing ensures immutability
- Cryptographic hashes verify data integrity
- Version tracking for historical analytics

## Data Availability Guarantees

### Pinata Integration
- Automatic pinning of all uploaded datasets
- Pin status monitoring and alerts
- Redundant pinning for critical datasets

### Filecoin Deals
- Long-term storage on Filecoin network
- Deal status monitoring
- Automatic deal renewal for important datasets

### Health Checks
- Regular availability verification
- Automated re-pinning of unavailable content
- Performance metrics and alerting

## Configuration

### Environment Variables

```env
# IPFS Configuration
IPFS_GATEWAY_URL=http://localhost:5001
IPFS_PUBLIC_GATEWAY=https://gateway.pinata.cloud

# Pinata Configuration
PINATA_API_KEY=your_pinata_api_key
PINATA_SECRET_KEY=your_pinata_secret_key

# Filecoin Configuration
FILECOIN_ENABLED=true
FILECOIN_MIN_DEAL_DURATION=525600  # 1 year in blocks
```

### Dependencies

```json
{
  "ipfs-http-client": "^60.0.1",
  "axios": "^1.6.2",
  "form-data": "^4.0.0"
}
```

## Usage Examples

### Uploading a Dataset

```typescript
const formData = new FormData();
formData.append('file', fileBuffer, 'dataset.csv');
formData.append('fileName', 'dataset.csv');
formData.append('encrypted', 'true');
formData.append('version', '1');

const response = await fetch('/api/v1/ipfs/upload', {
  method: 'POST',
  body: formData
});

const { cid, size, gatewayUrl } = await response.json();
```

### Registering Dataset in Smart Contract

```typescript
const tx = await contract.register_dataset(
  cid,
  datasetHash,
  uploaderAddress,
  size,
  true, // encrypted
  1,    // version
  decryptionKeyHash
);
```

### Checking Data Availability

```typescript
const response = await fetch(`/api/v1/ipfs/availability/${cid}`);
const { availability, pinInfo, filecoinDeals } = await response.json();

if (!availability.available) {
  // Handle unavailable data
  await rePinDataset(cid);
}
```

## Auditing and Compliance

### Audit Trail
- All dataset registrations are logged on-chain
- IPFS operations are logged with timestamps
- Access attempts are tracked and audited

### Compliance Features
- GDPR-compliant data handling
- Data retention policies
- Right to be forgotten implementation

### Third-Party Auditor Access

Auditors can access:

1. **Dataset Metadata**
   - Registration timestamps
   - Upload information
   - Version history

2. **Availability Reports**
   - Current availability status
   - Historical availability data
   - Pin status information

3. **Compliance Documentation**
   - Encryption proofs
   - Access logs
   - Data handling procedures

## Monitoring and Alerting

### Metrics
- Upload success rates
- Pin status changes
- Filecoin deal status
- Data availability percentage

### Alerts
- Unpinned content detection
- Failed availability checks
- Filecoin deal expiration warnings
- Storage cost anomalies

## Troubleshooting

### Common Issues

1. **IPFS Upload Failures**
   - Check IPFS node connectivity
   - Verify file size limits
   - Validate CID format

2. **Pinata Pinning Issues**
   - Verify API credentials
   - Check rate limits
   - Validate file formats

3. **Filecoin Deal Problems**
   - Monitor deal status
   - Check provider reputation
   - Verify deal parameters

### Debug Commands

```bash
# Check IPFS node status
ipfs id

# Verify pin status
ipfs pin ls <cid>

# Check Pinata pins
curl -H "pinata_api_key: $PINATA_API_KEY" \
     -H "pinata_secret_api_key: $PINATA_SECRET_KEY" \
     "https://api.pinata.cloud/pinning/pinList"
```

## Best Practices

1. **Data Management**
   - Always encrypt sensitive data
   - Use descriptive filenames
   - Implement versioning strategy

2. **Storage Optimization**
   - Compress files before upload
   - Use appropriate pinning strategies
   - Monitor storage costs

3. **Security**
   - Regularly rotate API keys
   - Implement access controls
   - Monitor for unauthorized access

4. **Performance**
   - Use batch operations for multiple files
   - Implement caching strategies
   - Optimize IPFS gateway selection

## Future Enhancements

1. **Advanced Encryption**
   - Homomorphic encryption support
   - Multi-party computation
   - Zero-knowledge proofs

2. **Storage Optimization**
   - Automatic data compression
   - Intelligent pinning strategies
   - Cost optimization algorithms

3. **Enhanced Monitoring**
   - Real-time availability dashboards
   - Predictive failure detection
   - Automated recovery procedures

4. **Integration Improvements**
   - Additional storage providers
   - Cross-chain compatibility
   - Enhanced API capabilities
