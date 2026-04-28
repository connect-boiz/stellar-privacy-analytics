/**
 * Anomaly Detection Engine for Privacy Metrics
 */

import { 
  AnomalyDetection, 
  DataAccessEvent, 
  PrivacyMetric, 
  AccessPattern 
} from '../types/privacyMetrics';

export interface AnomalyDetectionConfig {
  sensitivity: number; // 0.1 - 1.0
  windowSize: number; // minutes
  minDataPoints: number;
  alertThreshold: number; // confidence threshold
  enableML: boolean;
}

export interface AnomalyPattern {
  type: AnomalyDetection['anomalyType'];
  description: string;
  detectionMethod: 'statistical' | 'ml' | 'rule_based';
  parameters: Record<string, any>;
}

export class AnomalyDetectionEngine {
  private static instance: AnomalyDetectionEngine;
  private config: AnomalyDetectionConfig;
  private baselineData: Map<string, number[]> = new Map();
  private patterns: AnomalyPattern[] = [];
  private isTraining = false;

  private constructor(config: AnomalyDetectionConfig) {
    this.config = config;
    this.initializePatterns();
  }

  static getInstance(config?: AnomalyDetectionConfig): AnomalyDetectionEngine {
    if (!AnomalyDetectionEngine.instance) {
      if (!config) {
        config = {
          sensitivity: 0.7,
          windowSize: 60, // 1 hour
          minDataPoints: 30,
          alertThreshold: 0.8,
          enableML: false
        };
      }
      AnomalyDetectionEngine.instance = new AnomalyDetectionEngine(config);
    }
    return AnomalyDetectionEngine.instance;
  }

  private initializePatterns(): void {
    this.patterns = [
      {
        type: 'access_pattern',
        description: 'Unusual access frequency or timing',
        detectionMethod: 'statistical',
        parameters: {
          frequencyThreshold: 2.5, // standard deviations
          timeWindow: 60 // minutes
        }
      },
      {
        type: 'volume_spike',
        description: 'Sudden increase in data access volume',
        detectionMethod: 'statistical',
        parameters: {
          spikeThreshold: 3.0, // standard deviations
          minVolume: 1000 // minimum volume to consider
        }
      },
      {
        type: 'unusual_time',
        description: 'Access outside normal business hours',
        detectionMethod: 'rule_based',
        parameters: {
          businessStart: 9, // 9 AM
          businessEnd: 17, // 5 PM
          timezone: 'UTC'
        }
      },
      {
        type: 'geo_anomaly',
        description: 'Access from unusual geographic location',
        detectionMethod: 'ml',
        parameters: {
          locationHistory: 30, // days
          confidenceThreshold: 0.8
        }
      },
      {
        type: 'behavioral',
        description: 'Deviation from normal user behavior',
        detectionMethod: 'ml',
        parameters: {
          behaviorWindow: 7, // days
          featureWeights: {
            frequency: 0.3,
            timing: 0.2,
            volume: 0.3,
            resources: 0.2
          }
        }
      }
    ];
  }

  // Main anomaly detection methods
  public async detectAnomalies(
    metrics: PrivacyMetric[], 
    accessEvents: DataAccessEvent[]
  ): Promise<AnomalyDetection[]> {
    const anomalies: AnomalyDetection[] = [];

    // Detect access pattern anomalies
    const accessPatternAnomalies = await this.detectAccessPatternAnomalies(accessEvents);
    anomalies.push(...accessPatternAnomalies);

    // Detect volume spike anomalies
    const volumeAnomalies = await this.detectVolumeSpikeAnomalies(metrics);
    anomalies.push(...volumeAnomalies);

    // Detect unusual time anomalies
    const timeAnomalies = await this.detectUnusualTimeAnomalies(accessEvents);
    anomalies.push(...timeAnomalies);

    // Detect geographic anomalies
    const geoAnomalies = await this.detectGeoAnomalies(accessEvents);
    anomalies.push(...geoAnomalies);

    // Detect behavioral anomalies
    const behavioralAnomalies = await this.detectBehavioralAnomalies(accessEvents);
    anomalies.push(...behavioralAnomalies);

    // Filter by confidence threshold
    return anomalies.filter(anomaly => 
      anomaly.confidence >= this.config.alertThreshold
    );
  }

