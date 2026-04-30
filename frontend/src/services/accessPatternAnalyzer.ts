/**
 * Data Access Pattern Analyzer
 */

import { 
  DataAccessEvent, 
  AccessPattern, 
  PrivacyMetric 
} from '../types/privacyMetrics';

export interface PatternAnalysisConfig {
  timeWindow: number; // minutes
  minAccessCount: number;
  riskThresholds: {
    frequency: number;
    volume: number;
    time: number;
    location: number;
  };
  enableML: boolean;
}

export interface PatternInsight {
  type: 'frequency' | 'timing' | 'volume' | 'location' | 'resource';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  confidence: number;
  recommendation: string;
  metrics: Record<string, number>;
}

export class AccessPatternAnalyzer {
  private static instance: AccessPatternAnalyzer;
  private config: PatternAnalysisConfig;
  private historicalPatterns: Map<string, AccessPattern[]> = new Map();

  private constructor(config: PatternAnalysisConfig) {
    this.config = config;
  }

  static getInstance(config?: PatternAnalysisConfig): AccessPatternAnalyzer {
    if (!AccessPatternAnalyzer.instance) {
      if (!config) {
        config = {
          timeWindow: 60, // 1 hour
          minAccessCount: 10,
          riskThresholds: {
            frequency: 2.5,
            volume: 3.0,
            time: 0.8,
            location: 0.7
          },
          enableML: false
        };
      }
      AccessPatternAnalyzer.instance = new AccessPatternAnalyzer(config);
    }
    return AccessPatternAnalyzer.instance;
  }

  // Main analysis methods
  public async analyzeAccessPatterns(events: DataAccessEvent[]): Promise<AccessPattern[]> {
    const patterns: AccessPattern[] = [];
    const userGroups = this.groupEventsByUser(events);

    for (const [userId, userEvents] of userGroups) {
      if (userEvents.length < this.config.minAccessCount) {
        continue; // Skip users with insufficient data
      }

      const pattern = await this.analyzeUserPattern(userId, userEvents);
      patterns.push(pattern);

      // Store for historical comparison
      this.storeHistoricalPattern(userId, pattern);
    }

    return patterns;
  }

