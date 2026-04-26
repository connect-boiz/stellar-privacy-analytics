/**
 * Historical Scenario Comparison Service
 */

import {
  SimulationScenario,
  SimulationResult,
  ScenarioComparison,
  ComparisonResult,
  ComparisonInsight,
  BudgetAllocation,
  SimulationMetrics
} from '../types/privacyBudget';

export interface HistoricalComparisonConfig {
  maxHistoricalScenarios: number;
  timeRange: number; // days
  comparisonMetrics: string[];
  trendAnalysisEnabled: boolean;
  patternRecognitionEnabled: boolean;
  benchmarkingEnabled: boolean;
}

export interface HistoricalTrend {
  metric: string;
  dataPoints: TrendDataPoint[];
  trend: TrendAnalysis;
  seasonality: SeasonalityPattern[];
  changePoints: ChangePoint[];
  forecast: ForecastData[];
}

export interface TrendDataPoint {
  timestamp: number;
  value: number;
  scenarioId: string;
  scenarioName: string;
  metadata?: Record<string, any>;
}

export interface TrendAnalysis {
  direction: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  slope: number;
  correlation: number;
  strength: 'weak' | 'moderate' | 'strong';
  volatility: number;
}

export interface SeasonalityPattern {
  period: number; // days
  amplitude: number;
  phase: number;
  confidence: number;
}

export interface ChangePoint {
  timestamp: number;
  scenarioId: string;
  magnitude: number;
  confidence: number;
  description: string;
  type: 'sudden' | 'gradual' | 'cyclical';
}

export interface ForecastData {
  timestamp: number;
  value: number;
  confidence: number;
  upperBound: number;
  lowerBound: number;
}

export interface BenchmarkData {
  metric: string;
  industry: BenchmarkValue[];
  internal: BenchmarkValue[];
  peers: BenchmarkValue[];
  bestPractice: BenchmarkValue;
}

export interface BenchmarkValue {
  value: number;
  percentile: number;
  rank: number;
  source: string;
  timestamp: number;
  context?: Record<string, any>;
}

export interface PatternInsight {
  type: 'recurring' | 'emerging' | 'declining' | 'anomalous';
  description: string;
  frequency: number;
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  recommendations: string[];
  relatedScenarios: string[];
}

export interface PerformanceEvolution {
  scenarioId: string;
  scenarioName: string;
  evolution: EvolutionPoint[];
  overall: EvolutionMetrics;
}

export interface EvolutionPoint {
  timestamp: number;
  version: string;
  metrics: SimulationMetrics;
  changes: MetricChange[];
  improvements: string[];
  regressions: string[];
}

export interface MetricChange {
  metric: string;
  oldValue: number;
  newValue: number;
  changePercent: number;
  significance: 'low' | 'medium' | 'high';
}

export interface EvolutionMetrics {
  improvementRate: number;
  stabilityScore: number;
  adaptabilityScore: number;
  innovationIndex: number;
}

export class HistoricalScenarioComparison {
  private static instance: HistoricalScenarioComparison;
  private config: HistoricalComparisonConfig;
  private historicalScenarios: Map<string, SimulationScenario> = new Map();
  private historicalResults: Map<string, SimulationResult> = new Map();
  private trends: Map<string, HistoricalTrend> = new Map();
  private benchmarks: Map<string, BenchmarkData> = new Map();
  private patterns: Map<string, PatternInsight> = new Map();

  private constructor(config: HistoricalComparisonConfig) {
    this.config = config;
    this.initializeBenchmarks();
  }

  static getInstance(config?: HistoricalComparisonConfig): HistoricalScenarioComparison {
    if (!HistoricalScenarioComparison.instance) {
      if (!config) {
        config = {
          maxHistoricalScenarios: 100,
          timeRange: 365,
          comparisonMetrics: ['totalROI', 'riskScore', 'privacyScore', 'utilityScore', 'efficiency', 'complianceScore'],
          trendAnalysisEnabled: true,
          patternRecognitionEnabled: true,
          benchmarkingEnabled: true
        };
      }
      HistoricalScenarioComparison.instance = new HistoricalScenarioComparison(config);
    }
    return HistoricalScenarioComparison.instance;
  }

