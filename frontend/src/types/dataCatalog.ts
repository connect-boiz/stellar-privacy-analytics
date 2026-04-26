/**
 * Data Catalog Type Definitions
 */

export interface DataCatalogConfig {
  privacyLevel: 'public' | 'internal' | 'confidential' | 'restricted';
  searchEnabled: boolean;
  lineageEnabled: boolean;
  analyticsEnabled: boolean;
  qualityAssessmentEnabled: boolean;
  accessControlEnabled: boolean;
  encryptionEnabled: boolean;
  auditEnabled: boolean;
}

export interface DatasetMetadata {
  id: string;
  name: string;
  description: string;
  owner: string;
  department: string;
  createdAt: number;
  updatedAt: number;
  version: string;
  status: 'active' | 'inactive' | 'archived' | 'deprecated';
  tags: string[];
  categories: string[];
  privacy: PrivacyMetadata;
  schema: SchemaMetadata;
  lineage: LineageMetadata;
  quality: QualityMetadata;
  usage: UsageMetadata;
  access: AccessMetadata;
  location: LocationMetadata;
  processing: ProcessingMetadata;
  compliance: ComplianceMetadata;
}

export interface PrivacyMetadata {
  level: 'public' | 'internal' | 'confidential' | 'restricted';
  classification: string;
  sensitivity: 'low' | 'medium' | 'high' | 'critical';
  anonymizationLevel: number; // 0-1
  dataTypes: DataType[];
  retentionPolicy: RetentionPolicy;
  consentRequirements: ConsentRequirement[];
  privacyImpactAssessment: PrivacyImpactAssessment;
  gdprCompliance: GDPRCompliance;
}

export interface DataType {
  type: 'personal' | 'sensitive_personal' | 'financial' | 'health' | 'behavioral' | 'location' | 'demographic' | 'technical';
  category: string;
  description: string;
  sensitivity: 'low' | 'medium' | 'high' | 'critical';
  retentionPeriod: number; // days
  processingPurpose: string;
  legalBasis: string;
}

export interface RetentionPolicy {
  minimumRetention: number; // days
  maximumRetention: number; // days
  autoDelete: boolean;
  archivalRequired: boolean;
  complianceRequirements: string[];
}

export interface ConsentRequirement {
  id: string;
  type: 'explicit' | 'implicit' | 'opt_out' | 'legitimate_interest';
  description: string;
  purpose: string;
  legalBasis: string;
  duration: number; // days
  withdrawalAllowed: boolean;
  granular: boolean;
}

export interface PrivacyImpactAssessment {
  id: string;
  assessedAt: number;
  assessedBy: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  findings: string[];
  recommendations: string[];
  mitigationMeasures: string[];
  approvalStatus: 'pending' | 'approved' | 'rejected' | 'review_required';
}

export interface GDPRCompliance {
  lawfulBasis: 'consent' | 'contract' | 'legal_obligation' | 'vital_interests' | 'public_task' | 'legitimate_interests';
  dataSubjectRights: DataSubjectRight[];
  crossBorderTransfer: boolean;
  dpiaRequired: boolean;
  dpiaCompleted: boolean;
  recordOfProcessing: boolean;
  breachNotificationRequired: boolean;
}

export interface DataSubjectRight {
  right: 'access' | 'rectification' | 'erasure' | 'portability' | 'objection' | 'restriction';
  enabled: boolean;
  process: string;
  timeframe: number; // days
  contact: string;
}

export interface SchemaMetadata {
  version: string;
  format: 'json' | 'avro' | 'parquet' | 'csv' | 'xml' | 'sql' | 'custom';
  fields: SchemaField[];
  relationships: SchemaRelationship[];
  constraints: SchemaConstraint[];
  indexes: SchemaIndex[];
  partitions: SchemaPartition[];
  evolution: SchemaEvolution[];
}

export interface SchemaField {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: any;
  description: string;
  tags: string[];
  privacy: FieldPrivacy;
  constraints: FieldConstraint[];
  statistics: FieldStatistics;
  lineage: FieldLineage;
}

export interface FieldPrivacy {
  isPersonal: boolean;
  isSensitive: boolean;
  anonymizationMethod?: 'hashing' | 'masking' | 'tokenization' | 'encryption' | 'aggregation' | 'suppression';
  anonymizationLevel: number; // 0-1
  accessRestricted: boolean;
  consentRequired: boolean;
}

