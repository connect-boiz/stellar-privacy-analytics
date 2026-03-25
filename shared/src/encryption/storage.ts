export interface CIDInfo {
  cid: string;
  size: number;
  hash: string;
  timestamp: Date;
  version: number;
  keyId?: string;
}

export interface StorageResult {
  cid: string;
  hash: string;
  size: number;
  timestamp: Date;
  encryptionKeyId: string;
  integrityVerified: boolean;
}

export interface RetrievalResult {
  data: Buffer;
  integrity: {
    verified: boolean;
    expectedHash: string;
    actualHash: string;
  };
  metadata: CIDInfo;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export class CIDVersionManager {
  private versions: Map<string, CIDInfo[]> = new Map();
  
  /**
   * Add new version for a dataset
   */
  addVersion(datasetId: string, cidInfo: CIDInfo): void {
    if (!this.versions.has(datasetId)) {
      this.versions.set(datasetId, []);
    }
    
    const versions = this.versions.get(datasetId)!;
    cidInfo.version = versions.length + 1;
    versions.push(cidInfo);
    
    // Keep only last 10 versions
    if (versions.length > 10) {
      versions.shift();
    }
  }
  
  /**
   * Get latest version CID
   */
  getLatestVersion(datasetId: string): CIDInfo | null {
    const versions = this.versions.get(datasetId);
    return versions ? versions[versions.length - 1] : null;
  }
  
  /**
   * Get specific version CID
   */
  getVersion(datasetId: string, version: number): CIDInfo | null {
    const versions = this.versions.get(datasetId);
    return versions ? versions[version - 1] || null : null;
  }
  
  /**
   * Get all versions for a dataset
   */
  getAllVersions(datasetId: string): CIDInfo[] {
    return this.versions.get(datasetId) || [];
  }
  
  /**
   * Rotate to new CID (increment version)
   */
  rotateCID(datasetId: string, newCidInfo: CIDInfo): CIDInfo {
    this.addVersion(datasetId, newCidInfo);
    return newCidInfo;
  }
}

export class RetryManager {
  /**
   * Execute operation with exponential backoff retry
   */
  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: RetryConfig,
    context?: string
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === config.maxRetries) {
          throw new Error(
            `Operation failed after ${config.maxRetries} attempts. ` +
            `Context: ${context || 'unknown'}. ` +
            `Last error: ${lastError.message}`
          );
        }
        
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelay
        );
        
        console.warn(
          `Attempt ${attempt} failed (Context: ${context || 'unknown'}). ` +
          `Retrying in ${delay}ms. Error: ${lastError.message}`
        );
        
        await this.sleep(delay);
      }
    }
    
    throw lastError!;
  }
  
  /**
   * Sleep for specified milliseconds
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Default retry configuration
   */
  static defaultConfig(): RetryConfig {
    return {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2
    };
  }
}

export class IntegrityValidator {
  /**
   * Validate data integrity using SHA-256
   */
  static validateIntegrity(data: Buffer, expectedHash: string): boolean {
    const crypto = require('crypto');
    const actualHash = crypto.createHash('sha256').update(data).digest('hex');
    return actualHash === expectedHash;
  }
  
  /**
   * Generate SHA-256 hash
   */
  static generateHash(data: Buffer): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  
  /**
   * Verify data integrity and return detailed result
   */
  static verifyData(data: Buffer, expectedHash: string): {
    isValid: boolean;
    expectedHash: string;
    actualHash: string;
  } {
    const actualHash = this.generateHash(data);
    return {
      isValid: actualHash === expectedHash,
      expectedHash,
      actualHash
    };
  }
}

export interface StellarLedgerEntry {
  id: string;
  cid: string;
  hash: string;
  timestamp: Date;
  datasetId: string;
  version: number;
  encryptionKeyId: string;
  metadata?: Record<string, any>;
}

export class StellarLedgerManager {
  private entries: Map<string, StellarLedgerEntry[]> = new Map();
  
  /**
   * Store CID on Stellar ledger
   */
  async storeCID(entry: StellarLedgerEntry): Promise<void> {
    if (!this.entries.has(entry.datasetId)) {
      this.entries.set(entry.datasetId, []);
    }
    
    const entries = this.entries.get(entry.datasetId)!;
    entries.push(entry);
    
    // Simulate Stellar ledger transaction
    console.log(`Storing CID ${entry.cid} for dataset ${entry.datasetId} on Stellar ledger`);
  }
  
  /**
   * Retrieve CID from Stellar ledger
   */
  async retrieveCID(datasetId: string, version?: number): Promise<StellarLedgerEntry | null> {
    const entries = this.entries.get(datasetId);
    if (!entries) return null;
    
    if (version !== undefined) {
      return entries[version - 1] || null;
    }
    
    // Return latest version
    return entries[entries.length - 1] || null;
  }
  
  /**
   * Get all entries for a dataset
   */
  async getAllEntries(datasetId: string): Promise<StellarLedgerEntry[]> {
    return this.entries.get(datasetId) || [];
  }
  
  /**
   * Verify CID exists on ledger
   */
  async verifyCIDExists(cid: string): Promise<boolean> {
    for (const entries of this.entries.values()) {
      if (entries.some(entry => entry.cid === cid)) {
        return true;
      }
    }
    return false;
  }
}
