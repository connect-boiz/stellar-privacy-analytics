/**
 * Monitoring System Integrations Service
 */

import { 
  MonitoringIntegration, 
  PrivacyMetric, 
  PrivacyAlert,
  AnomalyDetection 
} from '../types/privacyMetrics';

export interface MonitoringConfig {
  prometheus?: {
    endpoint: string;
    jobName: string;
    metricsPrefix: string;
  };
  grafana?: {
    endpoint: string;
    apiKey: string;
    dashboardFolder: string;
  };
  datadog?: {
    apiKey: string;
    site: string;
    metricsPrefix: string;
  };
  splunk?: {
    endpoint: string;
    token: string;
    index: string;
  };
  webhook?: {
    endpoints: Array<{
      url: string;
      headers?: Record<string, string>;
      secret?: string;
    }>;
  };
}

export interface MonitoringMetric {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export interface MonitoringAlert {
  name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  labels: Record<string, string>;
  timestamp: number;
}

export class MonitoringIntegrations {
  private static instance: MonitoringIntegrations;
  private integrations: Map<string, MonitoringIntegration> = new Map();
  private config: MonitoringConfig = {};

  private constructor() {
    this.initializeDefaultIntegrations();
  }

  static getInstance(): MonitoringIntegrations {
    if (!MonitoringIntegrations.instance) {
      MonitoringIntegrations.instance = new MonitoringIntegrations();
    }
    return MonitoringIntegrations.instance;
  }

  private initializeDefaultIntegrations(): void {
    // Prometheus integration
    const prometheus: MonitoringIntegration = {
      id: 'prometheus-default',
      name: 'Prometheus',
      type: 'prometheus',
      enabled: false,
      config: {
        endpoint: 'http://localhost:9090',
        jobName: 'privacy-monitoring',
        metricsPrefix: 'privacy_'
      },
      metrics: [
        'privacy_access_total',
        'privacy_anomaly_detected',
        'privacy_compliance_score',
        'privacy_alert_count'
      ],
      lastSync: 0,
      status: 'disconnected'
    };

    // Grafana integration
    const grafana: MonitoringIntegration = {
      id: 'grafana-default',
      name: 'Grafana',
      type: 'grafana',
      enabled: false,
      config: {
        endpoint: 'http://localhost:3000',
        apiKey: '',
        dashboardFolder: 'Privacy Monitoring'
      },
      metrics: [],
      lastSync: 0,
      status: 'disconnected'
    };

    // Datadog integration
    const datadog: MonitoringIntegration = {
      id: 'datadog-default',
      name: 'Datadog',
      type: 'datadog',
      enabled: false,
      config: {
        apiKey: '',
        site: 'datadoghq.com',
        metricsPrefix: 'privacy.'
      },
      metrics: [
        'privacy.access.count',
        'privacy.anomaly.count',
        'privacy.compliance.score'
      ],
      lastSync: 0,
      status: 'disconnected'
    };

    // Splunk integration
    const splunk: MonitoringIntegration = {
      id: 'splunk-default',
      name: 'Splunk',
      type: 'splunk',
      enabled: false,
      config: {
        endpoint: 'https://splunk.example.com:8089',
        token: '',
        index: 'privacy_events'
      },
      metrics: [],
      lastSync: 0,
      status: 'disconnected'
    };

    // Webhook integration
    const webhook: MonitoringIntegration = {
      id: 'webhook-default',
      name: 'Custom Webhooks',
      type: 'webhook',
      enabled: false,
      config: {
        endpoints: [
          {
            url: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK',
            headers: {
              'Content-Type': 'application/json'
            }
          }
        ]
      },
      metrics: [],
      lastSync: 0,
      status: 'disconnected'
    };

    this.integrations.set('prometheus', prometheus);
    this.integrations.set('grafana', grafana);
    this.integrations.set('datadog', datadog);
    this.integrations.set('splunk', splunk);
    this.integrations.set('webhook', webhook);
  }

  // Integration management
  public addIntegration(integration: MonitoringIntegration): void {
    this.integrations.set(integration.id, integration);
  }

  public removeIntegration(id: string): boolean {
    return this.integrations.delete(id);
  }

  public getIntegration(id: string): MonitoringIntegration | undefined {
    return this.integrations.get(id);
  }

  public getAllIntegrations(): MonitoringIntegration[] {
    return Array.from(this.integrations.values());
  }

  public updateIntegration(id: string, updates: Partial<MonitoringIntegration>): boolean {
    const integration = this.integrations.get(id);
    if (!integration) return false;

    const updated = { ...integration, ...updates };
    this.integrations.set(id, updated);
    return true;
  }