export interface FieldConstraint {
  type: 'not_null' | 'unique' | 'primary_key' | 'foreign_key' | 'check' | 'regex' | 'range' | 'enum';
  value?: any;
  description: string;
  enforced: boolean;
}

export interface FieldStatistics {
  distinctCount: number;
  nullCount: number;
  min?: any;
  max?: any;
  avg?: number;
  distribution: DataDistribution;
  lastUpdated: number;
}

export interface DataDistribution {
  type: 'uniform' | 'normal' | 'exponential' | 'categorical' | 'custom';
  parameters: Record<string, any>;
  histogram: HistogramBin[];
  outliers: OutlierInfo[];
}

export interface HistogramBin {
  min: number;
  max: number;
  count: number;
  frequency: number;
}

export interface OutlierInfo {
  value: any;
  score: number;
  method: string;
  detectedAt: number;
}

export interface FieldLineage {
  sourceFields: string[];
  transformation: string;
  derivedAt: number;
  confidence: number;
}

export interface SchemaRelationship {
  type: 'one_to_one' | 'one_to_many' | 'many_to_many' | 'foreign_key' | 'self_reference';
  sourceField: string;
  targetDataset: string;
  targetField: string;
  description: string;
  cardinality: string;
  onDelete: 'cascade' | 'restrict' | 'set_null' | 'set_default';
}

export interface SchemaConstraint {
  name: string;
  type: 'check' | 'unique' | 'foreign_key' | 'not_null';
  fields: string[];
  condition: string;
  description: string;
  enforced: boolean;
}

export interface SchemaIndex {
  name: string;
  fields: string[];
  type: 'btree' | 'hash' | 'full_text' | 'spatial' | 'custom';
  unique: boolean;
  description: string;
}

export interface SchemaPartition {
  field: string;
  type: 'range' | 'hash' | 'list' | 'custom';
  values: any[];
  description: string;
}

export interface SchemaEvolution {
  version: string;
  timestamp: number;
  changes: SchemaChange[];
  migration: MigrationInfo;
  impact: EvolutionImpact;
}

export interface SchemaChange {
  type: 'add_field' | 'remove_field' | 'modify_field' | 'rename_field' | 'change_type' | 'add_constraint' | 'remove_constraint';
  field?: string;
  oldValue?: any;
  newValue?: any;
  description: string;
  breaking: boolean;
}

export interface MigrationInfo {
  required: boolean;
  script?: string;
  downtime: boolean;
  estimatedTime: number; // minutes
  rollbackAvailable: boolean;
}

export interface EvolutionImpact {
  downstreamDatasets: string[];
  affectedQueries: string[];
  riskLevel: 'low' | 'medium' | 'high';
  recommendations: string[];
}

export interface LineageMetadata {
  upstream: LineageNode[];
  downstream: LineageNode[];
  transformations: LineageTransformation[];
  graph: LineageGraph;
  impact: LineageImpact;
}

export interface LineageNode {
  datasetId: string;
  datasetName: string;
  type: 'source' | 'intermediate' | 'target' | 'reference';
  connectionType: 'direct' | 'indirect' | 'dependency';
  strength: number; // 0-1
  lastUpdated: number;
  metadata: Record<string, any>;
}

export interface LineageTransformation {
  id: string;
  name: string;
  type: 'filter' | 'join' | 'aggregate' | 'transform' | 'enrich' | 'cleanse' | 'anonymize';
  description: string;
  sourceDatasets: string[];
  targetDatasets: string[];
  logic: string;
  parameters: Record<string, any>;
  timestamp: number;
  owner: string;
}

export interface LineageGraph {
  nodes: LineageGraphNode[];
  edges: LineageGraphEdge[];
  layout: GraphLayout;
  metadata: GraphMetadata;
}

export interface LineageGraphNode {
  id: string;
  label: string;
  type: 'dataset' | 'transformation' | 'source' | 'sink';
  position: GraphPosition;
  style: NodeStyle;
  metadata: Record<string, any>;
}

export interface LineageGraphEdge {
  source: string;
  target: string;
  type: 'data_flow' | 'dependency' | 'reference';
  weight: number;
  style: EdgeStyle;
  metadata: Record<string, any>;
}

export interface GraphPosition {
  x: number;
  y: number;
  fixed?: boolean;
}

export interface NodeStyle {
  color: string;
  size: number;
  shape: 'circle' | 'rectangle' | 'diamond' | 'triangle';
  border: string;
  icon?: string;
}

