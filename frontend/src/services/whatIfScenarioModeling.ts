/**
 * What-If Scenario Modeling System
 */

import {
  SimulationScenario,
  SimulationResult,
  BudgetAllocation,
  SimulationParameters,
  ScenarioConstraints,
  BusinessObjective,
  SimulationAssumption,
  ScenarioComparison,
  ComparisonResult,
  ComparisonInsight
} from '../types/privacyBudget';

export interface WhatIfConfig {
  maxScenarios: number;
  defaultTimeHorizon: number; // days
  confidenceLevels: number[];
  sensitivityFactors: number[];
  optimizationTargets: string[];
}

export interface ScenarioTemplate {
  id: string;
  name: string;
  description: string;
  category: 'budget_increase' | 'budget_decrease' | 'reallocation' | 'risk_mitigation' | 'optimization';
  parameters: Partial<SimulationParameters>;
  constraints: Partial<ScenarioConstraints>;
  assumptions: SimulationAssumption[];
  useCases: string[];
}

export interface ScenarioImpact {
  metric: string;
  baseline: number;
  scenario: number;
  change: number;
  changePercent: number;
  confidence: number;
  significance: 'low' | 'medium' | 'high';
}

export interface ScenarioValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  recommendations: string[];
}

export class WhatIfScenarioModeling {
  private static instance: WhatIfScenarioModeling;
  private config: WhatIfConfig;
  private templates: Map<string, ScenarioTemplate> = new Map();
  private scenarios: Map<string, SimulationScenario> = new Map();
  private comparisons: Map<string, ScenarioComparison> = new Map();

  private constructor(config: WhatIfConfig) {
    this.config = config;
    this.initializeTemplates();
  }

  static getInstance(config?: WhatIfConfig): WhatIfScenarioModeling {
    if (!WhatIfScenarioModeling.instance) {
      if (!config) {
        config = {
          maxScenarios: 50,
          defaultTimeHorizon: 365,
          confidenceLevels: [0.8, 0.9, 0.95],
          sensitivityFactors: [0.8, 0.9, 1.0, 1.1, 1.2],
          optimizationTargets: ['roi', 'risk', 'privacy', 'utility']
        };
      }
      WhatIfScenarioModeling.instance = new WhatIfScenarioModeling(config);
    }
    return WhatIfScenarioModeling.instance;
  }

