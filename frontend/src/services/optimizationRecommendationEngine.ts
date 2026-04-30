/**
 * Optimization Recommendation Engine
 */

import {
  BudgetAllocation,
  SimulationResult,
  SimulationMetrics,
  Recommendation,
  OptimizationGoal,
  BudgetConstraints,
  AllocationCategory
} from '../types/privacyBudget';

export interface OptimizationConfig {
  maxRecommendations: number;
  minImpactThreshold: number;
  confidenceThreshold: number;
  riskTolerance: number;
  timeHorizon: number; // days
  optimizationTargets: string[];
}

export interface RecommendationContext {
  currentAllocations: BudgetAllocation[];
  simulationResult: SimulationResult;
  baselineMetrics: SimulationMetrics;
  constraints: BudgetConstraints;
  objectives: OptimizationGoal;
  historicalData: HistoricalDataPoint[];
}

export interface HistoricalDataPoint {
  timestamp: number;
  allocations: BudgetAllocation[];
  metrics: SimulationMetrics;
  externalFactors: Record<string, number>;
}

export interface RecommendationScore {
  overall: number;
  impact: number;
  feasibility: number;
  risk: number;
  cost: number;
  time: number;
}

export interface OptimizationPattern {
  id: string;
  name: string;
  description: string;
  category: 'reallocation' | 'efficiency' | 'risk_mitigation' | 'cost_reduction' | 'performance_improvement';
  conditions: PatternCondition[];
  actions: PatternAction[];
  expectedImpact: PatternImpact;
  confidence: number;
  frequency: number; // How often this pattern occurs
  successRate: number;
}

export interface PatternCondition {
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  value: number;
  weight: number;
}

export interface PatternAction {
  type: 'reallocate' | 'adjust' | 'add' | 'remove' | 'optimize';
  target: string; // category ID
  parameters: Record<string, any>;
}

export interface PatternImpact {
  roi: number;
  risk: number;
  privacy: number;
  utility: number;
  cost: number;
  efficiency: number;
}

export class OptimizationRecommendationEngine {
  private static instance: OptimizationRecommendationEngine;
  private config: OptimizationConfig;
  private patterns: Map<string, OptimizationPattern> = new Map();
  private historicalData: HistoricalDataPoint[] = [];

  private constructor(config: OptimizationConfig) {
    this.config = config;
    this.initializePatterns();
  }

  static getInstance(config?: OptimizationRecommendationEngine['config']): OptimizationRecommendationEngine {
    if (!OptimizationRecommendationEngine.instance) {
      if (!config) {
        config = {
          maxRecommendations: 10,
          minImpactThreshold: 0.05,
          confidenceThreshold: 0.7,
          riskTolerance: 0.3,
          timeHorizon: 365,
          optimizationTargets: ['roi', 'risk', 'privacy', 'utility']
        };
      }
      OptimizationRecommendationEngine.instance = new OptimizationRecommendationEngine(config);
    }
    return OptimizationRecommendationEngine.instance;
  }

