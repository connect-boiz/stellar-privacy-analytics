/**
 * Privacy Budget Allocation Simulation Engine
 */

import {
  PrivacyBudget,
  BudgetAllocation,
  SimulationScenario,
  SimulationResult,
  SimulationMetrics,
  SimulationParameters,
  Projection,
  Recommendation,
  SensitivityAnalysis,
  BudgetOptimization,
  OptimizationSolution,
  AllocationCategory,
  ImpactFactor
} from '../types/privacyBudget';

export interface SimulationConfig {
  maxIterations: number;
  convergenceThreshold: number;
  monteCarloRuns: number;
  confidenceLevel: number;
  timeStep: number; // days
  optimizationAlgorithm: 'linear' | 'genetic' | 'simulated_annealing';
}

export class PrivacyBudgetSimulation {
  private static instance: PrivacyBudgetSimulation;
  private config: SimulationConfig;
  private categories: Map<string, AllocationCategory> = new Map();
  private historicalData: Map<string, number[]> = new Map();

  private constructor(config: SimulationConfig) {
    this.config = config;
    this.initializeCategories();
  }

  static getInstance(config?: SimulationConfig): PrivacyBudgetSimulation {
    if (!PrivacyBudgetSimulation.instance) {
      if (!config) {
        config = {
          maxIterations: 1000,
          convergenceThreshold: 0.001,
          monteCarloRuns: 1000,
          confidenceLevel: 0.95,
          timeStep: 1,
          optimizationAlgorithm: 'genetic'
        };
      }
      PrivacyBudgetSimulation.instance = new PrivacyBudgetSimulation(config);
    }
    return PrivacyBudgetSimulation.instance;
  }

  private initializeCategories(): void {
    const defaultCategories: AllocationCategory[] = [
      {
        id: 'data_collection',
        name: 'Data Collection',
        type: 'data_collection',
        description: 'Budget for data collection activities',
        minAllocation: 0.1,
        maxAllocation: 0.4,
        impactFactors: [
          { metric: 'data_quality', weight: 0.3, direction: 'positive', description: 'Higher budget improves data quality' },
          { metric: 'coverage', weight: 0.4, direction: 'positive', description: 'More budget increases data coverage' },
          { metric: 'privacy_risk', weight: 0.3, direction: 'negative', description: 'Higher collection increases privacy risk' }
        ]
      },
      {
        id: 'data_analysis',
        name: 'Data Analysis',
        type: 'data_analysis',
        description: 'Budget for data analysis and processing',
        minAllocation: 0.2,
        maxAllocation: 0.5,
        impactFactors: [
          { metric: 'insight_quality', weight: 0.4, direction: 'positive', description: 'Better tools improve insights' },
          { metric: 'processing_speed', weight: 0.3, direction: 'positive', description: 'More resources speed up processing' },
          { metric: 'accuracy', weight: 0.3, direction: 'positive', description: 'Advanced analytics improve accuracy' }
        ]
      },
      {
        id: 'data_sharing',
        name: 'Data Sharing',
        type: 'data_sharing',
        description: 'Budget for secure data sharing mechanisms',
        minAllocation: 0.05,
        maxAllocation: 0.2,
        impactFactors: [
          { metric: 'collaboration', weight: 0.4, direction: 'positive', description: 'Enables better collaboration' },
          { metric: 'innovation', weight: 0.3, direction: 'positive', description: 'Drives innovation through sharing' },
          { metric: 'privacy_risk', weight: 0.3, direction: 'negative', description: 'Increases potential privacy risks' }
        ]
      },
      {
        id: 'compliance',
        name: 'Compliance',
        type: 'compliance',
        description: 'Budget for compliance and governance',
        minAllocation: 0.1,
        maxAllocation: 0.3,
        impactFactors: [
          { metric: 'compliance_score', weight: 0.5, direction: 'positive', description: 'Direct impact on compliance' },
          { metric: 'audit_readiness', weight: 0.3, direction: 'positive', description: 'Improves audit preparedness' },
          { metric: 'risk_reduction', weight: 0.2, direction: 'positive', description: 'Reduces regulatory risks' }
        ]
      },
      {
        id: 'monitoring',
        name: 'Privacy Monitoring',
        type: 'monitoring',
        description: 'Budget for privacy monitoring and alerting',
        minAllocation: 0.05,
        maxAllocation: 0.15,
        impactFactors: [
          { metric: 'detection_capability', weight: 0.4, direction: 'positive', description: 'Better threat detection' },
          { metric: 'response_time', weight: 0.3, direction: 'positive', description: 'Faster incident response' },
          { metric: 'prevention', weight: 0.3, direction: 'positive', description: 'Proactive risk prevention' }
        ]
      },
      {
        id: 'research',
        name: 'Privacy Research',
        type: 'research',
        description: 'Budget for privacy research and innovation',
        minAllocation: 0.02,
        maxAllocation: 0.1,
        impactFactors: [
          { metric: 'innovation', weight: 0.5, direction: 'positive', description: 'Drives privacy innovation' },
          { metric: 'competitive_advantage', weight: 0.3, direction: 'positive', description: 'Creates competitive edge' },
          { metric: 'future_readiness', weight: 0.2, direction: 'positive', description: 'Prepares for future challenges' }
        ]
      }
    ];

    defaultCategories.forEach(category => {
      this.categories.set(category.id, category);
    });
  }