  private initializeTemplates(): void {
    const templates: ScenarioTemplate[] = [
      {
        id: 'budget_increase_10',
        name: '10% Budget Increase',
        description: 'Model the impact of increasing the total privacy budget by 10%',
        category: 'budget_increase',
        parameters: {
          timeHorizon: this.config.defaultTimeHorizon,
          confidenceLevel: 0.9,
          riskTolerance: 0.3
        },
        constraints: {
          totalBudgetLimit: 0 // Will be calculated dynamically
        },
        assumptions: [
          {
            id: 'market_growth',
            name: 'Market Growth',
            description: 'Market conditions remain stable',
            type: 'market',
            value: 0.05,
            confidence: 0.8,
            impact: 'medium',
            source: 'market_analysis'
          }
        ],
        useCases: ['Planning for next fiscal year', 'Responding to increased privacy regulations']
      },
      {
        id: 'budget_decrease_20',
        name: '20% Budget Decrease',
        description: 'Model the impact of reducing the total privacy budget by 20%',
        category: 'budget_decrease',
        parameters: {
          timeHorizon: this.config.defaultTimeHorizon,
          confidenceLevel: 0.85,
          riskTolerance: 0.4
        },
        constraints: {
          totalBudgetLimit: 0 // Will be calculated dynamically
        },
        assumptions: [
          {
            id: 'cost_pressure',
            name: 'Cost Pressure',
            description: 'Organization facing cost pressures',
            type: 'operational',
            value: true,
            confidence: 0.9,
            impact: 'high',
            source: 'financial_reports'
          }
        ],
        useCases: ['Budget cuts preparation', 'Efficiency optimization planning']
      },
      {
        id: 'reallocate_to_compliance',
        name: 'Reallocate to Compliance',
        description: 'Shift budget from other categories to compliance activities',
        category: 'reallocation',
        parameters: {
          timeHorizon: this.config.defaultTimeHorizon,
          confidenceLevel: 0.95,
          riskTolerance: 0.2
        },
        constraints: {
          categoryLimits: {
            compliance: 0.4 // Increase compliance allocation to 40%
          }
        },
        assumptions: [
          {
            id: 'regulatory_changes',
            name: 'Regulatory Changes',
            description: 'New privacy regulations coming into effect',
            type: 'regulatory',
            value: 'GDPR_amendments',
            confidence: 0.95,
            impact: 'high',
            source: 'legal_analysis'
          }
        ],
        useCases: ['Preparing for new regulations', 'Improving compliance posture']
      },
      {
        id: 'risk_mitigation_focus',
        name: 'Risk Mitigation Focus',
        description: 'Prioritize budget allocation for risk mitigation activities',
        category: 'risk_mitigation',
        parameters: {
          timeHorizon: this.config.defaultTimeHorizon,
          confidenceLevel: 0.9,
          riskTolerance: 0.1
        },
        constraints: {
          minimumPrivacyLevel: 0.8,
          categoryLimits: {
            monitoring: 0.2,
            compliance: 0.3
          }
        },
        assumptions: [
          {
            id: 'increased_threats',
            name: 'Increased Threats',
            description: 'Privacy threat landscape is evolving',
            type: 'technical',
            value: 0.3,
            confidence: 0.8,
            impact: 'high',
            source: 'threat_intelligence'
          }
        ],
        useCases: ['Responding to security incidents', 'Improving threat detection']
      },
      {
        id: 'roi_optimization',
        name: 'ROI Optimization',
        description: 'Optimize budget allocation for maximum return on investment',
        category: 'optimization',
        parameters: {
          timeHorizon: this.config.defaultTimeHorizon,
          confidenceLevel: 0.85,
          optimizationGoal: {
            primary: 'maximize_roi',
            weights: {
              roi: 0.6,
              risk: 0.2,
              privacy: 0.1,
              utility: 0.1
            }
          }
        },
        constraints: {
          businessObjectives: [
            {
              id: 'roi_target',
              name: 'ROI Target',
              description: 'Achieve minimum 15% ROI',
              weight: 0.8,
              target: 0.15,
              current: 0.12,
              unit: 'percentage'
            }
          ]
        },
        assumptions: [
          {
            id: 'market_conditions',
            name: 'Market Conditions',
            description: 'Favorable market conditions for ROI',
            type: 'market',
            value: 0.08,
            confidence: 0.7,
            impact: 'medium',
            source: 'market_analysis'
          }
        ],
        useCases: ['Annual budget planning', 'Performance improvement initiatives']
      }
    ];

    templates.forEach(template => {
      this.templates.set(template.id, template);
    });
  }

