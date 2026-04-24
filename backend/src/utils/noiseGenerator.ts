import * as crypto from 'crypto';
import {
  DPNoiseMechanism,
  NoiseParameters,
  DifferentialPrivacyResult
} from '@stellar/shared';

export class NoiseGenerator {
  private readonly secureRandom: () => number;

  constructor() {
    this.secureRandom = this.createSecureRandom();
  }

  private createSecureRandom(): () => number {
    return () => {
      const buffer = crypto.randomBytes(8);
      const view = new DataView(buffer);
      const random = view.getBigUint64(0, false);
      return Number(random) / Number(BigInt(2) ** BigInt(64));
    };
  }

  generateLaplaceNoise(epsilon: number, sensitivity: number): number {
    if (epsilon <= 0) {
      throw new Error('Epsilon must be positive');
    }
    
    if (sensitivity < 0) {
      throw new Error('Sensitivity must be non-negative');
    }

    const scale = sensitivity / epsilon;
    const uniformRandom = this.secureRandom() - 0.5;
    
    const sign = uniformRandom < 0 ? -1 : 1;
    const noise = -sign * scale * Math.log(1 - 2 * Math.abs(uniformRandom));
    
    return noise;
  }

  generateGaussianNoise(epsilon: number, delta: number, sensitivity: number): number {
    if (epsilon <= 0) {
      throw new Error('Epsilon must be positive');
    }
    
    if (delta <= 0 || delta >= 1) {
      throw new Error('Delta must be between 0 and 1');
    }
    
    if (sensitivity < 0) {
      throw new Error('Sensitivity must be non-negative');
    }

    const sigma = this.calculateGaussianSigma(epsilon, delta, sensitivity);
    return this.generateBoxMullerNoise(sigma);
  }

  private calculateGaussianSigma(epsilon: number, delta: number, sensitivity: number): number {
    const c = Math.sqrt(2 * Math.log(1.25 / delta));
    return (sensitivity * c) / epsilon;
  }

  private generateBoxMullerNoise(sigma: number): number {
    const u1 = this.secureRandom();
    const u2 = this.secureRandom();
    
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    
    return z0 * sigma;
  }

  addNoise(
    value: number | null,
    parameters: NoiseParameters
  ): DifferentialPrivacyResult {
    if (value === null || value === undefined) {
      return {
        originalValue: null,
        noisyValue: 0,
        epsilonUsed: parameters.epsilon,
        noiseAdded: 0,
        mechanism: parameters.mechanism,
        sensitivity: parameters.sensitivity
      };
    }

    let noise: number;
    let noisyValue: number;

    switch (parameters.mechanism) {
      case DPNoiseMechanism.LAPLACE:
        noise = this.generateLaplaceNoise(parameters.epsilon, parameters.sensitivity);
        noisyValue = value + noise;
        break;
      
      case DPNoiseMechanism.GAUSSIAN:
        if (!parameters.delta) {
          throw new Error('Delta is required for Gaussian mechanism');
        }
        noise = this.generateGaussianNoise(parameters.epsilon, parameters.delta, parameters.sensitivity);
        noisyValue = value + noise;
        break;
      
      default:
        throw new Error(`Unsupported noise mechanism: ${parameters.mechanism}`);
    }

    return {
      originalValue: value,
      noisyValue,
      epsilonUsed: parameters.epsilon,
      noiseAdded: noise,
      mechanism: parameters.mechanism,
      sensitivity: parameters.sensitivity
    };
  }

  generateNoiseVector(
    size: number,
    parameters: NoiseParameters
  ): number[] {
    const noises: number[] = [];
    
    for (let i = 0; i < size; i++) {
      switch (parameters.mechanism) {
        case DPNoiseMechanism.LAPLACE:
          noises.push(this.generateLaplaceNoise(parameters.epsilon, parameters.sensitivity));
          break;
        
        case DPNoiseMechanism.GAUSSIAN:
          if (!parameters.delta) {
            throw new Error('Delta is required for Gaussian mechanism');
          }
          noises.push(this.generateGaussianNoise(parameters.epsilon, parameters.delta!, parameters.sensitivity));
          break;
        
        default:
          throw new Error(`Unsupported noise mechanism: ${parameters.mechanism}`);
      }
    }
    
    return noises;
  }

  validateNoiseParameters(parameters: NoiseParameters): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (parameters.epsilon <= 0) {
      errors.push('Epsilon must be positive');
    }

    if (parameters.sensitivity < 0) {
      errors.push('Sensitivity must be non-negative');
    }

    if (parameters.scale <= 0) {
      errors.push('Scale must be positive');
    }

    if (parameters.mechanism === DPNoiseMechanism.GAUSSIAN) {
      if (!parameters.delta) {
        errors.push('Delta is required for Gaussian mechanism');
      } else if (parameters.delta <= 0 || parameters.delta >= 1) {
        errors.push('Delta must be between 0 and 1');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  calculatePrivacyLoss(
    mechanism: DPNoiseMechanism,
    epsilon: number,
    delta?: number
  ): { epsilon: number; delta?: number; description: string } {
    switch (mechanism) {
      case DPNoiseMechanism.LAPLACE:
        return {
          epsilon,
          description: `Laplace mechanism with ε=${epsilon.toFixed(4)}`
        };
      
      case DPNoiseMechanism.GAUSSIAN:
        if (!delta) {
          throw new Error('Delta is required for Gaussian mechanism');
        }
        return {
          epsilon,
          delta,
          description: `Gaussian mechanism with ε=${epsilon.toFixed(4)}, δ=${delta.toExponential(2)}`
        };
      
      default:
        throw new Error(`Unsupported mechanism: ${mechanism}`);
    }
  }

  estimateNoiseMagnitude(parameters: NoiseParameters): number {
    switch (parameters.mechanism) {
      case DPNoiseMechanism.LAPLACE:
        return parameters.scale;
      
      case DPNoiseMechanism.GAUSSIAN:
        return parameters.scale * 2;
      
      default:
        throw new Error(`Unsupported mechanism: ${parameters.mechanism}`);
    }
  }

  generateSecureSeed(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  deterministicNoise(
    value: number,
    parameters: NoiseParameters,
    seed: string
  ): DifferentialPrivacyResult {
    const hmac = crypto.createHmac('sha256', seed);
    hmac.update(value.toString());
    const hash = hmac.digest('hex');
    
    const seedValue = parseInt(hash.substring(0, 8), 16) / 0xffffffff;
    
    let noise: number;
    switch (parameters.mechanism) {
      case DPNoiseMechanism.LAPLACE:
        const uniformRandom = seedValue - 0.5;
        const sign = uniformRandom < 0 ? -1 : 1;
        noise = -sign * parameters.scale * Math.log(1 - 2 * Math.abs(uniformRandom));
        break;
      
      case DPNoiseMechanism.GAUSSIAN:
        if (!parameters.delta) {
          throw new Error('Delta is required for Gaussian mechanism');
        }
        const u1 = seedValue;
        const u2 = (parseInt(hash.substring(8, 16), 16) / 0xffffffff);
        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        noise = z0 * parameters.scale;
        break;
      
      default:
        throw new Error(`Unsupported mechanism: ${parameters.mechanism}`);
    }

    return {
      originalValue: value,
      noisyValue: value + noise,
      epsilonUsed: parameters.epsilon,
      noiseAdded: noise,
      mechanism: parameters.mechanism,
      sensitivity: parameters.sensitivity
    };
  }
}
