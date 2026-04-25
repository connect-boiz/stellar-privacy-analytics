import { logger } from '../utils/logger';
import crypto from 'crypto';

export interface PrivacyBudget {
  epsilon: number;
  delta: number;
  used: number;
  remaining: number;
  lastReset: Date;
}

export interface DPQuery {
  type: 'count' | 'sum' | 'mean' | 'variance' | 'histogram';
  sensitivity: number;
  epsilon: number;
  delta?: number;
  data: number[];
  bounds?: [number, number];
}

export interface PrivacyMetrics {
  totalQueries: number;
  totalEpsilonUsed: number;
  averageEpsilonPerQuery: number;
  privacyBudgetRemaining: number;
  queryHistory: Array<{
    timestamp: Date;
    type: string;
    epsilon: number;
    resultSize: number;
  }>;
}

export class DifferentialPrivacyService {
  private privacyBudgets: Map<string, PrivacyBudget> = new Map();
  private queryHistory: PrivacyMetrics['queryHistory'] = [];
  private globalEpsilonLimit: number = 10.0; // Total privacy budget per user per day
  private defaultEpsilon: number = 0.1;

  constructor() {
    this.setupBudgetReset();
  }

  // Initialize privacy budget for a user
  initializeUserPrivacy(userId: string, epsilon: number = this.globalEpsilonLimit): void {
    const budget: PrivacyBudget = {
      epsilon,
      delta: 1e-5, // Standard delta value
      used: 0,
      remaining: epsilon,
      lastReset: new Date()
    };

    this.privacyBudgets.set(userId, budget);
    logger.info(`Initialized privacy budget for user ${userId}: ε=${epsilon}`);
  }

  // Execute a differentially private query
  async executeDPQuery(userId: string, query: DPQuery): Promise<any> {
    const budget = this.getPrivacyBudget(userId);
    
    if (!budget) {
      throw new Error(`No privacy budget found for user ${userId}`);
    }

    if (budget.remaining < query.epsilon) {
      throw new Error(`Insufficient privacy budget. Required: ${query.epsilon}, Available: ${budget.remaining}`);
    }

    try {
      let result: any;

      switch (query.type) {
        case 'count':
          result = this.privateCount(query.data, query.sensitivity, query.epsilon);
          break;
        case 'sum':
          result = this.privateSum(query.data, query.sensitivity, query.epsilon, query.bounds);
          break;
        case 'mean':
          result = this.privateMean(query.data, query.sensitivity, query.epsilon, query.bounds);
          break;
        case 'variance':
          result = this.privateVariance(query.data, query.sensitivity, query.epsilon, query.bounds);
          break;
        case 'histogram':
          result = this.privateHistogram(query.data, query.sensitivity, query.epsilon);
          break;
        default:
          throw new Error(`Unsupported query type: ${query.type}`);
      }

      // Update privacy budget
      this.updatePrivacyBudget(userId, query.epsilon);

      // Log query
      this.logQuery(userId, query.type, query.epsilon, result);

      return result;

    } catch (error) {
      logger.error(`Error executing DP query for user ${userId}:`, error);
      throw error;
    }
  }

  // Differential privacy mechanisms
  private privateCount(data: number[], sensitivity: number, epsilon: number): number {
    const trueCount = data.length;
    const noise = this.generateLaplaceNoise(0, sensitivity / epsilon);
    return Math.max(0, Math.round(trueCount + noise));
  }

  private privateSum(data: number[], sensitivity: number, epsilon: number, bounds?: [number, number]): number {
    const boundedData = bounds ? this.clipData(data, bounds) : data;
    const trueSum = boundedData.reduce((sum, val) => sum + val, 0);
    const noise = this.generateLaplaceNoise(0, sensitivity / epsilon);
    return trueSum + noise;
  }

  private privateMean(data: number[], sensitivity: number, epsilon: number, bounds?: [number, number]): number {
    const boundedData = bounds ? this.clipData(data, bounds) : data;
    const trueMean = boundedData.reduce((sum, val) => sum + val, 0) / boundedData.length;
    const noise = this.generateLaplaceNoise(0, sensitivity / epsilon);
    return trueMean + noise;
  }

  private privateVariance(data: number[], sensitivity: number, epsilon: number, bounds?: [number, number]): number {
    const boundedData = bounds ? this.clipData(data, bounds) : data;
    const mean = boundedData.reduce((sum, val) => sum + val, 0) / boundedData.length;
    const trueVariance = boundedData.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / boundedData.length;
    const noise = this.generateLaplaceNoise(0, sensitivity / epsilon);
    return Math.max(0, trueVariance + noise);
  }

  private privateHistogram(data: number[], sensitivity: number, epsilon: number, bins: number = 10): any {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const binWidth = (max - min) / bins;
    
    const histogram = Array(bins).fill(0);
    
    data.forEach(value => {
      const binIndex = Math.min(Math.floor((value - min) / binWidth), bins - 1);
      histogram[binIndex]++;
    });

    // Add Laplace noise to each bin count
    const noisyHistogram = histogram.map(count => {
      const noise = this.generateLaplaceNoise(0, sensitivity / epsilon);
      return Math.max(0, count + noise);
    });

    return {
      bins: Array.from({ length: bins }, (_, i) => min + i * binWidth),
      counts: noisyHistogram,
      binWidth
    };
  }