  // Main scenario modeling methods
  public createWhatIfScenario(
    baseScenario: SimulationScenario,
    templateId: string,
    customizations?: {
      parameters?: Partial<SimulationParameters>;
      constraints?: Partial<ScenarioConstraints>;
      assumptions?: SimulationAssumption[];
    }
  ): SimulationScenario {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Calculate new budget based on template
    const newBudget = this.calculateAdjustedBudget(baseScenario.baseBudget, template);

    // Create new allocations based on template
    const newAllocations = this.createTemplateAllocations(baseScenario.allocations, template, newBudget);

    // Merge parameters
    const mergedParameters = {
      ...baseScenario.parameters,
      ...template.parameters,
      ...customizations?.parameters
    };

    // Merge constraints
    const mergedConstraints = {
      ...baseScenario.constraints,
      ...template.constraints,
      ...customizations?.constraints
    };

    // Merge assumptions
    const mergedAssumptions = [
      ...baseScenario.assumptions,
      ...template.assumptions,
      ...(customizations?.assumptions || [])
    ];

    const scenario: SimulationScenario = {
      id: `whatif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `What-If: ${template.name}`,
      description: template.description,
      type: 'what_if',
      baseBudget: newBudget,
      allocations: newAllocations,
      parameters: mergedParameters,
      assumptions: mergedAssumptions,
      constraints: mergedConstraints,
      createdAt: Date.now(),
      createdBy: 'system',
      tags: [...baseScenario.tags, 'what-if', template.category],
      status: 'draft'
    };

    // Validate scenario
    const validation = this.validateScenario(scenario);
    if (!validation.isValid) {
      throw new Error(`Invalid scenario: ${validation.errors.join(', ')}`);
    }

    this.scenarios.set(scenario.id, scenario);
    return scenario;
  }

  public async compareScenarios(
    scenarioIds: string[],
    comparisonType: 'side_by_side' | 'delta' | 'ranking' = 'side_by_side',
    metrics?: string[],
    weights?: Record<string, number>
  ): Promise<ScenarioComparison> {
    const scenarios = scenarioIds.map(id => this.scenarios.get(id)).filter(Boolean) as SimulationScenario[];
    
    if (scenarios.length < 2) {
      throw new Error('At least two scenarios are required for comparison');
    }

    const selectedMetrics = metrics || ['totalROI', 'riskScore', 'privacyScore', 'utilityScore', 'efficiency'];
    const selectedWeights = weights || {
      totalROI: 0.3,
      riskScore: 0.2,
      privacyScore: 0.2,
      utilityScore: 0.2,
      efficiency: 0.1
    };

    // Run simulations for all scenarios
    const results: SimulationResult[] = [];
    for (const scenario of scenarios) {
      // This would typically call the simulation engine
      // For now, we'll create mock results
      const result = await this.runScenarioSimulation(scenario);
      results.push(result);
    }

    // Generate comparison results
    const comparisonResults = this.generateComparisonResults(
      scenarios,
      results,
      selectedMetrics,
      selectedWeights,
      comparisonType
    );

    // Generate insights
    const insights = this.generateComparisonInsights(comparisonResults, comparisonType);

    const comparison: ScenarioComparison = {
      id: `comparison-${Date.now()}`,
      name: `Scenario Comparison - ${comparisonType}`,
      scenarios: scenarioIds,
      comparisonType,
      metrics: selectedMetrics,
      weights: selectedWeights,
      results: comparisonResults,
      insights,
      createdAt: Date.now(),
      createdBy: 'system'
    };

    this.comparisons.set(comparison.id, comparison);
    return comparison;
  }

  public analyzeScenarioImpact(
    scenarioId: string,
    baselineScenarioId: string
  ): ScenarioImpact[] {
    const scenario = this.scenarios.get(scenarioId);
    const baseline = this.scenarios.get(baselineScenarioId);

    if (!scenario || !baseline) {
      throw new Error('Scenarios not found');
    }

    const impacts: ScenarioImpact[] = [];

    // Compare key metrics
    const metrics = [
      { name: 'totalBudget', label: 'Total Budget' },
      { name: 'totalROI', label: 'Total ROI' },
      { name: 'riskScore', label: 'Risk Score' },
      { name: 'privacyScore', label: 'Privacy Score' },
      { name: 'utilityScore', label: 'Utility Score' },
      { name: 'efficiency', label: 'Efficiency' },
      { name: 'complianceScore', label: 'Compliance Score' }
    ];

    metrics.forEach(metric => {
      const baselineValue = this.getMetricValue(metric.name, baseline);
      const scenarioValue = this.getMetricValue(metric.name, scenario);
      const change = scenarioValue - baselineValue;
      const changePercent = baselineValue !== 0 ? (change / baselineValue) * 100 : 0;
      const confidence = this.calculateImpactConfidence(metric.name, scenario, baseline);
      const significance = this.calculateSignificance(Math.abs(changePercent));

      impacts.push({
        metric: metric.label,
        baseline: baselineValue,
        scenario: scenarioValue,
        change,
        changePercent,
        confidence,
        significance
      });
    });

    return impacts.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
  }

  public generateScenarioReport(scenarioId: string): {
    summary: any;
    impacts: ScenarioImpact[];
    recommendations: any[];
    risks: any[];
    opportunities: any[];
  } {
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) {
      throw new Error('Scenario not found');
    }

    // Generate summary
    const summary = {
      name: scenario.name,
      description: scenario.description,
      type: scenario.type,
      totalBudget: scenario.baseBudget.totalBudget,
      allocations: scenario.allocations.length,
      timeHorizon: scenario.parameters.timeHorizon,
      riskTolerance: scenario.parameters.riskTolerance,
      confidenceLevel: scenario.parameters.confidenceLevel,
      assumptions: scenario.assumptions.length,
      constraints: Object.keys(scenario.constraints).length
    };

    // Generate impacts (compared to baseline if available)
    const impacts: ScenarioImpact[] = [];
    const baselineScenarios = Array.from(this.scenarios.values()).filter(s => s.type === 'baseline');
    
    if (baselineScenarios.length > 0) {
      const baseline = baselineScenarios[0];
      const scenarioImpacts = this.analyzeScenarioImpact(scenario.id, baseline.id);
      impacts.push(...scenarioImpacts);
    }

    // Generate recommendations
    const recommendations = this.generateScenarioRecommendations(scenario);

    // Generate risks
    const risks = this.identifyScenarioRisks(scenario);

    // Generate opportunities
    const opportunities = this.identifyScenarioOpportunities(scenario);

    return {
      summary,
      impacts,
      recommendations,
      risks,
      opportunities
    };
  }

  // Helper methods
  private calculateAdjustedBudget(baseBudget: any, template: ScenarioTemplate): any {
    const budgetMultiplier = this.getBudgetMultiplier(template);
    
    return {
      ...baseBudget,
      totalBudget: baseBudget.totalBudget * budgetMultiplier,
      allocatedBudget: baseBudget.allocatedBudget * budgetMultiplier,
      remainingBudget: baseBudget.remainingBudget * budgetMultiplier
    };
  }

  private getBudgetMultiplier(template: ScenarioTemplate): number {
    switch (template.category) {
      case 'budget_increase':
        return 1.1; // 10% increase
      case 'budget_decrease':
        return 0.8; // 20% decrease
      default:
        return 1.0; // No change
    }
  }

  private createTemplateAllocations(
    baseAllocations: BudgetAllocation[],
    template: ScenarioTemplate,
    newBudget: any
  ): BudgetAllocation[] {
    let allocations = [...baseAllocations];

    // Apply template-specific allocation changes
    switch (template.category) {
      case 'reallocation_to_compliance':
        allocations = this.reallocateToCategory(allocations, 'compliance', 0.4, newBudget.totalBudget);
        break;
      case 'risk_mitigation_focus':
        allocations = this.reallocateToCategories(allocations, ['monitoring', 'compliance'], [0.2, 0.3], newBudget.totalBudget);
        break;
      case 'roi_optimization':
        allocations = this.optimizeForROI(allocations, newBudget.totalBudget);
        break;
    }

    // Normalize allocations to match new budget
    return this.normalizeAllocations(allocations, newBudget.totalBudget);
  }

  private reallocateToCategory(
    allocations: BudgetAllocation[],
    targetCategory: string,
    targetPercentage: number,
    totalBudget: number
  ): BudgetAllocation[] {
    const targetAmount = totalBudget * targetPercentage;
    const currentAllocation = allocations.find(a => a.category.id === targetCategory);
    
    if (currentAllocation) {
      const difference = targetAmount - currentAllocation.amount;
      
      // Adjust target category
      currentAllocation.amount = targetAmount;
      currentAllocation.percentage = targetPercentage * 100;
      
      // Redistribute difference from other categories
      if (difference !== 0) {
        const otherCategories = allocations.filter(a => a.category.id !== targetCategory);
        const totalOtherBudget = otherCategories.reduce((sum, a) => sum + a.amount, 0);
        
        if (totalOtherBudget > 0) {
          const adjustmentFactor = (totalOtherBudget - difference) / totalOtherBudget;
          
          otherCategories.forEach(category => {
            category.amount *= adjustmentFactor;
            category.percentage = (category.amount / totalBudget) * 100;
          });
        }
      }
    }
    
    return allocations;
  }

  private reallocateToCategories(
    allocations: BudgetAllocation[],
    targetCategories: string[],
    targetPercentages: number[],
    totalBudget: number
  ): BudgetAllocation[] {
    let updatedAllocations = [...allocations];
    
    targetCategories.forEach((categoryId, index) => {
      updatedAllocations = this.reallocateToCategory(updatedAllocations, categoryId, targetPercentages[index], totalBudget);
    });
    
    return updatedAllocations;
  }

  private optimizeForROI(allocations: BudgetAllocation[], totalBudget: number): BudgetAllocation[] {
    // Sort by expected ROI (highest first)
    const sorted = [...allocations].sort((a, b) => b.expectedROI - a.expectedROI);
    
    // Allocate budget based on ROI priority
    let remainingBudget = totalBudget;
    const optimizedAllocations: BudgetAllocation[] = [];
    
    for (const allocation of sorted) {
      const category = allocation.category;
      const maxAllocation = totalBudget * category.maxAllocation;
      const minAllocation = totalBudget * category.minAllocation;
      
      // Allocate as much as possible up to max, considering remaining budget
      let amount = Math.min(allocation.amount, maxAllocation, remainingBudget);
      amount = Math.max(amount, minAllocation);
      
      optimizedAllocations.push({
        ...allocation,
        amount,
        percentage: (amount / totalBudget) * 100
      });
      
      remainingBudget -= amount;
    }
    
    return optimizedAllocations;
  }

  private normalizeAllocations(allocations: BudgetAllocation[], totalBudget: number): BudgetAllocation[] {
    const currentTotal = allocations.reduce((sum, alloc) => sum + alloc.amount, 0);
    
    if (currentTotal === 0) return allocations;
    
    const scaleFactor = totalBudget / currentTotal;
    
    return allocations.map(alloc => ({
      ...alloc,
      amount: alloc.amount * scaleFactor,
      percentage: (alloc.amount * scaleFactor / totalBudget) * 100
    }));
  }

  private validateScenario(scenario: SimulationScenario): ScenarioValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Validate budget
    if (scenario.baseBudget.totalBudget <= 0) {
      errors.push('Total budget must be positive');
    }

    // Validate allocations
    const totalAllocation = scenario.allocations.reduce((sum, alloc) => sum + alloc.amount, 0);
    if (Math.abs(totalAllocation - scenario.baseBudget.totalBudget) > 0.01) {
      warnings.push('Allocations do not sum to total budget');
      recommendations.push('Consider normalizing allocations to match total budget');
    }

    // Validate time horizon
    if (scenario.parameters.timeHorizon <= 0) {
      errors.push('Time horizon must be positive');
    }

    // Validate confidence level
    if (scenario.parameters.confidenceLevel < 0 || scenario.parameters.confidenceLevel > 1) {
      errors.push('Confidence level must be between 0 and 1');
    }

    // Validate risk tolerance
    if (scenario.parameters.riskTolerance < 0 || scenario.parameters.riskTolerance > 1) {
      errors.push('Risk tolerance must be between 0 and 1');
    }

    // Check for category constraints
    if (scenario.constraints.categoryLimits) {
      for (const [categoryId, limit] of Object.entries(scenario.constraints.categoryLimits)) {
        const allocation = scenario.allocations.find(a => a.category.id === categoryId);
        if (allocation && allocation.percentage > limit * 100) {
          warnings.push(`Allocation for ${categoryId} exceeds limit of ${(limit * 100).toFixed(1)}%`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      recommendations
    };
  }

  private async runScenarioSimulation(scenario: SimulationScenario): Promise<SimulationResult> {
    // This would typically call the PrivacyBudgetSimulation service
    // For now, we'll create a mock result
    return {
      id: `result-${scenario.id}`,
      scenarioId: scenario.id,
      timestamp: Date.now(),
      status: 'completed',
      duration: 1000,
      allocations: scenario.allocations,
      metrics: this.generateMockMetrics(scenario),
      projections: [],
      recommendations: [],
      sensitivity: {
        parameters: [],
        scenarios: [],
        tornadoChart: { parameters: [], baseCase: 0 },
        correlationMatrix: { matrix: [], variables: [], significant: [] }
      },
      confidence: [],
      metadata: {
        version: '1.0',
        algorithm: 'mock',
        parameters: scenario.parameters,
        assumptions: scenario.assumptions.map(a => a.description),
        limitations: ['Mock simulation for demonstration'],
        validation: {
          backtesting: [],
          crossValidation: 0.8,
          accuracy: 0.85,
          precision: 0.88,
          recall: 0.82
        }
      }
    };
  }

  private generateMockMetrics(scenario: SimulationScenario): any {
    const baseMetrics = {
      totalROI: 0.12,
      riskScore: 45,
      privacyScore: 78,
      utilityScore: 72,
      efficiency: 68,
      complianceScore: 85,
      budgetUtilization: 0.95,
      costBenefitRatio: 1.15,
      netPresentValue: 150000,
      internalRateOfReturn: 0.18,
      paybackPeriod: 180,
      breakEvenPoint: 165
    };

    // Adjust based on scenario type
    const adjustments = this.getScenarioAdjustments(scenario);

    const metrics = { ...baseMetrics };
    Object.entries(adjustments).forEach(([key, adjustment]) => {
      if (key in metrics) {
        (metrics as any)[key] *= adjustment;
      }
    });

    return metrics;
  }

  private getScenarioAdjustments(scenario: SimulationScenario): Record<string, number> {
    const adjustments: Record<string, number> = {};

    switch (scenario.type) {
      case 'what_if':
        // Adjust based on template category
        const template = this.templates.get(scenario.tags.find(t => this.templates.has(t)) || '');
        if (template) {
          switch (template.category) {
            case 'budget_increase':
              adjustments.totalROI = 1.1;
              adjustments.privacyScore = 1.05;
              adjustments.utilityScore = 1.08;
              break;
            case 'budget_decrease':
              adjustments.totalROI = 0.9;
              adjustments.riskScore = 1.15;
              adjustments.privacyScore = 0.92;
              break;
            case 'reallocation_to_compliance':
              adjustments.complianceScore = 1.2;
              adjustments.riskScore = 0.85;
              adjustments.totalROI = 0.95;
              break;
            case 'risk_mitigation_focus':
              adjustments.riskScore = 0.7;
              adjustments.privacyScore = 1.1;
              adjustments.complianceScore = 1.15;
              break;
            case 'roi_optimization':
              adjustments.totalROI = 1.25;
              adjustments.efficiency = 1.15;
              adjustments.utilityScore = 1.1;
              break;
          }
        }
        break;
    }

    return adjustments;
  }

  private generateComparisonResults(
    scenarios: SimulationScenario[],
    results: SimulationResult[],
    metrics: string[],
    weights: Record<string, number>,
    comparisonType: string
  ): ComparisonResult[] {
    return scenarios.map((scenario, index) => {
      const result = results[index];
      const metricValues: Record<string, number> = {};
      
      metrics.forEach(metric => {
        metricValues[metric] = (result.metrics as any)[metric] || 0;
      });

      // Calculate weighted score
      const score = Object.entries(metricValues).reduce((sum, [metric, value]) => {
        const weight = weights[metric] || 0;
        const normalizedValue = this.normalizeMetricValue(metric, value);
        return sum + (normalizedValue * weight);
      }, 0);

      // Determine rank (will be calculated after all results are generated)
      const rank = 0; // Placeholder

      // Generate strengths and weaknesses
      const strengths = this.identifyStrengths(metricValues, weights);
      const weaknesses = this.identifyWeaknesses(metricValues, weights);

      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        rank,
        score,
        metrics: metricValues,
        strengths,
        weaknesses
      };
    });
  }

  private normalizeMetricValue(metric: string, value: number): number {
    // Normalize metrics to 0-1 scale
    switch (metric) {
      case 'totalROI':
        return Math.min(value / 0.3, 1); // Max expected ROI 30%
      case 'riskScore':
        return 1 - (value / 100); // Lower risk is better
      case 'privacyScore':
      case 'utilityScore':
      case 'efficiency':
      case 'complianceScore':
        return value / 100;
      case 'budgetUtilization':
        return Math.min(value, 1);
      case 'costBenefitRatio':
        return Math.min(value / 2, 1); // Max expected ratio 2.0
      default:
        return Math.min(value / 100, 1);
    }
  }

  private identifyStrengths(metrics: Record<string, number>, weights: Record<string, number>): string[] {
    const strengths: string[] = [];
    
    Object.entries(metrics).forEach(([metric, value]) => {
      const weight = weights[metric] || 0;
      if (weight > 0 && value > this.getAverageValue(metric)) {
        strengths.push(`Strong ${metric} performance`);
      }
    });
    
    return strengths;
  }

  private identifyWeaknesses(metrics: Record<string, number>, weights: Record<string, number>): string[] {
    const weaknesses: string[] = [];
    
    Object.entries(metrics).forEach(([metric, value]) => {
      const weight = weights[metric] || 0;
      if (weight > 0 && value < this.getAverageValue(metric)) {
        weaknesses.push(`Below average ${metric}`);
      }
    });
    
    return weaknesses;
  }

  private getAverageValue(metric: string): number {
    // Return average/benchmark values for metrics
    const averages: Record<string, number> = {
      totalROI: 0.12,
      riskScore: 50,
      privacyScore: 75,
      utilityScore: 70,
      efficiency: 65,
      complianceScore: 80,
      budgetUtilization: 0.9,
      costBenefitRatio: 1.2,
      netPresentValue: 100000,
      internalRateOfReturn: 0.15,
      paybackPeriod: 200,
      breakEvenPoint: 180
    };
    
    return averages[metric] || 0;
  }

  private generateComparisonInsights(results: ComparisonResult[], comparisonType: string): ComparisonInsight[] {
    const insights: ComparisonInsight[] = [];
    
    // Sort results by score
    const sortedResults = [...results].sort((a, b) => b.score - a.score);
    
    // Best practice insight
    if (sortedResults.length > 0) {
      const best = sortedResults[0];
      insights.push({
        type: 'best_practice',
        description: `${best.scenarioName} performs best overall`,
        scenarios: [best.scenarioId],
        impact: `Highest weighted score of ${best.score.toFixed(3)}`,
        recommendation: 'Consider adopting the approach from the top-performing scenario'
      });
    }
    
    // Trade-off insights
    if (sortedResults.length > 1) {
      const top = sortedResults[0];
      const second = sortedResults[1];
      
      if (top.metrics.riskScore < second.metrics.riskScore && top.metrics.totalROI < second.metrics.totalROI) {
        insights.push({
          type: 'trade_off',
          description: 'Risk vs ROI trade-off identified',
          scenarios: [top.scenarioId, second.scenarioId],
          impact: 'Lower risk scenario shows slightly lower ROI',
          recommendation: 'Consider risk tolerance when selecting between these scenarios'
        });
      }
    }
    
    // Opportunity insights
    const lowRiskScenarios = results.filter(r => r.metrics.riskScore < 40);
    if (lowRiskScenarios.length > 0) {
      insights.push({
        type: 'opportunity',
        description: 'Low-risk options available',
        scenarios: lowRiskScenarios.map(r => r.scenarioId),
        impact: 'Multiple scenarios with risk scores below 40',
        recommendation: 'Evaluate low-risk scenarios for conservative approach'
      });
    }
    
    return insights;
  }

  private getMetricValue(metricName: string, scenario: SimulationScenario): number {
    // Extract metric value from scenario or return default
    switch (metricName) {
      case 'totalBudget':
        return scenario.baseBudget.totalBudget;
      case 'allocations':
        return scenario.allocations.length;
      case 'timeHorizon':
        return scenario.parameters.timeHorizon;
      case 'riskTolerance':
        return scenario.parameters.riskTolerance;
      case 'confidenceLevel':
        return scenario.parameters.confidenceLevel;
      default:
        return 0;
    }
  }

  private calculateImpactConfidence(metricName: string, scenario: SimulationScenario, baseline: SimulationScenario): number {
    // Calculate confidence based on scenario parameters and assumptions
    const baseConfidence = scenario.parameters.confidenceLevel;
    
    // Adjust confidence based on number of assumptions
    const assumptionCount = scenario.assumptions.length;
    const assumptionConfidence = scenario.assumptions.reduce((sum, a) => sum + a.confidence, 0) / Math.max(assumptionCount, 1);
    
    return baseConfidence * assumptionConfidence;
  }

  private calculateSignificance(changePercent: number): 'low' | 'medium' | 'high' {
    const absChange = Math.abs(changePercent);
    if (absChange < 5) return 'low';
    if (absChange < 15) return 'medium';
    return 'high';
  }

  private generateScenarioRecommendations(scenario: SimulationScenario): any[] {
    const recommendations: any[] = [];
    
    // Generate recommendations based on scenario characteristics
    if (scenario.parameters.riskTolerance < 0.3) {
      recommendations.push({
        type: 'risk_management',
        title: 'Maintain Conservative Risk Profile',
        description: 'Consider additional risk mitigation measures given low risk tolerance',
        priority: 'medium'
      });
    }
    
    if (scenario.parameters.confidenceLevel > 0.9) {
      recommendations.push({
        type: 'validation',
        title: 'Validate High Confidence Assumptions',
        description: 'Review assumptions supporting high confidence level',
        priority: 'low'
      });
    }
    
    return recommendations;
  }

  private identifyScenarioRisks(scenario: SimulationScenario): any[] {
    const risks: any[] = [];
    
    // Identify risks based on scenario parameters
    if (scenario.parameters.riskTolerance > 0.7) {
      risks.push({
        name: 'High Risk Exposure',
        description: 'High risk tolerance may lead to increased privacy incidents',
        probability: 0.6,
        impact: 0.7,
        mitigation: 'Implement additional monitoring and controls'
      });
    }
    
    if (scenario.assumptions.length > 5) {
      risks.push({
        name: 'Assumption Complexity',
        description: 'Multiple assumptions increase model uncertainty',
        probability: 0.4,
        impact: 0.5,
        mitigation: 'Validate key assumptions through sensitivity analysis'
      });
    }
    
    return risks;
  }

  private identifyScenarioOpportunities(scenario: SimulationScenario): any[] {
    const opportunities: any[] = [];
    
    // Identify opportunities based on scenario characteristics
    if (scenario.parameters.timeHorizon > 365) {
      opportunities.push({
        name: 'Long-term Planning',
        description: 'Extended time horizon allows for strategic investments',
        value: 'High',
        timeframe: '12-24 months'
      });
    }
    
    const highROIAllocations = scenario.allocations.filter(a => a.expectedROI > 0.15);
    if (highROIAllocations.length > 0) {
      opportunities.push({
        name: 'High ROI Opportunities',
        description: `${highROIAllocations.length} categories show strong ROI potential`,
        value: 'Medium',
        timeframe: '6-12 months'
      });
    }
    
    return opportunities;
  }

  // Template management
  public getTemplate(id: string): ScenarioTemplate | undefined {
    return this.templates.get(id);
  }

  public getAllTemplates(): ScenarioTemplate[] {
    return Array.from(this.templates.values());
  }

  public addTemplate(template: ScenarioTemplate): void {
    this.templates.set(template.id, template);
  }

  // Scenario management
  public getScenario(id: string): SimulationScenario | undefined {
    return this.scenarios.get(id);
  }

  public getAllScenarios(): SimulationScenario[] {
    return Array.from(this.scenarios.values());
  }

  public deleteScenario(id: string): boolean {
    return this.scenarios.delete(id);
  }

  // Comparison management
  public getComparison(id: string): ScenarioComparison | undefined {
    return this.comparisons.get(id);
  }

  public getAllComparisons(): ScenarioComparison[] {
    return Array.from(this.comparisons.values());
  }

  public deleteComparison(id: string): boolean {
    return this.comparisons.delete(id);
  }

  // Configuration management
  public updateConfig(newConfig: Partial<WhatIfConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): WhatIfConfig {
    return { ...this.config };
  }
}

export default WhatIfScenarioModeling;