  private initializePatterns(): void {
    const patterns: OptimizationPattern[] = [
      {
        id: 'low_roi_reallocation',
        name: 'Low ROI Reallocation',
        description: 'Reallocate budget from low ROI categories to high ROI categories',
        category: 'reallocation',
        conditions: [
          { metric: 'totalROI', operator: 'lt', value: 0.15, weight: 0.4 },
          { metric: 'budgetUtilization', operator: 'gt', value: 0.8, weight: 0.3 },
          { metric: 'efficiency', operator: 'lt', value: 70, weight: 0.3 }
        ],
        actions: [
          {
            type: 'reallocate',
            target: 'data_analysis',
            parameters: { percentage: 0.1, from: 'data_collection' }
          }
        ],
        expectedImpact: {
          roi: 0.08,
          risk: 0.02,
          privacy: 0.01,
          utility: 0.05,
          cost: -0.03,
          efficiency: 0.1
        },
        confidence: 0.85,
        frequency: 0.3,
        successRate: 0.78
      },
      {
        id: 'high_risk_mitigation',
        name: 'High Risk Mitigation',
        description: 'Increase budget for risk mitigation activities when risk score is high',
        category: 'risk_mitigation',
        conditions: [
          { metric: 'riskScore', operator: 'gt', value: 70, weight: 0.5 },
          { metric: 'privacyScore', operator: 'lt', value: 75, weight: 0.3 },
          { metric: 'complianceScore', operator: 'lt', value: 80, weight: 0.2 }
        ],
        actions: [
          {
            type: 'reallocate',
            target: 'monitoring',
            parameters: { percentage: 0.05, from: 'research' }
          },
          {
            type: 'add',
            target: 'compliance',
            parameters: { amount: 50000 }
          }
        ],
        expectedImpact: {
          roi: -0.02,
          risk: -0.15,
          privacy: 0.12,
          utility: 0.01,
          cost: 0.05,
          efficiency: -0.02
        },
        confidence: 0.92,
        frequency: 0.25,
        successRate: 0.85
      },
      {
        id: 'efficiency_optimization',
        name: 'Efficiency Optimization',
        description: 'Optimize budget allocation for maximum efficiency',
        category: 'efficiency',
        conditions: [
          { metric: 'efficiency', operator: 'lt', value: 65, weight: 0.4 },
          { metric: 'budgetUtilization', operator: 'gt', value: 0.9, weight: 0.3 },
          { metric: 'costBenefitRatio', operator: 'lt', value: 1.1, weight: 0.3 }
        ],
        actions: [
          {
            type: 'optimize',
            target: 'all',
            parameters: { method: 'linear_programming', objective: 'efficiency' }
          }
        ],
        expectedImpact: {
          roi: 0.03,
          risk: 0.01,
          privacy: 0.02,
          utility: 0.04,
          cost: -0.02,
          efficiency: 0.15
        },
        confidence: 0.78,
        frequency: 0.4,
        successRate: 0.72
      },
      {
        id: 'compliance_boost',
        name: 'Compliance Boost',
        description: 'Increase compliance budget when compliance score is low',
        category: 'performance_improvement',
        conditions: [
          { metric: 'complianceScore', operator: 'lt', value: 75, weight: 0.5 },
          { metric: 'riskScore', operator: 'gt', value: 60, weight: 0.3 },
          { metric: 'privacyScore', operator: 'lt', value: 80, weight: 0.2 }
        ],
        actions: [
          {
            type: 'add',
            target: 'compliance',
            parameters: { amount: 75000 }
          },
          {
            type: 'adjust',
            target: 'compliance',
            parameters: { efficiency_target: 0.9 }
          }
        ],
        expectedImpact: {
          roi: -0.01,
          risk: -0.08,
          privacy: 0.15,
          utility: 0.02,
          cost: 0.04,
          efficiency: 0.05
        },
        confidence: 0.88,
        frequency: 0.2,
        successRate: 0.82
      },
      {
        id: 'cost_reduction',
        name: 'Cost Reduction',
        description: 'Reduce costs while maintaining performance',
        category: 'cost_reduction',
        conditions: [
          { metric: 'costBenefitRatio', operator: 'lt', value: 1.0, weight: 0.4 },
          { metric: 'budgetUtilization', operator: 'lt', value: 0.7, weight: 0.3 },
          { metric: 'efficiency', operator: 'gt', value: 70, weight: 0.3 }
        ],
        actions: [
          {
            type: 'remove',
            target: 'research',
            parameters: { percentage: 0.5 }
          },
          {
            type: 'optimize',
            target: 'all',
            parameters: { method: 'cost_minimization' }
          }
        ],
        expectedImpact: {
          roi: 0.02,
          risk: 0.03,
          privacy: -0.02,
          utility: -0.01,
          cost: -0.08,
          efficiency: 0.03
        },
        confidence: 0.75,
        frequency: 0.35,
        successRate: 0.68
      }
    ];

    patterns.forEach(pattern => {
      this.patterns.set(pattern.id, pattern);
    });
  }

  // Main recommendation generation
  public generateRecommendations(context: RecommendationContext): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Generate pattern-based recommendations
    const patternRecommendations = this.generatePatternRecommendations(context);
    recommendations.push(...patternRecommendations);