  private async detectAccessPatternAnomalies(events: DataAccessEvent[]): Promise<AnomalyDetection[]> {
    const anomalies: AnomalyDetection[] = [];
    const userPatterns = this.groupEventsByUser(events);

    for (const [userId, userEvents] of userPatterns) {
      const pattern = this.analyzeAccessPattern(userEvents);
      
      if (pattern.isAnomalous) {
        anomalies.push({
          id: `access-pattern-${Date.now()}-${userId}`,
          timestamp: Date.now(),
          anomalyType: 'access_pattern',
          severity: this.calculateSeverity(pattern.deviation),
          confidence: pattern.confidence,
          description: `Unusual access pattern detected for user ${userId}: ${pattern.reason}`,
          affectedUsers: [userId],
          affectedResources: [...new Set(userEvents.map(e => e.resource))],
          metrics: {
            baselineValue: pattern.baseline,
            actualValue: pattern.actual,
            deviation: pattern.deviation
          },
          status: 'active'
        });
      }
    }

    return anomalies;
  }

  private async detectVolumeSpikeAnomalies(metrics: PrivacyMetric[]): Promise<AnomalyDetection[]> {
    const anomalies: AnomalyDetection[] = [];
    const volumeMetrics = metrics.filter(m => m.metricType === 'access');

    // Group by time windows
    const timeWindows = this.groupMetricsByTimeWindow(volumeMetrics, this.config.windowSize);

    for (const [windowStart, windowMetrics] of timeWindows) {
      const totalVolume = windowMetrics.reduce((sum, m) => sum + m.value, 0);
      const baseline = this.calculateBaseline('volume', windowMetrics.map(m => m.value));
      
      if (baseline.length > this.config.minDataPoints) {
        const stats = this.calculateStatistics(baseline);
        const deviation = Math.abs(totalVolume - stats.mean) / stats.stdDev;

        if (deviation > this.patterns.find(p => p.type === 'volume_spike')!.parameters.spikeThreshold) {
          anomalies.push({
            id: `volume-spike-${Date.now()}-${windowStart}`,
            timestamp: windowStart,
            anomalyType: 'volume_spike',
            severity: this.calculateSeverity(deviation),
            confidence: Math.min(deviation / 4, 1), // Normalize to 0-1
            description: `Data access volume spike detected: ${totalVolume} (baseline: ${stats.mean.toFixed(2)})`,
            affectedUsers: [],
            affectedResources: [...new Set(windowMetrics.map(m => m.source))],
            metrics: {
              baselineValue: stats.mean,
              actualValue: totalVolume,
              deviation
            },
            status: 'active'
          });
        }
      }
    }

    return anomalies;
  }

  private async detectUnusualTimeAnomalies(events: DataAccessEvent[]): Promise<AnomalyDetection[]> {
    const anomalies: AnomalyDetection[] = [];
    const pattern = this.patterns.find(p => p.type === 'unusual_time')!;
    const { businessStart, businessEnd } = pattern.parameters;

    for (const event of events) {
      const eventHour = new Date(event.timestamp).getUTCHours();
      const isBusinessHours = eventHour >= businessStart && eventHour <= businessEnd;

      if (!isBusinessHours && event.success) {
        // Check if this user typically accesses during business hours
        const userEvents = events.filter(e => e.userId === event.userId);
        const businessHourAccess = userEvents.filter(e => {
          const hour = new Date(e.timestamp).getUTCHours();
          return hour >= businessStart && hour <= businessEnd;
        });

        const businessHourRatio = businessHourAccess.length / userEvents.length;

        // Anomaly if user normally accesses during business hours but now accessing outside
        if (businessHourRatio > 0.8) {
          anomalies.push({
            id: `unusual-time-${Date.now()}-${event.id}`,
            timestamp: event.timestamp,
            anomalyType: 'unusual_time',
            severity: 'medium',
            confidence: businessHourRatio,
            description: `User ${event.userId} accessed data outside business hours (${eventHour}:00)`,
            affectedUsers: [event.userId],
            affectedResources: [event.resource],
            metrics: {
              baselineValue: businessHourRatio * 100,
              actualValue: (1 - businessHourRatio) * 100,
              deviation: 0
            },
            status: 'active'
          });
        }
      }
    }

    return anomalies;
  }