export interface EdgeStyle {
  color: string;
  width: number;
  style: 'solid' | 'dashed' | 'dotted';
  arrow: boolean;
}

export interface GraphLayout {
  algorithm: 'force' | 'hierarchical' | 'circular' | 'grid' | 'custom';
  parameters: Record<string, any>;
  optimized: boolean;
}

export interface GraphMetadata {
  generatedAt: number;
  version: string;
  nodeCount: number;
  edgeCount: number;
  depth: number;
  cycles: number;
}

export interface LineageImpact {
  criticality: 'low' | 'medium' | 'high' | 'critical';
  downstreamCount: number;
  consumerCount: number;
  businessImpact: string;
  riskFactors: string[];
}

export interface QualityMetadata {
  overall: QualityScore;
  dimensions: QualityDimension[];
  issues: QualityIssue[];
  assessments: QualityAssessment[];
  trends: QualityTrend[];
  benchmarks: QualityBenchmark[];
}

export interface QualityScore {
  value: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  lastAssessed: number;
  trend: 'improving' | 'stable' | 'declining';
  confidence: number; // 0-1
}

export interface QualityDimension {
  name: string;
  score: number; // 0-100
  weight: number; // 0-1
  description: string;
  metrics: QualityMetric[];
  lastAssessed: number;
  trend: 'improving' | 'stable' | 'declining';
}

export interface QualityMetric {
  name: string;
  value: number;
  target: number;
  threshold: number;
  status: 'pass' | 'warning' | 'fail';
  description: string;
  formula?: string;
  lastCalculated: number;
}

export interface QualityIssue {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'completeness' | 'accuracy' | 'consistency' | 'validity' | 'uniqueness' | 'timeliness';
  title: string;
  description: string;
  affectedFields: string[];
  affectedRecords: number;
  detectedAt: number;
  status: 'open' | 'investigating' | 'resolved' | 'ignored';
  resolution?: string;
  assignee?: string;
}

export interface QualityAssessment {
  id: string;
  timestamp: number;
  assessor: string;
  methodology: string;
  scores: Record<string, number>;
  findings: string[];
  recommendations: string[];
  nextReview: number;
}

export interface QualityTrend {
  metric: string;
  timeSeries: TrendDataPoint[];
  trend: TrendAnalysis;
  forecast: TrendForecast[];
  anomalies: TrendAnomaly[];
}

export interface TrendDataPoint {
  timestamp: number;
  value: number;
  sampleSize: number;
  confidence: number;
}

export interface TrendAnalysis {
  direction: 'increasing' | 'decreasing' | 'stable';
  slope: number;
  correlation: number;
  seasonality: SeasonalityPattern[];
  changePoints: ChangePoint[];
}

export interface SeasonalityPattern {
  period: number;
  amplitude: number;
  phase: number;
  confidence: number;
}

export interface ChangePoint {
  timestamp: number;
  value: number;
  confidence: number;
  type: 'sudden' | 'gradual';
  description: string;
}

export interface TrendForecast {
  timestamp: number;
  value: number;
  confidence: number;
  upperBound: number;
  lowerBound: number;
}