  private initializeBenchmarks(): void {
    const benchmarkData: BenchmarkData[] = [
      {
        metric: 'totalROI',
        industry: [
          { value: 0.12, percentile: 50, rank: 5, source: 'industry_survey', timestamp: Date.now() },
          { value: 0.15, percentile: 75, rank: 3, source: 'industry_survey', timestamp: Date.now() },
          { value: 0.18, percentile: 90, rank: 1, source: 'industry_survey', timestamp: Date.now() }
        ],
        internal: [
          { value: 0.10, percentile: 40, rank: 8, source: 'internal_data', timestamp: Date.now() },
          { value: 0.14, percentile: 60, rank: 4, source: 'internal_data', timestamp: Date.now() }
        ],
        peers: [
          { value: 0.13, percentile: 55, rank: 6, source: 'peer_analysis', timestamp: Date.now() },
          { value: 0.16, percentile: 80, rank: 2, source: 'peer_analysis', timestamp: Date.now() }
        ],
        bestPractice: { value: 0.20, percentile: 95, rank: 1, source: 'best_practice', timestamp: Date.now() }
      },
      {
        metric: 'riskScore',
        industry: [
          { value: 45, percentile: 50, rank: 5, source: 'industry_survey', timestamp: Date.now() },
          { value: 35, percentile: 75, rank: 3, source: 'industry_survey', timestamp: Date.now() },
          { value: 25, percentile: 90, rank: 1, source: 'industry_survey', timestamp: Date.now() }
        ],
        internal: [
          { value: 50, percentile: 35, rank: 9, source: 'internal_data', timestamp: Date.now() },
          { value: 40, percentile: 55, rank: 4, source: 'internal_data', timestamp: Date.now() }
        ],
        peers: [
          { value: 42, percentile: 48, rank: 6, source: 'peer_analysis', timestamp: Date.now() },
          { value: 38, percentile: 65, rank: 3, source: 'peer_analysis', timestamp: Date.now() }
        ],
        bestPractice: { value: 20, percentile: 95, rank: 1, source: 'best_practice', timestamp: Date.now() }
      },
      {
        metric: 'privacyScore',
        industry: [
          { value: 75, percentile: 50, rank: 5, source: 'industry_survey', timestamp: Date.now() },
          { value: 85, percentile: 75, rank: 3, source: 'industry_survey', timestamp: Date.now() },
          { value: 92, percentile: 90, rank: 1, source: 'industry_survey', timestamp: Date.now() }
        ],
        internal: [
          { value: 70, percentile: 40, rank: 8, source: 'internal_data', timestamp: Date.now() },
          { value: 80, percentile: 60, rank: 4, source: 'internal_data', timestamp: Date.now() }
        ],
        peers: [
          { value: 78, percentile: 55, rank: 6, source: 'peer_analysis', timestamp: Date.now() },
          { value: 88, percentile: 80, rank: 2, source: 'peer_analysis', timestamp: Date.now() }
        ],
        bestPractice: { value: 95, percentile: 95, rank: 1, source: 'best_practice', timestamp: Date.now() }
      }
    ];

    benchmarkData.forEach(benchmark => {
      this.benchmarks.set(benchmark.metric, benchmark);
    });
  }

  // Main comparison methods
  public async compareWithHistorical(
    currentScenario: SimulationScenario,
    currentResult: SimulationResult,
    comparisonType: 'trend' | 'benchmark' | 'pattern' | 'comprehensive' = 'comprehensive'
  ): Promise<{
    trends: HistoricalTrend[];
    benchmarks: BenchmarkData[];
    patterns: PatternInsight[];
    insights: ComparisonInsight[];
    recommendations: string[];
  }> {
    // Add current scenario to history
    this.addToHistory(currentScenario, currentResult);

    // Generate trend analysis
    const trends = this.config.trendAnalysisEnabled ? 
      await this.analyzeTrends(currentResult) : [];

    // Generate benchmark comparison
    const benchmarks = this.config.benchmarkingEnabled ? 
      this.compareWithBenchmarks(currentResult) : [];

    // Generate pattern insights
    const patterns = this.config.patternRecognitionEnabled ? 
      await this.recognizePatterns(currentResult) : [];

    // Generate comprehensive insights
    const insights = this.generateHistoricalInsights(currentResult, trends, benchmarks, patterns);

    // Generate recommendations
    const recommendations = this.generateHistoricalRecommendations(insights, patterns);

    return {
      trends,
      benchmarks,
      patterns,
      insights,
      recommendations
    };
  }