  public enableIntegration(id: string): boolean {
    return this.updateIntegration(id, { enabled: true, status: 'connected' });
  }

  public disableIntegration(id: string): boolean {
    return this.updateIntegration(id, { enabled: false, status: 'disconnected' });
  }

  // Configuration management
  public updateConfig(config: MonitoringConfig): void {
    this.config = { ...this.config, ...config };
    
    // Update integration configs
    if (config.prometheus) {
      this.updateIntegration('prometheus', { config: config.prometheus });
    }
    if (config.grafana) {
      this.updateIntegration('grafana', { config: config.grafana });
    }
    if (config.datadog) {
      this.updateIntegration('datadog', { config: config.datadog });
    }
    if (config.splunk) {
      this.updateIntegration('splunk', { config: config.splunk });
    }
    if (config.webhook) {
      this.updateIntegration('webhook', { config: config.webhook });
    }
  }

  public getConfig(): MonitoringConfig {
    return { ...this.config };
  }

  // Metrics publishing
  public async publishMetrics(metrics: PrivacyMetric[]): Promise<void> {
    const enabledIntegrations = Array.from(this.integrations.values())
      .filter(integration => integration.enabled);

    const monitoringMetrics = this.convertToMonitoringMetrics(metrics);

    await Promise.allSettled(
      enabledIntegrations.map(integration => 
        this.publishToIntegration(integration, monitoringMetrics)
      )
    );
  }

  private async publishToIntegration(
    integration: MonitoringIntegration, 
    metrics: MonitoringMetric[]
  ): Promise<void> {
    try {
      switch (integration.type) {
        case 'prometheus':
          await this.publishToPrometheus(integration, metrics);
          break;
        case 'datadog':
          await this.publishToDatadog(integration, metrics);
          break;
        case 'webhook':
          await this.publishToWebhook(integration, metrics);
          break;
        default:
          console.warn(`Publishing not implemented for ${integration.type}`);
      }

      // Update last sync
      integration.lastSync = Date.now();
      integration.status = 'connected';

    } catch (error) {
      console.error(`Failed to publish to ${integration.name}:`, error);
      integration.status = 'error';
      integration.error = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  private convertToMonitoringMetrics(metrics: PrivacyMetric[]): MonitoringMetric[] {
    return metrics.map(metric => ({
      name: `privacy_${metric.metricType}`,
      value: metric.value,
      labels: {
        source: metric.source,
        status: metric.status,
        ...metric.metadata
      },
      timestamp: metric.timestamp
    }));
  }

  private async publishToPrometheus(
    integration: MonitoringIntegration, 
    metrics: MonitoringMetric[]
  ): Promise<void> {
    const config = integration.config as any;
    const endpoint = config.endpoint;
    const jobName = config.jobName;
    const metricsPrefix = config.metricsPrefix || '';

    // Convert to Prometheus exposition format
    const prometheusMetrics = metrics.map(metric => {
      const labels = Object.entries(metric.labels)
        .map(([key, value]) => `${key}="${value}"`)
        .join(',');
      
      return `${metricsPrefix}${metric.name}{${labels}} ${metric.value} ${metric.timestamp}`;
    }).join('\n');

    await fetch(`${endpoint}/metrics/job/${jobName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain'
      },
      body: prometheusMetrics
    });
  }

  private async publishToDatadog(
    integration: MonitoringIntegration, 
    metrics: MonitoringMetric[]
  ): Promise<void> {
    const config = integration.config as any;
    const apiKey = config.apiKey;
    const site = config.site;
    const metricsPrefix = config.metricsPrefix || '';

    const datadogMetrics = metrics.map(metric => ({
      metric: `${metricsPrefix}${metric.name}`,
      points: [[metric.timestamp / 1000, metric.value]], // Datadog uses seconds
      tags: Object.entries(metric.labels).map(([key, value]) => `${key}:${value}`),
      type: 'gauge'
    }));

    await fetch(`https://api.${site}/api/v1/series`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': apiKey
      },
      body: JSON.stringify({ series: datadogMetrics })
    });
  }