  // Utility functions
  private clipData(data: number[], bounds: [number, number]): number[] {
    return data.map(val => Math.max(bounds[0], Math.min(bounds[1], val)));
  }

  private generateLaplaceNoise(mean: number, scale: number): number {
    const u = Math.random() - 0.5;
    return mean - scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  private generateGaussianNoise(mean: number, stdDev: number): number {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z0 * stdDev;
  }

  // Privacy budget management
  private getPrivacyBudget(userId: string): PrivacyBudget | undefined {
    return this.privacyBudgets.get(userId);
  }

  private updatePrivacyBudget(userId: string, epsilonUsed: number): void {
    const budget = this.privacyBudgets.get(userId);
    if (budget) {
      budget.used += epsilonUsed;
      budget.remaining = Math.max(0, budget.epsilon - budget.used);
      this.privacyBudgets.set(userId, budget);
    }
  }

  private logQuery(userId: string, queryType: string, epsilon: number, result: any): void {
    const queryRecord = {
      timestamp: new Date(),
      type: queryType,
      epsilon,
      resultSize: Array.isArray(result) ? result.length : 1
    };

    this.queryHistory.push(queryRecord);

    // Keep only last 1000 queries
    if (this.queryHistory.length > 1000) {
      this.queryHistory = this.queryHistory.slice(-1000);
    }

    logger.info(`DP query executed for user ${userId}: ${queryType}, ε=${epsilon}`);
  }

  private setupBudgetReset(): void {
    // Reset privacy budgets daily
    setInterval(() => {
      const now = new Date();
      this.privacyBudgets.forEach((budget, userId) => {
        const hoursSinceReset = (now.getTime() - budget.lastReset.getTime()) / (1000 * 60 * 60);
        
        if (hoursSinceReset >= 24) {
          budget.used = 0;
          budget.remaining = budget.epsilon;
          budget.lastReset = now;
          logger.info(`Privacy budget reset for user ${userId}`);
        }
      });
    }, 60 * 60 * 1000); // Check every hour
  }

  // Advanced DP mechanisms
  private exponentialMechanism(scores: number[], epsilon: number, sensitivity: number = 1): number {
    const maxScore = Math.max(...scores);
    const probabilities = scores.map(score => 
      Math.exp(epsilon * (score - maxScore) / (2 * sensitivity))
    );
    
    const totalProb = probabilities.reduce((sum, prob) => sum + prob, 0);
    const normalizedProbs = probabilities.map(prob => prob / totalProb);
    
    let random = Math.random();
    for (let i = 0; i < normalizedProbs.length; i++) {
      random -= normalizedProbs[i];
      if (random <= 0) {
        return i;
      }
    }
    
    return normalizedProbs.length - 1;
  }

  private reportNoisyMaxMechanism(values: number[], epsilon: number): number {
    const scores = values.map(val => val); // Identity function for scores
    return this.exponentialMechanism(scores, epsilon);
  }

  // Public API methods
  getPrivacyMetrics(userId?: string): PrivacyMetrics {
    const userQueries = userId ? 
      this.queryHistory.filter(q => q.timestamp > new Date(Date.now() - 24 * 60 * 60 * 1000)) :
      this.queryHistory;

    const totalEpsilonUsed = userQueries.reduce((sum, q) => sum + q.epsilon, 0);
    const budget = userId ? this.privacyBudgets.get(userId) : null;

    return {
      totalQueries: userQueries.length,
      totalEpsilonUsed,
      averageEpsilonPerQuery: userQueries.length > 0 ? totalEpsilonUsed / userQueries.length : 0,
      privacyBudgetRemaining: budget ? budget.remaining : 0,
      queryHistory: userQueries.slice(-100) // Last 100 queries
    };
  }

  // Composition theorems
  calculateComposition(queries: Array<{ epsilon: number; delta?: number }>): { epsilon: number; delta: number } {
    const totalEpsilon = queries.reduce((sum, q) => sum + q.epsilon, 0);
    const totalDelta = queries.reduce((sum, q) => sum + (q.delta || 0), 0);
    
    return {
      epsilon: totalEpsilon,
      delta: totalDelta
    };
  }

  // Advanced composition (K-air composition)
  advancedComposition(queries: Array<{ epsilon: number; delta?: number }>, k: number): { epsilon: number; delta: number } {
    const maxEpsilon = Math.max(...queries.map(q => q.epsilon));
    const maxDelta = Math.max(...queries.map(q => q.delta || 0));
    
    const composedEpsilon = Math.sqrt(2 * k * Math.log(1 / maxDelta)) * maxEpsilon + k * maxEpsilon * (Math.exp(maxEpsilon) - 1);
    const composedDelta = k * maxDelta + Math.sqrt(k * maxDelta * (Math.exp(maxEpsilon) - 1));
    
    return {
      epsilon: composedEpsilon,
      delta: composedDelta
    };
  }

  // Adaptive privacy budget allocation
  adaptiveBudgetAllocation(userId: string, queryComplexity: 'simple' | 'medium' | 'complex'): number {
    const budget = this.getPrivacyBudget(userId);
    if (!budget) return 0;

    const complexityMultipliers = {
      simple: 1.0,
      medium: 2.0,
      complex: 5.0
    };

    const baseEpsilon = this.defaultEpsilon;
    const multiplier = complexityMultipliers[queryComplexity];
    
    return Math.min(budget.remaining, baseEpsilon * multiplier);
  }
}
