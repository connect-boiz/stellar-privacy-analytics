/**
 * Client-side encryption utilities using Web Crypto API
 * Provides AES-256-GCM encryption and RSA key management
 */

export interface EncryptedFile {
  data: ArrayBuffer;
  iv: Uint8Array;
  salt: Uint8Array;
  checksum: string;
  algorithm: string;
}

export interface RSAKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export class WebCryptoService {
  private static readonly ALGORITHM = 'AES-256-GCM';
  private static readonly RSA_ALGORITHM = 'RSA-OAEP';
  private static readonly KEY_DERIVATION_ITERATIONS = 100000;

  /**
   * Generate an AES-256 key from a password
   */
  static async generateAESKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: this.KEY_DERIVATION_ITERATIONS,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: this.ALGORITHM, length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Generate RSA key pair for asymmetric encryption
   */
  static async generateRSAKeyPair(): Promise<RSAKeyPair> {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: this.RSA_ALGORITHM,
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256'
      },
      true,
      ['encrypt', 'decrypt']
    );

    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey
    };
  }

  /**
   * Encrypt file data using AES-256-GCM
   */
  static async encryptFile(
    file: File,
    password: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<EncryptedFile> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Generate key from password
    const key = await this.generateAESKey(password, salt);
    
    // Read file in chunks for progress tracking
    const arrayBuffer = await this.readFileInChunks(file, onProgress);
    
    // Encrypt the data
    const encryptedData = await crypto.subtle.encrypt(
      {
        name: this.ALGORITHM,
        iv
      },
      key,
      arrayBuffer
    );

    // Generate checksum
    const checksum = await this.generateChecksum(arrayBuffer);

    return {
      data: encryptedData,
      iv,
      salt,
      checksum,
      algorithm: this.ALGORITHM
    };
  }

  /**
   * Decrypt file data using AES-256-GCM
   */
  static async decryptFile(
    encryptedFile: EncryptedFile,
    password: string
  ): Promise<ArrayBuffer> {
    const key = await this.generateAESKey(password, encryptedFile.salt);
    
    const decryptedData = await crypto.subtle.decrypt(
      {
        name: this.ALGORITHM,
        iv: encryptedFile.iv
      },
      key,
      encryptedFile.data
    );

    // Verify checksum
    const computedChecksum = await this.generateChecksum(decryptedData);
    if (computedChecksum !== encryptedFile.checksum) {
      throw new Error('File integrity check failed - data may be corrupted');
    }

    return decryptedData;
  }

  /**
   * Encrypt data with RSA public key
   */
  static async encryptWithRSA(data: ArrayBuffer, publicKey: CryptoKey): Promise<ArrayBuffer> {
    return crypto.subtle.encrypt(
      {
        name: this.RSA_ALGORITHM
      },
      publicKey,
      data
    );
  }

  /**
   * Decrypt data with RSA private key
   */
  static async decryptWithRSA(encryptedData: ArrayBuffer, privateKey: CryptoKey): Promise<ArrayBuffer> {
    return crypto.subtle.decrypt(
      {
        name: this.RSA_ALGORITHM
      },
      privateKey,
      encryptedData
    );
  }

  /**
   * Generate SHA-256 checksum for file integrity verification
   */
  static async generateChecksum(data: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Verify file integrity using SHA-256
   */
  static async verifyFileIntegrity(file: File, expectedChecksum: string): Promise<boolean> {
    const arrayBuffer = await file.arrayBuffer();
    const actualChecksum = await this.generateChecksum(arrayBuffer);
    return actualChecksum === expectedChecksum;
  }

  /**
   * Read file in chunks for progress tracking
   */
  private static async readFileInChunks(
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const chunkSize = 1024 * 1024; // 1MB chunks
      let offset = 0;

      reader.onload = (e) => {
        if (e.target?.error) {
          reject(e.target.error);
          return;
        }

        const result = e.target?.result as ArrayBuffer;
        offset += result.byteLength;

        if (onProgress) {
          onProgress({
            loaded: offset,
            total: file.size,
            percentage: Math.round((offset / file.size) * 100)
          });
        }

        if (offset < file.size) {
          readNextChunk();
        } else {
          resolve(result);
        }
      };

      const readNextChunk = () => {
        const chunk = file.slice(offset, offset + chunkSize);
        reader.readAsArrayBuffer(chunk);
      };

      readNextChunk();
    });
  }

  /**
   * Export RSA public key to PEM format
   */
  static async exportRSAPublicKey(publicKey: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey('spki', publicKey);
    const exportedAsString = String.fromCharCode.apply(null, Array.from(new Uint8Array(exported)));
    const exportedAsBase64 = btoa(exportedAsString);
    const pemHeader = '-----BEGIN PUBLIC KEY-----';
    const pemFooter = '-----END PUBLIC KEY-----';
    return `${pemHeader}\n${exportedAsBase64.match(/.{1,64}/g)?.join('\n')}\n${pemFooter}`;
  }

  /**
   * Import RSA public key from PEM format
   */
  static async importRSAPublicKey(pem: string): Promise<CryptoKey> {
    const pemHeader = '-----BEGIN PUBLIC KEY-----';
    const pemFooter = '-----END PUBLIC KEY-----';
    const pemContents = pem.substring(pemHeader.length, pem.length - pemFooter.length).replace(/\s/g, '');
    const binaryDerString = atob(pemContents);
    const binaryDer = new Uint8Array(binaryDerString.length).map((_, i) => binaryDerString.charCodeAt(i));

    return crypto.subtle.importKey(
      'spki',
      binaryDer.buffer,
      {
        name: this.RSA_ALGORITHM,
        hash: 'SHA-256'
      },
      false,
      ['encrypt']
    );
  }

  /**
   * Generate cryptographically secure random password
   */
  static generateSecurePassword(length: number = 32): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);
    
    return Array.from(randomValues, value => charset[value % charset.length]).join('');
  }
}
