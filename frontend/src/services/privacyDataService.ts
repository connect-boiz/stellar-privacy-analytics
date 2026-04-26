/**
 * Real-time Privacy Metrics Data Collection Service
 */

import { 
  PrivacyMetric, 
  DataAccessEvent, 
  AnomalyDetection, 
  ComplianceStatus, 
  AccessPattern,
  PrivacyAlert,
  HistoricalTrend,
  DashboardState 
} from '../types/privacyMetrics';

export interface PrivacyDataServiceConfig {
  apiEndpoint: string;
  wsEndpoint: string;
  refreshInterval: number;
  retryAttempts: number;
  timeout: number;
}

export class PrivacyDataService {
  private static instance: PrivacyDataService;
  private config: PrivacyDataServiceConfig;
  private websocket: WebSocket | null = null;
  private subscribers: Map<string, Set<(data: any) => void>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;

  private constructor(config: PrivacyDataServiceConfig) {
    this.config = config;
  }

  static getInstance(config?: PrivacyDataServiceConfig): PrivacyDataService {
    if (!PrivacyDataService.instance) {
      if (!config) {
        throw new Error('Configuration required for first initialization');
      }
      PrivacyDataService.instance = new PrivacyDataService(config);
    }
    return PrivacyDataService.instance;
  }

  // WebSocket connection management
  public connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      if (this.isConnecting) {
        reject(new Error('Connection already in progress'));
        return;
      }

      this.isConnecting = true;

