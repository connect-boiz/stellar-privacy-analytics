import { createHash, randomBytes, createHmac } from 'crypto';

export class SecureRNG {
  private static instance: SecureRNG;
  
  private constructor() {}
  
  public static getInstance(): SecureRNG {
    if (!SecureRNG.instance) {
      SecureRNG.instance = new SecureRNG();
    }
    return SecureRNG.instance;
  }
  
  public generateRandomNumber(min: number = 0, max: number = 1): number {
    const buffer = randomBytes(8);
    const uint64 = BigInt('0x' + buffer.toString('hex'));
    const maxUint64 = BigInt('0xFFFFFFFFFFFFFFFF');
    const normalized = Number(uint64) / Number(maxUint64);
    return min + normalized * (max - min);
  }
  
  public generateGaussian(mean: number = 0, stdDev: number = 1): number {
    const u1 = this.generateRandomNumber();
    const u2 = this.generateRandomNumber();
    
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + stdDev * z0;
  }
  
  public generateLaplace(mean: number = 0, scale: number = 1): number {
    const u = this.generateRandomNumber() - 0.5;
    return mean - scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }
  
  public generateSeed(): string {
    return randomBytes(32).toString('hex');
  }
  
  public hashWithSalt(data: string, salt: string): string {
    return createHmac('sha256', salt).update(data).digest('hex');
  }
}
