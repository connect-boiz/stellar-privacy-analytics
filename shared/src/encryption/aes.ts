import crypto from 'crypto';
import { createHash } from 'crypto';

export interface EncryptionResult {
  encryptedData: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyId?: string;
}

export interface DecryptionResult {
  decryptedData: Buffer;
  integrityVerified: boolean;
}

export class AESEncryption {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 16;
  private static readonly AUTH_TAG_LENGTH = 16;
  private static readonly KEY_LENGTH = 32;

  /**
   * Generate a new AES-256 key
   */
  static generateKey(): Buffer {
    return crypto.randomBytes(this.KEY_LENGTH);
  }

  /**
   * Derive key from password using PBKDF2
   */
  static deriveKey(password: string, salt: Buffer, iterations: number = 100000): Buffer {
    return crypto.pbkdf2Sync(password, salt, iterations, this.KEY_LENGTH, 'sha256');
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  static encrypt(data: Buffer, key: Buffer, keyId?: string): EncryptionResult {
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipher(this.ALGORITHM, key);
    cipher.setAAD(Buffer.from(keyId || ''));
    
    const encryptedData = Buffer.concat([
      cipher.update(data),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    return {
      encryptedData,
      iv,
      authTag,
      keyId
    };
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  static decrypt(
    encryptedData: Buffer, 
    key: Buffer, 
    iv: Buffer, 
    authTag: Buffer, 
    keyId?: string
  ): DecryptionResult {
    const decipher = crypto.createDecipher(this.ALGORITHM, key);
    decipher.setAAD(Buffer.from(keyId || ''));
    decipher.setAuthTag(authTag);
    
    try {
      const decryptedData = Buffer.concat([
        decipher.update(encryptedData),
        decipher.final()
      ]);
      
      return {
        decryptedData,
        integrityVerified: true
      };
    } catch (error) {
      return {
        decryptedData: Buffer.alloc(0),
        integrityVerified: false
      };
    }
  }

  /**
   * Encrypt data with key encapsulation (ECDH)
   */
  static encryptWithKeyEncapsulation(data: Buffer, recipientPublicKey: crypto.KeyObject): EncryptionResult & { encryptedKey: Buffer } {
    const ephemeralKeyPair = crypto.generateKeyPairSync('ec', {
      namedCurve: 'secp256k1'
    });
    
    const sharedSecret = crypto.diffieHellman({
      privateKey: ephemeralKeyPair.privateKey,
      publicKey: recipientPublicKey
    });
    
    const encryptionKey = createHash('sha256').update(sharedSecret).digest();
    const encryptionResult = this.encrypt(data, encryptionKey);
    
    const encryptedKey = crypto.publicEncrypt(
      {
        key: recipientPublicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      encryptionKey
    );
    
    return {
      ...encryptionResult,
      encryptedKey
    };
  }

  /**
   * Verify data integrity using SHA-256
   */
  static verifyIntegrity(data: Buffer, expectedHash: string): boolean {
    const actualHash = createHash('sha256').update(data).digest('hex');
    return actualHash === expectedHash;
  }

  /**
   * Generate SHA-256 hash of data
   */
  static generateHash(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }
}

export class StreamingDecryption {
  private cipher: crypto.DecipherGCM;
  private chunks: Buffer[] = [];
  
  constructor(key: Buffer, iv: Buffer, authTag: Buffer, keyId?: string) {
    this.cipher = crypto.createDecipher('aes-256-gcm', key);
    this.cipher.setAAD(Buffer.from(keyId || ''));
    this.cipher.setAuthTag(authTag);
  }
  
  /**
   * Process a chunk of encrypted data
   */
  processChunk(chunk: Buffer): Buffer | null {
    try {
      return this.cipher.update(chunk);
    } catch (error) {
      throw new Error('Decryption failed: Invalid chunk or authentication');
    }
  }
  
  /**
   * Finalize decryption and verify integrity
   */
  finalize(): Buffer {
    try {
      const finalChunk = this.cipher.final();
      this.chunks.push(finalChunk);
      return Buffer.concat(this.chunks);
    } catch (error) {
      throw new Error('Decryption failed: Authentication tag verification failed');
    }
  }
  
  /**
   * Add decrypted chunk to buffer
   */
  addChunk(chunk: Buffer): void {
    this.chunks.push(chunk);
  }
  
  /**
   * Get all decrypted chunks concatenated
   */
  getDecryptedData(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

export interface KeyManagement {
  generateKey(): Buffer;
  storeKey(keyId: string, key: Buffer): Promise<void>;
  retrieveKey(keyId: string): Promise<Buffer | null>;
  rotateKey(keyId: string): Promise<Buffer>;
}

export class SimpleKeyManager implements KeyManagement {
  private keys: Map<string, Buffer> = new Map();
  
  generateKey(): Buffer {
    return AESEncryption.generateKey();
  }
  
  async storeKey(keyId: string, key: Buffer): Promise<void> {
    this.keys.set(keyId, key);
  }
  
  async retrieveKey(keyId: string): Promise<Buffer | null> {
    return this.keys.get(keyId) || null;
  }
  
  async rotateKey(keyId: string): Promise<Buffer> {
    const newKey = this.generateKey();
    await this.storeKey(keyId, newKey);
    return newKey;
  }
}
