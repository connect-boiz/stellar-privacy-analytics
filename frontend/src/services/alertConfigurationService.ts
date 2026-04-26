/**
 * Alert Configuration Service
 */

import { 
  AlertConfiguration, 
  AlertChannel, 
  AlertCondition, 
  EscalationRule,
  PrivacyAlert 
} from '../types/privacyMetrics';

export interface AlertTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  conditions: AlertCondition[];
  defaultSeverity: AlertConfiguration['severity'];
  defaultChannels: AlertChannel[];
  tags: string[];
}

export interface AlertRule {
  id: string;
  configId: string;
  isActive: boolean;
  lastTriggered?: number;
  triggerCount: number;
  suppressionUntil?: number;
}

export interface AlertStatistics {
  totalAlerts: number;
  activeAlerts: number;
  alertsBySeverity: Record<string, number>;
  alertsByType: Record<string, number>;
  averageResolutionTime: number;
  escalationRate: number;
}

export class AlertConfigurationService {
  private static instance: AlertConfigurationService;
  private configurations: Map<string, AlertConfiguration> = new Map();
  private templates: Map<string, AlertTemplate> = new Map();
  private rules: Map<string, AlertRule> = new Map();
  private alertHistory: PrivacyAlert[] = [];

  private constructor() {
    this.initializeTemplates();
    this.initializeDefaultConfigurations();
  }

  static getInstance(): AlertConfigurationService {
    if (!AlertConfigurationService.instance) {
      AlertConfigurationService.instance = new AlertConfigurationService();
    }
    return AlertConfigurationService.instance;
  }

  private initializeTemplates(): void {
    const templates: AlertTemplate[] = [
      {
        id: 'high-access-volume',
        name: 'High Access Volume Alert',
        description: 'Alert when data access volume exceeds threshold',
        category: 'access',
        conditions: [
          {
            metric: 'access_volume',
            operator: 'gt',
            value: 1000,
            duration: 5 // minutes
          }
        ],
        defaultSeverity: 'high',
        defaultChannels: [
          {
            type: 'email',
            config: {
              recipients: ['privacy-team@company.com'],
              subject: 'High Access Volume Alert'
            },
            enabled: true
          }
        ],
        tags: ['access', 'volume', 'security']
      },
      {
        id: 'compliance-score-drop',
        name: 'Compliance Score Drop',
        description: 'Alert when compliance score drops below threshold',
        category: 'compliance',
        conditions: [
          {
            metric: 'compliance_score',
            operator: 'lt',
            value: 85,
            duration: 1 // minute
          }
        ],
        defaultSeverity: 'medium',
        defaultChannels: [
          {
            type: 'email',
            config: {
              recipients: ['compliance-team@company.com'],
              subject: 'Compliance Score Alert'
            },
            enabled: true
          },
          {
            type: 'slack',
            config: {
              webhook: 'https://hooks.slack.com/services/...',
              channel: '#privacy-alerts'
            },
            enabled: true
          }
        ],
        tags: ['compliance', 'score', 'regulatory']
      },
      {
        id: 'anomaly-detection',
        name: 'Anomaly Detection Alert',
        description: 'Alert when anomaly is detected with high confidence',
        category: 'anomaly',
        conditions: [
          {
            metric: 'anomaly_confidence',
            operator: 'gte',
            value: 0.8,
            duration: 0 // immediate
          }
        ],
        defaultSeverity: 'critical',
        defaultChannels: [
          {
            type: 'email',
            config: {
              recipients: ['security-team@company.com'],
              subject: 'Critical Anomaly Detected'
            },
            enabled: true
          },
          {
            type: 'sms',
            config: {
              numbers: ['+1234567890']
            },
            enabled: true
          }
        ],
        tags: ['anomaly', 'security', 'critical']
      },
      {
        id: 'data-retention',
        name: 'Data Retention Policy Violation',
        description: 'Alert when data exceeds retention period',
        category: 'retention',
        conditions: [
          {
            metric: 'data_age_days',
            operator: 'gt',
            value: 2555, // 7 years
            duration: 60 // minutes
          }
        ],
        defaultSeverity: 'medium',
        defaultChannels: [
          {
            type: 'email',
            config: {
              recipients: ['data-governance@company.com'],
              subject: 'Data Retention Policy Violation'
            },
            enabled: true
          }
        ],
        tags: ['retention', 'policy', 'compliance']
      },
      {
        id: 'unusual-access-pattern',
        name: 'Unusual Access Pattern',
        description: 'Alert when unusual access patterns are detected',
        category: 'pattern',
        conditions: [
          {
            metric: 'pattern_deviation',
            operator: 'gt',
            value: 2.5,
            duration: 10 // minutes
          }
        ],
        defaultSeverity: 'low',
        defaultChannels: [
          {
            type: 'slack',
            config: {
              webhook: 'https://hooks.slack.com/services/...',
              channel: '#privacy-monitoring'
            },
            enabled: true
          }
        ],
        tags: ['pattern', 'behavior', 'monitoring']
      }
    ];

    templates.forEach(template => {
      this.templates.set(template.id, template);
    });
  }