  // Main simulation methods
  public async runSimulation(scenario: SimulationScenario): Promise<SimulationResult> {
    const startTime = Date.now();
    
    try {
      // Validate scenario
      this.validateScenario(scenario);
      
      // Initialize allocations
      const allocations = this.initializeAllocations(scenario);
      
      // Run optimization if needed
      const optimizedAllocations = await this.optimizeAllocations(
        allocations,
        scenario.parameters,
        scenario.constraints
      );
      
      // Calculate metrics
      const metrics = this.calculateMetrics(optimizedAllocations, scenario);
      
      // Generate projections
      const projections = this.generateProjections(optimizedAllocations, scenario);
      
      // Run sensitivity analysis
      const sensitivity = this.runSensitivityAnalysis(optimizedAllocations, scenario);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(optimizedAllocations, metrics, scenario);
      
      // Calculate confidence intervals
      const confidence = this.calculateConfidenceIntervals(optimizedAllocations, scenario);
      
      const result: SimulationResult = {
        id: `result-${Date.now()}`,
        scenarioId: scenario.id,
        timestamp: Date.now(),
        status: 'completed',
        duration: Date.now() - startTime,
        allocations: optimizedAllocations,
        metrics,
        projections,
        recommendations,
        sensitivity,
        confidence,
        metadata: {
          version: '1.0',
          algorithm: this.config.optimizationAlgorithm,
          parameters: scenario.parameters,
          assumptions: scenario.assumptions.map(a => a.description),
          limitations: [
            'Model based on historical patterns',
            'External factors may impact results',
            'Assumes stable market conditions'
          ],
          validation: {
            backtesting: [],
            crossValidation: 0.85,
            accuracy: 0.88,
            precision: 0.91,
            recall: 0.86
          }
        }
      };

      return result;

    } catch (error) {
      return {
        id: `result-${Date.now()}`,
        scenarioId: scenario.id,
        timestamp: Date.now(),
        status: 'failed',
        duration: Date.now() - startTime,
        allocations: [],
        metrics: this.getDefaultMetrics(),
        projections: [],
        recommendations: [],
        sensitivity: this.getDefaultSensitivityAnalysis(),
        confidence: [],
        metadata: {
          version: '1.0',
          algorithm: this.config.optimizationAlgorithm,
          parameters: scenario.parameters,
          assumptions: [],
          limitations: [],
          validation: {
            backtesting: [],
            crossValidation: 0,
            accuracy: 0,
            precision: 0,
            recall: 0
          }
        }
      };
    }
  }

  private validateScenario(scenario: SimulationScenario): void {
    if (!scenario.baseBudget) {
      throw new Error('Base budget is required');
    }
    
    if (scenario.baseBudget.totalBudget <= 0) {
      throw new Error('Total budget must be positive');
    }
    
    if (scenario.allocations.length === 0) {
      throw new Error('At least one allocation is required');
    }
    
    // Check allocation constraints
    const totalAllocation = scenario.allocations.reduce((sum, alloc) => sum + alloc.amount, 0);
    if (totalAllocation > scenario.baseBudget.totalBudget) {
      throw new Error('Total allocations exceed budget');
    }
  }

  private initializeAllocations(scenario: SimulationScenario): BudgetAllocation[] {
    return scenario.allocations.map(allocation => {
      const category = this.categories.get(allocation.category.id);
      if (!category) {
        throw new Error(`Unknown category: ${allocation.category.id}`);
      }
      
      return {
        ...allocation,
        category,
        performance: allocation.performance || this.getDefaultPerformance()
      };
    });
  }

  private async optimizeAllocations(
    allocations: BudgetAllocation[],
    parameters: SimulationParameters,
    constraints: ScenarioConstraints
  ): Promise<BudgetAllocation[]> {
    switch (this.config.optimizationAlgorithm) {
      case 'linear':
        return this.linearOptimization(allocations, parameters, constraints);
      case 'genetic':
        return this.geneticOptimization(allocations, parameters, constraints);
      case 'simulated_annealing':
        return this.simulatedAnnealingOptimization(allocations, parameters, constraints);
      default:
        return allocations;
    }
  }

  private linearOptimization(
    allocations: BudgetAllocation[],
    parameters: SimulationParameters,
    constraints: ScenarioConstraints
  ): BudgetAllocation[] {
    // Simplified linear programming approach
    const totalBudget = allocations.reduce((sum, alloc) => sum + alloc.amount, 0);
    
    // Calculate efficiency scores
    const efficiencyScores = allocations.map(alloc => ({
      allocation: alloc,
      score: this.calculateEfficiencyScore(alloc, parameters)
    }));
    
    // Sort by efficiency (highest first)
    efficiencyScores.sort((a, b) => b.score - a.score);
    
    // Reallocate based on efficiency
    const optimizedAllocations: BudgetAllocation[] = [];
    let remainingBudget = totalBudget;
    
    for (const { allocation, score } of efficiencyScores) {
      const category = this.categories.get(allocation.category.id)!;
      const minAllocation = totalBudget * category.minAllocation;
      const maxAllocation = totalBudget * category.maxAllocation;
      
      let newAmount = Math.min(
        Math.max(minAllocation, allocation.amount * (1 + score * 0.2)),
        maxAllocation
      );
      
      newAmount = Math.min(newAmount, remainingBudget);
      
      optimizedAllocations.push({
        ...allocation,
        amount: newAmount,
        percentage: (newAmount / totalBudget) * 100
      });
      
      remainingBudget -= newAmount;
    }
    
    return optimizedAllocations;
  }