  public async compareEvolution(
    scenarioId: string,
    timeRange?: number
  ): Promise<PerformanceEvolution> {
    const scenario = this.historicalScenarios.get(scenarioId);
    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioId}`);
    }

    const evolutionPoints = this.getEvolutionPoints(scenarioId, timeRange);
    const evolutionMetrics = this.calculateEvolutionMetrics(evolutionPoints);

    return {
      scenarioId,
      scenarioName: scenario.name,
      evolution: evolutionPoints,
      overall: evolutionMetrics
    };
  }

  public async compareAcrossTime(
    metric: string,
    timeRange: number = this.config.timeRange
  ): Promise<{
    timeline: TimelineData[];
    trends: TrendAnalysis[];
    patterns: PatternInsight[];
    forecasts: ForecastData[];
  }> {
    const timeline = this.generateTimeline(metric, timeRange);
    const trends = this.analyzeTimelineTrends(timeline);
    const patterns = this.recognizeTimelinePatterns(timeline);
    const forecasts = this.generateTimelineForecasts(timeline);

    return {
      timeline,
      trends,
      patterns,
      forecasts
    };
  }

  public async generateComparativeReport(
    scenarioIds: string[],
    reportType: 'executive' | 'technical' | 'detailed' = 'executive'
  ): Promise<{
    summary: ReportSummary;
    comparisons: ScenarioComparison[];
    trends: HistoricalTrend[];
    benchmarks: BenchmarkData[];
    insights: ComparisonInsight[];
    recommendations: ReportRecommendation[];
  }> {
    const scenarios = scenarioIds.map(id => this.historicalScenarios.get(id)).filter(Boolean) as SimulationScenario[];
    const results = scenarioIds.map(id => this.historicalResults.get(id)).filter(Boolean) as SimulationResult[];

    if (scenarios.length === 0 || results.length === 0) {
      throw new Error('No valid scenarios found for comparison');
    }

    // Generate summary
    const summary = this.generateReportSummary(scenarios, results, reportType);

    // Generate comparisons
    const comparisons = await this.generateScenarioComparisons(scenarios, results);

    // Generate trends
    const trends = await this.analyzeComparativeTrends(results);

    // Generate benchmarks
    const benchmarks = this.generateComparativeBenchmarks(results);

    // Generate insights
    const insights = this.generateComparativeInsights(comparisons, trends, benchmarks);

    // Generate recommendations
    const recommendations = this.generateReportRecommendations(insights, reportType);

    return {
      summary,
      comparisons,
      trends,
      benchmarks,
      insights,
      recommendations
    };
  }

  // Historical data management
  public addToHistory(scenario: SimulationScenario, result: SimulationResult): void {
    // Remove oldest scenarios if limit exceeded
    if (this.historicalScenarios.size >= this.config.maxHistoricalScenarios) {
      const oldestKey = this.getOldestScenarioKey();
      this.historicalScenarios.delete(oldestKey);
      this.historicalResults.delete(oldestKey);
    }

    this.historicalScenarios.set(scenario.id, scenario);
    this.historicalResults.set(scenario.id, result);

    // Update trends and patterns
    this.updateTrends(result);
    this.updatePatterns(result);
  }

  public getHistoricalScenarios(timeRange?: number): SimulationScenario[] {
    const cutoffTime = timeRange ? Date.now() - (timeRange * 24 * 60 * 60 * 1000) : 0;
    
    return Array.from(this.historicalScenarios.values())
      .filter(scenario => scenario.createdAt >= cutoffTime)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  public getHistoricalResults(timeRange?: number): SimulationResult[] {
    const cutoffTime = timeRange ? Date.now() - (timeRange * 24 * 60 * 60 * 1000) : 0;
    
    return Array.from(this.historicalResults.values())
      .filter(result => result.timestamp >= cutoffTime)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  // Trend analysis methods
  private async analyzeTrends(currentResult: SimulationResult): Promise<HistoricalTrend[]> {
    const trends: HistoricalTrend[] = [];
    const results = this.getHistoricalResults(this.config.timeRange);

    for (const metric of this.config.comparisonMetrics) {
      const trendData = this.extractTrendData(metric, results);
      const trendAnalysis = this.calculateTrendAnalysis(trendData);
      const seasonality = this.detectSeasonality(trendData);
      const changePoints = this.detectChangePoints(trendData);
      const forecast = this.generateForecast(trendData);

      trends.push({
        metric,
        dataPoints: trendData,
        trend: trendAnalysis,
        seasonality,
        changePoints,
        forecast
      });
    }

    return trends;
  }

  private extractTrendData(metric: string, results: SimulationResult[]): TrendDataPoint[] {
    return results.map(result => {
      const value = (result.metrics as any)[metric];
      return {
        timestamp: result.timestamp,
        value: value || 0,
        scenarioId: result.scenarioId,
        scenarioName: this.historicalScenarios.get(result.scenarioId)?.name || 'Unknown',
        metadata: {
          status: result.status,
          duration: result.duration
        }
      };
    }).sort((a, b) => a.timestamp - b.timestamp);
  }

  private calculateTrendAnalysis(dataPoints: TrendDataPoint[]): TrendAnalysis {
    if (dataPoints.length < 2) {
      return {
        direction: 'stable',
        slope: 0,
        correlation: 0,
        strength: 'weak',
        volatility: 0
      };
    }

    // Calculate linear regression
    const n = dataPoints.length;
    const x = dataPoints.map((_, i) => i);
    const y = dataPoints.map(p => p.value);

    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + (val * y[i]), 0);
    const sumXX = x.reduce((sum, val) => sum + (val * val), 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const correlation = this.calculateCorrelation(x, y);

    // Determine direction and strength
    let direction: TrendAnalysis['direction'] = 'stable';
    if (Math.abs(slope) > 0.01) {
      direction = slope > 0 ? 'increasing' : 'decreasing';
    }

    // Check for volatility
    const mean = sumY / n;
    const variance = y.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    const volatility = Math.sqrt(variance) / mean;

    // Determine strength
    let strength: TrendAnalysis['strength'] = 'weak';
    if (Math.abs(correlation) > 0.7) strength = 'strong';
    else if (Math.abs(correlation) > 0.4) strength = 'moderate';

    return {
      direction,
      slope,
      correlation,
      strength,
      volatility
    };
  }

  private calculateCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n < 2) return 0;

    const meanX = x.reduce((sum, val) => sum + val, 0) / n;
    const meanY = y.reduce((sum, val) => sum + val, 0) / n;

    let numerator = 0;
    let sumXSquared = 0;
    let sumYSquared = 0;

    for (let i = 0; i < n; i++) {
      const xDiff = x[i] - meanX;
      const yDiff = y[i] - meanY;
      numerator += xDiff * yDiff;
      sumXSquared += xDiff * xDiff;
      sumYSquared += yDiff * yDiff;
    }

    const denominator = Math.sqrt(sumXSquared * sumYSquared);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  private detectSeasonality(dataPoints: TrendDataPoint[]): SeasonalityPattern[] {
    const patterns: SeasonalityPattern[] = [];
    
    if (dataPoints.length < 12) return patterns; // Need at least 12 points for seasonality

    // Check for weekly patterns (7 days)
    const weeklyPattern = this.checkPeriodPattern(dataPoints, 7);
    if (weeklyPattern.confidence > 0.6) {
      patterns.push(weeklyPattern);
    }

    // Check for monthly patterns (30 days)
    const monthlyPattern = this.checkPeriodPattern(dataPoints, 30);
    if (monthlyPattern.confidence > 0.6) {
      patterns.push(monthlyPattern);
    }

    return patterns;
  }

  private checkPeriodPattern(dataPoints: TrendDataPoint[], period: number): SeasonalityPattern {
    const values = dataPoints.map(p => p.value);
    const n = values.length;

    if (n < period * 2) {
      return { period, amplitude: 0, phase: 0, confidence: 0 };
    }

    // Simple autocorrelation for seasonality detection
    let maxCorrelation = 0;
    let bestPhase = 0;

    for (let phase = 0; phase < period; phase++) {
      const correlation = this.calculateAutocorrelation(values, period, phase);
      if (correlation > maxCorrelation) {
        maxCorrelation = correlation;
        bestPhase = phase;
      }
    }

    // Calculate amplitude
    const amplitude = this.calculateAmplitude(values, period, bestPhase);

    return {
      period,
      amplitude,
      phase: bestPhase,
      confidence: maxCorrelation
    };
  }

  private calculateAutocorrelation(values: number[], period: number, phase: number): number {
    const n = values.length;
    if (n < period + phase) return 0;

    let numerator = 0;
    let denominator = 0;

    for (let i = phase; i < n - period; i++) {
      numerator += values[i] * values[i + period];
      denominator += values[i] * values[i];
    }

    return denominator === 0 ? 0 : numerator / denominator;
  }

  private calculateAmplitude(values: number[], period: number, phase: number): number {
    const n = values.length;
    if (n < period + phase) return 0;

    const periodicValues: number[] = [];
    for (let i = phase; i < n; i += period) {
      if (i < n) {
        periodicValues.push(values[i]);
      }
    }

    if (periodicValues.length < 2) return 0;

    const mean = periodicValues.reduce((sum, val) => sum + val, 0) / periodicValues.length;
    const variance = periodicValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / periodicValues.length;
    
    return Math.sqrt(variance);
  }

  private detectChangePoints(dataPoints: TrendDataPoint[]): ChangePoint[] {
    const changePoints: ChangePoint[] = [];
    
    if (dataPoints.length < 5) return changePoints;

    const values = dataPoints.map(p => p.value);
    const timestamps = dataPoints.map(p => p.timestamp);
    const scenarioIds = dataPoints.map(p => p.scenarioId);

    // Simple change point detection using moving average
    const windowSize = Math.max(3, Math.floor(dataPoints.length / 10));
    
    for (let i = windowSize; i < values.length - windowSize; i++) {
      const beforeWindow = values.slice(i - windowSize, i);
      const afterWindow = values.slice(i, i + windowSize);
      
      const beforeMean = beforeWindow.reduce((sum, val) => sum + val, 0) / beforeWindow.length;
      const afterMean = afterWindow.reduce((sum, val) => sum + val, 0) / afterWindow.length;
      
      const change = Math.abs(afterMean - beforeMean);
      const threshold = this.calculateChangeThreshold(values, i);
      
      if (change > threshold) {
        changePoints.push({
          timestamp: timestamps[i],
          scenarioId: scenarioIds[i],
          magnitude: change,
          confidence: Math.min(0.9, change / threshold),
          description: `Significant change detected at ${new Date(timestamps[i]).toLocaleDateString()}`,
          type: change > threshold * 2 ? 'sudden' : 'gradual'
        });
      }
    }

    return changePoints;
  }

  private calculateChangeThreshold(values: number[], index: number): number {
    const windowSize = Math.max(3, Math.floor(values.length / 10));
    const start = Math.max(0, index - windowSize);
    const end = Math.min(values.length, index + windowSize);
    
    const windowValues = values.slice(start, end);
    const mean = windowValues.reduce((sum, val) => sum + val, 0) / windowValues.length;
    const variance = windowValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / windowValues.length;
    
    return Math.sqrt(variance) * 2; // 2 standard deviations
  }

  private generateForecast(dataPoints: TrendDataPoint[]): ForecastData[] {
    const forecasts: ForecastData[] = [];
    
    if (dataPoints.length < 3) return forecasts;

    const values = dataPoints.map(p => p.value);
    const timestamps = dataPoints.map(p => p.timestamp);
    
    // Simple linear regression forecast
    const n = values.length;
    const x = dataPoints.map((_, i) => i);
    const y = values;

    const { slope, intercept } = this.calculateLinearRegression(x, y);
    
    // Generate 12 future points
    const lastTimestamp = timestamps[timestamps.length - 1];
    const timeInterval = timestamps.length > 1 ? 
      (timestamps[timestamps.length - 1] - timestamps[timestamps.length - 2]) : 
      24 * 60 * 60 * 1000; // 1 day default

    for (let i = 1; i <= 12; i++) {
      const futureX = n + i - 1;
      const futureValue = slope * futureX + intercept;
      const futureTimestamp = lastTimestamp + (i * timeInterval);
      
      // Calculate confidence bounds
      const variance = this.calculateForecastVariance(values, slope, intercept);
      const margin = Math.sqrt(variance) * 1.96; // 95% confidence
      const confidence = Math.max(0.1, 1 - (variance / Math.pow(futureValue, 2)));
      
      forecasts.push({
        timestamp: futureTimestamp,
        value: Math.max(0, futureValue),
        confidence,
        upperBound: Math.max(0, futureValue + margin),
        lowerBound: Math.max(0, futureValue - margin)
      });
    }

    return forecasts;
  }

  private calculateLinearRegression(x: number[], y: number[]): { slope: number; intercept: number } {
    const n = x.length;
    if (n < 2) return { slope: 0, intercept: 0 };

    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + (val * y[i]), 0);
    const sumXX = x.reduce((sum, val) => sum + (val * val), 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  }

  private calculateForecastVariance(values: number[], slope: number, intercept: number): number {
    const n = values.length;
    if (n < 3) return 1;

    let sumSquaredErrors = 0;
    for (let i = 0; i < n; i++) {
      const predicted = slope * i + intercept;
      const error = values[i] - predicted;
      sumSquaredErrors += error * error;
    }

    return sumSquaredErrors / (n - 2);
  }

  // Benchmark comparison methods
  private compareWithBenchmarks(currentResult: SimulationResult): BenchmarkData[] {
    const benchmarks: BenchmarkData[] = [];

    for (const metric of this.config.comparisonMetrics) {
      const currentValue = (currentResult.metrics as any)[metric];
      const benchmarkData = this.benchmarks.get(metric);

      if (benchmarkData && currentValue !== undefined) {
        benchmarks.push({
          ...benchmarkData,
          currentValue,
          currentPercentile: this.calculatePercentile(currentValue, benchmarkData),
          currentRank: this.calculateRank(currentValue, benchmarkData)
        });
      }
    }

    return benchmarks;
  }

  private calculatePercentile(value: number, benchmark: BenchmarkData): number {
    const allValues = [
      ...benchmark.industry.map(b => b.value),
      ...benchmark.internal.map(b => b.value),
      ...benchmark.peers.map(b => b.value),
      value
    ].sort((a, b) => a - b);

    const index = allValues.indexOf(value);
    return (index / (allValues.length - 1)) * 100;
  }

  private calculateRank(value: number, benchmark: BenchmarkData): number {
    const allValues = [
      ...benchmark.industry.map(b => b.value),
      ...benchmark.internal.map(b => b.value),
      ...benchmark.peers.map(b => b.value),
      value
    ].sort((a, b) => b - a);

    return allValues.indexOf(value) + 1;
  }

  // Pattern recognition methods
  private async recognizePatterns(currentResult: SimulationResult): Promise<PatternInsight[]> {
    const patterns: PatternInsight[] = [];
    const results = this.getHistoricalResults(this.config.timeRange);

    // Analyze recurring patterns
    const recurringPatterns = this.analyzeRecurringPatterns(results);
    patterns.push(...recurringPatterns);

    // Analyze emerging patterns
    const emergingPatterns = this.analyzeEmergingPatterns(results, currentResult);
    patterns.push(...emergingPatterns);

    // Analyze declining patterns
    const decliningPatterns = this.analyzeDecliningPatterns(results);
    patterns.push(...decliningPatterns);

    // Analyze anomalous patterns
    const anomalousPatterns = this.analyzeAnomalousPatterns(results, currentResult);
    patterns.push(...anomalousPatterns);

    return patterns;
  }

  private analyzeRecurringPatterns(results: SimulationResult[]): PatternInsight[] {
    const patterns: PatternInsight[] = [];
    
    // Look for patterns that repeat across multiple scenarios
    const patternFrequency = new Map<string, number>();
    const patternScenarios = new Map<string, string[]>();

    results.forEach(result => {
      const scenarioPatterns = this.extractScenarioPatterns(result);
      scenarioPatterns.forEach(pattern => {
        const key = `${pattern.type}-${pattern.description}`;
        patternFrequency.set(key, (patternFrequency.get(key) || 0) + 1);
        
        if (!patternScenarios.has(key)) {
          patternScenarios.set(key, []);
        }
        patternScenarios.get(key)!.push(result.scenarioId);
      });
    });

    // Identify recurring patterns (frequency >= 3)
    patternFrequency.forEach((frequency, key) => {
      if (frequency >= 3) {
        const [type, description] = key.split('-');
        const relatedScenarios = patternScenarios.get(key) || [];
        
        patterns.push({
          type: 'recurring',
          description,
          frequency,
          confidence: Math.min(0.9, frequency / results.length),
          impact: this.calculatePatternImpact(type, frequency),
          recommendations: this.generatePatternRecommendations(type, description),
          relatedScenarios
        });
      }
    });

    return patterns;
  }

  private analyzeEmergingPatterns(results: SimulationResult[], currentResult: SimulationResult): PatternInsight[] {
    const patterns: PatternInsight[] = [];
    
    // Look for patterns that are increasing in frequency
    const recentResults = results.slice(-10); // Last 10 results
    const olderResults = results.slice(-20, -10); // Previous 10 results

    const recentPatterns = this.extractPatternsFromResults(recentResults);
    const olderPatterns = this.extractPatternsFromResults(olderResults);

    const patternGrowth = new Map<string, number>();
    
    recentPatterns.forEach(pattern => {
      const key = `${pattern.type}-${pattern.description}`;
      const recentCount = this.countPatternOccurrences(key, recentResults);
      const olderCount = this.countPatternOccurrences(key, olderResults);
      
      if (recentCount > olderCount) {
        const growthRate = (recentCount - olderCount) / Math.max(olderCount, 1);
        patternGrowth.set(key, growthRate);
      }
    });

    // Identify emerging patterns (growth rate > 0.5)
    patternGrowth.forEach((growthRate, key) => {
      if (growthRate > 0.5) {
        const [type, description] = key.split('-');
        const recentCount = this.countPatternOccurrences(key, recentResults);
        
        patterns.push({
          type: 'emerging',
          description,
          frequency: recentCount,
          confidence: Math.min(0.8, growthRate),
          impact: this.calculatePatternImpact(type, recentCount),
          recommendations: this.generatePatternRecommendations(type, description),
          relatedScenarios: recentResults.map(r => r.scenarioId)
        });
      }
    });

    return patterns;
  }

  private analyzeDecliningPatterns(results: SimulationResult[]): PatternInsight[] {
    const patterns: PatternInsight[] = [];
    
    // Look for patterns that are decreasing in frequency
    const recentResults = results.slice(-10);
    const olderResults = results.slice(-20, -10);

    const recentPatterns = this.extractPatternsFromResults(recentResults);
    const olderPatterns = this.extractPatternsFromResults(olderResults);

    const patternDecline = new Map<string, number>();
    
    olderPatterns.forEach(pattern => {
      const key = `${pattern.type}-${pattern.description}`;
      const recentCount = this.countPatternOccurrences(key, recentResults);
      const olderCount = this.countPatternOccurrences(key, olderResults);
      
      if (recentCount < olderCount) {
        const declineRate = (olderCount - recentCount) / Math.max(olderCount, 1);
        patternDecline.set(key, declineRate);
      }
    });

    // Identify declining patterns (decline rate > 0.5)
    patternDecline.forEach((declineRate, key) => {
      if (declineRate > 0.5) {
        const [type, description] = key.split('-');
        const olderCount = this.countPatternOccurrences(key, olderResults);
        
        patterns.push({
          type: 'declining',
          description,
          frequency: olderCount,
          confidence: Math.min(0.8, declineRate),
          impact: this.calculatePatternImpact(type, olderCount),
          recommendations: this.generatePatternRecommendations(type, description),
          relatedScenarios: olderResults.map(r => r.scenarioId)
        });
      }
    });

    return patterns;
  }

  private analyzeAnomalousPatterns(results: SimulationResult[], currentResult: SimulationResult): PatternInsight[] {
    const patterns: PatternInsight[] = [];
    
    // Look for patterns in current result that don't match historical patterns
    const currentPatterns = this.extractScenarioPatterns(currentResult);
    const historicalPatterns = this.extractPatternsFromResults(results.slice(0, -1)); // Exclude current

    currentPatterns.forEach(currentPattern => {
      const key = `${currentPattern.type}-${currentPattern.description}`;
      const historicalFrequency = this.countPatternOccurrences(key, historicalResults);
      
      // If pattern is new or very rare, it's anomalous
      if (historicalFrequency < 2) {
        patterns.push({
          type: 'anomalous',
          description: currentPattern.description,
          frequency: 1,
          confidence: 0.7,
          impact: 'high',
          recommendations: [
            'Investigate this unusual pattern',
            'Monitor for recurrence',
            'Consider if it represents a new trend or an anomaly'
          ],
          relatedScenarios: [currentResult.scenarioId]
        });
      }
    });

    return patterns;
  }

  private extractScenarioPatterns(result: SimulationResult): Array<{ type: string; description: string }> {
    const patterns: Array<{ type: string; description: string }> = [];
    
    // Extract patterns based on metrics
    const metrics = result.metrics;
    
    if (metrics.totalROI > 0.2) {
      patterns.push({ type: 'high_roi', description: 'Very high ROI achieved' });
    }
    
    if (metrics.riskScore > 80) {
      patterns.push({ type: 'high_risk', description: 'Elevated risk levels' });
    }
    
    if (metrics.privacyScore > 90) {
      patterns.push({ type: 'high_privacy', description: 'Excellent privacy protection' });
    }
    
    if (metrics.efficiency > 85) {
      patterns.push({ type: 'high_efficiency', description: 'High operational efficiency' });
    }
    
    return patterns;
  }

  private extractPatternsFromResults(results: SimulationResult[]): Array<{ type: string; description: string }> {
    const allPatterns: Array<{ type: string; description: string }> = [];
    
    results.forEach(result => {
      const patterns = this.extractScenarioPatterns(result);
      allPatterns.push(...patterns);
    });
    
    return allPatterns;
  }

  private countPatternOccurrences(key: string, results: SimulationResult[]): number {
    let count = 0;
    const [type, description] = key.split('-');
    
    results.forEach(result => {
      const patterns = this.extractScenarioPatterns(result);
      if (patterns.some(p => p.type === type && p.description === description)) {
        count++;
      }
    });
    
    return count;
  }

  private calculatePatternImpact(type: string, frequency: number): 'low' | 'medium' | 'high' {
    if (type === 'high_risk') return 'high';
    if (type === 'anomalous') return 'high';
    if (frequency > 5) return 'high';
    if (frequency > 3) return 'medium';
    return 'low';
  }

  private generatePatternRecommendations(type: string, description: string): string[] {
    const recommendations: string[] = [];
    
    switch (type) {
      case 'high_roi':
        recommendations.push('Analyze factors contributing to high ROI', 'Consider scaling successful approaches');
        break;
      case 'high_risk':
        recommendations.push('Implement risk mitigation measures', 'Review privacy controls');
        break;
      case 'high_privacy':
        recommendations.push('Document best practices', 'Share successful privacy strategies');
        break;
      case 'high_efficiency':
        recommendations.push('Standardize efficient processes', 'Train team on best practices');
        break;
      default:
        recommendations.push('Monitor pattern evolution', 'Consider impact on planning');
    }
    
    return recommendations;
  }

  // Insight generation methods
  private generateHistoricalInsights(
    currentResult: SimulationResult,
    trends: HistoricalTrend[],
    benchmarks: BenchmarkData[],
    patterns: PatternInsight[]
  ): ComparisonInsight[] {
    const insights: ComparisonInsight[] = [];

    // Generate trend insights
    trends.forEach(trend => {
      if (trend.trend.strength === 'strong') {
        insights.push({
          type: 'trend',
          description: `Strong ${trend.trend.direction} trend detected in ${trend.metric}`,
          scenarios: [],
          impact: `${trend.trend.direction === 'increasing' ? 'Positive' : 'Negative'} impact on ${trend.metric}`,
          recommendation: `Consider ${trend.trend.direction === 'increasing' ? 'leveraging' : 'addressing'} this trend in future planning`
        });
      }
    });

    // Generate benchmark insights
    benchmarks.forEach(benchmark => {
      if (benchmark.currentPercentile > 80) {
        insights.push({
          type: 'best_practice',
          description: `Outstanding performance in ${benchmark.metric} (${benchmark.currentPercentile.toFixed(1)}th percentile)`,
          scenarios: [],
          impact: 'Competitive advantage',
          recommendation: 'Document and share best practices for this metric'
        });
      } else if (benchmark.currentPercentile < 20) {
        insights.push({
          type: 'opportunity',
          description: `Significant improvement opportunity in ${benchmark.metric} (${benchmark.currentPercentile.toFixed(1)}th percentile)`,
          scenarios: [],
          impact: 'Performance gap',
          recommendation: 'Focus improvement efforts on this metric'
        });
      }
    });

    // Generate pattern insights
    patterns.forEach(pattern => {
      if (pattern.type === 'emerging') {
        insights.push({
          type: 'opportunity',
          description: `Emerging pattern: ${pattern.description}`,
          scenarios: pattern.relatedScenarios,
          impact: 'New trend identified',
          recommendation: 'Monitor and prepare for potential scaling'
        });
      } else if (pattern.type === 'anomalous') {
        insights.push({
          type: 'risk',
          description: `Anomalous pattern: ${pattern.description}`,
          scenarios: pattern.relatedScenarios,
          impact: 'Unusual behavior detected',
          recommendation: 'Investigate root cause and monitor for recurrence'
        });
      }
    });

    return insights;
  }

  private generateHistoricalRecommendations(insights: ComparisonInsight[], patterns: PatternInsight[]): string[] {
    const recommendations: string[] = [];

    // Generate recommendations based on insights
    insights.forEach(insight => {
      recommendations.push(insight.recommendation);
    });

    // Generate recommendations based on patterns
    patterns.forEach(pattern => {
      recommendations.push(...pattern.recommendations);
    });

    // Remove duplicates and return
    return [...new Set(recommendations)];
  }

  // Evolution analysis methods
  private getEvolutionPoints(scenarioId: string, timeRange?: number): EvolutionPoint[] {
    const cutoffTime = timeRange ? Date.now() - (timeRange * 24 * 60 * 60 * 1000) : 0;
    
    // This would typically fetch historical versions of the scenario
    // For now, return a mock evolution
    return [
      {
        timestamp: Date.now() - 30 * 24 * 60 * 60 * 1000,
        version: '1.0',
        metrics: this.generateMockMetrics(),
        changes: [],
        improvements: ['Initial baseline established'],
        regressions: []
      },
      {
        timestamp: Date.now() - 15 * 24 * 60 * 60 * 1000,
        version: '2.0',
        metrics: this.generateMockMetrics(),
        changes: [
          { metric: 'totalROI', oldValue: 0.12, newValue: 0.15, changePercent: 25, significance: 'medium' }
        ],
        improvements: ['ROI increased by 25%'],
        regressions: []
      },
      {
        timestamp: Date.now(),
        version: '3.0',
        metrics: this.generateMockMetrics(),
        changes: [
          { metric: 'riskScore', oldValue: 50, newValue: 40, changePercent: -20, significance: 'medium' }
        ],
        improvements: ['Risk reduced by 20%'],
        regressions: []
      }
    ];
  }

  private calculateEvolutionMetrics(evolutionPoints: EvolutionPoint[]): EvolutionMetrics {
    if (evolutionPoints.length < 2) {
      return {
        improvementRate: 0,
        stabilityScore: 0.5,
        adaptabilityScore: 0.5,
        innovationIndex: 0.5
      };
    }

    // Calculate improvement rate
    const improvements = evolutionPoints.reduce((sum, point) => sum + point.improvements.length, 0);
    const regressions = evolutionPoints.reduce((sum, point) => sum + point.regressions.length, 0);
    const improvementRate = (improvements - regressions) / evolutionPoints.length;

    // Calculate stability (inverse of volatility)
    const metrics = evolutionPoints.map(point => point.metrics.totalROI);
    const mean = metrics.reduce((sum, val) => sum + val, 0) / metrics.length;
    const variance = metrics.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / metrics.length;
    const stabilityScore = Math.max(0, 1 - (Math.sqrt(variance) / mean));

    // Calculate adaptability (based on number of changes)
    const totalChanges = evolutionPoints.reduce((sum, point) => sum + point.changes.length, 0);
    const adaptabilityScore = Math.min(1, totalChanges / evolutionPoints.length);

    // Calculate innovation index (based on significant changes)
    const significantChanges = evolutionPoints.reduce((sum, point) => 
      sum + point.changes.filter(c => c.significance === 'high').length, 0);
    const innovationIndex = Math.min(1, significantChanges / evolutionPoints.length);

    return {
      improvementRate,
      stabilityScore,
      adaptabilityScore,
      innovationIndex
    };
  }

  // Timeline analysis methods
  private generateTimeline(metric: string, timeRange: number): TimelineData[] {
    const results = this.getHistoricalResults(timeRange);
    
    return results.map(result => ({
      timestamp: result.timestamp,
      scenarioId: result.scenarioId,
      scenarioName: this.historicalScenarios.get(result.scenarioId)?.name || 'Unknown',
      value: (result.metrics as any)[metric] || 0,
      status: result.status
    }));
  }

  private analyzeTimelineTrends(timeline: TimelineData[]): TrendAnalysis[] {
    // This would analyze trends across the timeline
    // For now, return a single trend analysis
    const values = timeline.map(t => t.value);
    const trend = this.calculateTrendAnalysis(
      timeline.map(t => ({
        timestamp: t.timestamp,
        value: t.value,
        scenarioId: t.scenarioId,
        scenarioName: t.scenarioName
      }))
    );

    return [trend];
  }

  private recognizeTimelinePatterns(timeline: TimelineData[]): PatternInsight[] {
    // This would recognize patterns in the timeline
    // For now, return empty array
    return [];
  }

  private generateTimelineForecasts(timeline: TimelineData[]): ForecastData[] {
    // This would generate forecasts based on timeline data
    // For now, return empty array
    return [];
  }

  // Report generation methods
  private generateReportSummary(
    scenarios: SimulationScenario[],
    results: SimulationResult[],
    reportType: string
  ): ReportSummary {
    const totalScenarios = scenarios.length;
    const completedResults = results.filter(r => r.status === 'completed').length;
    const averageROI = results.reduce((sum, r) => sum + r.metrics.totalROI, 0) / results.length;
    const averageRisk = results.reduce((sum, r) => sum + r.metrics.riskScore, 0) / results.length;

    return {
      reportType,
      totalScenarios,
      completedResults,
      averageROI,
      averageRisk,
      generatedAt: Date.now(),
      timeRange: this.config.timeRange
    };
  }

  private async generateScenarioComparisons(
    scenarios: SimulationScenario[],
    results: SimulationResult[]
  ): Promise<ScenarioComparison[]> {
    const comparisons: ScenarioComparison[] = [];

    // Generate pairwise comparisons
    for (let i = 0; i < scenarios.length; i++) {
      for (let j = i + 1; j < scenarios.length; j++) {
        const comparison = await this.compareScenarios(
          [scenarios[i].id, scenarios[j].id],
          'side_by_side'
        );
        comparisons.push(comparison);
      }
    }

    return comparisons;
  }

  private async analyzeComparativeTrends(results: SimulationResult[]): Promise<HistoricalTrend[]> {
    // This would analyze trends across multiple results
    // For now, return empty array
    return [];
  }

  private generateComparativeBenchmarks(results: SimulationResult[]): BenchmarkData[] {
    // This would generate benchmarks for comparison
    // For now, return empty array
    return [];
  }

  private generateComparativeInsights(
    comparisons: ScenarioComparison[],
    trends: HistoricalTrend[],
    benchmarks: BenchmarkData[]
  ): ComparisonInsight[] {
    // This would generate insights from comparisons
    // For now, return empty array
    return [];
  }

  private generateReportRecommendations(
    insights: ComparisonInsight[],
    reportType: string
  ): ReportRecommendation[] {
    // This would generate recommendations based on insights and report type
    // For now, return empty array
    return [];
  }

  // Utility methods
  private getOldestScenarioKey(): string {
    let oldestKey = '';
    let oldestTime = Date.now();

    this.historicalScenarios.forEach((scenario, key) => {
      if (scenario.createdAt < oldestTime) {
        oldestTime = scenario.createdAt;
        oldestKey = key;
      }
    });

    return oldestKey;
  }

  private updateTrends(result: SimulationResult): void {
    // Update trend analysis with new result
    // This would recalculate trends with the new data point
  }

  private updatePatterns(result: SimulationResult): void {
    // Update pattern recognition with new result
    // This would reanalyze patterns with the new data point
  }

  private generateMockMetrics(): SimulationMetrics {
    return {
      totalROI: 0.12 + Math.random() * 0.08,
      riskScore: 40 + Math.random() * 30,
      privacyScore: 70 + Math.random() * 20,
      utilityScore: 65 + Math.random() * 25,
      efficiency: 60 + Math.random() * 30,
      complianceScore: 75 + Math.random() * 20,
      budgetUtilization: 0.8 + Math.random() * 0.15,
      costBenefitRatio: 1.1 + Math.random() * 0.3,
      netPresentValue: 100000 + Math.random() * 50000,
      internalRateOfReturn: 0.15 + Math.random() * 0.1,
      paybackPeriod: 180 + Math.random() * 60,
      breakEvenPoint: 165 + Math.random() * 45
    };
  }

  // Configuration management
  public updateConfig(newConfig: Partial<HistoricalComparisonConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): HistoricalComparisonConfig {
    return { ...this.config };
  }

  // Data access methods
  public getTrends(metric?: string): HistoricalTrend[] {
    if (metric) {
      return this.trends.has(metric) ? [this.trends.get(metric)!] : [];
    }
    return Array.from(this.trends.values());
  }

  public getPatterns(type?: string): PatternInsight[] {
    const patterns = Array.from(this.patterns.values());
    if (type) {
      return patterns.filter(p => p.type === type);
    }
    return patterns;
  }

  public getBenchmarks(metric?: string): BenchmarkData[] {
    if (metric) {
      return this.benchmarks.has(metric) ? [this.benchmarks.get(metric)!] : [];
    }
    return Array.from(this.benchmarks.values());
  }

  public clearHistory(): void {
    this.historicalScenarios.clear();
    this.historicalResults.clear();
    this.trends.clear();
    this.patterns.clear();
  }
}

// Additional interfaces for the service
interface ReportSummary {
  reportType: string;
  totalScenarios: number;
  completedResults: number;
  averageROI: number;
  averageRisk: number;
  generatedAt: number;
  timeRange: number;
}

interface ReportRecommendation {
  id: string;
  type: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  impact: string;
  effort: string;
  timeline: string;
}

interface TimelineData {
  timestamp: number;
  scenarioId: string;
  scenarioName: string;
  value: number;
  status: string;
}

export default HistoricalScenarioComparison;
