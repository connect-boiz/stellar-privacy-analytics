import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
import { EncryptedData } from '../types/privacy';

// Export new blob storage components
export * from './aes';
export * from './storage';
export * from './blob-storage';

export class EncryptionService {
  private static readonly ALGORITHM = 'AES-256-GCM';
  private static readonly KEY_DERIVATION_ITERATIONS = 100000;

  /**
   * Encrypts data using AES-256-GCM with authenticated encryption
   */
  static async encrypt(data: any, key: string): Promise<EncryptedData> {
    try {
      const keyId = uuidv4();
      const iv = CryptoJS.lib.WordArray.random(16);
      const keyHash = CryptoJS.PBKDF2(key, keyId, {
        keySize: 256 / 32,
        iterations: this.KEY_DERIVATION_ITERATIONS
      });

      const encrypted = CryptoJS.AES.encrypt(
        JSON.stringify(data),
        keyHash,
        {
          iv: iv,
          mode: CryptoJS.mode.GCM,
          padding: CryptoJS.pad.NoPadding
        }
      );

      const checksum = CryptoJS.SHA256(JSON.stringify(data)).toString();

      return {
        data: encrypted.toString(),
        metadata: {
          algorithm: this.ALGORITHM,
          keyId,
          iv: CryptoJS.enc.Base64.stringify(iv),
          timestamp: new Date()
        },
        checksum
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error}`);
    }
  }

  /**
   * Decrypts data using AES-256-GCM
   */
  static async decrypt(encryptedData: EncryptedData, key: string): Promise<any> {
    try {
      const { data, metadata } = encryptedData;
      const iv = CryptoJS.enc.Base64.parse(metadata.iv);
      
      const keyHash = CryptoJS.PBKDF2(key, metadata.keyId, {
        keySize: 256 / 32,
        iterations: this.KEY_DERIVATION_ITERATIONS
      });

      const decrypted = CryptoJS.AES.decrypt(data, keyHash, {
        iv: iv,
        mode: CryptoJS.mode.GCM,
        padding: CryptoJS.pad.NoPadding
      });

      const plaintext = decrypted.toString(CryptoJS.enc.Utf8);
      
      if (!plaintext) {
        throw new Error('Decryption produced empty result');
      }

      const result = JSON.parse(plaintext);
      
      // Verify checksum
      const computedChecksum = CryptoJS.SHA256(JSON.stringify(result)).toString();
      if (computedChecksum !== encryptedData.checksum) {
        throw new Error('Data integrity check failed');
      }

      return result;
    } catch (error) {
      throw new Error(`Decryption failed: ${error}`);
    }
  }

  /**
   * Generates a cryptographically secure random key
   */
  static generateKey(length: number = 256): string {
    return CryptoJS.lib.WordArray.random(length / 8).toString();
  }

  /**
   * Hashes data using SHA-256
   */
  static hash(data: string): string {
    return CryptoJS.SHA256(data).toString();
  }

  /**
   * Generates a salt for key derivation
   */
  static generateSalt(): string {
    return CryptoJS.lib.WordArray.random(32).toString();
  }

  /**
   * Derives a key from password using PBKDF2
   */
  static deriveKey(password: string, salt: string, iterations: number = 100000): string {
    return CryptoJS.PBKDF2(password, salt, {
      keySize: 256 / 32,
      iterations
    }).toString();
  }
}

/**
 * Homomorphic encryption utilities for privacy-preserving computations
 */
export class HomomorphicEncryption {
  /**
   * Simple additive homomorphic encryption for numerical values
   * Note: This is a simplified implementation for demonstration
   */
  static encryptNumber(value: number, key: number): number {
    return value + key;
  }

  static decryptNumber(encryptedValue: number, key: number): number {
    return encryptedValue - key;
  }

  /**
   * Homomorphic addition of encrypted numbers
   */
  static addEncrypted(encryptedValues: number[]): number {
    return encryptedValues.reduce((sum, val) => sum + val, 0);
  }

  /**
   * Homomorphic multiplication with constant
   */
  static multiplyEncrypted(encryptedValue: number, constant: number): number {
    return encryptedValue * constant;
  }
}

/**
 * Differential privacy utilities
 */
export class DifferentialPrivacy {
  /**
   * Adds Laplace noise for differential privacy
   */
  static addLaplaceNoise(value: number, epsilon: number, sensitivity: number = 1): number {
    if (epsilon <= 0) {
      throw new Error('Epsilon must be positive');
    }

    const scale = sensitivity / epsilon;
    const uniform = Math.random() - 0.5;
    const noise = -scale * Math.sign(uniform) * Math.log(1 - 2 * Math.abs(uniform));
    
    return value + noise;
  }

  /**
   * Adds Gaussian noise for differential privacy
   */
  static addGaussianNoise(value: number, epsilon: number, delta: number, sensitivity: number = 1): number {
    if (epsilon <= 0 || delta <= 0 || delta >= 1) {
      throw new Error('Invalid epsilon or delta values');
    }

    const sigma = sensitivity * Math.sqrt(2 * Math.log(1.25 / delta)) / epsilon;
    const noise = this.gaussianRandom() * sigma;
    
    return value + noise;
  }

  /**
   * Generates Gaussian random number using Box-Muller transform
   */
  private static gaussianRandom(): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  /**
   * Calculates privacy budget consumption
   */
  static calculateBudgetConsumed(epsilon: number, delta: number = 0): number {
    return epsilon + (delta > 0 ? Math.log(1 / delta) : 0);
  }
}
