/**
 * Privacy Metrics Data Types and Interfaces
 */

export interface PrivacyMetric {
  id: string;
  timestamp: number;
  metricType: 'access' | 'compliance' | 'anomaly' | 'performance';
  value: number;
  threshold?: number;
  status: 'normal' | 'warning' | 'critical' | 'resolved';
  metadata: Record<string, any>;
  source: string;
}

export interface DataAccessEvent {
  id: string;
  timestamp: number;
  userId: string;
  resource: string;
  action: 'read' | 'write' | 'delete' | 'export';
  ipAddress: string;
  userAgent: string;
  success: boolean;
  errorCode?: string;
  responseTime: number;
  dataVolume: number;
  complianceFlags: string[];
  riskScore: number;
}

export interface AnomalyDetection {
  id: string;
  timestamp: number;
  anomalyType: 'access_pattern' | 'volume_spike' | 'unusual_time' | 'geo_anomaly' | 'behavioral';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number; // 0-1
  description: string;
  affectedUsers: string[];
  affectedResources: string[];
  metrics: {
    baselineValue: number;
    actualValue: number;
    deviation: number;
  };
  status: 'active' | 'investigating' | 'resolved' | 'false_positive';
  resolutionNotes?: string;
}

export interface ComplianceStatus {
  id: string;
  framework: 'GDPR' | 'CCPA' | 'HIPAA' | 'SOX' | 'custom';
  category: string;
  requirement: string;
  status: 'compliant' | 'non_compliant' | 'partial' | 'pending_review';
  score: number; // 0-100
  lastAssessed: number;
  nextAssessment: number;
  evidence: string[];
  violations: ComplianceViolation[];
  owner: string;
}

export interface ComplianceViolation {
  id: string;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  remediation: string;
  status: 'open' | 'in_progress' | 'resolved';
  assignedTo?: string;
  dueDate?: number;
}

export interface AccessPattern {
  userId: string;
  timeWindow: {
    start: number;
    end: number;
  };
  accessFrequency: number;
  resourceTypes: Record<string, number>;
  timePatterns: {
    hourly: Record<number, number>;
    daily: Record<number, number>;
  };
  geoPatterns: Record<string, number>;
  devicePatterns: Record<string, number>;
  riskIndicators: {
    unusualFrequency: boolean;
    unusualTime: boolean;
    unusualLocation: boolean;
    volumeAnomaly: boolean;
  };
  trendDirection: 'increasing' | 'decreasing' | 'stable';
  trendMagnitude: number;
}

export interface AlertConfiguration {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  metricType: PrivacyMetric['metricType'];
  conditions: AlertCondition[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  channels: AlertChannel[];
  cooldownPeriod: number; // minutes
  escalationRules: EscalationRule[];
}

export interface AlertCondition {
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'ne';
  value: number;
  duration?: number; // minutes
}

export interface AlertChannel {
  type: 'email' | 'sms' | 'webhook' | 'slack' | 'teams';
  config: Record<string, any>;
  enabled: boolean;
}

export interface EscalationRule {
  condition: string;
  delay: number; // minutes
  severity: 'medium' | 'high' | 'critical';
  channels: AlertChannel[];
}

export interface PrivacyAlert {
  id: string;
  configId: string;
  timestamp: number;
  severity: AlertConfiguration['severity'];
  title: string;
  message: string;
  metricValue: number;
  threshold: number;
  status: 'active' | 'acknowledged' | 'resolved';
  acknowledgedBy?: string;
  acknowledgedAt?: number;
  resolvedAt?: number;
  resolutionNotes?: string;
  metadata: Record<string, any>;
}

export interface HistoricalTrend {
  metric: string;
  timeRange: {
    start: number;
    end: number;
  };
  granularity: 'minute' | 'hour' | 'day' | 'week' | 'month';
  dataPoints: Array<{
    timestamp: number;
    value: number;
    metadata?: Record<string, any>;
  }>;
  statistics: {
    min: number;
    max: number;
    avg: number;
    median: number;
    stdDev: number;
    trend: {
      direction: 'up' | 'down' | 'stable';
      slope: number;
      correlation: number;
    };
  };
  anomalies: Array<{
    timestamp: number;
    value: number;
    score: number;
  }>;
}

export interface MonitoringIntegration {
  id: string;
  name: string;
  type: 'prometheus' | 'grafana' | 'datadog' | 'splunk' | 'custom';
  enabled: boolean;
  config: Record<string, any>;
  metrics: string[];
  lastSync: number;
  status: 'connected' | 'disconnected' | 'error';
  error?: string;
}

export interface DashboardState {
  metrics: PrivacyMetric[];
  alerts: PrivacyAlert[];
  anomalies: AnomalyDetection[];
  compliance: ComplianceStatus[];
  accessPatterns: AccessPattern[];
  integrations: MonitoringIntegration[];
  lastUpdated: number;
  filters: {
    timeRange: {
      start: number;
      end: number;
    };
    severity: string[];
    categories: string[];
    sources: string[];
  };
  loading: boolean;
  error?: string;
}

export interface PrivacyDashboardConfig {
  refreshInterval: number; // milliseconds
  autoRefresh: boolean;
  defaultTimeRange: '1h' | '6h' | '24h' | '7d' | '30d';
  maxDataPoints: number;
  enableRealTime: boolean;
  alertSound: boolean;
  theme: 'light' | 'dark' | 'auto';
  widgets: DashboardWidget[];
}

export interface DashboardWidget {
  id: string;
  type: 'metric_chart' | 'alert_list' | 'compliance_score' | 'access_pattern' | 'anomaly_feed';
  title: string;
  size: {
    width: number;
    height: number;
  };
  position: {
    x: number;
    y: number;
  };
  config: Record<string, any>;
  visible: boolean;
}
