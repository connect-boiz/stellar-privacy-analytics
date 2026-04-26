/**
 * Privacy Budget Simulation Data Types and Interfaces
 */

export interface PrivacyBudget {
  id: string;
  name: string;
  description: string;
  totalBudget: number; // Total privacy budget units
  allocatedBudget: number;
  remainingBudget: number;
  currency: string;
  period: 'monthly' | 'quarterly' | 'yearly';
  startDate: number;
  endDate: number;
  status: 'active' | 'expired' | 'pending';
  owner: string;
  department: string;
  constraints: BudgetConstraints;
  allocations: BudgetAllocation[];
}

export interface BudgetConstraints {
  maxPerAnalysis: number;
  minPrivacyLevel: number; // 0-1 scale
  requiredApprovals: string[];
  restrictedCategories: string[];
  complianceFrameworks: string[];
  geographicRestrictions: string[];
}

export interface BudgetAllocation {
  id: string;
  category: AllocationCategory;
  amount: number;
  percentage: number;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  expectedROI: number;
  riskLevel: 'low' | 'medium' | 'high';
  dependencies: string[];
  constraints: AllocationConstraints;
  performance: AllocationPerformance;
}

export interface AllocationCategory {
  id: string;
  name: string;
  type: 'data_collection' | 'data_analysis' | 'data_sharing' | 'compliance' | 'monitoring' | 'research';
  description: string;
  minAllocation: number;
  maxAllocation: number;
  impactFactors: ImpactFactor[];
}

export interface ImpactFactor {
  metric: string;
  weight: number; // 0-1
  direction: 'positive' | 'negative';
  description: string;
}

export interface AllocationConstraints {
  timeConstraints: {
    minDuration: number; // days
    maxDuration: number; // days
  };
  resourceConstraints: {
    maxDataVolume: number; // GB
    maxUsers: number;
    maxQueries: number;
  };
  privacyConstraints: {
    minAnonymizationLevel: number; // 0-1
    maxDataRetention: number; // days
    requiredConsent: boolean;
  };
}

export interface AllocationPerformance {
  actualROI: number;
  utilizationRate: number; // 0-1
  efficiency: number; // 0-1
  complianceScore: number; // 0-1
  userSatisfaction: number; // 0-1
  lastUpdated: number;
}

export interface SimulationScenario {
  id: string;
  name: string;
  description: string;
  type: 'baseline' | 'optimization' | 'what_if' | 'comparison';
  baseBudget: PrivacyBudget;
  allocations: BudgetAllocation[];
  parameters: SimulationParameters;
  assumptions: SimulationAssumption[];
  constraints: ScenarioConstraints;
  createdAt: number;
  createdBy: string;
  tags: string[];
  status: 'draft' | 'active' | 'archived';
}

export interface SimulationParameters {
  timeHorizon: number; // days
  confidenceLevel: number; // 0-1
  riskTolerance: number; // 0-1
  optimizationGoal: OptimizationGoal;
  sensitivity: 'low' | 'medium' | 'high';
  monteCarloRuns: number;
}

export interface OptimizationGoal {
  primary: 'maximize_roi' | 'minimize_risk' | 'balance_privacy_utility' | 'minimize_cost';
  secondary?: OptimizationGoal['primary'];
  weights: Record<string, number>;
}

export interface SimulationAssumption {
  id: string;
  name: string;
  description: string;
  type: 'market' | 'technical' | 'regulatory' | 'operational';
  value: number | string | boolean;
  confidence: number; // 0-1
  impact: 'low' | 'medium' | 'high';
  source: string;
}

export interface ScenarioConstraints {
  totalBudgetLimit: number;
  categoryLimits: Record<string, number>;
  minimumPrivacyLevel: number;
  complianceRequirements: string[];
  businessObjectives: BusinessObjective[];
}

export interface BusinessObjective {
  id: string;
  name: string;
  description: string;
  weight: number; // 0-1
  target: number;
  current: number;
  unit: string;
}

export interface SimulationResult {
  id: string;
  scenarioId: string;
  timestamp: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  duration: number; // milliseconds
  allocations: BudgetAllocation[];
  metrics: SimulationMetrics;
  projections: Projection[];
  recommendations: Recommendation[];
  sensitivity: SensitivityAnalysis;
  confidence: ConfidenceInterval[];
  metadata: ResultMetadata;
}