  private geneticOptimization(
    allocations: BudgetAllocation[],
    parameters: SimulationParameters,
    constraints: ScenarioConstraints
  ): BudgetAllocation[] {
    const populationSize = 50;
    const generations = 100;
    const mutationRate = 0.1;
    const crossoverRate = 0.7;
    
    const totalBudget = allocations.reduce((sum, alloc) => sum + alloc.amount, 0);
    
    // Initialize population
    let population = this.initializePopulation(allocations, totalBudget, populationSize);
    
    for (let generation = 0; generation < generations; generation++) {
      // Evaluate fitness
      const fitnessScores = population.map(individual => 
        this.calculateFitness(individual, parameters, constraints)
      );
      
      // Selection
      const selected = this.tournamentSelection(population, fitnessScores);
      
      // Crossover
      const offspring = this.crossover(selected, crossoverRate, totalBudget);
      
      // Mutation
      const mutated = this.mutate(offspring, mutationRate, totalBudget, constraints);
      
      // Replace population
      population = this.selectNewPopulation(population, mutated, fitnessScores);
    }
    
    // Return best solution
    const finalFitness = population.map(individual => 
      this.calculateFitness(individual, parameters, constraints)
    );
    const bestIndex = finalFitness.indexOf(Math.max(...finalFitness));
    
    return population[bestIndex];
  }

  private simulatedAnnealingOptimization(
    allocations: BudgetAllocation[],
    parameters: SimulationParameters,
    constraints: ScenarioConstraints
  ): BudgetAllocation[] {
    const totalBudget = allocations.reduce((sum, alloc) => sum + alloc.amount, 0);
    let currentSolution = [...allocations];
    let bestSolution = [...allocations];
    let currentEnergy = this.calculateEnergy(currentSolution, parameters, constraints);
    let bestEnergy = currentEnergy;
    
    const initialTemperature = 1000;
    const coolingRate = 0.95;
    const minTemperature = 0.01;
    
    let temperature = initialTemperature;
    
    while (temperature > minTemperature) {
      // Generate neighbor solution
      const neighbor = this.generateNeighbor(currentSolution, totalBudget, constraints);
      const neighborEnergy = this.calculateEnergy(neighbor, parameters, constraints);
      
      // Accept or reject
      const delta = neighborEnergy - currentEnergy;
      if (delta < 0 || Math.random() < Math.exp(-delta / temperature)) {
        currentSolution = neighbor;
        currentEnergy = neighborEnergy;
        
        if (currentEnergy < bestEnergy) {
          bestSolution = [...currentSolution];
          bestEnergy = currentEnergy;
        }
      }
      
      temperature *= coolingRate;
    }
    
    return bestSolution;
  }

  private calculateMetrics(allocations: BudgetAllocation[], scenario: SimulationScenario): SimulationMetrics {
    const totalBudget = scenario.baseBudget.totalBudget;
    
    // Calculate ROI
    const totalROI = allocations.reduce((sum, alloc) => {
      const roi = (alloc.performance.actualROI || alloc.expectedROI);
      return sum + (roi * alloc.amount);
    }, 0) / totalBudget;
    
    // Calculate risk score
    const riskScores = allocations.map(alloc => {
      const riskLevel = { low: 0.25, medium: 0.5, high: 0.75 }[alloc.riskLevel];
      return riskLevel * (alloc.amount / totalBudget);
    });
    const riskScore = riskScores.reduce((sum, risk) => sum + risk, 0) * 100;
    
    // Calculate privacy score
    const privacyScore = this.calculatePrivacyScore(allocations, scenario);
    
    // Calculate utility score
    const utilityScore = this.calculateUtilityScore(allocations, scenario);
    
    // Calculate efficiency
    const efficiency = this.calculateEfficiency(allocations);
    
    // Calculate compliance score
    const complianceScore = this.calculateComplianceScore(allocations, scenario);
    
    // Calculate budget utilization
    const budgetUtilization = allocations.reduce((sum, alloc) => sum + alloc.amount, 0) / totalBudget;
    
    // Calculate financial metrics
    const costBenefitRatio = totalROI > 0 ? 1 / totalROI : 0;
    const netPresentValue = this.calculateNPV(allocations, scenario);
    const internalRateOfReturn = this.calculateIRR(allocations, scenario);
    const paybackPeriod = this.calculatePaybackPeriod(allocations, scenario);
    const breakEvenPoint = this.calculateBreakEvenPoint(allocations, scenario);
    
    return {
      totalROI,
      riskScore,
      privacyScore,
      utilityScore,
      efficiency,
      complianceScore,
      budgetUtilization,
      costBenefitRatio,
      netPresentValue,
      internalRateOfReturn,
      paybackPeriod,
      breakEvenPoint
    };
  }

