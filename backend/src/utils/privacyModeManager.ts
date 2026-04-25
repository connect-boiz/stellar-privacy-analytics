import {
  PrivacyMode,
  DifferentialPrivacyConfig,
  DPNoiseMechanism,
  PrivacyBudgetConfig
} from '@stellar/shared';

export interface PrivacyModeConfig {
  mode: PrivacyMode;
  epsilonMultiplier: number;
  sensitivityMultiplier: number;
  allowGroupByNoise: boolean;
  enableAdaptiveAllocation: boolean;
  minGroupSize: number;
  maxNoiseScale: number;
}

export class PrivacyModeManager {
  private static instance: PrivacyModeManager;
  private currentMode: PrivacyMode = PrivacyMode.STRICT;
  private modeConfigs: Map<PrivacyMode, PrivacyModeConfig>;

  private constructor() {
    this.modeConfigs = this.initializeModeConfigs();
  }

  static getInstance(): PrivacyModeManager {
    if (!PrivacyModeManager.instance) {
      PrivacyModeManager.instance = new PrivacyModeManager();
    }
    return PrivacyModeManager.instance;
  }

  private initializeModeConfigs(): Map<PrivacyMode, PrivacyModeConfig> {
    const configs = new Map<PrivacyMode, PrivacyModeConfig>();

    configs.set(PrivacyMode.STRICT, {
      mode: PrivacyMode.STRICT,
      epsilonMultiplier: 1.0,
      sensitivityMultiplier: 1.0,
      allowGroupByNoise: true,
      enableAdaptiveAllocation: false,
      minGroupSize: 5,
      maxNoiseScale: Infinity
    });

    configs.set(PrivacyMode.RELAXED, {
      mode: PrivacyMode.RELAXED,
      epsilonMultiplier: 0.8,
      sensitivityMultiplier: 0.5,
      allowGroupByNoise: true,
      enableAdaptiveAllocation: true,
      minGroupSize: 3,
      maxNoiseScale: 100
    });

    return configs;
  }

  setPrivacyMode(mode: PrivacyMode): void {
    this.currentMode = mode;
  }

  getPrivacyMode(): PrivacyMode {
    return this.currentMode;
  }

  adaptConfigForMode(config: DifferentialPrivacyConfig): DifferentialPrivacyConfig {
    const modeConfig = this.modeConfigs.get(this.currentMode);
    if (!modeConfig) {
      throw new Error(`Unsupported privacy mode: ${this.currentMode}`);
    }

    return {
      ...config,
      epsilon: config.epsilon * modeConfig.epsilonMultiplier,
      sensitivity: config.sensitivity ? config.sensitivity * modeConfig.sensitivityMultiplier : undefined,
      enableGroupByNoise: modeConfig.allowGroupByNoise,
      mode: this.currentMode
    };
  }

  adaptBudgetConfigForMode(config: PrivacyBudgetConfig): PrivacyBudgetConfig {
    const modeConfig = this.modeConfigs.get(this.currentMode);
    if (!modeConfig) {
      throw new Error(`Unsupported privacy mode: ${this.currentMode}`);
    }

    return {
      ...config,
      defaultEpsilon: config.defaultEpsilon * modeConfig.epsilonMultiplier,
      maxEpsilonPerQuery: config.maxEpsilonPerQuery * modeConfig.epsilonMultiplier
    };
  }

  shouldApplyGroupByNoise(): boolean {
    const modeConfig = this.modeConfigs.get(this.currentMode);
    return modeConfig?.allowGroupByNoise ?? false;
  }

  shouldUseAdaptiveAllocation(): boolean {
    const modeConfig = this.modeConfigs.get(this.currentMode);
    return modeConfig?.enableAdaptiveAllocation ?? false;
  }

  getMinGroupSize(): number {
    const modeConfig = this.modeConfigs.get(this.currentMode);
    return modeConfig?.minGroupSize ?? 5;
  }

  getMaxNoiseScale(): number {
    const modeConfig = this.modeConfigs.get(this.currentMode);
    return modeConfig?.maxNoiseScale ?? Infinity;
  }

  validateModeTransition(newMode: PrivacyMode): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    if (newMode === this.currentMode) {
      return { valid: true, warnings: ['No mode change needed'] };
    }

    const currentConfig = this.modeConfigs.get(this.currentMode);
    const newConfig = this.modeConfigs.get(newMode);