export interface SimulationMetrics {
  totalROI: number;
  riskScore: number; // 0-100
  privacyScore: number; // 0-100
  utilityScore: number; // 0-100
  efficiency: number; // 0-100
  complianceScore: number; // 0-100
  budgetUtilization: number; // 0-1
  costBenefitRatio: number;
  netPresentValue: number;
  internalRateOfReturn: number;
  paybackPeriod: number; // days
  breakEvenPoint: number; // days
}

export interface Projection {
  metric: string;
  timePoints: TimePoint[];
  trend: TrendAnalysis;
  confidence: number;
}

export interface TimePoint {
  timestamp: number;
  value: number;
  lowerBound: number;
  upperBound: number;
  probability: number;
}

export interface TrendAnalysis {
  direction: 'increasing' | 'decreasing' | 'stable';
  slope: number;
  correlation: number;
  seasonality: SeasonalityPattern[];
  changePoints: ChangePoint[];
}

export interface SeasonalityPattern {
  period: number; // days
  amplitude: number;
  phase: number;
  confidence: number;
}

export interface ChangePoint {
  timestamp: number;
  magnitude: number;
  confidence: number;
  description: string;
}

export interface Recommendation {
  id: string;
  type: 'allocation' | 'optimization' | 'risk_mitigation' | 'cost_reduction';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  rationale: string;
  expectedImpact: Impact;
  implementation: ImplementationPlan;
  risks: Risk[];
  alternatives: Alternative[];
}

export interface Impact {
  roi: number;
  risk: number;
  privacy: number;
  utility: number;
  cost: number;
  confidence: number;
}

export interface ImplementationPlan {
  steps: ImplementationStep[];
  duration: number; // days
  cost: number;
  resources: Resource[];
  dependencies: string[];
}

export interface ImplementationStep {
  id: string;
  name: string;
  description: string;
  duration: number; // days
  cost: number;
  prerequisites: string[];
  deliverables: string[];
}

export interface Resource {
  type: 'human' | 'technical' | 'financial' | 'operational';
  name: string;
  quantity: number;
  unit: string;
  cost: number;
}

export interface Risk {
  id: string;
  name: string;
  description: string;
  probability: number; // 0-1
  impact: number; // 0-1
  category: 'financial' | 'operational' | 'regulatory' | 'technical' | 'reputational';
  mitigation: string;
  owner: string;
}

export interface Alternative {
  name: string;
  description: string;
  pros: string[];
  cons: string[];
  cost: number;
  impact: Impact;
}

export interface SensitivityAnalysis {
  parameters: SensitivityParameter[];
  scenarios: SensitivityScenario[];
  tornadoChart: TornadoData;
  correlationMatrix: CorrelationData;
}

export interface SensitivityParameter {
  name: string;
  baseValue: number;
  range: { min: number; max: number };
  distribution: 'normal' | 'uniform' | 'triangular' | 'beta';
  sensitivity: number; // 0-1
  impact: number;
}

export interface SensitivityScenario {
  name: string;
  parameters: Record<string, number>;
  results: SimulationMetrics;
  variance: number;
}

export interface TornadoData {
  parameters: TornadoParameter[];
  baseCase: number;
}

export interface TornadoParameter {
  name: string;
  lowImpact: number;
  highImpact: number;
  range: number;
}

export interface CorrelationData {
  matrix: number[][];
  variables: string[];
  significant: CorrelationPair[];
}

export interface CorrelationPair {
  variable1: string;
  variable2: string;
  correlation: number;
  significance: number;
}

export interface ConfidenceInterval {
  metric: string;
  lower: number;
  upper: number;
  level: number; // 0.95, 0.99, etc.
  method: 'bootstrap' | 'parametric' | 'monte_carlo';
}

export interface ResultMetadata {
  version: string;
  algorithm: string;
  parameters: Record<string, any>;
  assumptions: string[];
  limitations: string[];
  validation: ValidationResults;
}

export interface ValidationResults {
  backtesting: BacktestResult[];
  crossValidation: number;
  accuracy: number;
  precision: number;
  recall: number;
}

export interface BacktestResult {
  period: string;
  predicted: number;
  actual: number;
  error: number;
  accuracy: number;
}

