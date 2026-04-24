# Secure Data Ingestion Portal

A comprehensive client-side encryption and blockchain integration system for secure data uploads to the Stellar Privacy Analytics platform.

## Features

### 🔐 Client-Side Encryption
- **AES-256-GCM Encryption**: Military-grade encryption using Web Crypto API
- **RSA Key Management**: Asymmetric encryption for key exchange
- **SHA-256 Integrity Verification**: File integrity checks before and after encryption
- **Secure Key Generation**: Cryptographically secure random password generation

### 🛡️ Zero-Knowledge Proofs
- **WASM-Based Prover**: Client-side ZK-proof generation
- **File Integrity Proofs**: Prove data authenticity without revealing content
- **Data Ownership Proofs**: Verify ownership without exposing data
- **Privacy Compliance Proofs**: Demonstrate regulatory compliance

### 📊 Progress Tracking
- **Multi-Part Upload Progress**: Real-time progress bars for large files
- **Stage-Based Processing**: Visual feedback for encryption, proof generation, and upload
- **Chunked File Reading**: Memory-efficient processing of large files

### 🔗 Stellar Blockchain Integration
- **Wallet Connectivity**: Support for Freighter, Albedo, and xBull wallets
- **Transaction Signing**: Automatic signing of data upload transactions
- **On-Chain Storage**: Immutable storage of data metadata and proofs
- **Receipt Generation**: Downloadable receipts with transaction verification

### 🎯 User Experience
- **Drag & Drop Interface**: Intuitive file upload zone
- **File Format Support**: CSV, JSON, and Parquet files up to 10GB
- **Real-time Feedback**: Progress indicators and status updates
- **Error Handling**: Comprehensive error reporting and recovery

## Architecture

```
Secure Data Upload Flow:
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   File Input   │───▶│  Encryption     │───▶│  ZK-Proofs      │
│   (Drag/Drop)  │    │  (AES-256-GCM)  │    │  (WASM)         │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  File          │    │  Encrypted      │    │  Proof          │
│  Integrity     │    │  Data           │    │  Verification   │
│  Check         │    │                 │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                    ┌──────────────────┐
                    │  Stellar        │
                    │  Transaction    │
                    │  Signing        │
                    └──────────────────┘
                                 │
                                 ▼
                    ┌──────────────────┐
                    │  Receipt        │
                    │  Generation     │
                    └──────────────────┘
```

## Components

### WebCryptoService (`webCrypto.ts`)
Handles all client-side cryptographic operations:
- AES-256-GCM encryption/decryption
- RSA key generation and management
- SHA-256 hashing and integrity verification
- Secure password generation

### ZKProofService (`zkProof.ts`)
Manages zero-knowledge proof operations:
- WASM module initialization
- Proof generation for various use cases
- Proof serialization/deserialization
- Proof verification

### StellarWalletService (`stellarWallet.ts`)
Integrates with Stellar blockchain:
- Wallet connection (Freighter, Albedo, xBull)
- Transaction creation and signing
- Receipt generation and download
- Transaction verification

### SecureDataUpload (`SecureDataUpload.tsx`)
Main React component for the upload interface:
- Drag and drop file handling
- Upload progress tracking
- Wallet integration
- Receipt display

## Usage

### Basic Upload

```tsx
import { SecureDataUpload } from './components/SecureDataUpload';

function App() {
  const handleUploadComplete = (receipt) => {
    console.log('Upload completed:', receipt);
  };

  return (
    <SecureDataUpload 
      onUploadComplete={handleUploadComplete}
      maxFileSize={10 * 1024 * 1024 * 1024} // 10GB
      acceptedFormats={['.csv', '.json', '.parquet']}
    />
  );
}
```

### Advanced Usage

```tsx
// Custom encryption
const encryptedFile = await WebCryptoService.encryptFile(file, password);

// Generate ZK-proof
const zkProof = await ZKProofService.generateFileIntegrityProof(
  file, 
  checksum, 
  encryptionKey
);

// Connect wallet and sign transaction
const account = await StellarWalletService.connectWallet('freighter');
const receipt = await StellarWalletService.signAndSubmitUploadTransaction(
  account,
  transactionData
);
```

## Security Features

### End-to-End Encryption
- Data is encrypted client-side before transmission
- Encryption keys never leave the user's device
- AES-256-GCM provides both confidentiality and integrity

### Zero-Knowledge Privacy
- Proofs are generated without revealing sensitive data
- Verification can be performed without accessing the original data
- Compliance can be demonstrated without exposing content

### Blockchain Immutability
- All transactions are recorded on the Stellar blockchain
- Receipts provide verifiable proof of upload
- Audit trail is tamper-proof and transparent

## File Support

### Accepted Formats
- **CSV**: Comma-separated values files
- **JSON**: JavaScript Object Notation files
- **Parquet**: Apache Parquet columnar format

### Size Limits
- **Default**: 10GB per file
- **Configurable**: Adjustable via component props
- **Memory Efficient**: Chunked processing for large files

## Browser Compatibility

### Required Features
- **Web Crypto API**: For client-side encryption
- **File API**: For file handling
- **Fetch API**: For network requests
- **WebAssembly**: For ZK-proof generation

### Supported Browsers
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Development

### Running Tests
```bash
npm test
```

### Building
```bash
npm run build
```

### Development Server
```bash
npm run dev
```

## Configuration

### Environment Variables
```env
# Stellar Network
STELLAR_NETWORK=testnet
HORIZON_URL=https://horizon-testnet.stellar.org

# Encryption
ENCRYPTION_KEY_DERIVATION_ITERATIONS=100000

# File Upload
MAX_FILE_SIZE=10737418240  # 10GB in bytes
CHUNK_SIZE=1048576           # 1MB chunks
```

## Troubleshooting

### Common Issues

1. **Wallet Connection Failed**
   - Ensure wallet extension is installed
   - Check network settings (testnet vs mainnet)
   - Verify wallet is unlocked

2. **Encryption Errors**
   - Check browser compatibility
   - Ensure sufficient memory for large files
   - Verify file format is supported

3. **ZK-Proof Generation Failed**
   - Ensure WASM module loads correctly
   - Check browser supports WebAssembly
   - Verify sufficient system resources

### Debug Mode
Enable debug logging by setting:
```javascript
localStorage.setItem('debug', 'stellar:*');
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
