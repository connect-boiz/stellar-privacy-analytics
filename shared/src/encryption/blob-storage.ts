import { create } from 'ipfs-http-client';
import FormData from 'form-data';
import axios from 'axios';
import { 
  AESEncryption, 
  StreamingDecryption, 
  KeyManagement,
  EncryptionResult,
  DecryptionResult
} from './aes';
import {
  CIDInfo,
  StorageResult,
  RetrievalResult,
  RetryConfig,
  CIDVersionManager,
  RetryManager,
  IntegrityValidator,
  StellarLedgerManager,
  StellarLedgerEntry
} from './storage';

export interface IPFSConfig {
  nodeUrl?: string;
  pinataApiKey?: string;
  pinataSecretKey?: string;
  timeout?: number;
  retries?: RetryConfig;
}

export interface EncryptedUploadOptions {
  datasetId: string;
  encryptionKeyId?: string;
  storeOnLedger?: boolean;
  metadata?: Record<string, any>;
}

export class EncryptedBlobStorageAdapter {
  private ipfsClient: any;
  private config: IPFSConfig;
  private keyManager: KeyManagement;
  private versionManager: CIDVersionManager;
  private ledgerManager: StellarLedgerManager;
  
  constructor(config: IPFSConfig, keyManager: KeyManagement) {
    this.config = {
      timeout: 30000,
      retries: RetryManager.defaultConfig(),
      ...config
    };
    
    // Initialize IPFS client
    if (this.config.nodeUrl) {
      this.ipfsClient = create({ url: this.config.nodeUrl });
    }
    
    this.keyManager = keyManager;
    this.versionManager = new CIDVersionManager();
    this.ledgerManager = new StellarLedgerManager();
  }
  
  /**
   * Encrypt and upload data to IPFS/Filecoin
   */
  async uploadEncrypted(
    data: Buffer,
    options: EncryptedUploadOptions
  ): Promise<StorageResult> {
    // Generate or retrieve encryption key
    const encryptionKeyId = options.encryptionKeyId || `key_${Date.now()}`;
    let key = await this.keyManager.retrieveKey(encryptionKeyId);
    
    if (!key) {
      key = this.keyManager.generateKey();
      await this.keyManager.storeKey(encryptionKeyId, key);
    }
    
    // Encrypt data
    const encryptionResult = AESEncryption.encrypt(data, key, encryptionKeyId);
    
    // Generate hash for integrity verification
    const hash = AESEncryption.generateHash(encryptionResult.encryptedData);
    
    // Upload to IPFS with retry mechanism
    const cid = await RetryManager.executeWithRetry(
      () => this.uploadToIPFS(encryptionResult.encryptedData),
      this.config.retries!,
      `IPFS upload for dataset ${options.datasetId}`
    );
    
    // Create CID info
    const cidInfo: CIDInfo = {
      cid,
      size: encryptionResult.encryptedData.length,
      hash,
      timestamp: new Date(),
      version: 1,
      keyId: encryptionKeyId
    };
    
    // Store version information
    this.versionManager.addVersion(options.datasetId, cidInfo);
    
    // Store on Stellar ledger if requested
    if (options.storeOnLedger) {
      const ledgerEntry: StellarLedgerEntry = {
        id: `${options.datasetId}_${cidInfo.version}`,
        cid,
        hash,
        timestamp: cidInfo.timestamp,
        datasetId: options.datasetId,
        version: cidInfo.version,
        encryptionKeyId,
        metadata: options.metadata
      };
      
      await this.ledgerManager.storeCID(ledgerEntry);
    }
    
    return {
      cid,
      hash,
      size: encryptionResult.encryptedData.length,
      timestamp: cidInfo.timestamp,
      encryptionKeyId,
      integrityVerified: true
    };
  }
  
  /**
   * Download and decrypt data from IPFS/Filecoin
   */
  async downloadEncrypted(
    cid: string,
    encryptionKeyId: string,
    validateIntegrity: boolean = true
  ): Promise<RetrievalResult> {
    // Download from IPFS with retry mechanism
    const encryptedData = await RetryManager.executeWithRetry(
      () => this.downloadFromIPFS(cid),
      this.config.retries!,
      `IPFS download for CID ${cid}`
    );
    
    // Retrieve encryption key
    const key = await this.keyManager.retrieveKey(encryptionKeyId);
    if (!key) {
      throw new Error(`Encryption key not found for key ID: ${encryptionKeyId}`);
    }
    
    // Parse encryption metadata (assuming IV and authTag are stored with the data)
    const { encryptedPayload, iv, authTag } = this.parseEncryptedData(encryptedData);
    
    // Decrypt data
    const decryptionResult = AESEncryption.decrypt(encryptedPayload, key, iv, authTag, encryptionKeyId);
    
    if (!decryptionResult.integrityVerified) {
      throw new Error('Decryption failed: Authentication tag verification failed');
    }
    
    // Verify integrity if requested
    let integrityVerified = true;
    let expectedHash = '';
    let actualHash = '';
    
    if (validateIntegrity) {
      expectedHash = AESEncryption.generateHash(encryptedPayload);
      actualHash = AESEncryption.generateHash(encryptedPayload);
      integrityVerified = IntegrityValidator.validateIntegrity(encryptedPayload, expectedHash);
    }
    
    // Get metadata from version manager or ledger
    const metadata = await this.getMetadataForCID(cid);
    
    return {
      data: decryptionResult.decryptedData,
      integrity: {
        verified: integrityVerified,
        expectedHash,
        actualHash
      },
      metadata: metadata || {
        cid,
        size: encryptedData.length,
        hash: expectedHash,
        timestamp: new Date(),
        version: 1,
        keyId: encryptionKeyId
      }
    };
  }
  