export interface ScenarioComparison {
  id: string;
  name: string;
  scenarios: string[]; // scenario IDs
  comparisonType: 'side_by_side' | 'delta' | 'ranking';
  metrics: string[];
  weights: Record<string, number>;
  results: ComparisonResult[];
  insights: ComparisonInsight[];
  createdAt: number;
  createdBy: string;
}

export interface ComparisonResult {
  scenarioId: string;
  scenarioName: string;
  rank: number;
  score: number;
  metrics: Record<string, number>;
  strengths: string[];
  weaknesses: string[];
}

export interface ComparisonInsight {
  type: 'best_practice' | 'trade_off' | 'opportunity' | 'risk';
  description: string;
  scenarios: string[];
  impact: string;
  recommendation: string;
}

export interface BudgetOptimization {
  id: string;
  name: string;
  type: 'linear' | 'nonlinear' | 'integer' | 'mixed';
  objective: OptimizationGoal;
  constraints: OptimizationConstraint[];
  variables: OptimizationVariable[];
  solution: OptimizationSolution;
  status: 'solved' | 'infeasible' | 'unbounded' | 'error';
}

export interface OptimizationConstraint {
  name: string;
  type: 'equality' | 'inequality' | 'bound';
  expression: string;
  coefficient: number;
  rhs: number;
}

export interface OptimizationVariable {
  name: string;
  type: 'continuous' | 'integer' | 'binary';
  lowerBound: number;
  upperBound: number;
  coefficient: number;
  category: string;
}

export interface OptimizationSolution {
  objectiveValue: number;
  variables: Record<string, number>;
  constraints: Record<string, number>;
  shadowPrices: Record<string, number>;
  reducedCosts: Record<string, number>;
  status: 'optimal' | 'feasible' | 'infeasible';
  solveTime: number;
}

export interface BudgetExport {
  format: 'json' | 'csv' | 'excel' | 'pdf';
  data: any;
  metadata: ExportMetadata;
}

export interface ExportMetadata {
  exportedAt: number;
  exportedBy: string;
  version: string;
  format: string;
  encryption: boolean;
  compression: boolean;
}

export interface BudgetShare {
  id: string;
  token: string;
  url: string;
  expiresAt: number;
  permissions: SharePermission[];
  accessLog: AccessLog[];
  createdAt: number;
  createdBy: string;
}

export interface SharePermission {
  type: 'view' | 'edit' | 'comment' | 'download';
  scope: 'full' | 'summary' | 'specific';
  restrictions: string[];
}

export interface AccessLog {
  timestamp: number;
  userId: string;
  action: string;
  ip: string;
  userAgent: string;
}

export interface BudgetAlert {
  id: string;
  type: 'budget_exceeded' | 'low_utilization' | 'deadline' | 'compliance' | 'optimization';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  threshold: number;
  currentValue: number;
  budgetId: string;
  category?: string;
  timestamp: number;
  acknowledged: boolean;
  resolved: boolean;
}

export interface BudgetAnalytics {
  utilization: UtilizationAnalytics;
  performance: PerformanceAnalytics;
  trends: TrendAnalytics;
  forecasts: ForecastAnalytics;
  benchmarks: BenchmarkAnalytics;
}

export interface UtilizationAnalytics {
  overall: number; // 0-1
  byCategory: Record<string, number>;
  byTime: TimeSeriesData[];
  efficiency: number; // 0-1
  waste: number; // 0-1
}

export interface PerformanceAnalytics {
  roi: number;
  costEffectiveness: number;
  quality: number; // 0-1
  timeliness: number; // 0-1
  satisfaction: number; // 0-1
}

export interface TrendAnalytics {
  direction: 'increasing' | 'decreasing' | 'stable';
  magnitude: number;
  seasonality: SeasonalityPattern[];
  changePoints: ChangePoint[];
  forecast: ForecastData[];
}

export interface ForecastAnalytics {
  shortTerm: ForecastData[];
  mediumTerm: ForecastData[];
  longTerm: ForecastData[];
  confidence: number;
  accuracy: number;
}

export interface BenchmarkAnalytics {
  industry: BenchmarkData[];
  internal: BenchmarkData[];
  peers: BenchmarkData[];
  ranking: number;
  percentile: number;
}

export interface TimeSeriesData {
  timestamp: number;
  value: number;
  metadata?: Record<string, any>;
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
  value: number;
  rank: number;
  percentile: number;
  source: string;
  timestamp: number;
}
