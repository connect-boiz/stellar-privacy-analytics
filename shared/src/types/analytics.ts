export interface XRayAnalysis {
  id: string;
  name: string;
  description: string;
  type: AnalysisType;
  parameters: AnalysisParameters;
  privacySettings: PrivacyAnalysisSettings;
  status: AnalysisStatus;
  results?: AnalysisResult;
  createdAt: Date;
  completedAt?: Date;
}

export enum AnalysisType {
  DESCRIPTIVE = 'descriptive',
  PREDICTIVE = 'predictive',
  CORRELATION = 'correlation',
  ANOMALY_DETECTION = 'anomaly_detection',
  TREND_ANALYSIS = 'trend_analysis',
  SEGMENTATION = 'segmentation'
}

export interface AnalysisParameters {
  fields: string[];
  filters?: AnalysisFilter[];
  groupBy?: string[];
  aggregations?: AggregationType[];
  timeRange?: TimeRange;
  privacyBudget: number;
}

export interface AnalysisFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
  value: any;
}

export enum AggregationType {
  COUNT = 'count',
  SUM = 'sum',
  AVERAGE = 'average',
  MEDIAN = 'median',
  MIN = 'min',
  MAX = 'max',
  STD_DEV = 'std_dev'
}

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface PrivacyAnalysisSettings {
  differentialPrivacyEpsilon: number;
  minimumSampleSize: number;
  noiseMechanism: NoiseMechanism;
  anonymizationLevel: AnonymizationLevel;
}

export enum NoiseMechanism {
  LAPLACE = 'laplace',
  GAUSSIAN = 'gaussian',
  EXPONENTIAL = 'exponential'
}

export enum AnonymizationLevel {
  NONE = 'none',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

export enum AnalysisStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface AnalysisResult {
  id: string;
  analysisId: string;
  summary: ResultSummary;
  data: ResultData[];
  visualizations: VisualizationConfig[];
  privacyMetrics: PrivacyMetrics;
  accuracyMetrics?: AccuracyMetrics;
  generatedAt: Date;
}

export interface ResultSummary {
  totalRecords: number;
  processedRecords: number;
  privacyBudgetUsed: number;
  executionTimeMs: number;
  insights: string[];
}

export interface ResultData {
  group?: string;
  metrics: Record<string, number>;
  confidence?: number;
  privacyNoise?: number;
}

export interface VisualizationConfig {
  type: VisualizationType;
  title: string;
  dataSource: string;
  config: Record<string, any>;
  privacyAnnotations?: PrivacyAnnotation[];
}

export enum VisualizationType {
  BAR_CHART = 'bar_chart',
  LINE_CHART = 'line_chart',
  PIE_CHART = 'pie_chart',
  SCATTER_PLOT = 'scatter_plot',
  HEATMAP = 'heatmap',
  HISTOGRAM = 'histogram',
  BOX_PLOT = 'box_plot'
}

export interface PrivacyAnnotation {
  type: 'noise_level' | 'sample_size' | 'confidence_interval';
  message: string;
  level: 'info' | 'warning' | 'error';
}

export interface PrivacyMetrics {
  epsilonUsed: number;
  remainingBudget: number;
  anonymizationStrength: number;
  dataUtilityScore: number;
  reidentificationRisk: number;
}

export interface AccuracyMetrics {
  precision?: number;
  recall?: number;
  f1Score?: number;
  meanSquaredError?: number;
  r2Score?: number;
}