  private async detectGeoAnomalies(events: DataAccessEvent[]): Promise<AnomalyDetection[]> {
    const anomalies: AnomalyDetection[] = [];
    const userLocations = this.groupUserLocations(events);

    for (const [userId, locations] of userLocations) {
      const locationFreq = new Map<string, number>();
      locations.forEach(ip => {
        locationFreq.set(ip, (locationFreq.get(ip) || 0) + 1);
      });

      const totalAccess = locations.length;
      for (const [ip, count] of locationFreq) {
        const frequency = count / totalAccess;
        
        // If this is a new location or very infrequent location
        if (frequency < 0.1 && count === 1) {
          anomalies.push({
            id: `geo-anomaly-${Date.now()}-${userId}`,
            timestamp: Date.now(),
            anomalyType: 'geo_anomaly',
            severity: 'high',
            confidence: 1 - frequency,
            description: `User ${userId} accessed data from new location: ${ip}`,
            affectedUsers: [userId],
            affectedResources: [],
            metrics: {
              baselineValue: frequency * 100,
              actualValue: (1 - frequency) * 100,
              deviation: 0
            },
            status: 'active'
          });
        }
      }
    }

    return anomalies;
  }

  private async detectBehavioralAnomalies(events: DataAccessEvent[]): Promise<AnomalyDetection[]> {
    const anomalies: AnomalyDetection[] = [];
    const userProfiles = this.buildUserBehaviorProfiles(events);

    for (const [userId, currentProfile] of userProfiles) {
      const historicalProfile = this.getHistoricalProfile(userId);
      
      if (historicalProfile) {
        const similarity = this.calculateBehavioralSimilarity(currentProfile, historicalProfile);
        const anomalyScore = 1 - similarity;

        if (anomalyScore > (1 - this.config.sensitivity)) {
          anomalies.push({
            id: `behavioral-${Date.now()}-${userId}`,
            timestamp: Date.now(),
            anomalyType: 'behavioral',
            severity: this.calculateSeverity(anomalyScore * 3),
            confidence: anomalyScore,
            description: `Behavioral anomaly detected for user ${userId}`,
            affectedUsers: [userId],
            affectedResources: [...new Set(events.filter(e => e.userId === userId).map(e => e.resource))],
            metrics: {
              baselineValue: similarity * 100,
              actualValue: anomalyScore * 100,
              deviation: anomalyScore * 3
            },
            status: 'active'
          });
        }
      }
    }

    return anomalies;
  }

  // Helper methods
  private groupEventsByUser(events: DataAccessEvent[]): Map<string, DataAccessEvent[]> {
    const grouped = new Map<string, DataAccessEvent[]>();
    
    events.forEach(event => {
      if (!grouped.has(event.userId)) {
        grouped.set(event.userId, []);
      }
      grouped.get(event.userId)!.push(event);
    });

    return grouped;
  }

  private analyzeAccessPattern(events: DataAccessEvent[]): {
    isAnomalous: boolean;
    confidence: number;
    deviation: number;
    baseline: number;
    actual: number;
    reason: string;
  } {
    if (events.length < this.config.minDataPoints) {
      return {
        isAnomalous: false,
        confidence: 0,
        deviation: 0,
        baseline: 0,
        actual: events.length,
        reason: 'Insufficient data'
      };
    }

    const recentEvents = events.filter(e => 
      Date.now() - e.timestamp < this.config.windowSize * 60 * 1000
    );

    const baseline = this.calculateBaseline('frequency', events.map((_, i) => i));
    const stats = this.calculateStatistics(baseline);
    
    const actual = recentEvents.length;
    const deviation = Math.abs(actual - stats.mean) / stats.stdDev;

    const isAnomalous = deviation > this.patterns.find(p => p.type === 'access_pattern')!.parameters.frequencyThreshold;
    
    return {
      isAnomalous,
      confidence: Math.min(deviation / 3, 1),
      deviation,
      baseline: stats.mean,
      actual,
      reason: deviation > 2 ? 'Frequency spike' : 'Frequency drop'
    };
  }

  private groupMetricsByTimeWindow(metrics: PrivacyMetric[], windowSizeMinutes: number): Map<number, PrivacyMetric[]> {
    const windows = new Map<number, PrivacyMetric[]>();
    const windowSizeMs = windowSizeMinutes * 60 * 1000;

    metrics.forEach(metric => {
      const windowStart = Math.floor(metric.timestamp / windowSizeMs) * windowSizeMs;
      
      if (!windows.has(windowStart)) {
        windows.set(windowStart, []);
      }
      windows.get(windowStart)!.push(metric);
    });

    return windows;
  }

