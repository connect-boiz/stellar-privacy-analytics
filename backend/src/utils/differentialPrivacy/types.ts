export enum NoiseDistribution {
  LAPLACE = 'laplace',
  GAUSSIAN = 'gaussian'
}

export enum PrivacyMode {
  STRICT = 'strict',
  RELAXED = 'relaxed'
}

export interface PrivacyBudget {
  epsilon: number;
  delta: number;
  remaining: number;
  dataset: string;
  lastUpdated: Date;
}

export interface QuerySensitivity {
  sensitivity: number;
  type: 'count' | 'sum' | 'average' | 'max' | 'min';
  groupBy?: string[];
}

export interface DifferentialPrivacyConfig {
  epsilon: number;
  delta: number;
  distribution: NoiseDistribution;
  mode: PrivacyMode;
  enableGroupByNoise: boolean;
}

export class BudgetExhaustedException extends Error {
  constructor(
    message: string,
    public dataset: string,
    public remainingBudget: number
  ) {
    super(message);
    this.name = 'BudgetExhaustedException';
  }
}

export class InvalidQueryException extends Error {
  constructor(message: string, public query: string) {
    super(message);
    this.name = 'InvalidQueryException';
  }
}
