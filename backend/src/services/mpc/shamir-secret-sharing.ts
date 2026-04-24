import { createHash, randomBytes, Buffer } from 'crypto';
import { BigInteger } from 'jsbn';

/**
 * Shamir's Secret Sharing implementation for MPC
 * Allows splitting secrets into shares that can be reconstructed with threshold
 */
export class ShamirSecretSharing {
  private prime: BigInteger;
  private threshold: number;
  private totalShares: number;

  constructor(threshold: number, totalShares: number) {
    if (threshold > totalShares) {
      throw new Error('Threshold cannot be greater than total shares');
    }

    this.threshold = threshold;
    this.totalShares = totalShares;
    // Use a large prime number (2^255 - 19, commonly used in cryptography)
    this.prime = new BigInteger('57896044618658097711785492504343953926634992332820282019728792003956564819949');
  }

  /**
   * Split a secret into shares using polynomial interpolation
   */
  split(secret: string | Buffer): Share[] {
    const secretInt = this.bufferToBigInt(secret);
    const coefficients = this.generatePolynomial(secretInt);
    const shares: Share[] = [];

    for (let i = 1; i <= this.totalShares; i++) {
      const x = new BigInteger(i.toString());
      const y = this.evaluatePolynomial(coefficients, x);

      shares.push({
        id: i,
        x: x.toString(),
        y: y.toString(),
        threshold: this.threshold,
        totalShares: this.totalShares
      });
    }

    return shares;
  }

  /**
   * Reconstruct secret from threshold number of shares
   */
  reconstruct(shares: Share[]): string {
    if (shares.length < this.threshold) {
      throw new Error(`Need at least ${this.threshold} shares to reconstruct`);
    }

    // Use Lagrange interpolation
    let secret = new BigInteger('0');

    for (let i = 0; i < this.threshold; i++) {
      const share = shares[i];
      const xi = new BigInteger(share.x);
      const yi = new BigInteger(share.y);

      let lagrange = new BigInteger('1');

      for (let j = 0; j < this.threshold; j++) {
        if (i !== j) {
          const xj = new BigInteger(shares[j].x);

          // Calculate (xj / (xj - xi)) mod prime
          const numerator = xj;
          const denominator = xj.subtract(xi).modInverse(this.prime);
          const term = numerator.multiply(denominator).mod(this.prime);

          lagrange = lagrange.multiply(term).mod(this.prime);
        }
      }

      const contribution = yi.multiply(lagrange).mod(this.prime);
      secret = secret.add(contribution).mod(this.prime);
    }

    return this.bigIntToBuffer(secret).toString('utf8');
  }

  /**
   * Verify if a share is valid for the given configuration
   */
  verifyShare(share: Share): boolean {
    return share.id > 0 &&
      share.id <= this.totalShares &&
      share.threshold === this.threshold &&
      share.totalShares === this.totalShares;
  }

  /**
   * Generate random polynomial coefficients
   */
  private generatePolynomial(secret: BigInteger): BigInteger[] {
    const coefficients: BigInteger[] = [secret];

    for (let i = 1; i < this.threshold; i++) {
      const randomBytes = randomBytes(32);
      const randomInt = this.bufferToBigInt(randomBytes);
      coefficients.push(randomInt.mod(this.prime));
    }

    return coefficients;
  }

  /**
   * Evaluate polynomial at point x
   */
  private evaluatePolynomial(coefficients: BigInteger[], x: BigInteger): BigInteger {
    let result = new BigInteger('0');
    let powerOfX = new BigInteger('1');

    for (const coefficient of coefficients) {
      const term = powerOfX.multiply(coefficient).mod(this.prime);
      result = result.add(term).mod(this.prime);
      powerOfX = powerOfX.multiply(x).mod(this.prime);
    }

    return result;
  }

  /**
   * Convert buffer to BigInteger
   */
  private bufferToBigInt(buffer: Buffer | string): BigInteger {
    if (typeof buffer === 'string') {
      buffer = Buffer.from(buffer, 'utf8');
    }
    return new BigInteger(buffer.toString('hex'), 16);
  }

  /**
   * Convert BigInteger to buffer
   */
  private bigIntToBuffer(bigInt: BigInteger): Buffer {
    const hex = bigInt.toString(16);
    // Ensure even length for proper byte conversion
    const paddedHex = hex.length % 2 === 0 ? hex : '0' + hex;
    return Buffer.from(paddedHex, 'hex');
  }
}

/**
 * Share interface for secret sharing
 */
export interface Share {
  id: number;
  x: string;
  y: string;
  threshold: number;
  totalShares: number;
}

/**
 * MPC Session configuration
 */
export interface MPCSession {
  id: string;
  participants: string[];
  threshold: number;
  operation: MPCOperation;
  status: MPCSessionStatus;
  createdAt: Date;
  shares: Map<string, Share>;
  result?: string;
}

export enum MPCOperation {
  SUM = 'SUM',
  AVG = 'AVG',
  COUNT = 'COUNT'
}

export enum MPCSessionStatus {
  INITIALIZING = 'INITIALIZING',
  SHARING = 'SHARING',
  COMPUTING = 'COMPUTING',
  REVEALING = 'REVEALING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

/**
 * Arithmetic operations on secret shares
 */
export class MPCArithmetic {
  private shamir: ShamirSecretSharing;

  constructor(threshold: number, totalShares: number) {
    this.shamir = new ShamirSecretSharing(threshold, totalShares);
  }

  /**
   * Add two secret-shared values
   */
  add(shares1: Share[], shares2: Share[]): Share[] {
    if (shares1.length !== shares2.length) {
      throw new Error('Share arrays must have same length');
    }

    return shares1.map((share1, index) => {
      const share2 = shares2[index];
      const y1 = new BigInteger(share1.y);
      const y2 = new BigInteger(share2.y);
      const sum = y1.add(y2).mod(this.shamir['prime']);

      return {
        ...share1,
        y: sum.toString()
      };
    });
  }

  /**
   * Multiply secret-shared value by public constant
   */
  multiplyByConstant(shares: Share[], constant: number): Share[] {
    const constantBigInt = new BigInteger(constant.toString());

    return shares.map(share => {
      const y = new BigInteger(share.y);
      const product = y.multiply(constantBigInt).mod(this.shamir['prime']);

      return {
        ...share,
        y: product.toString()
      };
    });
  }

  /**
   * Compute average of secret-shared values
   */
  average(shareArrays: Share[][]): Share[] {
    if (shareArrays.length === 0) {
      throw new Error('No shares provided');
    }

    // Sum all shares
    let sumShares = shareArrays[0];
    for (let i = 1; i < shareArrays.length; i++) {
      sumShares = this.add(sumShares, shareArrays[i]);
    }

    // Divide by count (multiply by modular inverse)
    return this.multiplyByConstant(sumShares, this.modInverse(shareArrays.length, this.shamir['prime']));
  }

  /**
   * Compute modular inverse
   */
  private modInverse(a: number, m: BigInteger): number {
    const aBigInt = new BigInteger(a.toString());
    const inverse = aBigInt.modInverse(m);
    return parseInt(inverse.toString());
  }
}