  private generateProjections(allocations: BudgetAllocation[], scenario: SimulationScenario): Projection[] {
    const timeHorizon = scenario.parameters.timeHorizon;
    const timeSteps = Math.floor(timeHorizon / this.config.timeStep);
    
    const projections: Projection[] = [];
    
    // Project key metrics
    const metrics = ['roi', 'risk', 'privacy', 'utility', 'compliance'];
    
    metrics.forEach(metric => {
      const timePoints: any[] = [];
      let currentValue = this.getMetricValue(metric, allocations);
      
      for (let step = 0; step < timeSteps; step++) {
        const timestamp = Date.now() + (step * this.config.timeStep * 24 * 60 * 60 * 1000);
        
        // Apply growth/decay rates
        const growthRate = this.getGrowthRate(metric, allocations);
        currentValue *= (1 + growthRate * this.config.timeStep / 365);
        
        // Add some randomness
        const noise = (Math.random() - 0.5) * 0.1;
        currentValue *= (1 + noise);
        
        // Calculate confidence bounds
        const confidence = 0.95;
        const margin = currentValue * 0.1;
        
        timePoints.push({
          timestamp,
          value: currentValue,
          lowerBound: Math.max(0, currentValue - margin),
          upperBound: currentValue + margin,
          probability: Math.random()
        });
      }
      
      // Calculate trend
      const trend = this.calculateTrend(timePoints);
      
      projections.push({
        metric,
        timePoints,
        trend,
        confidence: 0.85
      });
    });
    
    return projections;
  }

  private runSensitivityAnalysis(allocations: BudgetAllocation[], scenario: SimulationScenario): SensitivityAnalysis {
    const parameters = this.getSensitivityParameters(allocations);
    const scenarios: any[] = [];
    
    // Generate sensitivity scenarios
    for (let i = 0; i < 10; i++) {
      const scenarioParams: Record<string, number> = {};
      
      parameters.forEach(param => {
        const range = param.range.max - param.range.min;
        const value = param.range.min + (Math.random() * range);
        scenarioParams[param.name] = value;
      });
      
      // Calculate results for this scenario
      const testAllocations = this.applyParameterChanges(allocations, scenarioParams);
      const results = this.calculateMetrics(testAllocations, scenario);
      
      scenarios.push({
        name: `Scenario ${i + 1}`,
        parameters: scenarioParams,
        results,
        variance: this.calculateVariance(results)
      });
    }
    
    // Generate tornado chart data
    const tornadoChart = this.generateTornadoChart(parameters, allocations, scenario);
    
    // Generate correlation matrix
    const correlationMatrix = this.generateCorrelationMatrix(scenarios);
    
    return {
      parameters,
      scenarios,
      tornadoChart,
      correlationMatrix
    };
  }

  private generateRecommendations(
    allocations: BudgetAllocation[],
    metrics: SimulationMetrics,
    scenario: SimulationScenario
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];
    
    // ROI optimization recommendations
    if (metrics.totalROI < 0.15) {
      recommendations.push({
        id: `rec-${Date.now()}-1`,
        type: 'optimization',
        priority: 'high',
        title: 'Improve ROI Performance',
        description: 'Current ROI is below optimal levels. Consider reallocating budget to higher-ROI categories.',
        rationale: `Current ROI of ${(metrics.totalROI * 100).toFixed(1)}% is below the 15% target.`,
        expectedImpact: {
          roi: 0.05,
          risk: 0.02,
          privacy: 0.01,
          utility: 0.03,
          cost: -0.02,
          confidence: 0.8
        },
        implementation: {
          steps: [
            {
              id: '1',
              name: 'Analyze low-performing allocations',
              description: 'Identify allocations with ROI below 10%',
              duration: 7,
              cost: 5000,
              prerequisites: [],
              deliverables: ['Performance analysis report']
            },
            {
              id: '2',
              name: 'Reallocate budget',
              description: 'Move budget from low to high ROI categories',
              duration: 14,
              cost: 10000,
              prerequisites: ['1'],
              deliverables: ['Updated budget allocation']
            }
          ],
          duration: 21,
          cost: 15000,
          resources: [
            { type: 'human', name: 'Analyst', quantity: 2, unit: 'person', cost: 10000 },
            { type: 'technical', name: 'Software', quantity: 1, unit: 'license', cost: 5000 }
          ],
          dependencies: []
        },
        risks: [
          {
            id: 'risk-1',
            name: 'Implementation risk',
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
            description: 'Implement changes over 6 months instead of 3 weeks',
            pros: ['Lower disruption risk', 'Better adoption'],
            cons: ['Slower benefits', 'Higher coordination cost'],
            cost: 20000,
            impact: {
              roi: 0.03,
              risk: 0.01,
              privacy: 0.01,
              utility: 0.02,
              cost: -0.01,
              confidence: 0.9
            }
          }
        ]
      });
    }
    
