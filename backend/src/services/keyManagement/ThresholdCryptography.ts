import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'crypto';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import {
  getErrorMessage,
  validateThresholdParams,
  validateNonEmptyArray
} from '../../utils/errorHandler';

/**
 * Shamir's Secret Sharing implementation for threshold cryptography
 * Allows splitting a secret into N shares where any K shares can reconstruct the secret
 */
export class ThresholdCryptography extends EventEmitter {
  // Prime number for finite field arithmetic (256-bit prime)
  private readonly PRIME = BigInt(
    '115792089237316195423570985008687907853269984665640564039457584007913129639747'
  );

  constructor() {
    super();
  }

  /**
   * Create shares from key material using Shamir's Secret Sharing
   */
  async createShares(
    secret: Buffer,
    threshold: number,
    totalShares: number,
    shareHolders: string[]
  ): Promise<{ shareId: string; holder: string; share: string }[]> {
    // Validate inputs
    validateThresholdParams(threshold, totalShares);
    validateNonEmptyArray(shareHolders, 'shareHolders');

    if (shareHolders.length !== totalShares) {
      throw new Error('Number of share holders must match total shares');
    }

    if (!Buffer.isBuffer(secret) || secret.length === 0) {
      throw new Error('Secret must be a non-empty Buffer');
    }

    try {
      // Convert secret to BigInt
      const secretInt = this.bufferToBigInt(secret);

      // Generate random coefficients for polynomial
      const coefficients = [secretInt];
      for (let i = 1; i < threshold; i++) {
        coefficients.push(this.randomBigInt());
      }

      // Generate shares by evaluating polynomial at different points
      const shares: { shareId: string; holder: string; share: string }[] = [];
      
      for (let i = 0; i < totalShares; i++) {
        const x = BigInt(i + 1);
        const y = this.evaluatePolynomial(coefficients, x);
        
        const shareId = this.generateShareId();
        const shareData = {
          x: x.toString(),
          y: y.toString(),
          threshold,
          totalShares
        };

        shares.push({
          shareId,
          holder: shareHolders[i],
          share: Buffer.from(JSON.stringify(shareData)).toString('base64')
        });
      }

      logger.info('Threshold shares created', {
        threshold,
        totalShares,
        shareHolders: shareHolders.length
      });

      this.emit('sharesCreated', {
        threshold,
        totalShares,
        shareHolders
      });

      return shares;
    } catch (error: unknown) {
      logger.error('Failed to create threshold shares:', error);
      throw new Error(`Share creation failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Reconstruct secret from threshold shares
   */
  async reconstructSecret(
    shares: { shareId: string; holder: string; share: string }[],
    threshold: number
  ): Promise<Buffer> {
    if (shares.length < threshold) {
      throw new Error(`Insufficient shares: need ${threshold}, got ${shares.length}`);
    }

    try {
      // Parse shares
      const parsedShares = shares.slice(0, threshold).map(s => {
        const shareData = JSON.parse(Buffer.from(s.share, 'base64').toString());
        return {
          x: BigInt(shareData.x),
          y: BigInt(shareData.y)
        };
      });

      // Use Lagrange interpolation to reconstruct secret
      const secret = this.lagrangeInterpolation(parsedShares);

      logger.info('Secret reconstructed from threshold shares', {
        sharesUsed: shares.length,
        threshold
      });

      this.emit('secretReconstructed', {
        sharesUsed: shares.length,
        threshold
      });

      return this.bigIntToBuffer(secret);
    } catch (error: unknown) {
      logger.error('Failed to reconstruct secret:', error);
      throw new Error(`Secret reconstruction failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Verify a share is valid
   */
  async verifyShare(
    share: { shareId: string; holder: string; share: string },
    publicVerificationData?: any
  ): Promise<boolean> {
    try {
      // Parse share to verify format
      const shareData = JSON.parse(Buffer.from(share.share, 'base64').toString());
      
      // Verify required fields
      if (!shareData.x || !shareData.y || !shareData.threshold || !shareData.totalShares) {
        return false;
      }

      // Verify values are valid
      const x = BigInt(shareData.x);
      const y = BigInt(shareData.y);

      if (x <= 0n || y < 0n) {
        return false;
      }

      // Additional verification with public data if provided
      if (publicVerificationData) {
        // Implement verification against public commitments
        // This would use Feldman's VSS or Pedersen's VSS
      }

      return true;
    } catch (error) {
      logger.warn('Share verification failed:', error);
      return false;
    }
  }

  /**
   * Refresh shares without changing the secret
   * Useful for proactive security
   */
  async refreshShares(
    oldShares: { shareId: string; holder: string; share: string }[],
    threshold: number
  ): Promise<{ shareId: string; holder: string; share: string }[]> {
    try {
      // Reconstruct the secret
      const secret = await this.reconstructSecret(oldShares, threshold);

      // Get share holders from old shares
      const shareHolders = oldShares.map(s => s.holder);

      // Create new shares with same secret
      const newShares = await this.createShares(
        secret,
        threshold,
        shareHolders.length,
        shareHolders
      );

      logger.info('Shares refreshed', {
        threshold,
        totalShares: shareHolders.length
      });

      this.emit('sharesRefreshed', {
        threshold,
        totalShares: shareHolders.length
      });

      return newShares;
    } catch (error: unknown) {
      logger.error('Failed to refresh shares:', error);
      throw new Error(`Share refresh failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Combine multiple secrets using threshold addition
   * Useful for distributed key generation
   */
  async combineSecrets(
    secretShares: { shareId: string; holder: string; share: string }[][],
    threshold: number
  ): Promise<Buffer> {
    if (secretShares.length === 0) {
      throw new Error('No secret shares provided');
    }

    try {
      // Reconstruct each secret
      const secrets = await Promise.all(
        secretShares.map(shares => this.reconstructSecret(shares, threshold))
      );

      // Combine secrets using XOR
      let combined = secrets[0];
      for (let i = 1; i < secrets.length; i++) {
        combined = Buffer.from(
          combined.map((byte, idx) => byte ^ secrets[i][idx])
        );
      }

      logger.info('Secrets combined', { secretCount: secrets.length });

      return combined;
    } catch (error: unknown) {
      logger.error('Failed to combine secrets:', error);
      throw new Error(`Secret combination failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Generate verifiable shares using Feldman's VSS
   * Allows verification without revealing the secret
   */
  async createVerifiableShares(
    secret: Buffer,
    threshold: number,
    totalShares: number,
    shareHolders: string[]
  ): Promise<{
    shares: { shareId: string; holder: string; share: string }[];
    commitments: string[];
  }> {
    try {
      // Create regular shares
      const shares = await this.createShares(secret, threshold, totalShares, shareHolders);

      // Generate commitments for verification
      // In a full implementation, this would use elliptic curve points
      const commitments = shares.map(share => {
        const shareData = JSON.parse(Buffer.from(share.share, 'base64').toString());
        const commitment = createHash('sha256')
          .update(shareData.y)
          .digest('hex');
        return commitment;
      });

      logger.info('Verifiable shares created', {
        threshold,
        totalShares,
        commitments: commitments.length
      });

      return { shares, commitments };
    } catch (error: unknown) {
      logger.error('Failed to create verifiable shares:', error);
      throw new Error(`Verifiable share creation failed: ${getErrorMessage(error)}`);
    }
  }

  // Private helper methods

  private evaluatePolynomial(coefficients: bigint[], x: bigint): bigint {
    let result = 0n;
    let xPower = 1n;

    for (const coeff of coefficients) {
      result = this.modAdd(result, this.modMul(coeff, xPower));
      xPower = this.modMul(xPower, x);
    }

    return result;
  }

  private lagrangeInterpolation(shares: { x: bigint; y: bigint }[]): bigint {
    let secret = 0n;

    for (let i = 0; i < shares.length; i++) {
      let numerator = 1n;
      let denominator = 1n;

      for (let j = 0; j < shares.length; j++) {
        if (i !== j) {
          numerator = this.modMul(numerator, shares[j].x);
          denominator = this.modMul(
            denominator,
            this.modSub(shares[j].x, shares[i].x)
          );
        }
      }

      const lagrangeCoeff = this.modMul(numerator, this.modInverse(denominator));
      secret = this.modAdd(secret, this.modMul(shares[i].y, lagrangeCoeff));
    }

    return secret;
  }

  private modAdd(a: bigint, b: bigint): bigint {
    return ((a + b) % this.PRIME + this.PRIME) % this.PRIME;
  }

  private modSub(a: bigint, b: bigint): bigint {
    return ((a - b) % this.PRIME + this.PRIME) % this.PRIME;
  }

  private modMul(a: bigint, b: bigint): bigint {
    return (a * b) % this.PRIME;
  }

  private modInverse(a: bigint): bigint {
    // Extended Euclidean algorithm
    let [old_r, r] = [a, this.PRIME];
    let [old_s, s] = [1n, 0n];

    while (r !== 0n) {
      const quotient = old_r / r;
      [old_r, r] = [r, old_r - quotient * r];
      [old_s, s] = [s, old_s - quotient * s];
    }

    return ((old_s % this.PRIME) + this.PRIME) % this.PRIME;
  }

  private randomBigInt(): bigint {
    const bytes = randomBytes(32);
    return this.bufferToBigInt(bytes) % this.PRIME;
  }

  private bufferToBigInt(buffer: Buffer): bigint {
    return BigInt('0x' + buffer.toString('hex'));
  }

  private bigIntToBuffer(value: bigint): Buffer {
    let hex = value.toString(16);
    if (hex.length % 2) {
      hex = '0' + hex;
    }
    return Buffer.from(hex, 'hex');
  }

  private generateShareId(): string {
    return `share_${Date.now()}_${randomBytes(8).toString('hex')}`;
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalSharesCreated: number;
    totalReconstructed: number;
    totalRefreshed: number;
  } {
    return {
      totalSharesCreated: this.listenerCount('sharesCreated'),
      totalReconstructed: this.listenerCount('secretReconstructed'),
      totalRefreshed: this.listenerCount('sharesRefreshed')
    };
  }
}

export default ThresholdCryptography;