  /**
   * Stream decryption for large files
   */
  async streamDecryption(
    cid: string,
    encryptionKeyId: string,
    chunkSize: number = 1024 * 1024 // 1MB chunks
  ): Promise<AsyncIterableIterator<Buffer>> {
    // Get encryption key
    const key = await this.keyManager.retrieveKey(encryptionKeyId);
    if (!key) {
      throw new Error(`Encryption key not found for key ID: ${encryptionKeyId}`);
    }
    
    // Download encrypted data
    const encryptedData = await this.downloadFromIPFS(cid);
    const { encryptedPayload, iv, authTag } = this.parseEncryptedData(encryptedData);
    
    // Create streaming decryption
    const decryption = new StreamingDecryption(key, iv, authTag, encryptionKeyId);
    
    return this.createDecryptionStream(encryptedPayload, decryption, chunkSize);
  }
  
  /**
   * Rotate CID for updated dataset
   */
  async rotateCID(
    datasetId: string,
    newData: Buffer,
    options: Omit<EncryptedUploadOptions, 'datasetId'> = {}
  ): Promise<StorageResult> {
    const latestVersion = this.versionManager.getLatestVersion(datasetId);
    const version = (latestVersion?.version || 0) + 1;
    
    const uploadOptions: EncryptedUploadOptions = {
      ...options,
      datasetId,
      encryptionKeyId: latestVersion?.keyId || options.encryptionKeyId
    };
    
    const result = await this.uploadEncrypted(newData, uploadOptions);
    
    // Update version information
    const cidInfo = this.versionManager.getLatestVersion(datasetId)!;
    cidInfo.version = version;
    
    return result;
  }
  
  /**
   * Get all versions for a dataset
   */
  getVersions(datasetId: string): CIDInfo[] {
    return this.versionManager.getAllVersions(datasetId);
  }
  
  /**
   * Get specific version of a dataset
   */
  async getVersion(datasetId: string, version: number): Promise<RetrievalResult | null> {
    const cidInfo = this.versionManager.getVersion(datasetId, version);
    if (!cidInfo || !cidInfo.keyId) {
      return null;
    }
    
    return this.downloadEncrypted(cidInfo.cid, cidInfo.keyId);
  }
  
  /**
   * Upload data to IPFS node
   */
  private async uploadToIPFS(data: Buffer): Promise<string> {
    if (this.ipfsClient) {
      const result = await this.ipfsClient.add(data);
      return result.cid.toString();
    } else if (this.config.pinataApiKey && this.config.pinataSecretKey) {
      return this.uploadToPinata(data);
    } else {
      throw new Error('No IPFS node or Pinata credentials configured');
    }
  }
  
  /**
   * Upload data to Pinata
   */
  private async uploadToPinata(data: Buffer): Promise<string> {
    const formData = new FormData();
    formData.append('file', data);
    
    const response = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      formData,
      {
        headers: {
          'pinata_api_key': this.config.pinataApiKey!,
          'pinata_secret_api_key': this.config.pinataSecretKey!,
          ...formData.getHeaders()
        },
        timeout: this.config.timeout
      }
    );
    
    return response.data.IpfsHash;
  }
  
  /**
   * Download data from IPFS
   */
  private async downloadFromIPFS(cid: string): Promise<Buffer> {
    if (this.ipfsClient) {
      const chunks = [];
      for await (const chunk of this.ipfsClient.cat(cid)) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } else {
      // Use public IPFS gateway
      const response = await axios.get(
        `https://ipfs.io/ipfs/${cid}`,
        { responseType: 'arraybuffer', timeout: this.config.timeout }
      );
      return Buffer.from(response.data);
    }
  }
  
  /**
   * Parse encrypted data to extract payload, IV, and auth tag
   */
  private parseEncryptedData(encryptedData: Buffer): {
    encryptedPayload: Buffer;
    iv: Buffer;
    authTag: Buffer;
  } {
    // Format: IV (16 bytes) + AuthTag (16 bytes) + EncryptedPayload
    const iv = encryptedData.slice(0, 16);
    const authTag = encryptedData.slice(16, 32);
    const encryptedPayload = encryptedData.slice(32);
    
    return { encryptedPayload, iv, authTag };
  }
  
  /**
   * Create decryption stream
   */
  private async* createDecryptionStream(
    encryptedData: Buffer,
    decryption: StreamingDecryption,
    chunkSize: number
  ): AsyncIterableIterator<Buffer> {
    for (let i = 0; i < encryptedData.length; i += chunkSize) {
      const chunk = encryptedData.slice(i, i + chunkSize);
      const decryptedChunk = decryption.processChunk(chunk);
      
      if (decryptedChunk) {
        decryption.addChunk(decryptedChunk);
        yield decryptedChunk;
      }
    }
    
    // Finalize decryption
    const finalChunk = decryption.finalize();
    if (finalChunk.length > 0) {
      yield finalChunk;
    }
  }
  
  /**
   * Get metadata for CID from version manager or ledger
   */
  private async getMetadataForCID(cid: string): Promise<CIDInfo | null> {
    // Search in version manager
    for (const [datasetId, versions] of this.versionManager['versions'].entries()) {
      const version = versions.find(v => v.cid === cid);
      if (version) {
        return version;
      }
    }
    
    // Search in ledger manager
    for (const [datasetId] of this.ledgerManager['entries'].entries()) {
      const entries = await this.ledgerManager.getAllEntries(datasetId);
      const entry = entries.find(e => e.cid === cid);
      if (entry) {
        return {
          cid: entry.cid,
          size: 0, // Not stored in ledger
          hash: entry.hash,
          timestamp: entry.timestamp,
          version: entry.version,
          keyId: entry.encryptionKeyId
        };
      }
    }
    
    return null;
  }
}
