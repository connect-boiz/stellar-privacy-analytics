import { SecureRNG } from '../secureRNG';
import { 
  NoiseDistribution, 
  PrivacyMode, 
  DifferentialPrivacyConfig,
  BudgetExhaustedException 
} from './types';

export class DifferentialPrivacy {
  private rng: SecureRNG;
  private config: DifferentialPrivacyConfig;

  constructor(config: DifferentialPrivacyConfig) {
    this.rng = SecureRNG.getInstance();
    this.config = config;
  }

  public addNoise(value: number, sensitivity: number, epsilon?: number): number {
    const effectiveEpsilon = epsilon || this.config.epsilon;
    
    if (effectiveEpsilon <= 0) {
      throw new BudgetExhaustedException(
        'Epsilon budget exhausted',
        'unknown',
        0
      );
    }

    const noise = this.generateNoise(sensitivity, effectiveEpsilon);
    const noisyValue = value + noise;

    if (this.config.mode === PrivacyMode.STRICT) {
      return Math.max(0, noisyValue);
    }
    
    return noisyValue;
  }

  public addNoiseToAggregate(
    value: number, 
    sensitivity: number, 
    epsilon?: number
  ): number {
    return this.addNoise(value, sensitivity, epsilon);
  }

  public addNoiseToGroupBy(
    groups: Map<string, number[]>,
    sensitivity: number,
    epsilon?: number
  ): Map<string, number[]> {
    const effectiveEpsilon = epsilon || this.config.epsilon;
    
    if (!this.config.enableGroupByNoise) {
      return groups;
    }

    const noisyGroups = new Map<string, number[]>();
    const epsilonPerGroup = effectiveEpsilon / groups.size;

    for (const [key, values] of groups) {
      const noisyValues = values.map(value => 
        this.addNoise(value, sensitivity, epsilonPerGroup)
      );
      noisyGroups.set(key, noisyValues);
    }

    return noisyGroups;
  }

  private generateNoise(sensitivity: number, epsilon: number): number {
    switch (this.config.distribution) {
      case NoiseDistribution.LAPLACE:
        return this.generateLaplaceNoise(sensitivity, epsilon);
      case NoiseDistribution.GAUSSIAN:
        return this.generateGaussianNoise(sensitivity, epsilon);
      default:
        throw new Error(`Unsupported noise distribution: ${this.config.distribution}`);
    }
  }

  private generateLaplaceNoise(sensitivity: number, epsilon: number): number {
    const scale = sensitivity / epsilon;
    return this.rng.generateLaplace(0, scale);
  }

  private generateGaussianNoise(sensitivity: number, epsilon: number): number {
    const delta = this.config.delta || 1e-10;
    const sigma = (sensitivity / epsilon) * Math.sqrt(2 * Math.log(1.25 / delta));
    return this.rng.generateGaussian(0, sigma);
  }

  public updateConfig(newConfig: Partial<DifferentialPrivacyConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): DifferentialPrivacyConfig {
    return { ...this.config };
  }

  public calculatePrivacyLoss(epsilonUsed: number): number {
    return epsilonUsed / this.config.epsilon;
  }

  public canAffordPrivacyLoss(epsilonRequired: number): boolean {
    return epsilonRequired <= this.config.epsilon;
  }
}