export interface TrendAnomaly {
  timestamp: number;
  value: number;
  expectedValue: number;
  deviation: number;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export interface QualityBenchmark {
  name: string;
  source: string;
  values: Record<string, number>;
  percentiles: Record<string, number>;
  lastUpdated: number;
}

export interface UsageMetadata {
  statistics: UsageStatistics;
  patterns: UsagePattern[];
  consumers: DataConsumer[];
  queries: UsageQuery[];
  access: UsageAccess[];
  performance: UsagePerformance;
  trends: UsageTrend[];
}

export interface UsageStatistics {
  totalQueries: number;
  uniqueUsers: number;
  avgQueriesPerDay: number;
  peakQueriesPerHour: number;
  dataVolumeAccessed: number;
  avgResponseTime: number;
  errorRate: number;
  lastUpdated: number;
  period: string; // 'day' | 'week' | 'month' | 'year'
}

export interface UsagePattern {
  type: 'temporal' | 'user' | 'query' | 'access';
  pattern: string;
  frequency: number;
  confidence: number;
  description: string;
  metadata: Record<string, any>;
}

export interface DataConsumer {
  id: string;
  name: string;
  type: 'user' | 'application' | 'service' | 'team';
  department: string;
  accessLevel: 'read' | 'write' | 'admin';
  firstAccess: number;
  lastAccess: number;
  queryCount: number;
  dataVolume: number;
  favorite: boolean;
  tags: string[];
}

export interface UsageQuery {
  id: string;
  user: string;
  timestamp: number;
  type: 'select' | 'insert' | 'update' | 'delete' | 'create' | 'drop';
  duration: number;
  rowsAffected: number;
  dataVolume: number;
  success: boolean;
  errorCode?: string;
  fields: string[];
  tables: string[];
  filters: string[];
  aggregations: string[];
  joins: string[];
}

export interface UsageAccess {
  timestamp: number;
  user: string;
  action: 'read' | 'write' | 'delete' | 'share' | 'download';
  resource: string;
  success: boolean;
  ipAddress: string;
  userAgent: string;
  location?: GeoLocation;
  sessionDuration: number;
}

export interface GeoLocation {
  country: string;
  region: string;
  city: string;
  latitude: number;
  longitude: number;
}

export interface UsagePerformance {
  avgResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  throughput: number;
  concurrency: number;
  errorRate: number;
  availability: number;
  lastUpdated: number;
}

export interface UsageTrend {
  metric: string;
  timeSeries: TrendDataPoint[];
  trend: TrendAnalysis;
  forecast: TrendForecast[];
  seasonality: SeasonalityPattern[];
}

export interface AccessMetadata {
  permissions: AccessPermission[];
  roles: AccessRole[];
  policies: AccessPolicy[];
  requests: AccessRequest[];
  audits: AccessAudit[];
  restrictions: AccessRestriction[];
}

export interface AccessPermission {
  id: string;
  principal: string;
  principalType: 'user' | 'group' | 'service' | 'role';
  resource: string;
  resourceType: 'dataset' | 'schema' | 'field' | 'table';
  actions: AccessAction[];
  conditions: AccessCondition[];
  grantedAt: number;
  grantedBy: string;
  expiresAt?: number;
  status: 'active' | 'expired' | 'revoked';
  justification: string;
}

export interface AccessAction {
  action: 'read' | 'write' | 'delete' | 'share' | 'download' | 'export' | 'admin';
  granted: boolean;
  restrictions?: string[];
}

export interface AccessCondition {
  type: 'time' | 'location' | 'purpose' | 'data_classification' | 'approval' | 'custom';
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'contains' | 'greater_than' | 'less_than';
  value: any;
  description: string;
}

export interface AccessRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  members: string[];
  createdAt: number;
  createdBy: string;
  status: 'active' | 'inactive';
}

export interface AccessPolicy {
  id: string;
  name: string;
  description: string;
  type: 'allow' | 'deny' | 'require_approval';
  scope: PolicyScope;
  rules: PolicyRule[];
  conditions: PolicyCondition[];
  priority: number;
  enabled: boolean;
  createdAt: number;
  createdBy: string;
  lastModified: number;
  modifiedBy: string;
}

export interface PolicyScope {
  resources: string[];
  principals: string[];
  actions: string[];
  environments: string[];
}

export interface PolicyRule {
  effect: 'allow' | 'deny';
  actions: string[];
  conditions: PolicyCondition[];
  exceptions: PolicyException[];
}

export interface PolicyCondition {
  attribute: string;
  operator: string;
  value: any;
  description: string;
}

export interface PolicyException {
  condition: PolicyCondition;
  effect: 'allow' | 'deny';
  reason: string;
  expiresAt?: number;
}

export interface AccessRequest {
  id: string;
  requester: string;
  resource: string;
  resourceType: string;
  actions: string[];
  justification: string;
  duration: number; // days
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  requestedAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  reviewComments?: string;
  expiresAt?: number;
  accessGranted?: boolean;
}

export interface AccessAudit {
  id: string;
  timestamp: number;
  user: string;
  action: string;
  resource: string;
  resourceType: string;
  result: 'success' | 'failure' | 'denied';
  reason?: string;
  ipAddress: string;
  userAgent: string;
  sessionId: string;
  metadata: Record<string, any>;
}

export interface AccessRestriction {
  type: 'geographic' | 'time_based' | 'purpose_based' | 'approval_required' | 'encryption_required';
  description: string;
  conditions: AccessCondition[];
  enforced: boolean;
  bypassAllowed: boolean;
  bypassReason?: string;
}