  private async publishToWebhook(
    integration: MonitoringIntegration, 
    metrics: MonitoringMetric[]
  ): Promise<void> {
    const config = integration.config as any;
    const endpoints = config.endpoints || [];

    await Promise.allSettled(
      endpoints.map(async (endpoint: any) => {
        const payload = {
          metrics,
          timestamp: Date.now(),
          source: 'privacy-monitoring'
        };

        const headers = {
          'Content-Type': 'application/json',
          ...endpoint.headers
        };

        // Add signature if secret is provided
        if (endpoint.secret) {
          const signature = this.generateSignature(JSON.stringify(payload), endpoint.secret);
          headers['X-Signature'] = signature;
        }

        await fetch(endpoint.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
      })
    );
  }

  // Alert publishing
  public async publishAlert(alert: PrivacyAlert): Promise<void> {
    const enabledIntegrations = Array.from(this.integrations.values())
      .filter(integration => integration.enabled);

    const monitoringAlert = this.convertToMonitoringAlert(alert);

    await Promise.allSettled(
      enabledIntegrations.map(integration => 
        this.publishAlertToIntegration(integration, monitoringAlert)
      )
    );
  }

  private convertToMonitoringAlert(alert: PrivacyAlert): MonitoringAlert {
    return {
      name: alert.title,
      severity: alert.severity,
      message: alert.message,
      labels: {
        alert_id: alert.id,
        config_id: alert.configId,
        status: alert.status,
        metric_value: alert.metricValue.toString(),
        threshold: alert.threshold.toString()
      },
      timestamp: alert.timestamp
    };
  }

  private async publishAlertToIntegration(
    integration: MonitoringIntegration, 
    alert: MonitoringAlert
  ): Promise<void> {
    try {
      switch (integration.type) {
        case 'prometheus':
          await this.publishAlertToPrometheus(integration, alert);
          break;
        case 'datadog':
          await this.publishAlertToDatadog(integration, alert);
          break;
        case 'webhook':
          await this.publishAlertToWebhook(integration, alert);
          break;
        default:
          console.warn(`Alert publishing not implemented for ${integration.type}`);
      }
    } catch (error) {
      console.error(`Failed to publish alert to ${integration.name}:`, error);
    }
  }

  private async publishAlertToPrometheus(
    integration: MonitoringIntegration, 
    alert: MonitoringAlert
  ): Promise<void> {
    const config = integration.config as any;
    const endpoint = config.endpoint;
    const jobName = config.jobName;
    const metricsPrefix = config.metricsPrefix || '';

    const labels = Object.entries(alert.labels)
      .map(([key, value]) => `${key}="${value}"`)
      .join(',');

    const prometheusAlert = `${metricsPrefix}alert{${labels},severity="${alert.severity}",name="${alert.name}"} 1 ${alert.timestamp}`;

    await fetch(`${endpoint}/metrics/job/${jobName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain'
      },
      body: prometheusAlert
    });
  }

  private async publishAlertToDatadog(
    integration: MonitoringIntegration, 
    alert: MonitoringAlert
  ): Promise<void> {
    const config = integration.config as any;
    const apiKey = config.apiKey;
    const site = config.site;

    const event = {
      title: alert.name,
      text: alert.message,
      alert_type: 'error',
      priority: this.getDatadogPriority(alert.severity),
      tags: Object.entries(alert.labels).map(([key, value]) => `${key}:${value}`),
      timestamp: alert.timestamp / 1000 // Datadog uses seconds
    };

    await fetch(`https://api.${site}/api/v1/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': apiKey
      },
      body: JSON.stringify(event)
    });
  }