      try {
        this.websocket = new WebSocket(this.config.wsEndpoint);

        this.websocket.onopen = () => {
          console.log('Privacy metrics WebSocket connected');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          resolve();
        };

        this.websocket.onmessage = (event) => {
          this.handleWebSocketMessage(event.data);
        };

        this.websocket.onclose = (event) => {
          console.log('Privacy metrics WebSocket disconnected', event);
          this.isConnecting = false;
          this.handleReconnect();
        };

        this.websocket.onerror = (error) => {
          console.error('Privacy metrics WebSocket error:', error);
          this.isConnecting = false;
          reject(error);
        };

      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
      
      setTimeout(() => {
        this.connectWebSocket().catch(error => {
          console.error('Reconnection failed:', error);
        });
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  private handleWebSocketMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'metric_update':
          this.notifySubscribers('metrics', message.data);
          break;
        case 'anomaly_detected':
          this.notifySubscribers('anomalies', message.data);
          break;
        case 'alert_triggered':
          this.notifySubscribers('alerts', message.data);
          break;
        case 'compliance_update':
          this.notifySubscribers('compliance', message.data);
          break;
        case 'access_pattern':
          this.notifySubscribers('patterns', message.data);
          break;
        default:
          console.warn('Unknown WebSocket message type:', message.type);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  // Subscription management
  public subscribe(eventType: string, callback: (data: any) => void): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    
    this.subscribers.get(eventType)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      const subscribers = this.subscribers.get(eventType);
      if (subscribers) {
        subscribers.delete(callback);
        if (subscribers.size === 0) {
          this.subscribers.delete(eventType);
        }
      }
    };
  }

  private notifySubscribers(eventType: string, data: any): void {
    const subscribers = this.subscribers.get(eventType);
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in subscriber callback:', error);
        }
      });
    }
  }

  // REST API methods
  public async fetchMetrics(timeRange: { start: number; end: number }): Promise<PrivacyMetric[]> {
    return this.fetchWithRetry(`/api/metrics?start=${timeRange.start}&end=${timeRange.end}`);
  }

  public async fetchAnomalies(timeRange: { start: number; end: number }): Promise<AnomalyDetection[]> {
    return this.fetchWithRetry(`/api/anomalies?start=${timeRange.start}&end=${timeRange.end}`);
  }

  public async fetchAlerts(status?: string): Promise<PrivacyAlert[]> {
    const url = status ? `/api/alerts?status=${status}` : '/api/alerts';
    return this.fetchWithRetry(url);
  }

  public async fetchComplianceStatus(): Promise<ComplianceStatus[]> {
    return this.fetchWithRetry('/api/compliance');
  }

  public async fetchAccessPatterns(userId?: string): Promise<AccessPattern[]> {
    const url = userId ? `/api/patterns?userId=${userId}` : '/api/patterns';
    return this.fetchWithRetry(url);
  }

  public async fetchHistoricalTrends(
    metric: string, 
    timeRange: { start: number; end: number },
    granularity: string
  ): Promise<HistoricalTrend> {
    return this.fetchWithRetry(
      `/api/trends/${metric}?start=${timeRange.start}&end=${timeRange.end}&granularity=${granularity}`
    );
  }

  public async acknowledgeAlert(alertId: string): Promise<void> {
    await this.fetchWithRetry(`/api/alerts/${alertId}/acknowledge`, 'POST');
  }

  public async resolveAlert(alertId: string, notes?: string): Promise<void> {
    await this.fetchWithRetry(`/api/alerts/${alertId}/resolve`, 'POST', { notes });
  }

  public async updateComplianceStatus(
    complianceId: string, 
    status: ComplianceStatus['status']
  ): Promise<void> {
    await this.fetchWithRetry(`/api/compliance/${complianceId}`, 'PUT', { status });
  }

  // Data access events
  public async logAccessEvent(event: Omit<DataAccessEvent, 'id' | 'timestamp'>): Promise<void> {
    await this.fetchWithRetry('/api/access-events', 'POST', event);
  }

  public async fetchAccessEvents(
    timeRange: { start: number; end: number },
    userId?: string
  ): Promise<DataAccessEvent[]> {
    const params = new URLSearchParams({
      start: timeRange.start.toString(),
      end: timeRange.end.toString()
    });
    
    if (userId) {
      params.append('userId', userId);
    }
    
    return this.fetchWithRetry(`/api/access-events?${params.toString()}`);
  }

  // Dashboard state
  public async fetchDashboardState(filters?: any): Promise<DashboardState> {
    const params = filters ? new URLSearchParams(filters).toString() : '';
    const url = params ? `/api/dashboard?${params}` : '/api/dashboard';
    return this.fetchWithRetry(url);
  }

  // Generic fetch with retry
  private async fetchWithRetry<T>(
    endpoint: string, 
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
  ): Promise<T> {
    const url = `${this.config.apiEndpoint}${endpoint}`;
    
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.config.timeout)
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        console.warn(`Fetch attempt ${attempt} failed for ${endpoint}:`, error);
        
        if (attempt === this.config.retryAttempts) {
          throw error;
        }
        
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new Error('Max retry attempts reached');
  }

  // Real-time data generation for demo/testing
  public generateMockData(): {
    metrics: PrivacyMetric[];
    anomalies: AnomalyDetection[];
    alerts: PrivacyAlert[];
    compliance: ComplianceStatus[];
    accessEvents: DataAccessEvent[];
  } {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    
    // Generate mock metrics
    const metrics: PrivacyMetric[] = [];
    for (let i = 0; i < 100; i++) {
      const timestamp = oneHourAgo + (i * 36 * 1000); // Every 36 seconds
      metrics.push({
        id: `metric-${i}`,
        timestamp,
        metricType: ['access', 'compliance', 'anomaly', 'performance'][i % 4] as any,
        value: Math.random() * 100,
        threshold: 80,
        status: Math.random() > 0.8 ? 'warning' : 'normal',
        metadata: { source: 'system' },
        source: 'privacy-engine'
      });
    }

    // Generate mock anomalies
    const anomalies: AnomalyDetection[] = [
      {
        id: 'anomaly-1',
        timestamp: now - 10 * 60 * 1000,
        anomalyType: 'access_pattern',
        severity: 'medium',
        confidence: 0.85,
        description: 'Unusual access pattern detected for user john.doe',
        affectedUsers: ['john.doe'],
        affectedResources: ['customer-data'],
        metrics: {
          baselineValue: 10,
          actualValue: 45,
          deviation: 3.5
        },
        status: 'active'
      },
      {
        id: 'anomaly-2',
        timestamp: now - 30 * 60 * 1000,
        anomalyType: 'volume_spike',
        severity: 'high',
        confidence: 0.92,
        description: 'Data export volume spike detected',
        affectedUsers: ['jane.smith'],
        affectedResources: ['analytics-db'],
        metrics: {
          baselineValue: 100,
          actualValue: 1500,
          deviation: 15
        },
        status: 'investigating'
      }
    ];

    // Generate mock alerts
    const alerts: PrivacyAlert[] = [
      {
        id: 'alert-1',
        configId: 'config-1',
        timestamp: now - 5 * 60 * 1000,
        severity: 'high',
        title: 'High Access Volume Alert',
        message: 'Access volume exceeded threshold by 200%',
        metricValue: 300,
        threshold: 100,
        status: 'active'
      },
      {
        id: 'alert-2',
        configId: 'config-2',
        timestamp: now - 15 * 60 * 1000,
        severity: 'medium',
        title: 'Compliance Score Drop',
        message: 'GDPR compliance score dropped below 90%',
        metricValue: 85,
        threshold: 90,
        status: 'acknowledged',
        acknowledgedBy: 'admin',
        acknowledgedAt: now - 10 * 60 * 1000
      }
    ];

    // Generate mock compliance status
    const compliance: ComplianceStatus[] = [
      {
        id: 'gdpr-1',
        framework: 'GDPR',
        category: 'Data Protection',
        requirement: 'Article 32 - Security of Processing',
        status: 'compliant',
        score: 95,
        lastAssessed: now - 7 * 24 * 60 * 60 * 1000,
        nextAssessed: now + 23 * 24 * 60 * 60 * 1000,
        evidence: ['security-audit-2024', 'penetration-test'],
        violations: [],
        owner: 'security-team'
      },
      {
        id: 'ccpa-1',
        framework: 'CCPA',
        category: 'Consumer Rights',
        requirement: 'Right to Delete',
        status: 'partial',
        score: 78,
        lastAssessed: now - 3 * 24 * 60 * 60 * 1000,
        nextAssessed: now + 27 * 24 * 60 * 60 * 1000,
        evidence: ['deletion-process-docs'],
        violations: [
          {
            id: 'violation-1',
            timestamp: now - 2 * 24 * 60 * 60 * 1000,
            severity: 'medium',
            description: 'Deletion requests not processed within 45 days',
            impact: 'Potential regulatory penalty',
            remediation: 'Implement automated deletion workflow',
            status: 'in_progress',
            assignedTo: 'engineering-team',
            dueDate: now + 7 * 24 * 60 * 60 * 1000
          }
        ],
        owner: 'privacy-team'
      }
    ];

    // Generate mock access events
    const accessEvents: DataAccessEvent[] = [];
    for (let i = 0; i < 50; i++) {
      const timestamp = oneHourAgo + (i * 72 * 1000); // Every 72 seconds
      accessEvents.push({
        id: `event-${i}`,
        timestamp,
        userId: ['john.doe', 'jane.smith', 'admin', 'bob.wilson'][i % 4],
        resource: ['customer-data', 'analytics-db', 'user-records', 'audit-logs'][i % 4],
        action: ['read', 'write', 'delete', 'export'][i % 4] as any,
        ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
        userAgent: 'Mozilla/5.0 (Privacy Dashboard)',
        success: Math.random() > 0.1,
        responseTime: Math.floor(Math.random() * 500) + 50,
        dataVolume: Math.floor(Math.random() * 10000) + 100,
        complianceFlags: Math.random() > 0.8 ? ['PII_ACCESS'] : [],
        riskScore: Math.random() * 100
      });
    }

    return {
      metrics,
      anomalies,
      alerts,
      compliance,
      accessEvents
    };
  }

  // Cleanup
  public disconnect(): void {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    this.subscribers.clear();
  }
}

export default PrivacyDataService;