    // Generate analytical recommendations
    const analyticalRecommendations = this.generateAnalyticalRecommendations(context);
    recommendations.push(...analyticalRecommendations);

    // Generate ML-based recommendations if enough historical data
    if (this.historicalData.length > 10) {
      const mlRecommendations = this.generateMLRecommendations(context);
      recommendations.push(...mlRecommendations);
    }

    // Score and rank recommendations
    const scoredRecommendations = recommendations.map(rec => ({
      ...rec,
      score: this.scoreRecommendation(rec, context)
    }));

    // Filter and sort
    const filteredRecommendations = scoredRecommendations
      .filter(rec => rec.score.overall >= this.config.minImpactThreshold)
      .filter(rec => rec.score.overall >= this.config.confidenceThreshold)
      .sort((a, b) => b.score.overall - a.score.overall)
      .slice(0, this.config.maxRecommendations);

    return filteredRecommendations;
  }

  private generatePatternRecommendations(context: RecommendationContext): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const metrics = context.simulationResult.metrics;

    // Check each pattern
    for (const pattern of this.patterns.values()) {
      if (this.evaluatePatternConditions(pattern.conditions, metrics)) {
        const recommendation = this.createPatternRecommendation(pattern, context);
        if (recommendation) {
          recommendations.push(recommendation);
        }
      }
    }

    return recommendations;
  }

  private evaluatePatternConditions(conditions: any[], metrics: SimulationMetrics): boolean {
    let totalScore = 0;
    let totalWeight = 0;

    for (const condition of conditions) {
      const metricValue = (metrics as any)[condition.metric];
      if (metricValue === undefined) continue;

      let conditionMet = false;
      switch (condition.operator) {
        case 'gt':
          conditionMet = metricValue > condition.value;
          break;
        case 'gte':
          conditionMet = metricValue >= condition.value;
          break;
        case 'lt':
          conditionMet = metricValue < condition.value;
          break;
        case 'lte':
          conditionMet = metricValue <= condition.value;
          break;
        case 'eq':
          conditionMet = metricValue === condition.value;
          break;
      }

      totalScore += conditionMet ? condition.weight : 0;
      totalWeight += condition.weight;
    }

    return totalWeight > 0 && (totalScore / totalWeight) >= 0.6; // 60% threshold
  }

  private createPatternRecommendation(pattern: OptimizationPattern, context: RecommendationContext): Recommendation | null {
    const priority = this.calculatePriority(pattern.expectedImpact);
    const implementation = this.createImplementationPlan(pattern, context);
    const risks = this.identifyRisks(pattern, context);
    const alternatives = this.generateAlternatives(pattern, context);

    return {
      id: `rec-pattern-${pattern.id}-${Date.now()}`,
      type: pattern.category,
      priority,
      title: pattern.name,
      description: pattern.description,
      rationale: this.generateRationale(pattern, context),
      expectedImpact: {
        roi: pattern.expectedImpact.roi,
        risk: pattern.expectedImpact.risk,
        privacy: pattern.expectedImpact.privacy,
        utility: pattern.expectedImpact.utility,
        cost: pattern.expectedImpact.cost,
        confidence: pattern.confidence
      },
      implementation,
      risks,
      alternatives
    };
  }

  private generateAnalyticalRecommendations(context: RecommendationContext): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const metrics = context.simulationResult.metrics;

    // ROI optimization recommendations
    if (metrics.totalROI < 0.15) {
      recommendations.push(this.createROIRecommendation(context));
    }

    // Risk mitigation recommendations
    if (metrics.riskScore > 70) {
      recommendations.push(this.createRiskRecommendation(context));
    }

    // Privacy improvement recommendations
    if (metrics.privacyScore < 80) {
      recommendations.push(this.createPrivacyRecommendation(context));
    }

    // Efficiency recommendations
    if (metrics.efficiency < 70) {
      recommendations.push(this.createEfficiencyRecommendation(context));
    }

    // Compliance recommendations
    if (metrics.complianceScore < 85) {
      recommendations.push(this.createComplianceRecommendation(context));
    }

    return recommendations;
  }

  private generateMLRecommendations(context: RecommendationContext): Recommendation[] {
    // Simplified ML-based recommendations
    // In a real implementation, this would use machine learning models
    const recommendations: Recommendation[] = [];

    // Analyze historical patterns
    const patterns = this.analyzeHistoricalPatterns(context);
    
    patterns.forEach(pattern => {
      if (pattern.confidence > this.config.confidenceThreshold) {
        recommendations.push(this.createMLRecommendation(pattern, context));
      }
    });

    return recommendations;
  }

  private scoreRecommendation(recommendation: Recommendation, context: RecommendationContext): RecommendationScore {
    const impact = this.calculateImpactScore(recommendation, context);
    const feasibility = this.calculateFeasibilityScore(recommendation, context);
    const risk = this.calculateRiskScore(recommendation, context);
    const cost = this.calculateCostScore(recommendation, context);
    const time = this.calculateTimeScore(recommendation, context);

    const overall = (
      impact * 0.3 +
      feasibility * 0.25 +
      (1 - risk) * 0.2 +
      (1 - cost) * 0.15 +
      (1 - time) * 0.1
    );

    return {
      overall,
      impact,
      feasibility,
      risk,
      cost,
      time
    };
  }

  // Helper methods for creating specific recommendations
  private createROIRecommendation(context: RecommendationContext): Recommendation {
    const lowROICategories = context.currentAllocations
      .filter(alloc => alloc.expectedROI < 0.1)
      .sort((a, b) => a.expectedROI - b.expectedROI);

    const highROICategories = context.currentAllocations
      .filter(alloc => alloc.expectedROI > 0.15)
      .sort((a, b) => b.expectedROI - a.expectedROI);

    return {
      id: `rec-roi-${Date.now()}`,
      type: 'optimization',
      priority: 'high',
      title: 'Improve ROI Performance',
      description: `Reallocate budget from low ROI categories (${lowROICategories.map(c => c.category.name).join(', ')}) to high ROI categories (${highROICategories.map(c => c.category.name).join(', ')})`,
      rationale: `Current ROI of ${(context.simulationResult.metrics.totalROI * 100).toFixed(1)}% is below the 15% target. Analysis shows potential for ${(lowROICategories.length * 0.05 * 100).toFixed(1)}% ROI improvement through reallocation.`,
      expectedImpact: {
        roi: 0.06,
        risk: 0.02,
        privacy: 0.01,
        utility: 0.03,
        cost: -0.01,
        confidence: 0.8
      },
      implementation: {
        steps: [
          {
            id: '1',
            name: 'Analyze low-performing allocations',
            description: 'Identify specific areas with ROI below 10%',
            duration: 7,
            cost: 5000,
            prerequisites: [],
            deliverables: ['ROI analysis report']
          },
          {
            id: '2',
            name: 'Develop reallocation plan',
            description: 'Create detailed budget reallocation strategy',
            duration: 14,
            cost: 10000,
            prerequisites: ['1'],
            deliverables: ['Reallocation plan', 'Impact analysis']
          },
          {
            id: '3',
            name: 'Implement reallocation',
            description: 'Execute budget reallocation with minimal disruption',
            duration: 21,
            cost: 15000,
            prerequisites: ['2'],
            deliverables: ['Updated budget allocation', 'Performance monitoring']
          }
        ],
        duration: 42,
        cost: 30000,
        resources: [
          { type: 'human', name: 'Financial Analyst', quantity: 2, unit: 'person', cost: 20000 },
          { type: 'human', name: 'Budget Manager', quantity: 1, unit: 'person', cost: 10000 }
        ],
        dependencies: []
      },
      risks: [
        {
          id: 'risk-1',
          name: 'Implementation disruption',
          description: 'Reallocation may disrupt ongoing projects',
          probability: 0.3,
          impact: 0.4,
          category: 'operational',
          mitigation: 'Phase implementation gradually',
          owner: 'project-manager'
        }
      ],
      alternatives: [
        {
          name: 'Gradual optimization',
          description: 'Implement changes over 6 months instead of 6 weeks',
          pros: ['Lower disruption risk', 'Better adoption'],
          cons: ['Slower benefits', 'Higher coordination cost'],
          cost: 35000,
          impact: {
            roi: 0.04,
            risk: 0.01,
            privacy: 0.01,
            utility: 0.02,
            cost: -0.005,
            confidence: 0.9
          }
        }
      ]
    };
  }

  private createRiskRecommendation(context: RecommendationContext): Recommendation {
    return {
      id: `rec-risk-${Date.now()}`,
      type: 'risk_mitigation',
      priority: 'critical',
      title: 'Reduce Privacy Risk Exposure',
      description: 'Increase investment in privacy protection and monitoring to reduce risk score',
      rationale: `Current risk score of ${context.simulationResult.metrics.riskScore.toFixed(1)} exceeds the 70% threshold. Immediate action required to prevent potential privacy incidents.`,
      expectedImpact: {
        roi: -0.02,
        risk: -0.18,
        privacy: 0.12,
        utility: 0.01,
        cost: 0.06,
        confidence: 0.9
      },
      implementation: {
        steps: [
          {
            id: '1',
            name: 'Enhance monitoring systems',
            description: 'Upgrade privacy monitoring and alerting capabilities',
            duration: 30,
            cost: 50000,
            prerequisites: [],
            deliverables: ['Enhanced monitoring system', 'Alerting framework']
          },
          {
            id: '2',
            name: 'Implement additional controls',
            description: 'Deploy additional privacy protection measures',
            duration: 45,
            cost: 75000,
            prerequisites: ['1'],
            deliverables: ['Privacy controls', 'Protection framework']
          }
        ],
        duration: 75,
        cost: 125000,
        resources: [
          { type: 'human', name: 'Privacy Engineer', quantity: 3, unit: 'person', cost: 90000 },
          { type: 'technical', name: 'Security Tools', quantity: 1, unit: 'suite', cost: 35000 }
        ],
        dependencies: []
      },
      risks: [],
      alternatives: []
    };
  }

  private createPrivacyRecommendation(context: RecommendationContext): Recommendation {
    return {
      id: `rec-privacy-${Date.now()}`,
      type: 'allocation',
      priority: 'medium',
      title: 'Improve Privacy Protection',
      description: 'Increase investment in privacy-enhancing technologies and processes',
      rationale: `Privacy score of ${context.simulationResult.metrics.privacyScore.toFixed(1)} is below the 80% target. Additional investment needed to improve privacy posture.`,
      expectedImpact: {
        roi: 0.01,
        risk: -0.05,
        privacy: 0.15,
        utility: 0.02,
        cost: 0.03,
        confidence: 0.75
      },
      implementation: {
        steps: [
          {
            id: '1',
            name: 'Invest in privacy technologies',
            description: 'Acquire and implement advanced privacy protection tools',
            duration: 60,
            cost: 80000,
            prerequisites: [],
            deliverables: ['Privacy technology suite', 'Implementation plan']
          }
        ],
        duration: 60,
        cost: 80000,
        resources: [
          { type: 'human', name: 'Privacy Specialist', quantity: 2, unit: 'person', cost: 60000 },
          { type: 'technical', name: 'Privacy Tools', quantity: 1, unit: 'suite', cost: 20000 }
        ],
        dependencies: []
      },
      risks: [],
      alternatives: []
    };
  }

  private createEfficiencyRecommendation(context: RecommendationContext): Recommendation {
    return {
      id: `rec-efficiency-${Date.now()}`,
      type: 'optimization',
      priority: 'medium',
      title: 'Improve Budget Efficiency',
      description: 'Optimize budget allocation and processes to improve overall efficiency',
      rationale: `Current efficiency score of ${context.simulationResult.metrics.efficiency.toFixed(1)} is below optimal. Process improvements and better allocation can significantly improve efficiency.`,
      expectedImpact: {
        roi: 0.03,
        risk: 0.01,
        privacy: 0.02,
        utility: 0.04,
        cost: -0.02,
        confidence: 0.8
      },
      implementation: {
        steps: [
          {
            id: '1',
            name: 'Process optimization',
            description: 'Analyze and optimize budget allocation processes',
            duration: 30,
            cost: 25000,
            prerequisites: [],
            deliverables: ['Process analysis', 'Optimization recommendations']
          }
        ],
        duration: 30,
        cost: 25000,
        resources: [
          { type: 'human', name: 'Process Analyst', quantity: 2, unit: 'person', cost: 20000 },
          { type: 'technical', name: 'Analysis Tools', quantity: 1, unit: 'license', cost: 5000 }
        ],
        dependencies: []
      },
      risks: [],
      alternatives: []
    };
  }

  private createComplianceRecommendation(context: RecommendationContext): Recommendation {
    return {
      id: `rec-compliance-${Date.now()}`,
      type: 'allocation',
      priority: 'high',
      title: 'Strengthen Compliance Position',
      description: 'Increase investment in compliance activities to improve compliance score',
      rationale: `Compliance score of ${context.simulationResult.metrics.complianceScore.toFixed(1)} is below the 85% target. Additional compliance investment needed to meet regulatory requirements.`,
      expectedImpact: {
        roi: -0.01,
        risk: -0.08,
        privacy: 0.1,
        utility: 0.02,
        cost: 0.04,
        confidence: 0.85
      },
      implementation: {
        steps: [
          {
            id: '1',
            name: 'Enhance compliance program',
            description: 'Strengthen compliance monitoring and reporting',
            duration: 45,
            cost: 60000,
            prerequisites: [],
            deliverables: ['Enhanced compliance program', 'Monitoring framework']
          }
        ],
        duration: 45,
        cost: 60000,
        resources: [
          { type: 'human', name: 'Compliance Officer', quantity: 2, unit: 'person', cost: 50000 },
          { type: 'technical', name: 'Compliance Tools', quantity: 1, unit: 'suite', cost: 10000 }
        ],
        dependencies: []
      },
      risks: [],
      alternatives: []
    };
  }

  // Scoring helper methods
  private calculateImpactScore(recommendation: Recommendation, context: RecommendationContext): number {
    const impact = recommendation.expectedImpact;
    const weights = context.objectives.weights || {
      roi: 0.3,
      risk: 0.2,
      privacy: 0.2,
      utility: 0.2,
      cost: 0.1
    };

    return (
      (impact.roi * weights.roi) +
      ((-impact.risk) * weights.risk) +
      (impact.privacy * weights.privacy) +
      (impact.utility * weights.utility) +
      ((-impact.cost) * weights.cost)
    );
  }

  private calculateFeasibilityScore(recommendation: Recommendation, context: RecommendationContext): number {
    let feasibility = 0.8; // Base feasibility

    // Adjust based on implementation complexity
    const implementationComplexity = recommendation.implementation.steps.length;
    if (implementationComplexity > 3) feasibility -= 0.1;
    if (implementationComplexity > 5) feasibility -= 0.1;

    // Adjust based on cost
    const costRatio = recommendation.implementation.cost / context.currentAllocations.reduce((sum, a) => sum + a.amount, 0);
    if (costRatio > 0.1) feasibility -= 0.1;
    if (costRatio > 0.2) feasibility -= 0.1;

    // Adjust based on dependencies
    const dependencyCount = recommendation.implementation.dependencies.length;
    if (dependencyCount > 2) feasibility -= 0.05;
    if (dependencyCount > 4) feasibility -= 0.05;

    return Math.max(0, Math.min(1, feasibility));
  }

  private calculateRiskScore(recommendation: Recommendation, context: RecommendationContext): number {
    if (recommendation.risks.length === 0) return 0.1; // Low base risk

    const avgProbability = recommendation.risks.reduce((sum, risk) => sum + risk.probability, 0) / recommendation.risks.length;
    const avgImpact = recommendation.risks.reduce((sum, risk) => sum + risk.impact, 0) / recommendation.risks.length;

    return avgProbability * avgImpact;
  }

  private calculateCostScore(recommendation: Recommendation, context: RecommendationContext): number {
    const totalBudget = context.currentAllocations.reduce((sum, a) => sum + a.amount, 0);
    const costRatio = recommendation.implementation.cost / totalBudget;

    if (costRatio < 0.05) return 0.1; // Low cost
    if (costRatio < 0.1) return 0.3; // Medium cost
    if (costRatio < 0.2) return 0.6; // High cost
    return 0.9; // Very high cost
  }

  private calculateTimeScore(recommendation: Recommendation, context: RecommendationContext): number {
    const duration = recommendation.implementation.duration;
    
    if (duration < 30) return 0.1; // Quick implementation
    if (duration < 60) return 0.3; // Medium implementation
    if (duration < 90) return 0.6; // Long implementation
    return 0.9; // Very long implementation
  }

  // Additional helper methods
  private calculatePriority(impact: PatternImpact): 'low' | 'medium' | 'high' | 'critical' {
    const totalImpact = Math.abs(impact.roi) + Math.abs(impact.risk) + Math.abs(impact.privacy) + Math.abs(impact.utility);
    
    if (totalImpact > 0.3) return 'critical';
    if (totalImpact > 0.2) return 'high';
    if (totalImpact > 0.1) return 'medium';
    return 'low';
  }

  private createImplementationPlan(pattern: OptimizationPattern, context: RecommendationContext): any {
    const steps = pattern.actions.map((action, index) => ({
      id: `step-${index + 1}`,
      name: `Execute ${action.type} for ${action.target}`,
      description: `Implement ${action.type} action on ${action.target} category`,
      duration: 14, // Default 2 weeks per action
      cost: 25000, // Default cost
      prerequisites: index > 0 ? [`step-${index}`] : [],
      deliverables: [`${action.type} completion report`]
    }));

    return {
      steps,
      duration: steps.length * 14,
      cost: steps.length * 25000,
      resources: [
        { type: 'human', name: 'Privacy Analyst', quantity: 2, unit: 'person', cost: steps.length * 15000 },
        { type: 'technical', name: 'Analysis Tools', quantity: 1, unit: 'license', cost: steps.length * 10000 }
      ],
      dependencies: []
    };
  }

  private identifyRisks(pattern: OptimizationPattern, context: RecommendationContext): any[] {
    const risks: any[] = [];

    if (pattern.category === 'reallocation') {
      risks.push({
        id: 'risk-reallocation',
        name: 'Reallocation Disruption',
        description: 'Budget reallocation may disrupt ongoing activities',
        probability: 0.3,
        impact: 0.4,
        category: 'operational',
        mitigation: 'Phase implementation gradually',
        owner: 'budget-manager'
      });
    }

    if (pattern.expectedImpact.cost > 0.05) {
      risks.push({
        id: 'risk-cost',
        name: 'Cost Overrun',
        description: 'Implementation may exceed estimated costs',
        probability: 0.2,
        impact: 0.3,
        category: 'financial',
        mitigation: 'Include contingency budget',
        owner: 'finance-team'
      });
    }

    return risks;
  }

  private generateAlternatives(pattern: OptimizationPattern, context: RecommendationContext): any[] {
    const alternatives: any[] = [];

    // Generate a conservative alternative
    alternatives.push({
      name: 'Conservative Approach',
      description: 'Implement changes at a slower pace with lower risk',
      pros: ['Lower disruption', 'Higher success rate'],
      cons: ['Slower benefits', 'Extended timeline'],
      cost: pattern.expectedImpact.cost * 0.7,
      impact: {
        roi: pattern.expectedImpact.roi * 0.7,
        risk: pattern.expectedImpact.risk * 0.7,
        privacy: pattern.expectedImpact.privacy * 0.7,
        utility: pattern.expectedImpact.utility * 0.7,
        cost: pattern.expectedImpact.cost * 0.7,
        confidence: pattern.confidence * 1.1
      }
    });

    return alternatives;
  }

  private generateRationale(pattern: OptimizationPattern, context: RecommendationContext): string {
    const metrics = context.simulationResult.metrics;
    const matchingConditions = pattern.conditions.filter(condition => {
      const metricValue = (metrics as any)[condition.metric];
      if (metricValue === undefined) return false;

      switch (condition.operator) {
        case 'gt': return metricValue > condition.value;
        case 'gte': return metricValue >= condition.value;
        case 'lt': return metricValue < condition.value;
        case 'lte': return metricValue <= condition.value;
        case 'eq': return metricValue === condition.value;
        default: return false;
      }
    });

    const conditionDescriptions = matchingConditions.map(condition => {
      const metricValue = (metrics as any)[condition.metric];
      return `${condition.metric} is ${metricValue.toFixed(2)} (${condition.operator} ${condition.value})`;
    });

    return `Based on analysis: ${conditionDescriptions.join(', ')}. This pattern has a success rate of ${(pattern.successRate * 100).toFixed(1)}% and confidence level of ${(pattern.confidence * 100).toFixed(1)}%.`;
  }

  private analyzeHistoricalPatterns(context: RecommendationContext): any[] {
    // Simplified historical pattern analysis
    // In a real implementation, this would use more sophisticated ML techniques
    const patterns: any[] = [];

    // Analyze trends in historical data
    if (this.historicalData.length > 5) {
      const recentData = this.historicalData.slice(-5);
      const olderData = this.historicalData.slice(-10, -5);

      // Compare recent vs older performance
      const recentAvgROI = recentData.reduce((sum, d) => sum + d.metrics.totalROI, 0) / recentData.length;
      const olderAvgROI = olderData.reduce((sum, d) => sum + d.metrics.totalROI, 0) / olderData.length;

      if (recentAvgROI < olderAvgROI) {
        patterns.push({
          type: 'declining_roi',
          description: 'ROI has been declining in recent periods',
          confidence: 0.8,
          recommendation: 'Focus on ROI improvement strategies'
        });
      }
    }

    return patterns;
  }

  private createMLRecommendation(pattern: any, context: RecommendationContext): Recommendation {
    return {
      id: `rec-ml-${Date.now()}`,
      type: 'optimization',
      priority: 'medium',
      title: 'ML-Based Optimization',
      description: pattern.description,
      rationale: `Based on historical data analysis with ${(pattern.confidence * 100).toFixed(1)}% confidence`,
      expectedImpact: {
        roi: 0.05,
        risk: 0.02,
        privacy: 0.03,
        utility: 0.04,
        cost: 0.01,
        confidence: pattern.confidence
      },
      implementation: {
        steps: [
          {
            id: '1',
            name: 'Implement ML recommendation',
            description: pattern.recommendation,
            duration: 30,
            cost: 40000,
            prerequisites: [],
            deliverables: ['ML implementation', 'Performance monitoring']
          }
        ],
        duration: 30,
        cost: 40000,
        resources: [
          { type: 'human', name: 'Data Scientist', quantity: 1, unit: 'person', cost: 30000 },
          { type: 'technical', name: 'ML Tools', quantity: 1, unit: 'license', cost: 10000 }
        ],
        dependencies: []
      },
      risks: [],
      alternatives: []
    };
  }

  // Configuration management
  public updateConfig(newConfig: Partial<OptimizationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): OptimizationConfig {
    return { ...this.config };
  }

  // Pattern management
  public addPattern(pattern: OptimizationPattern): void {
    this.patterns.set(pattern.id, pattern);
  }

  public removePattern(id: string): boolean {
    return this.patterns.delete(id);
  }

  public getPattern(id: string): OptimizationPattern | undefined {
    return this.patterns.get(id);
  }

  public getAllPatterns(): OptimizationPattern[] {
    return Array.from(this.patterns.values());
  }

  // Historical data management
  public addHistoricalDataPoint(dataPoint: HistoricalDataPoint): void {
    this.historicalData.push(dataPoint);
    // Keep only last 100 data points
    if (this.historicalData.length > 100) {
      this.historicalData = this.historicalData.slice(-100);
    }
  }

  public getHistoricalData(): HistoricalDataPoint[] {
    return [...this.historicalData];
  }

  public clearHistoricalData(): void {
    this.historicalData = [];
  }
}

export default OptimizationRecommendationEngine;