  private async publishAlertToWebhook(
    integration: MonitoringIntegration, 
    alert: MonitoringAlert
  ): Promise<void> {
    const config = integration.config as any;
    const endpoints = config.endpoints || [];

    await Promise.allSettled(
      endpoints.map(async (endpoint: any) => {
        const payload = {
          alert,
          timestamp: Date.now(),
          source: 'privacy-monitoring'
        };

        const headers = {
          'Content-Type': 'application/json',
          ...endpoint.headers
        };

        if (endpoint.secret) {
          const signature = this.generateSignature(JSON.stringify(payload), endpoint.secret);
          headers['X-Signature'] = signature;
        }

        await fetch(endpoint.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
      })
    );
  }

  // Grafana dashboard management
  public async createGrafanaDashboard(
    integrationId: string,
    dashboardConfig: any
  ): Promise<{ uid: string; url: string } | null> {
    const integration = this.integrations.get(integrationId);
    if (!integration || integration.type !== 'grafana' || !integration.enabled) {
      return null;
    }

    const config = integration.config as any;
    const endpoint = config.endpoint;
    const apiKey = config.apiKey;
    const folder = config.dashboardFolder || 'Privacy Monitoring';

    try {
      // Create folder if it doesn't exist
      const folderResponse = await fetch(`${endpoint}/api/folders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          title: folder
        })
      });

      const folderData = await folderResponse.json();
      const folderId = folderData.id || folderData.uid;

      // Create dashboard
      const dashboardPayload = {
        dashboard: {
          ...dashboardConfig,
          title: dashboardConfig.title || 'Privacy Monitoring Dashboard',
          tags: ['privacy', 'monitoring'],
          timezone: 'browser',
          panels: dashboardConfig.panels || [],
          schemaVersion: 30,
          refresh: '5m'
        },
        folderId,
        overwrite: true
      };

      const response = await fetch(`${endpoint}/api/dashboards/db`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(dashboardPayload)
      });

      const result = await response.json();
      
      return {
        uid: result.uid,
        url: `${endpoint}/d/${result.uid}`
      };

    } catch (error) {
      console.error('Failed to create Grafana dashboard:', error);
      return null;
    }
  }

  // Health check
  public async checkIntegrationHealth(id: string): Promise<{
    healthy: boolean;
    latency?: number;
    error?: string;
  }> {
    const integration = this.integrations.get(id);
    if (!integration || !integration.enabled) {
      return { healthy: false, error: 'Integration not enabled' };
    }

    const startTime = Date.now();

    try {
      switch (integration.type) {
        case 'prometheus':
          await this.checkPrometheusHealth(integration);
          break;
        case 'grafana':
          await this.checkGrafanaHealth(integration);
          break;
        case 'datadog':
          await this.checkDatadogHealth(integration);
          break;
        case 'splunk':
          await this.checkSplunkHealth(integration);
          break;
        default:
          return { healthy: false, error: 'Health check not implemented' };
      }

      const latency = Date.now() - startTime;
      return { healthy: true, latency };

    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async checkPrometheusHealth(integration: MonitoringIntegration): Promise<void> {
    const config = integration.config as any;
    const response = await fetch(`${config.endpoint}/api/v1/query?query=up`);
    
    if (!response.ok) {
      throw new Error('Prometheus health check failed');
    }
  }

  private async checkGrafanaHealth(integration: MonitoringIntegration): Promise<void> {
    const config = integration.config as any;
    const response = await fetch(`${config.endpoint}/api/health`);
    
    if (!response.ok) {
      throw new Error('Grafana health check failed');
    }
  }

  private async checkDatadogHealth(integration: MonitoringIntegration): Promise<void> {
    const config = integration.config as any;
    const response = await fetch(`https://api.${config.site}/api/v1/validate`, {
      headers: {
        'DD-API-KEY': config.apiKey
      }
    });
    
    if (!response.ok) {
      throw new Error('Datadog health check failed');
    }
  }

  private async checkSplunkHealth(integration: MonitoringIntegration): Promise<void> {
    const config = integration.config as any;
    const response = await fetch(`${config.endpoint}/servicesNS/admin/search/auth/login`, {
      method: 'POST',
      headers: {
        'Authorization': `Splunk ${config.token}`
      },
      body: new URLSearchParams({
        username: 'admin',
        password: 'changeme'
      })
    });
    
    if (!response.ok) {
      throw new Error('Splunk health check failed');
    }
  }

  // Utility methods
  private getDatadogPriority(severity: string): 'low' | 'normal' | 'high' {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'high';
      case 'medium':
        return 'normal';
      case 'low':
      default:
        return 'low';
    }
  }

  private generateSignature(payload: string, secret: string): string {
    // Simple HMAC-like signature (in production, use crypto library)
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(payload);
    
    // This is a simplified version - use crypto.subtle.sign in production
    return btoa(payload + secret).slice(0, 64);
  }

  // Statistics
  public getIntegrationStatistics(): {
    total: number;
    enabled: number;
    healthy: number;
    byType: Record<string, number>;
    lastSyncTimes: Record<string, number>;
  } {
    const integrations = Array.from(this.integrations.values());
    
    return {
      total: integrations.length,
      enabled: integrations.filter(i => i.enabled).length,
      healthy: integrations.filter(i => i.status === 'connected').length,
      byType: integrations.reduce((acc, i) => {
        acc[i.type] = (acc[i.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      lastSyncTimes: integrations.reduce((acc, i) => {
        acc[i.id] = i.lastSync;
        return acc;
      }, {} as Record<string, number>)
    };
  }

  // Cleanup
  public reset(): void {
    this.integrations.clear();
    this.config = {};
    this.initializeDefaultIntegrations();
  }
}

export default MonitoringIntegrations;