    if (!currentConfig || !newConfig) {
      return { valid: false, warnings: ['Invalid mode configuration'] };
    }

    if (newMode === PrivacyMode.RELAXED) {
      warnings.push('Switching to RELAXED mode reduces privacy guarantees');
      warnings.push('Epsilon budget will be multiplied by 0.8');
      warnings.push('Sensitivity calculations will be more conservative');
    } else if (newMode === PrivacyMode.STRICT) {
      warnings.push('Switching to STRICT mode increases privacy protection');
      warnings.push('May result in higher noise levels');
      warnings.push('Group size requirements will be stricter');
    }

    return { valid: true, warnings };
  }

  getModeComparison(): Array<{
    mode: PrivacyMode;
    config: PrivacyModeConfig;
    description: string;
    useCases: string[];
  }> {
    return [
      {
        mode: PrivacyMode.STRICT,
        config: this.modeConfigs.get(PrivacyMode.STRICT)!,
        description: 'Maximum privacy protection with conservative parameters',
        useCases: [
          'Medical data analysis',
          'Financial transactions',
          'Personal identifiers',
          'Regulatory compliance requirements'
        ]
      },
      {
        mode: PrivacyMode.RELAXED,
        config: this.modeConfigs.get(PrivacyMode.RELAXED)!,
        description: 'Balanced privacy with improved data utility',
        useCases: [
          'Statistical research',
          'Business analytics',
          'A/B testing',
          'Exploratory data analysis'
        ]
      }
    ];
  }

  updateModeConfig(mode: PrivacyMode, updates: Partial<PrivacyModeConfig>): void {
    const currentConfig = this.modeConfigs.get(mode);
    if (!currentConfig) {
      throw new Error(`Cannot update config for unknown mode: ${mode}`);
    }

    const updatedConfig = { ...currentConfig, ...updates };
    this.modeConfigs.set(mode, updatedConfig);
  }

  resetModeConfigs(): void {
    this.modeConfigs = this.initializeModeConfigs();
  }

  getEffectiveEpsilon(baseEpsilon: number): number {
    const modeConfig = this.modeConfigs.get(this.currentMode);
    return baseEpsilon * (modeConfig?.epsilonMultiplier ?? 1.0);
  }

  getEffectiveSensitivity(baseSensitivity: number): number {
    const modeConfig = this.modeConfigs.get(this.currentMode);
    return baseSensitivity * (modeConfig?.sensitivityMultiplier ?? 1.0);
  }

  shouldSuppressResult(groupSize: number, noiseScale: number): boolean {
    const modeConfig = this.modeConfigs.get(this.currentMode);
    if (!modeConfig) return false;

    if (groupSize < modeConfig.minGroupSize) {
      return true;
    }

    if (noiseScale > modeConfig.maxNoiseScale) {
      return true;
    }

    if (this.currentMode === PrivacyMode.STRICT && groupSize < 10) {
      return true;
    }

    return false;
  }

  getPrivacyReport(): {
    currentMode: PrivacyMode;
    modeConfig: PrivacyModeConfig;
    recommendations: string[];
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  } {
    const modeConfig = this.modeConfigs.get(this.currentMode)!;
    const recommendations: string[] = [];
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';

    if (this.currentMode === PrivacyMode.RELAXED) {
      recommendations.push('Consider using STRICT mode for sensitive data');
      recommendations.push('Monitor privacy budget consumption closely');
      riskLevel = 'MEDIUM';
    } else {
      recommendations.push('Privacy protection is maximized');
      recommendations.push('Data utility may be reduced');
      riskLevel = 'LOW';
    }

    if (modeConfig.epsilonMultiplier < 0.5) {
      recommendations.push('Epsilon budget is significantly reduced');
      riskLevel = 'HIGH';
    }

    return {
      currentMode: this.currentMode,
      modeConfig,
      recommendations,
      riskLevel
    };
  }

  toggleMode(): PrivacyMode {
    const newMode = this.currentMode === PrivacyMode.STRICT 
      ? PrivacyMode.RELAXED 
      : PrivacyMode.STRICT;
    
    this.setPrivacyMode(newMode);
    return newMode;
  }

  isModeSupported(mode: PrivacyMode): boolean {
    return this.modeConfigs.has(mode);
  }

  getAvailableModes(): PrivacyMode[] {
    return Array.from(this.modeConfigs.keys());
  }
}