export interface LocationMetadata {
  source: DataSource;
  storage: StorageInfo;
  format: DataFormat;
  size: DataSize;
  partitions: PartitionInfo[];
  replication: ReplicationInfo;
  backup: BackupInfo;
  retention: RetentionInfo;
  cost: CostInfo;
}

export interface DataSource {
  type: 'database' | 'file' | 'stream' | 'api' | 'data_lake' | 'data_warehouse' | 'object_store';
  name: string;
  connection: ConnectionInfo;
  credentials: CredentialInfo;
  properties: Record<string, any>;
}

export interface ConnectionInfo {
  host: string;
  port: number;
  database?: string;
  schema?: string;
  protocol: string;
  ssl: boolean;
  timeout: number;
  poolSize: number;
}

export interface CredentialInfo {
  type: 'password' | 'key' | 'token' | 'certificate' | 'oauth' | 'managed_identity';
  encrypted: boolean;
  rotationRequired: boolean;
  lastRotated?: number;
  expiresAt?: number;
}

export interface StorageInfo {
  provider: string;
  region: string;
  bucket?: string;
  container?: string;
  path: string;
  encryption: EncryptionInfo;
  compression: CompressionInfo;
  indexing: IndexingInfo;
}

export interface EncryptionInfo {
  enabled: boolean;
  algorithm: string;
  keyId: string;
  keyRotation: boolean;
  atRest: boolean;
  inTransit: boolean;
}

export interface CompressionInfo {
  enabled: boolean;
  algorithm: string;
  ratio: number;
  level: number;
}

export interface IndexingInfo {
  enabled: boolean;
  type: string;
  fields: string[];
  refreshInterval: number;
}

export interface DataFormat {
  type: 'parquet' | 'avro' | 'json' | 'csv' | 'xml' | 'orc' | 'delta' | 'iceberg' | 'hudi';
  version?: string;
  compression: string;
  encoding: string;
  delimiter?: string;
  header?: boolean;
}

export interface DataSize {
  total: number;
  used: number;
  available: number;
  unit: 'bytes' | 'kb' | 'mb' | 'gb' | 'tb' | 'pb';
  estimated: boolean;
  lastUpdated: number;
}

export interface PartitionInfo {
  strategy: 'range' | 'hash' | 'list' | 'round_robin';
  columns: string[];
  partitions: number;
  sizeDistribution: PartitionSize[];
}

export interface PartitionSize {
  partition: string;
  size: number;
  rows: number;
  lastUpdated: number;
}

export interface ReplicationInfo {
  enabled: boolean;
  strategy: 'synchronous' | 'asynchronous';
  factor: number;
  regions: string[];
  lag: number;
  status: 'active' | 'inactive' | 'degraded';
}

export interface BackupInfo {
  enabled: boolean;
  frequency: string;
  retention: number;
  lastBackup: number;
  nextBackup: number;
  size: number;
  location: string;
  encrypted: boolean;
}

export interface RetentionInfo {
  policy: string;
  minimumAge: number;
  maximumAge: number;
  autoDelete: boolean;
  archivalRequired: boolean;
  archivalLocation?: string;
}

export interface CostInfo {
  storage: number;
  compute: number;
  transfer: number;
  operations: number;
  total: number;
  currency: string;
  period: string;
  lastUpdated: number;
}

export interface ProcessingMetadata {
  pipelines: ProcessingPipeline[];
  jobs: ProcessingJob[];
  schedules: ProcessingSchedule[];
  dependencies: ProcessingDependency[];
  monitoring: ProcessingMonitoring;
}

export interface ProcessingPipeline {
  id: string;
  name: string;
  description: string;
  type: 'batch' | 'streaming' | 'real_time';
  stages: ProcessingStage[];
  sources: string[];
  targets: string[];
  parameters: Record<string, any>;
  status: 'active' | 'inactive' | 'failed' | 'paused';
  createdAt: number;
  createdBy: string;
  lastRun: number;
  nextRun?: number;
}

export interface ProcessingStage {
  id: string;
  name: string;
  type: 'extract' | 'transform' | 'load' | 'validate' | 'cleanse' | 'enrich' | 'aggregate';
  order: number;
  description: string;
  configuration: Record<string, any>;
  dependencies: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  metrics: StageMetrics;
}

export interface StageMetrics {
  executionTime: number;
  recordsProcessed: number;
  errorCount: number;
  throughput: number;
  memoryUsage: number;
  cpuUsage: number;
  lastUpdated: number;
}