  private groupUserLocations(events: DataAccessEvent[]): Map<string, string[]> {
    const userLocations = new Map<string, string[]>();

    events.forEach(event => {
      if (!userLocations.has(event.userId)) {
        userLocations.set(event.userId, []);
      }
      userLocations.get(event.userId)!.push(event.ipAddress);
    });

    return userLocations;
  }

  private buildUserBehaviorProfiles(events: DataAccessEvent[]): Map<string, any> {
    const profiles = new Map<string, any>();

    const userEvents = this.groupEventsByUser(events);
    
    for (const [userId, userEvents] of userEvents) {
      const profile = {
        accessFrequency: userEvents.length,
        avgResponseTime: userEvents.reduce((sum, e) => sum + e.responseTime, 0) / userEvents.length,
        avgDataVolume: userEvents.reduce((sum, e) => sum + e.dataVolume, 0) / userEvents.length,
        resourceTypes: new Set(userEvents.map(e => e.resource)),
        accessTimes: userEvents.map(e => new Date(e.timestamp).getUTCHours()),
        riskScore: userEvents.reduce((sum, e) => sum + e.riskScore, 0) / userEvents.length
      };

      profiles.set(userId, profile);
    }

    return profiles;
  }

  private getHistoricalProfile(userId: string): any | null {
    // In a real implementation, this would fetch historical data
    // For now, return null to simulate no historical data
    return null;
  }

  private calculateBehavioralSimilarity(current: any, historical: any): number {
    // Simple similarity calculation - in production, use more sophisticated methods
    const features = ['accessFrequency', 'avgResponseTime', 'avgDataVolume', 'riskScore'];
    let similarity = 0;

    features.forEach(feature => {
      const currentVal = current[feature] || 0;
      const historicalVal = historical[feature] || 0;
      const maxVal = Math.max(currentVal, historicalVal, 1);
      const featureSimilarity = 1 - Math.abs(currentVal - historicalVal) / maxVal;
      similarity += featureSimilarity;
    });

    return similarity / features.length;
  }

  private calculateBaseline(metricType: string, values: number[]): number[] {
    const key = `baseline_${metricType}`;
    
    if (!this.baselineData.has(key)) {
      this.baselineData.set(key, []);
    }

    const baseline = this.baselineData.get(key)!;
    
    // Add new values
    baseline.push(...values);
    
    // Keep only recent values (last 1000 data points)
    if (baseline.length > 1000) {
      baseline.splice(0, baseline.length - 1000);
    }

    return baseline.slice();
  }

  private calculateStatistics(values: number[]): {
    mean: number;
    stdDev: number;
    min: number;
    max: number;
  } {
    if (values.length === 0) {
      return { mean: 0, stdDev: 0, min: 0, max: 0 };
    }

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const min = Math.min(...values);
    const max = Math.max(...values);

    return { mean, stdDev, min, max };
  }

  private calculateSeverity(deviation: number): AnomalyDetection['severity'] {
    if (deviation > 4) return 'critical';
    if (deviation > 3) return 'high';
    if (deviation > 2) return 'medium';
    return 'low';
  }

  // Training and baseline management
  public async trainModel(historicalData: DataAccessEvent[]): Promise<void> {
    if (this.isTraining) return;
    
    this.isTraining = true;
    
    try {
      // Update baselines with historical data
      const userGroups = this.groupEventsByUser(historicalData);
      
      for (const [userId, events] of userGroups) {
        const accessPattern = this.analyzeAccessPattern(events);
        if (!accessPattern.isAnomalous) {
          // Update baseline for this user
          this.calculateBaseline(`user_${userId}`, events.map((_, i) => i));
        }
      }

      console.log('Anomaly detection model training completed');
    } finally {
      this.isTraining = false;
    }
  }

  public updateConfig(newConfig: Partial<AnomalyDetectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getPatterns(): AnomalyPattern[] {
    return [...this.patterns];
  }

  public addCustomPattern(pattern: AnomalyPattern): void {
    this.patterns.push(pattern);
  }
}

export default AnomalyDetectionEngine;