  private initializeDefaultConfigurations(): void {
    // Create configurations from templates
    for (const template of this.templates.values()) {
      const config: AlertConfiguration = {
        id: `config-${template.id}`,
        name: template.name,
        description: template.description,
        enabled: true,
        metricType: template.category as any,
        conditions: template.conditions,
        severity: template.defaultSeverity,
        channels: template.defaultChannels,
        cooldownPeriod: 15, // minutes
        escalationRules: []
      };

      this.configurations.set(config.id, config);
      this.rules.set(config.id, {
        id: `rule-${config.id}`,
        configId: config.id,
        isActive: true,
        triggerCount: 0
      });
    }
  }

  // Configuration management
  public createConfiguration(config: Omit<AlertConfiguration, 'id'>): AlertConfiguration {
    const id = `config-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newConfig: AlertConfiguration = { ...config, id };
    
    this.configurations.set(id, newConfig);
    this.rules.set(id, {
      id: `rule-${id}`,
      configId: id,
      isActive: true,
      triggerCount: 0
    });

    return newConfig;
  }

  public updateConfiguration(id: string, updates: Partial<AlertConfiguration>): AlertConfiguration | null {
    const existing = this.configurations.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates };
    this.configurations.set(id, updated);
    return updated;
  }

  public deleteConfiguration(id: string): boolean {
    const deleted = this.configurations.delete(id);
    if (deleted) {
      this.rules.delete(id);
    }
    return deleted;
  }

  public getConfiguration(id: string): AlertConfiguration | undefined {
    return this.configurations.get(id);
  }

  public getAllConfigurations(): AlertConfiguration[] {
    return Array.from(this.configurations.values());
  }

  public getConfigurationsByCategory(category: string): AlertConfiguration[] {
    return Array.from(this.configurations.values()).filter(
      config => config.metricType === category
    );
  }

  // Template management
  public getTemplate(id: string): AlertTemplate | undefined {
    return this.templates.get(id);
  }

  public getAllTemplates(): AlertTemplate[] {
    return Array.from(this.templates.values());
  }

  public createConfigurationFromTemplate(templateId: string, overrides?: Partial<AlertConfiguration>): AlertConfiguration | null {
    const template = this.templates.get(templateId);
    if (!template) return null;

    const config: AlertConfiguration = {
      id: `config-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: template.name,
      description: template.description,
      enabled: true,
      metricType: template.category as any,
      conditions: template.conditions,
      severity: template.defaultSeverity,
      channels: template.defaultChannels,
      cooldownPeriod: 15,
      escalationRules: [],
      ...overrides
    };

    this.configurations.set(config.id, config);
    this.rules.set(config.id, {
      id: `rule-${config.id}`,
      configId: config.id,
      isActive: true,
      triggerCount: 0
    });