  public async generatePatternInsights(patterns: AccessPattern[]): Promise<PatternInsight[]> {
    const insights: PatternInsight[] = [];

    for (const pattern of patterns) {
      const userInsights = this.analyzePatternForInsights(pattern);
      insights.push(...userInsights);
    }

    return insights.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  private async analyzeUserPattern(userId: string, events: DataAccessEvent[]): Promise<AccessPattern> {
    const timeWindow = this.getTimeWindow(events);
    
    // Analyze different aspects of the pattern
    const frequencyAnalysis = this.analyzeFrequency(events);
    const resourceAnalysis = this.analyzeResourceTypes(events);
    const timeAnalysis = this.analyzeTimePatterns(events);
    const geoAnalysis = this.analyzeGeoPatterns(events);
    const deviceAnalysis = this.analyzeDevicePatterns(events);
    
    // Calculate trend
    const trend = this.calculateTrend(events);
    
    // Identify risk indicators
    const riskIndicators = this.identifyRiskIndicators(events, {
      frequency: frequencyAnalysis,
      time: timeAnalysis,
      location: geoAnalysis
    });

    return {
      userId,
      timeWindow,
      accessFrequency: frequencyAnalysis.average,
      resourceTypes: resourceAnalysis.distribution,
      timePatterns: {
        hourly: timeAnalysis.hourly,
        daily: timeAnalysis.daily
      },
      geoPatterns: geoAnalysis.distribution,
      devicePatterns: deviceAnalysis.distribution,
      riskIndicators,
      trendDirection: trend.direction,
      trendMagnitude: trend.magnitude
    };
  }

  private analyzeFrequency(events: DataAccessEvent[]): {
    average: number;
    peak: number;
    variance: number;
    distribution: number[];
  } {
    const timeWindow = this.getTimeWindow(events);
    const windowHours = timeWindow.end - timeWindow.start;
    const hourlyBuckets = new Array(Math.ceil(windowHours / (60 * 60 * 1000))).fill(0);

    events.forEach(event => {
      const hourIndex = Math.floor((event.timestamp - timeWindow.start) / (60 * 60 * 1000));
      if (hourIndex >= 0 && hourIndex < hourlyBuckets.length) {
        hourlyBuckets[hourIndex]++;
      }
    });

    const average = events.length / (windowHours / (60 * 60 * 1000));
    const peak = Math.max(...hourlyBuckets);
    const variance = this.calculateVariance(hourlyBuckets);

    return {
      average,
      peak,
      variance,
      distribution: hourlyBuckets
    };
  }

  private analyzeResourceTypes(events: DataAccessEvent[]): {
    distribution: Record<string, number>;
    diversity: number;
    primaryResource: string;
  } {
    const resourceCount = new Map<string, number>();

    events.forEach(event => {
      resourceCount.set(event.resource, (resourceCount.get(event.resource) || 0) + 1);
    });

    const distribution: Record<string, number> = {};
    let total = 0;

    resourceCount.forEach((count, resource) => {
      distribution[resource] = count;
      total += count;
    });

    // Normalize to percentages
    Object.keys(distribution).forEach(resource => {
      distribution[resource] = (distribution[resource] / total) * 100;
    });

    const diversity = Object.keys(distribution).length;
    const primaryResource = Object.entries(distribution)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || '';

    return {
      distribution,
      diversity,
      primaryResource
    };
  }

  private analyzeTimePatterns(events: DataAccessEvent[]): {
    hourly: Record<number, number>;
    daily: Record<number, number>;
    businessHourRatio: number;
    weekendRatio: number;
  } {
    const hourly: Record<number, number> = {};
    const daily: Record<number, number> = {};
    let businessHourCount = 0;
    let weekendCount = 0;

    events.forEach(event => {
      const date = new Date(event.timestamp);
      const hour = date.getUTCHours();
      const day = date.getUTCDay();

      hourly[hour] = (hourly[hour] || 0) + 1;
      daily[day] = (daily[day] || 0) + 1;

      // Business hours (9 AM - 5 PM UTC)
      if (hour >= 9 && hour <= 17) {
        businessHourCount++;
      }

      // Weekend (Saturday = 6, Sunday = 0)
      if (day === 0 || day === 6) {
        weekendCount++;
      }
    });

    const businessHourRatio = businessHourCount / events.length;
    const weekendRatio = weekendCount / events.length;

    return {
      hourly,
      daily,
      businessHourRatio,
      weekendRatio
    };
  }

  private analyzeGeoPatterns(events: DataAccessEvent[]): {
    distribution: Record<string, number>;
    uniqueLocations: number;
    primaryLocation: string;
    locationEntropy: number;
  } {
    const locationCount = new Map<string, number>();

    events.forEach(event => {
      locationCount.set(event.ipAddress, (locationCount.get(event.ipAddress) || 0) + 1);
    });

    const distribution: Record<string, number> = {};
    let total = 0;

    locationCount.forEach((count, location) => {
      distribution[location] = count;
      total += count;
    });

    // Normalize to percentages
    Object.keys(distribution).forEach(location => {
      distribution[location] = (distribution[location] / total) * 100;
    });

    const uniqueLocations = locationCount.size;
    const primaryLocation = Object.entries(distribution)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || '';

    // Calculate entropy (measure of location diversity)
    let entropy = 0;
    locationCount.forEach(count => {
      const probability = count / total;
      if (probability > 0) {
        entropy -= probability * Math.log2(probability);
      }
    });

    return {
      distribution,
      uniqueLocations,
      primaryLocation,
      locationEntropy: entropy
    };
  }

  private analyzeDevicePatterns(events: DataAccessEvent[]): {
    distribution: Record<string, number>;
    uniqueDevices: number;
    primaryDevice: string;
  } {
    const deviceCount = new Map<string, number>();

    events.forEach(event => {
      // Extract device type from user agent (simplified)
      const device = this.extractDeviceType(event.userAgent);
      deviceCount.set(device, (deviceCount.get(device) || 0) + 1);
    });

    const distribution: Record<string, number> = {};
    let total = 0;

    deviceCount.forEach((count, device) => {
      distribution[device] = count;
      total += count;
    });

    // Normalize to percentages
    Object.keys(distribution).forEach(device => {
      distribution[device] = (distribution[device] / total) * 100;
    });

    const uniqueDevices = deviceCount.size;
    const primaryDevice = Object.entries(distribution)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || '';

    return {
      distribution,
      uniqueDevices,
      primaryDevice
    };
  }

  private extractDeviceType(userAgent: string): string {
    const ua = userAgent.toLowerCase();
    
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return 'mobile';
    } else if (ua.includes('tablet') || ua.includes('ipad')) {
      return 'tablet';
    } else if (ua.includes('bot') || ua.includes('crawler')) {
      return 'bot';
    } else {
      return 'desktop';
    }
  }