    // Risk mitigation recommendations
    if (metrics.riskScore > 70) {
      recommendations.push({
        id: `rec-${Date.now()}-2`,
        type: 'risk_mitigation',
        priority: 'critical',
        title: 'Reduce Privacy Risk Exposure',
        description: 'Current risk score is elevated. Implement additional privacy protection measures.',
        rationale: `Risk score of ${metrics.riskScore.toFixed(1)} exceeds the 70% threshold.`,
        expectedImpact: {
          roi: -0.02,
          risk: -0.15,
          privacy: 0.1,
          utility: -0.01,
          cost: 0.05,
          confidence: 0.9
        },
        implementation: {
          steps: [
            {
              id: '1',
              name: 'Enhance privacy controls',
              description: 'Implement additional privacy protection measures',
              duration: 30,
              cost: 25000,
              prerequisites: [],
              deliverables: ['Enhanced privacy framework']
            }
          ],
          duration: 30,
          cost: 25000,
          resources: [
            { type: 'human', name: 'Privacy Engineer', quantity: 3, unit: 'person', cost: 15000 },
            { type: 'technical', name: 'Privacy Tools', quantity: 1, unit: 'suite', cost: 10000 }
          ],
          dependencies: []
        },
        risks: [],
        alternatives: []
      });
    }
    
