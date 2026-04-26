import crypto from 'crypto';
import { logger } from '../utils/logger';

export interface StorageOptions {
  encrypted?: boolean;
  ttl?: number; // Time to live in seconds
  tags?: Record<string, string>;
  replicaCount?: number;
}

export interface StorageResult {
  id: string;
  backend: string;
  uri: string;
  hash: string;
  size: number;
  encrypted: boolean;
  metadata: Record<string, any>;
}

export interface StorageBackend {
  name: string;
  upload(data: Buffer, path: string, options?: StorageOptions): Promise<StorageResult>;
  download(uri: string): Promise<Buffer>;
  delete(uri: string): Promise<void>;
  exists(uri: string): Promise<boolean>;
  getMetadata(uri: string): Promise<Record<string, any>>;
}

export class StorageService {
  private backends: Map<string, StorageBackend> = new Map();
  private defaultBackend: string = 'ipfs';
  private masterKey: Buffer;

  constructor(masterKey: string) {
    this.masterKey = Buffer.from(masterKey, 'hex');
  }

  registerBackend(backend: StorageBackend, isDefault: boolean = false): void {
    this.backends.set(backend.name, backend);
    if (isDefault) this.defaultBackend = backend.name;
    logger.info(`Storage backend registered: ${backend.name}`);
  }

  async store(data: Buffer, fileName: string, options: StorageOptions = {}): Promise<StorageResult[]> {
    const encrypted = options.encrypted !== false;
    let processedData = data;
    let encryptionMetadata: any = {};

    // 1. Integrity check (Merkle tree root / Hash)
    const originalHash = this.calculateHash(data);

    // 2. Encryption
    if (encrypted) {
      const { ciphertext, iv, authTag } = this.encrypt(data);
      processedData = ciphertext;
      encryptionMetadata = { iv: iv.toString('hex'), authTag: authTag.toString('hex') };
    }

    // 3. Multi-backend replication
    const results: StorageResult[] = [];
    const replicaCount = options.replicaCount || 1;
    const availableBackends = Array.from(this.backends.values());
    
    // Always upload to default first
    const defaultBackend = this.backends.get(this.defaultBackend);
    if (defaultBackend) {
      const result = await defaultBackend.upload(processedData, fileName, options);
      result.metadata = { ...result.metadata, ...encryptionMetadata, originalHash };
      results.push(result);
    }

    // Replicate to other backends if needed
    for (let i = 0; i < Math.min(replicaCount - 1, availableBackends.length - 1); i++) {
      const backend = availableBackends.find(b => !results.some(r => r.backend === b.name));
      if (backend) {
        try {
          const result = await backend.upload(processedData, fileName, options);
          result.metadata = { ...result.metadata, ...encryptionMetadata, originalHash };
          results.push(result);
        } catch (error) {
          logger.error(`Replication failed for backend: ${backend.name}`, { error: error.message });
        }
      }
    }

    return results;
  }

  async retrieve(results: StorageResult[]): Promise<Buffer> {
    // Try each backend until successful
    for (const result of results) {
      try {
        const backend = this.backends.get(result.backend);
        if (!backend) continue;

        let data = await backend.download(result.uri);

        // Verify integrity
        const currentHash = this.calculateHash(data);
        if (currentHash !== result.hash) {
          logger.error(`Integrity verification failed for ${result.uri} on ${result.backend}`);
          continue;
        }

        // Decrypt if needed
        if (result.encrypted && result.metadata.iv && result.metadata.authTag) {
          data = this.decrypt(
            data, 
            Buffer.from(result.metadata.iv, 'hex'), 
            Buffer.from(result.metadata.authTag, 'hex')
          );
        }

        return data;
      } catch (error) {
        logger.error(`Retrieval failed from ${result.backend}`, { error: error.message });
      }
    }

    throw new Error('Failed to retrieve data from any backend');
  }

  private encrypt(data: Buffer): { ciphertext: Buffer; iv: Buffer; authTag: Buffer } {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);
    
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    return { ciphertext, iv, authTag };
  }

  private decrypt(ciphertext: Buffer, iv: Buffer, authTag: Buffer): Buffer {
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(authTag);
    
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  private calculateHash(data: Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}