    return config;
  }

  // Alert evaluation
  public async evaluateAlerts(metrics: Record<string, number>): Promise<PrivacyAlert[]> {
    const triggeredAlerts: PrivacyAlert[] = [];

    for (const [configId, config] of this.configurations) {
      if (!config.enabled) continue;

      const rule = this.rules.get(configId);
      if (!rule?.isActive) continue;

      // Check cooldown period
      if (rule.suppressionUntil && Date.now() < rule.suppressionUntil) {
        continue;
      }

      // Evaluate conditions
      const shouldTrigger = this.evaluateConditions(config.conditions, metrics);
      
      if (shouldTrigger) {
        const alert = this.createAlert(config, metrics);
        triggeredAlerts.push(alert);

        // Update rule
        rule.lastTriggered = Date.now();
        rule.triggerCount++;
        rule.suppressionUntil = Date.now() + (config.cooldownPeriod * 60 * 1000);

        // Store in history
        this.alertHistory.push(alert);
      }
    }

    return triggeredAlerts;
  }

  private evaluateConditions(conditions: AlertCondition[], metrics: Record<string, number>): boolean {
    if (conditions.length === 0) return false;

    return conditions.every(condition => {
      const value = metrics[condition.metric];
      if (value === undefined) return false;

      switch (condition.operator) {
        case 'gt': return value > condition.value;
        case 'gte': return value >= condition.value;
        case 'lt': return value < condition.value;
        case 'lte': return value <= condition.value;
        case 'eq': return value === condition.value;
        case 'ne': return value !== condition.value;
        default: return false;
      }
    });
  }

  private createAlert(config: AlertConfiguration, metrics: Record<string, number>): PrivacyAlert {
    const primaryCondition = config.conditions[0];
    const metricValue = metrics[primaryCondition.metric] || 0;

    return {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      configId: config.id,
      timestamp: Date.now(),
      severity: config.severity,
      title: config.name,
      message: this.generateAlertMessage(config, metrics),
      metricValue,
      threshold: primaryCondition.value,
      status: 'active',
      metadata: {
        conditions: config.conditions,
        channels: config.channels,
        metrics
      }
    };
  }

  private generateAlertMessage(config: AlertConfiguration, metrics: Record<string, number>): string {
    const primaryCondition = config.conditions[0];
    const value = metrics[primaryCondition.metric] || 0;
    
    return `${config.description}: Current value ${value} ${this.getOperatorText(primaryCondition.operator)} threshold ${primaryCondition.value}`;
  }

  private getOperatorText(operator: AlertCondition['operator']): string {
    const operators = {
      gt: '>',
      gte: '>=',
      lt: '<',
      lte: '<=',
      eq: '=',
      ne: '!='
    };
    return operators[operator] || operator;
  }

  // Alert management
  public acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.alertHistory.find(a => a.id === alertId);
    if (!alert || alert.status !== 'active') return false;

    alert.status = 'acknowledged';
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = Date.now();

    return true;
  }

  public resolveAlert(alertId: string, resolutionNotes?: string): boolean {
    const alert = this.alertHistory.find(a => a.id === alertId);
    if (!alert || (alert.status !== 'active' && alert.status !== 'acknowledged')) return false;

    alert.status = 'resolved';
    alert.resolvedAt = Date.now();
    if (resolutionNotes) {
      alert.resolutionNotes = resolutionNotes;
    }

    return true;
  }

  public getActiveAlerts(): PrivacyAlert[] {
    return this.alertHistory.filter(alert => alert.status === 'active');
  }

  public getAlertHistory(limit?: number): PrivacyAlert[] {
    const sorted = [...this.alertHistory].sort((a, b) => b.timestamp - a.timestamp);
    return limit ? sorted.slice(0, limit) : sorted;
  }

  // Statistics and analytics
  public getAlertStatistics(timeRange?: { start: number; end: number }): AlertStatistics {
    let alerts = this.alertHistory;
    
    if (timeRange) {
      alerts = alerts.filter(alert => 
        alert.timestamp >= timeRange.start && alert.timestamp <= timeRange.end
      );
    }

    const activeAlerts = alerts.filter(a => a.status === 'active');
    const alertsBySeverity = alerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const alertsByType = alerts.reduce((acc, alert) => {
      const config = this.configurations.get(alert.configId);
      if (config) {
        acc[config.metricType] = (acc[config.metricType] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    // Calculate average resolution time
    const resolvedAlerts = alerts.filter(a => a.status === 'resolved' && a.resolvedAt);
    const averageResolutionTime = resolvedAlerts.length > 0
      ? resolvedAlerts.reduce((sum, alert) => {
          const resolutionTime = alert.resolvedAt! - alert.timestamp;
          return sum + resolutionTime;
        }, 0) / resolvedAlerts.length
      : 0;

    // Calculate escalation rate
    const escalatedAlerts = alerts.filter(alert => {
      const config = this.configurations.get(alert.configId);
      return config && config.escalationRules.length > 0;
    });
    const escalationRate = alerts.length > 0 ? escalatedAlerts.length / alerts.length : 0;

    return {
      totalAlerts: alerts.length,
      activeAlerts: activeAlerts.length,
      alertsBySeverity,
      alertsByType,
      averageResolutionTime,
      escalationRate
    };
  }

  // Channel management
  public addChannel(configId: string, channel: AlertChannel): boolean {
    const config = this.configurations.get(configId);
    if (!config) return false;

    config.channels.push(channel);
    return true;
  }

  public removeChannel(configId: string, channelIndex: number): boolean {
    const config = this.configurations.get(configId);
    if (!config || channelIndex < 0 || channelIndex >= config.channels.length) return false;

    config.channels.splice(channelIndex, 1);
    return true;
  }

  public updateChannel(configId: string, channelIndex: number, updates: Partial<AlertChannel>): boolean {
    const config = this.configurations.get(configId);
    if (!config || channelIndex < 0 || channelIndex >= config.channels.length) return false;

    config.channels[channelIndex] = { ...config.channels[channelIndex], ...updates };
    return true;
  }

  // Escalation rules
  public addEscalationRule(configId: string, rule: EscalationRule): boolean {
    const config = this.configurations.get(configId);
    if (!config) return false;

    config.escalationRules.push(rule);
    return true;
  }

  public removeEscalationRule(configId: string, ruleIndex: number): boolean {
    const config = this.configurations.get(configId);
    if (!config || ruleIndex < 0 || ruleIndex >= config.escalationRules.length) return false;

    config.escalationRules.splice(ruleIndex, 1);
    return true;
  }

  // Rule management
  public enableRule(configId: string): boolean {
    const rule = this.rules.get(configId);
    if (!rule) return false;

    rule.isActive = true;
    return true;
  }

  public disableRule(configId: string): boolean {
    const rule = this.rules.get(configId);
    if (!rule) return false;

    rule.isActive = false;
    return true;
  }

  public getRuleStatus(configId: string): AlertRule | undefined {
    return this.rules.get(configId);
  }

  public getAllRuleStatuses(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  // Validation
  public validateConfiguration(config: AlertConfiguration): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!config.name || config.name.trim().length === 0) {
      errors.push('Configuration name is required');
    }

    if (!config.conditions || config.conditions.length === 0) {
      errors.push('At least one condition is required');
    }

    if (config.conditions) {
      config.conditions.forEach((condition, index) => {
        if (!condition.metric) {
          errors.push(`Condition ${index + 1}: Metric is required`);
        }
        if (condition.value === undefined || condition.value === null) {
          errors.push(`Condition ${index + 1}: Value is required`);
        }
      });
    }

    if (!config.channels || config.channels.length === 0) {
      errors.push('At least one notification channel is required');
    }

    if (config.cooldownPeriod < 0) {
      errors.push('Cooldown period must be positive');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Export/Import
  public exportConfigurations(): string {
    const data = {
      configurations: Array.from(this.configurations.values()),
      templates: Array.from(this.templates.values()),
      exportedAt: Date.now()
    };
    return JSON.stringify(data, null, 2);
  }

  public importConfigurations(data: string): {
    imported: number;
    errors: string[];
  } {
    const errors: string[] = [];
    let imported = 0;

    try {
      const parsed = JSON.parse(data);
      
      if (parsed.configurations && Array.isArray(parsed.configurations)) {
        parsed.configurations.forEach((config: AlertConfiguration) => {
          const validation = this.validateConfiguration(config);
          if (validation.isValid) {
            this.configurations.set(config.id, config);
            this.rules.set(config.id, {
              id: `rule-${config.id}`,
              configId: config.id,
              isActive: true,
              triggerCount: 0
            });
            imported++;
          } else {
            errors.push(`Configuration ${config.id}: ${validation.errors.join(', ')}`);
          }
        });
      }
    } catch (error) {
      errors.push('Invalid JSON format');
    }

    return { imported, errors };
  }

  // Cleanup
  public clearHistory(): void {
    this.alertHistory = [];
  }

  public reset(): void {
    this.configurations.clear();
    this.rules.clear();
    this.alertHistory.clear();
    this.initializeDefaultConfigurations();
  }
}

export default AlertConfigurationService;