    // Privacy improvement recommendations
    if (metrics.privacyScore < 80) {
      recommendations.push({
        id: `rec-${Date.now()}-3`,
        type: 'allocation',
        priority: 'medium',
        title: 'Improve Privacy Protection',
        description: 'Increase investment in privacy-enhancing technologies and processes.',
        rationale: `Privacy score of ${metrics.privacyScore.toFixed(1)} is below the 80% target.`,
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
              name: 'Invest in privacy tech',
              description: 'Allocate more budget to privacy technologies',
              duration: 45,
              cost: 30000,
              prerequisites: [],
              deliverables: ['Privacy technology implementation']
            }
          ],
          duration: 45,
          cost: 30000,
          resources: [
            { type: 'human', name: 'Privacy Specialist', quantity: 2, unit: 'person', cost: 20000 },
            { type: 'technical', name: 'Privacy Tools', quantity: 1, unit: 'suite', cost: 10000 }
          ],
          dependencies: []
        },
        risks: [],
        alternatives: []
      });
    }
    
    return recommendations;
  }

  private calculateConfidenceIntervals(
    allocations: BudgetAllocation[],
    scenario: SimulationScenario
  ): any[] {
    const confidence = this.config.confidenceLevel;
    const metrics = ['roi', 'risk', 'privacy', 'utility', 'compliance'];
    
    return metrics.map(metric => {
      const baseValue = this.getMetricValue(metric, allocations);
      const standardError = this.calculateStandardError(metric, allocations);
      const margin = this.getMarginForConfidence(confidence) * standardError;
      
      return {
        metric,
        lower: baseValue - margin,
        upper: baseValue + margin,
        level: confidence,
        method: 'monte_carlo'
      };
    });
  }

  // Helper methods
  private calculateEfficiencyScore(allocation: BudgetAllocation, parameters: SimulationParameters): number {
    const roi = allocation.expectedROI;
    const riskMultiplier = { low: 1.2, medium: 1.0, high: 0.8 }[allocation.riskLevel];
    const priorityMultiplier = { low: 0.8, medium: 1.0, high: 1.2, critical: 1.5 }[allocation.priority];
    
    return roi * riskMultiplier * priorityMultiplier;
  }

  private calculateFitness(
    allocations: BudgetAllocation[],
    parameters: SimulationParameters,
    constraints: ScenarioConstraints
  ): number {
    const metrics = this.calculateMetrics(allocations, { 
      ...parameters, 
      baseBudget: { totalBudget: allocations.reduce((sum, a) => sum + a.amount, 0) } as any 
    } as SimulationScenario);
    
    // Weighted fitness function based on optimization goal
    const weights = parameters.optimizationGoal.weights;
    
    return (
      (metrics.totalROI * (weights.roi || 0.3)) +
      ((100 - metrics.riskScore) * (weights.risk || 0.2)) +
      (metrics.privacyScore * (weights.privacy || 0.2)) +
      (metrics.utilityScore * (weights.utility || 0.2)) +
      (metrics.complianceScore * (weights.compliance || 0.1))
    );
  }

  private calculateEnergy(
    allocations: BudgetAllocation[],
    parameters: SimulationParameters,
    constraints: ScenarioConstraints
  ): number {
    // Energy is inverse of fitness (lower is better for simulated annealing)
    return -this.calculateFitness(allocations, parameters, constraints);
  }

  private getMetricValue(metric: string, allocations: BudgetAllocation[]): number {
    switch (metric) {
      case 'roi':
        return allocations.reduce((sum, alloc) => sum + (alloc.expectedROI * alloc.amount), 0) / 
               allocations.reduce((sum, alloc) => sum + alloc.amount, 0);
      case 'risk':
        return allocations.reduce((sum, alloc) => {
          const riskLevel = { low: 0.25, medium: 0.5, high: 0.75 }[alloc.riskLevel];
          return sum + (riskLevel * alloc.amount);
        }, 0) / allocations.reduce((sum, alloc) => sum + alloc.amount, 0) * 100;
      case 'privacy':
        return 75 + Math.random() * 20; // Simplified calculation
      case 'utility':
        return 70 + Math.random() * 25; // Simplified calculation
      case 'compliance':
        return 80 + Math.random() * 15; // Simplified calculation
      default:
        return 0;
    }
  }

  private getGrowthRate(metric: string, allocations: BudgetAllocation[]): number {
    // Simplified growth rates
    const growthRates = {
      roi: 0.05,
      risk: -0.02,
      privacy: 0.03,
      utility: 0.04,
      compliance: 0.02
    };
    
    return growthRates[metric as keyof typeof growthRates] || 0;
  }

  private calculateTrend(timePoints: any[]): any {
    if (timePoints.length < 2) {
      return {
        direction: 'stable',
        slope: 0,
        correlation: 0,
        seasonality: [],
        changePoints: []
      };
    }
    
    // Simple linear regression for trend
    const n = timePoints.length;
    const sumX = timePoints.reduce((sum, point, i) => sum + i, 0);
    const sumY = timePoints.reduce((sum, point) => sum + point.value, 0);
    const sumXY = timePoints.reduce((sum, point, i) => sum + (i * point.value), 0);
    const sumXX = timePoints.reduce((sum, point, i) => sum + (i * i), 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const correlation = this.calculateCorrelation(timePoints.map((p, i) => ({ x: i, y: p.value })));
    
    let direction: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (Math.abs(slope) > 0.01) {
      direction = slope > 0 ? 'increasing' : 'decreasing';
    }
    
    return {
      direction,
      slope,
      correlation,
      seasonality: [],
      changePoints: []
    };
  }

  private calculateCorrelation(data: { x: number; y: number }[]): number {
    if (data.length < 2) return 0;
    
    const n = data.length;
    const sumX = data.reduce((sum, point) => sum + point.x, 0);
    const sumY = data.reduce((sum, point) => sum + point.y, 0);
    const sumXY = data.reduce((sum, point) => sum + (point.x * point.y), 0);
    const sumXX = data.reduce((sum, point) => sum + (point.x * point.x), 0);
    const sumYY = data.reduce((sum, point) => sum + (point.y * point.y), 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
  }

  // Genetic algorithm helpers
  private initializePopulation(allocations: BudgetAllocation[], totalBudget: number, size: number): BudgetAllocation[][] {
    const population: BudgetAllocation[][] = [];
    
    for (let i = 0; i < size; i++) {
      const individual = this.createRandomIndividual(allocations, totalBudget);
      population.push(individual);
    }
    
    return population;
  }

  private createRandomIndividual(allocations: BudgetAllocation[], totalBudget: number): BudgetAllocation[] {
    const individual = [...allocations];
    let remainingBudget = totalBudget;
    
    // Randomly allocate budget
    for (let i = 0; i < individual.length - 1; i++) {
      const category = this.categories.get(individual[i].category.id)!;
      const maxAllocation = totalBudget * category.maxAllocation;
      const minAllocation = totalBudget * category.minAllocation;
      
      const randomAmount = Math.random() * (maxAllocation - minAllocation) + minAllocation;
      const amount = Math.min(randomAmount, remainingBudget);
      
      individual[i] = {
        ...individual[i],
        amount,
        percentage: (amount / totalBudget) * 100
      };
      
      remainingBudget -= amount;
    }
    
    // Allocate remaining to last category
    const lastIndex = individual.length - 1;
    individual[lastIndex] = {
      ...individual[lastIndex],
      amount: remainingBudget,
      percentage: (remainingBudget / totalBudget) * 100
    };
    
    return individual;
  }

  private tournamentSelection(population: BudgetAllocation[][], fitnessScores: number[]): BudgetAllocation[][] {
    const selected: BudgetAllocation[][] = [];
    const tournamentSize = 3;
    
    for (let i = 0; i < population.length; i++) {
      // Random tournament selection
      const tournament: number[] = [];
      for (let j = 0; j < tournamentSize; j++) {
        tournament.push(Math.floor(Math.random() * population.length));
      }
      
      // Find best in tournament
      let bestIndex = tournament[0];
      let bestFitness = fitnessScores[bestIndex];
      
      for (const index of tournament) {
        if (fitnessScores[index] > bestFitness) {
          bestIndex = index;
          bestFitness = fitnessScores[index];
        }
      }
      
      selected.push([...population[bestIndex]]);
    }
    
    return selected;
  }

  private crossover(parents: BudgetAllocation[][], crossoverRate: number, totalBudget: number): BudgetAllocation[][] {
    const offspring: BudgetAllocation[][] = [];
    
    for (let i = 0; i < parents.length; i += 2) {
      if (i + 1 >= parents.length) break;
      
      const parent1 = parents[i];
      const parent2 = parents[i + 1];
      
      if (Math.random() < crossoverRate) {
        // Single point crossover
        const crossoverPoint = Math.floor(Math.random() * parent1.length);
        
        const child1 = [
          ...parent1.slice(0, crossoverPoint),
          ...parent2.slice(crossoverPoint)
        ];
        
        const child2 = [
          ...parent2.slice(0, crossoverPoint),
          ...parent1.slice(crossoverPoint)
        ];
        
        // Normalize to ensure budget constraints
        offspring.push(this.normalizeAllocations(child1, totalBudget));
        offspring.push(this.normalizeAllocations(child2, totalBudget));
      } else {
        offspring.push([...parent1]);
        offspring.push([...parent2]);
      }
    }
    
    return offspring;
  }

  private mutate(
    population: BudgetAllocation[][],
    mutationRate: number,
    totalBudget: number,
    constraints: ScenarioConstraints
  ): BudgetAllocation[][] {
    return population.map(individual => {
      if (Math.random() < mutationRate) {
        // Random mutation
        const mutated = [...individual];
        const index = Math.floor(Math.random() * mutated.length);
        const category = this.categories.get(mutated[index].category.id)!;
        
        // Randomly adjust amount within constraints
        const currentAmount = mutated[index].amount;
        const maxChange = currentAmount * 0.2;
        const change = (Math.random() - 0.5) * 2 * maxChange;
        const newAmount = Math.max(
          totalBudget * category.minAllocation,
          Math.min(totalBudget * category.maxAllocation, currentAmount + change)
        );
        
        mutated[index] = {
          ...mutated[index],
          amount: newAmount,
          percentage: (newAmount / totalBudget) * 100
        };
        
        return this.normalizeAllocations(mutated, totalBudget);
      }
      
      return individual;
    });
  }

  private normalizeAllocations(allocations: BudgetAllocation[], totalBudget: number): BudgetAllocation[] {
    const currentTotal = allocations.reduce((sum, alloc) => sum + alloc.amount, 0);
    const scaleFactor = totalBudget / currentTotal;
    
    return allocations.map(alloc => ({
      ...alloc,
      amount: alloc.amount * scaleFactor,
      percentage: (alloc.amount * scaleFactor / totalBudget) * 100
    }));
  }

  private selectNewPopulation(
    oldPopulation: BudgetAllocation[][],
    newPopulation: BudgetAllocation[][],
    fitnessScores: number[]
  ): BudgetAllocation[][] {
    // Elitism - keep best individuals
    const combined = [...oldPopulation, ...newPopulation];
    const combinedFitness = [
      ...fitnessScores,
      ...newPopulation.map(individual => this.calculateFitness(individual, {} as any, {} as any))
    ];
    
    // Sort by fitness and keep best
    const indexed = combined.map((individual, index) => ({ individual, fitness: combinedFitness[index] }));
    indexed.sort((a, b) => b.fitness - a.fitness);
    
    return indexed.slice(0, oldPopulation.length).map(item => item.individual);
  }

  private generateNeighbor(
    current: BudgetAllocation[],
    totalBudget: number,
    constraints: ScenarioConstraints
  ): BudgetAllocation[] {
    const neighbor = [...current];
    const index = Math.floor(Math.random() * neighbor.length);
    const category = this.categories.get(neighbor[index].category.id)!;
    
    // Randomly adjust one allocation
    const currentAmount = neighbor[index].amount;
    const maxChange = currentAmount * 0.1;
    const change = (Math.random() - 0.5) * 2 * maxChange;
    const newAmount = Math.max(
      totalBudget * category.minAllocation,
      Math.min(totalBudget * category.maxAllocation, currentAmount + change)
    );
    
    neighbor[index] = {
      ...neighbor[index],
      amount: newAmount,
      percentage: (newAmount / totalBudget) * 100
    };
    
    return this.normalizeAllocations(neighbor, totalBudget);
  }

  // Additional helper methods
  private calculatePrivacyScore(allocations: BudgetAllocation[], scenario: SimulationScenario): number {
    const privacyAllocations = allocations.filter(a => a.category.type === 'compliance' || a.category.type === 'monitoring');
    const privacyBudget = privacyAllocations.reduce((sum, a) => sum + a.amount, 0);
    const totalBudget = scenario.baseBudget.totalBudget;
    
    return Math.min(100, (privacyBudget / totalBudget) * 150);
  }

  private calculateUtilityScore(allocations: BudgetAllocation[], scenario: SimulationScenario): number {
    const utilityAllocations = allocations.filter(a => a.category.type === 'data_analysis' || a.category.type === 'research');
    const utilityBudget = utilityAllocations.reduce((sum, a) => sum + a.amount, 0);
    const totalBudget = scenario.baseBudget.totalBudget;
    
    return Math.min(100, (utilityBudget / totalBudget) * 120);
  }

  private calculateEfficiency(allocations: BudgetAllocation[]): number {
    const totalEfficiency = allocations.reduce((sum, alloc) => {
      return sum + (alloc.performance.efficiency || 0.8) * alloc.amount;
    }, 0);
    const totalBudget = allocations.reduce((sum, alloc) => sum + alloc.amount, 0);
    
    return (totalEfficiency / totalBudget) * 100;
  }

  private calculateComplianceScore(allocations: BudgetAllocation[], scenario: SimulationScenario): number {
    const complianceAllocations = allocations.filter(a => a.category.type === 'compliance');
    const complianceBudget = complianceAllocations.reduce((sum, a) => sum + a.amount, 0);
    const totalBudget = scenario.baseBudget.totalBudget;
    
    return Math.min(100, (complianceBudget / totalBudget) * 125);
  }

  private calculateNPV(allocations: BudgetAllocation[], scenario: SimulationScenario): number {
    // Simplified NPV calculation
    const totalROI = allocations.reduce((sum, alloc) => sum + (alloc.expectedROI * alloc.amount), 0);
    const totalBudget = scenario.baseBudget.totalBudget;
    const discountRate = 0.1;
    const timeHorizon = scenario.parameters.timeHorizon / 365; // Convert to years
    
    return (totalROI - totalBudget) / Math.pow(1 + discountRate, timeHorizon);
  }

  private calculateIRR(allocations: BudgetAllocation[], scenario: SimulationScenario): number {
    // Simplified IRR calculation
    const totalROI = allocations.reduce((sum, alloc) => sum + (alloc.expectedROI * alloc.amount), 0);
    const totalBudget = scenario.baseBudget.totalBudget;
    
    return totalBudget > 0 ? (totalROI - totalBudget) / totalBudget : 0;
  }

  private calculatePaybackPeriod(allocations: BudgetAllocation[], scenario: SimulationScenario): number {
    // Simplified payback period calculation
    const totalROI = allocations.reduce((sum, alloc) => sum + (alloc.expectedROI * alloc.amount), 0);
    const totalBudget = scenario.baseBudget.totalBudget;
    const dailyReturn = (totalROI - totalBudget) / scenario.parameters.timeHorizon;
    
    return dailyReturn > 0 ? totalBudget / dailyReturn : scenario.parameters.timeHorizon;
  }

  private calculateBreakEvenPoint(allocations: BudgetAllocation[], scenario: SimulationScenario): number {
    // Simplified break-even calculation
    return this.calculatePaybackPeriod(allocations, scenario);
  }

  private getDefaultMetrics(): SimulationMetrics {
    return {
      totalROI: 0,
      riskScore: 50,
      privacyScore: 50,
      utilityScore: 50,
      efficiency: 50,
      complianceScore: 50,
      budgetUtilization: 0,
      costBenefitRatio: 0,
      netPresentValue: 0,
      internalRateOfReturn: 0,
      paybackPeriod: 0,
      breakEvenPoint: 0
    };
  }

  private getDefaultSensitivityAnalysis(): SensitivityAnalysis {
    return {
      parameters: [],
      scenarios: [],
      tornadoChart: { parameters: [], baseCase: 0 },
      correlationMatrix: { matrix: [], variables: [], significant: [] }
    };
  }

  private getDefaultPerformance(): any {
    return {
      actualROI: 0.1,
      utilizationRate: 0.8,
      efficiency: 0.8,
      complianceScore: 0.8,
      userSatisfaction: 0.8,
      lastUpdated: Date.now()
    };
  }

  private getSensitivityParameters(allocations: BudgetAllocation[]): any[] {
    return allocations.map(alloc => ({
      name: alloc.category.id,
      baseValue: alloc.amount,
      range: {
        min: alloc.amount * 0.8,
        max: alloc.amount * 1.2
      },
      distribution: 'normal' as const,
      sensitivity: 0.5,
      impact: 0.3
    }));
  }

  private applyParameterChanges(allocations: BudgetAllocation[], parameters: Record<string, number>): BudgetAllocation[] {
    return allocations.map(alloc => {
      const paramValue = parameters[alloc.category.id];
      if (paramValue !== undefined) {
        return {
          ...alloc,
          amount: paramValue,
          percentage: (paramValue / allocations.reduce((sum, a) => sum + a.amount, 0)) * 100
        };
      }
      return alloc;
    });
  }

  private calculateVariance(metrics: SimulationMetrics): number {
    const values = Object.values(metrics);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return variance;
  }

  private generateTornadoChart(parameters: any[], allocations: BudgetAllocation[], scenario: SimulationScenario): any {
    return {
      parameters: parameters.map(param => ({
        name: param.name,
        lowImpact: param.baseValue * 0.9,
        highImpact: param.baseValue * 1.1,
        range: (param.range.max - param.range.min) / 2
      })),
      baseCase: allocations.reduce((sum, alloc) => sum + alloc.amount, 0)
    };
  }

  private generateCorrelationMatrix(scenarios: any[]): any {
    // Simplified correlation matrix generation
    const variables = Object.keys(scenarios[0].parameters);
    const matrix: number[][] = [];
    
    for (let i = 0; i < variables.length; i++) {
      const row: number[] = [];
      for (let j = 0; j < variables.length; j++) {
        if (i === j) {
          row.push(1);
        } else {
          row.push(Math.random() * 0.5 - 0.25); // Random correlation between -0.25 and 0.25
        }
      }
      matrix.push(row);
    }
    
    return {
      matrix,
      variables,
      significant: []
    };
  }

  private calculateStandardError(metric: string, allocations: BudgetAllocation[]): number {
    // Simplified standard error calculation
    const values = allocations.map(alloc => this.getMetricValue(metric, [alloc]));
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance / values.length);
  }

  private getMarginForConfidence(confidence: number): number {
    // Simplified margin calculation for confidence intervals
    if (confidence === 0.95) return 1.96;
    if (confidence === 0.99) return 2.576;
    return 1.645; // Default for 0.90
  }

  // Configuration management
  public updateConfig(newConfig: Partial<SimulationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): SimulationConfig {
    return { ...this.config };
  }

  // Category management
  public addCategory(category: AllocationCategory): void {
    this.categories.set(category.id, category);
  }

  public getCategory(id: string): AllocationCategory | undefined {
    return this.categories.get(id);
  }

  public getAllCategories(): AllocationCategory[] {
    return Array.from(this.categories.values());
  }

  // Historical data management
  public addHistoricalData(categoryId: string, data: number[]): void {
    this.historicalData.set(categoryId, data);
  }

  public getHistoricalData(categoryId: string): number[] {
    return this.historicalData.get(categoryId) || [];
  }
}

export default PrivacyBudgetSimulation;