export interface ProcessingJob {
  id: string;
  pipeline: string;
  type: 'manual' | 'scheduled' | 'triggered';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: number;
  endTime?: number;
  duration?: number;
  inputRecords: number;
  outputRecords: number;
  errorCount: number;
  logs: JobLog[];
  metrics: JobMetrics;
}

export interface JobLog {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  stage?: string;
  details?: Record<string, any>;
}

export interface JobMetrics {
  executionTime: number;
  throughput: number;
  memoryPeak: number;
  cpuAverage: number;
  networkIO: number;
  diskIO: number;
  cost: number;
}

export interface ProcessingSchedule {
  id: string;
  pipeline: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  nextRun: number;
  lastRun: number;
  runCount: number;
  failureCount: number;
  owner: string;
}

export interface ProcessingDependency {
  source: string;
  target: string;
  type: 'data' | 'schema' | 'pipeline' | 'external';
  condition: DependencyCondition;
  critical: boolean;
  description: string;
}

export interface DependencyCondition {
  type: 'completion' | 'success' | 'data_availability' | 'time_based' | 'custom';
  parameters: Record<string, any>;
}

export interface ProcessingMonitoring {
  enabled: boolean;
  alerts: MonitoringAlert[];
  dashboards: MonitoringDashboard[];
  metrics: MonitoringMetric[];
  healthChecks: HealthCheck[];
}

export interface MonitoringAlert {
  id: string;
  name: string;
  type: 'error' | 'warning' | 'info';
  condition: AlertCondition;
  enabled: boolean;
  recipients: string[];
  channels: string[];
  lastTriggered?: number;
  count: number;
}

export interface AlertCondition {
  metric: string;
  operator: 'greater_than' | 'less_than' | 'equals' | 'not_equals';
  threshold: number;
  duration: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface MonitoringDashboard {
  id: string;
  name: string;
  description: string;
  widgets: DashboardWidget[];
  layout: LayoutConfig;
  refreshInterval: number;
  shared: boolean;
  owner: string;
}

export interface DashboardWidget {
  id: string;
  type: 'chart' | 'metric' | 'table' | 'text' | 'gauge';
  title: string;
  query: string;
  visualization: VisualizationConfig;
  position: WidgetPosition;
  size: WidgetSize;
}

export interface VisualizationConfig {
  chartType: string;
  xAxis: string;
  yAxis: string;
  groupBy?: string;
  aggregation?: string;
  filters?: Record<string, any>;
  styling?: Record<string, any>;
}

export interface WidgetPosition {
  x: number;
  y: number;
}

export interface WidgetSize {
  width: number;
  height: number;
}

export interface LayoutConfig {
  columns: number;
  rowHeight: number;
  margin: number;
  containerPadding: number;
}

export interface MonitoringMetric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  description: string;
  labels: Record<string, string>;
  aggregation: string;
  unit: string;
}

export interface HealthCheck {
  name: string;
  type: 'connectivity' | 'performance' | 'data_quality' | 'security' | 'custom';
  endpoint: string;
  interval: number;
  timeout: number;
  threshold: number;
  status: 'healthy' | 'unhealthy' | 'warning';
  lastCheck: number;
  nextCheck: number;
}

export interface ComplianceMetadata {
  frameworks: ComplianceFramework[];
  assessments: ComplianceAssessment[];
  controls: ComplianceControl[];
  evidences: ComplianceEvidence[];
  reports: ComplianceReport[];
  certifications: ComplianceCertification[];
}

export interface ComplianceFramework {
  name: string;
  version: string;
  description: string;
  requirements: ComplianceRequirement[];
  controls: ComplianceControl[];
  maturity: ComplianceMaturity;
  lastAssessed: number;
}

export interface ComplianceRequirement {
  id: string;
  name: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  controls: string[];
  evidence: string[];
  status: 'compliant' | 'non_compliant' | 'partial' | 'not_assessed';
  lastAssessed: number;
}

export interface ComplianceControl {
  id: string;
  name: string;
  description: string;
  type: 'preventive' | 'detective' | 'corrective';
  category: string;
  automation: 'manual' | 'semi_automated' | 'fully_automated';
  frequency: string;
  owner: string;
  implementation: string;
  testing: string;
  evidence: string[];
  status: 'implemented' | 'partial' | 'not_implemented';
  effectiveness: 'high' | 'medium' | 'low';
}