  private calculateTrend(events: DataAccessEvent[]): {
    direction: 'increasing' | 'decreasing' | 'stable';
    magnitude: number;
  } {
    // Sort events by timestamp
    const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);
    
    // Split into two halves
    const midPoint = Math.floor(sortedEvents.length / 2);
    const firstHalf = sortedEvents.slice(0, midPoint);
    const secondHalf = sortedEvents.slice(midPoint);

    const firstHalfRate = this.calculateAccessRate(firstHalf);
    const secondHalfRate = this.calculateAccessRate(secondHalf);

    const change = secondHalfRate - firstHalfRate;
    const magnitude = Math.abs(change) / (firstHalfRate || 1);

    let direction: 'increasing' | 'decreasing' | 'stable';
    if (Math.abs(change) < 0.1) {
      direction = 'stable';
    } else if (change > 0) {
      direction = 'increasing';
    } else {
      direction = 'decreasing';
    }

    return { direction, magnitude };
  }

  private calculateAccessRate(events: DataAccessEvent[]): number {
    if (events.length < 2) return 0;

    const timeSpan = events[events.length - 1].timestamp - events[0].timestamp;
    return (events.length / timeSpan) * (60 * 60 * 1000); // accesses per hour
  }

  private identifyRiskIndicators(events: DataAccessEvent[], analyses: {
    frequency: any;
    time: any;
    location: any;
  }): AccessPattern['riskIndicators'] {
    const { frequency, time, location } = analyses;
    const thresholds = this.config.riskThresholds;

    return {
      unusualFrequency: frequency.variance > thresholds.frequency,
      unusualTime: time.businessHourRatio < (1 - thresholds.time),
      unusualLocation: location.locationEntropy > thresholds.location,
      volumeAnomaly: frequency.peak > (frequency.average * thresholds.volume)
    };
  }

  private analyzePatternForInsights(pattern: AccessPattern): PatternInsight[] {
    const insights: PatternInsight[] = [];

    // Frequency insights
    if (pattern.riskIndicators.unusualFrequency) {
      insights.push({
        type: 'frequency',
        severity: 'medium',
        description: `Unusual access frequency pattern detected for user ${pattern.userId}`,
        confidence: 0.8,
        recommendation: 'Review user activity and consider additional monitoring',
        metrics: {
          frequency: pattern.accessFrequency,
          variance: this.calculateVariance(Object.values(pattern.timePatterns.hourly))
        }
      });
    }

    // Timing insights
    if (pattern.riskIndicators.unusualTime) {
      insights.push({
        type: 'timing',
        severity: 'high',
        description: `User ${pattern.userId} accessing data outside normal business hours`,
        confidence: pattern.timePatterns.businessHourRatio < 0.2 ? 0.9 : 0.7,
        recommendation: 'Verify user identity and review access authorization',
        metrics: {
          businessHourRatio: pattern.timePatterns.businessHourRatio,
          weekendRatio: pattern.timePatterns.daily[0] + pattern.timePatterns.daily[6]
        }
      });
    }

    // Location insights
    if (pattern.riskIndicators.unusualLocation) {
      insights.push({
        type: 'location',
        severity: 'medium',
        description: `Multiple geographic locations detected for user ${pattern.userId}`,
        confidence: pattern.geoPatterns.uniqueLocations > 3 ? 0.8 : 0.6,
        recommendation: 'Verify if multi-location access is authorized for this user',
        metrics: {
          uniqueLocations: pattern.geoPatterns.uniqueLocations,
          locationEntropy: pattern.geoPatterns.locationEntropy
        }
      });
    }

    // Volume insights
    if (pattern.riskIndicators.volumeAnomaly) {
      insights.push({
        type: 'volume',
        severity: 'high',
        description: `Unusual data access volume detected for user ${pattern.userId}`,
        confidence: 0.85,
        recommendation: 'Review data access patterns and potential data exfiltration risks',
        metrics: {
          currentVolume: pattern.accessFrequency,
          trendMagnitude: pattern.trendMagnitude
        }
      });
    }

    // Resource insights
    const resourceDiversity = Object.keys(pattern.resourceTypes).length;
    if (resourceDiversity > 10) {
      insights.push({
        type: 'resource',
        severity: 'low',
        description: `User ${pattern.userId} accessing diverse set of resources`,
        confidence: 0.6,
        recommendation: 'Monitor for potential privilege escalation or unauthorized access',
        metrics: {
          resourceDiversity,
          primaryResourcePercentage: Math.max(...Object.values(pattern.resourceTypes))
        }
      });
    }

    return insights;
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

  private getTimeWindow(events: DataAccessEvent[]): { start: number; end: number } {
    const timestamps = events.map(e => e.timestamp);
    return {
      start: Math.min(...timestamps),
      end: Math.max(...timestamps)
    };
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    
    return variance;
  }

  private storeHistoricalPattern(userId: string, pattern: AccessPattern): void {
    if (!this.historicalPatterns.has(userId)) {
      this.historicalPatterns.set(userId, []);
    }

    const userPatterns = this.historicalPatterns.get(userId)!;
    userPatterns.push(pattern);

    // Keep only last 30 patterns
    if (userPatterns.length > 30) {
      userPatterns.shift();
    }
  }

  // Pattern comparison methods
  public compareWithHistorical(userId: string, currentPattern: AccessPattern): {
    similarity: number;
    changes: string[];
    riskLevel: 'low' | 'medium' | 'high';
  } {
    const historical = this.historicalPatterns.get(userId) || [];
    
    if (historical.length === 0) {
      return {
        similarity: 0,
        changes: ['No historical data available'],
        riskLevel: 'medium'
      };
    }

    const lastPattern = historical[historical.length - 1];
    const changes: string[] = [];
    let similarityScore = 0;
    let totalChecks = 0;

    // Compare frequency
    const freqChange = Math.abs(currentPattern.accessFrequency - lastPattern.accessFrequency) / lastPattern.accessFrequency;
    if (freqChange > 0.5) {
      changes.push(`Access frequency changed by ${(freqChange * 100).toFixed(1)}%`);
    }
    similarityScore += Math.max(0, 1 - freqChange);
    totalChecks++;

    // Compare resource diversity
    const currentDiversity = Object.keys(currentPattern.resourceTypes).length;
    const lastDiversity = Object.keys(lastPattern.resourceTypes).length;
    const diversityChange = Math.abs(currentDiversity - lastDiversity) / Math.max(lastDiversity, 1);
    if (diversityChange > 0.3) {
      changes.push(`Resource diversity changed from ${lastDiversity} to ${currentDiversity}`);
    }
    similarityScore += Math.max(0, 1 - diversityChange);
    totalChecks++;

    // Compare trend
    if (currentPattern.trendDirection !== lastPattern.trendDirection) {
      changes.push(`Access trend changed from ${lastPattern.trendDirection} to ${currentPattern.trendDirection}`);
    }
    similarityScore += currentPattern.trendDirection === lastPattern.trendDirection ? 1 : 0.5;
    totalChecks++;

    const similarity = similarityScore / totalChecks;

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (similarity < 0.3) {
      riskLevel = 'high';
    } else if (similarity < 0.7) {
      riskLevel = 'medium';
    }

    return { similarity, changes, riskLevel };
  }

  // Configuration management
  public updateConfig(newConfig: Partial<PatternAnalysisConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getHistoricalPatterns(userId: string): AccessPattern[] {
    return this.historicalPatterns.get(userId) || [];
  }

  public clearHistoricalData(): void {
    this.historicalPatterns.clear();
  }
}

export default AccessPatternAnalyzer;
