export enum DPNoiseMechanism {
  LAPLACE = 'laplace',
  GAUSSIAN = 'gaussian'
}

export enum PrivacyMode {
  STRICT = 'strict',
  RELAXED = 'relaxed'
}

export interface DifferentialPrivacyConfig {
  epsilon: number;
  delta?: number; // For Gaussian mechanism
  mechanism: DPNoiseMechanism;
  mode: PrivacyMode;
  sensitivity?: number;
  enableGroupByNoise: boolean;
}

export interface PrivacyBudget {
  userId: string;
  datasetId: string;
  totalEpsilon: number;
  remainingEpsilon: number;
  lastUpdated: Date;
  queriesCount: number;
}

export interface QueryInfo {
  query: string;
  userId: string;
  datasetId: string;
  sensitivity: number;
  epsilonRequested: number;
  timestamp: Date;
}

export interface SensitivityAnalysisResult {
  globalSensitivity: number;
  groupBySensitivities: Map<string, number>;
  aggregationType: DPAggregationType;
  affectedColumns: string[];
}

export enum DPAggregationType {
  COUNT = 'count',
  SUM = 'sum',
  AVERAGE = 'average',
  MIN = 'min',
  MAX = 'max',
  VARIANCE = 'variance'
}

export interface NoiseParameters {
  scale: number;
  mechanism: DPNoiseMechanism;
  sensitivity: number;
  epsilon: number;
  delta?: number;
}

export interface DifferentialPrivacyResult {
  originalValue: number | null;
  noisyValue: number;
  epsilonUsed: number;
  noiseAdded: number;
  mechanism: DPNoiseMechanism;
  sensitivity: number;
}

export interface GroupByResult {
  groupKey: string;
  results: DifferentialPrivacyResult[];
  totalEpsilonUsed: number;
}

export class BudgetExhaustedException extends Error {
  constructor(
    public userId: string,
    public datasetId: string,
    public requestedEpsilon: number,
    public remainingEpsilon: number
  ) {
    super(`Privacy budget exhausted for user ${userId} on dataset ${datasetId}. Requested: ${requestedEpsilon}, Available: ${remainingEpsilon}`);
    this.name = 'BudgetExhaustedException';
  }
}

export interface RedisPrivacyBudget {
  key: string;
  remainingEpsilon: number;
  totalEpsilon: number;
  queriesCount: number;
  lastAccessed: number;
}

export interface PrivacyBudgetConfig {
  defaultEpsilon: number;
  maxEpsilonPerQuery: number;
  budgetResetInterval: number; // in hours
  enableBudgetTracking: boolean;
}