export interface ComplianceMaturity {
  level: number; // 1-5
  description: string;
  characteristics: string[];
  gaps: string[];
  recommendations: string[];
}

export interface ComplianceAssessment {
  id: string;
  framework: string;
  scope: string;
  methodology: string;
  startDate: number;
  endDate: number;
  assessor: string;
  findings: ComplianceFinding[];
  overallScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
  nextAssessment: number;
}

export interface ComplianceFinding {
  id: string;
  requirement: string;
  control: string;
  status: 'compliant' | 'non_compliant' | 'gap' | 'observation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  recommendation: string;
  evidence: string[];
  dueDate?: number;
  assignee?: string;
}

export interface ComplianceEvidence {
  id: string;
  type: 'document' | 'screenshot' | 'log' | 'test_result' | 'interview' | 'observation';
  description: string;
  source: string;
  collectedAt: number;
  collectedBy: string;
  hash: string;
  size: number;
  format: string;
  location: string;
  retention: number;
  classification: string;
}

export interface ComplianceReport {
  id: string;
  type: 'assessment' | 'audit' | 'review' | 'status';
  framework: string;
  period: string;
  generatedAt: number;
  generatedBy: string;
  summary: ReportSummary;
  findings: ComplianceFinding[];
  recommendations: string[];
  attachments: string[];
  distribution: string[];
  status: 'draft' | 'review' | 'approved' | 'published';
}

export interface ReportSummary {
  overallScore: number;
  compliantControls: number;
  totalControls: number;
  highRiskFindings: number;
  criticalRiskFindings: number;
  recommendations: number;
  nextReview: number;
}

export interface ComplianceCertification {
  id: string;
  name: string;
  issuer: string;
  framework: string;
  scope: string;
  issuedAt: number;
  expiresAt: number;
  status: 'active' | 'expired' | 'suspended' | 'revoked';
  evidence: string[];
  auditor: string;
  report: string;
}

// Search and Discovery Types
export interface SearchRequest {
  query: string;
  filters: SearchFilter[];
  sort: SearchSort[];
  pagination: SearchPagination;
  facets: string[];
  highlight: boolean;
  privacy: SearchPrivacy;
}

export interface SearchFilter {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'starts_with' | 'ends_with' | 'in' | 'not_in' | 'greater_than' | 'less_than' | 'between';
  value: any;
  boost?: number;
}

export interface SearchSort {
  field: string;
  order: 'asc' | 'desc';
  mode: 'min' | 'max' | 'sum' | 'avg';
}

export interface SearchPagination {
  from: number;
  size: number;
}

export interface SearchPrivacy {
  level: 'public' | 'internal' | 'confidential' | 'restricted';
  anonymizeResults: boolean;
  maskSensitiveFields: boolean;
  requireConsent: boolean;
}

export interface SearchResult {
  datasets: DatasetSearchResult[];
  total: number;
  took: number;
  facets: SearchFacet[];
  suggestions: SearchSuggestion[];
  aggregations: SearchAggregation[];
  privacy: SearchPrivacyResult;
}

export interface DatasetSearchResult {
  dataset: DatasetMetadata;
  score: number;
  highlights: SearchHighlight[];
  explanation: SearchExplanation;
  privacy: ResultPrivacy;
}

export interface SearchHighlight {
  field: string;
  fragments: string[];
}

export interface SearchExplanation {
  value: number;
  description: string;
  details: Record<string, any>;
}

export interface ResultPrivacy {
  level: string;
  maskedFields: string[];
  anonymizedFields: string[];
  accessRequired: boolean;
  consentRequired: boolean;
}

export interface SearchFacet {
  field: string;
  values: FacetValue[];
  total: number;
}

export interface FacetValue {
  value: string;
  count: number;
  selected: boolean;
}

export interface SearchSuggestion {
  text: string;
  type: 'term' | 'phrase' | 'completion' | 'correction';
  score: number;
  source: string;
}

export interface SearchAggregation {
  name: string;
  type: 'terms' | 'date_histogram' | 'range' | 'stats' | 'cardinality';
  buckets: AggregationBucket[];
  value?: any;
}

export interface AggregationBucket {
  key: string;
  docCount: number;
  subAggregations?: Record<string, SearchAggregation>;
}

export interface SearchPrivacyResult {
  filteredResults: number;
  maskedFields: string[];
  anonymizedResults: number;
  consentRequired: number;
  accessDenied: number;
}
