/**
 * Historical Trend Analysis Service
 */

import { 
  HistoricalTrend, 
  PrivacyMetric, 
  AnomalyDetection, 
  ComplianceStatus,
  PrivacyAlert 
} from '../types/privacyMetrics';

export interface TrendAnalysisConfig {
  timeRange: '1h' | '6h' | '24h' | '7d' | '30d' | '90d';
  granularity: 'minute' | 'hour' | 'day' | 'week' | 'month';
  smoothingFactor: number; // 0-1, for moving average
  outlierThreshold: number; // standard deviations
  enablePredictions: boolean;
}

export interface TrendInsight {
  type: 'trend' | 'seasonality' | 'anomaly' | 'correlation';
  metric: string;
  description: string;
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  recommendations: string[];
}

export interface TrendPrediction {
  timestamp: number;
  value: number;
  confidence: number;
  upperBound: number;
  lowerBound: number;
}

export class HistoricalTrendAnalyzer {
  private static instance: HistoricalTrendAnalyzer;
  private config: TrendAnalysisConfig;
  private cache: Map<string, HistoricalTrend> = new Map();

  private constructor(config: TrendAnalysisConfig) {
    this.config = config;
  }

  static getInstance(config?: TrendAnalysisConfig): HistoricalTrendAnalyzer {
    if (!HistoricalTrendAnalyzer.instance) {
      if (!config) {
        config = {
          timeRange: '7d',
          granularity: 'hour',
          smoothingFactor: 0.3,
          outlierThreshold: 2.5,
          enablePredictions: true
        };
      }
      HistoricalTrendAnalyzer.instance = new HistoricalTrendAnalyzer(config);
    }
    return HistoricalTrendAnalyzer.instance;
  }

  // Main analysis methods
  public async analyzeTrends(
    metrics: PrivacyMetric[],
    metricName: string,
    customConfig?: Partial<TrendAnalysisConfig>
  ): Promise<HistoricalTrend> {
    const config = { ...this.config, ...customConfig };
    const cacheKey = `${metricName}-${config.timeRange}-${config.granularity}`;

    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Filter and aggregate data
    const filteredMetrics = this.filterMetricsByTimeRange(metrics, config.timeRange);
    const aggregatedData = this.aggregateMetrics(filteredMetrics, config.granularity);

    // Calculate statistics
    const statistics = this.calculateStatistics(aggregatedData);
    
    // Detect anomalies
    const anomalies = this.detectAnomalies(aggregatedData, statistics);
    
    // Calculate trend
    const trend = this.calculateTrend(aggregatedData);

    const historicalTrend: HistoricalTrend = {
      metric: metricName,
      timeRange: this.getTimeRange(config.timeRange),
      granularity: config.granularity,
      dataPoints: aggregatedData,
      statistics,
      anomalies,
      trend
    };

    // Cache the result
    this.cache.set(cacheKey, historicalTrend);

    return historicalTrend;
  }

  public generateInsights(trends: HistoricalTrend[]): TrendInsight[] {
    const insights: TrendInsight[] = [];

    for (const trend of trends) {
      // Trend insights
      if (Math.abs(trend.trend.slope) > 0.1) {
        insights.push({
          type: 'trend',
          metric: trend.metric,
          description: `${trend.metric} is ${trend.trend.direction} with ${(trend.trend.slope * 100).toFixed(2)}% change rate`,
          confidence: Math.abs(trend.trend.correlation),
          impact: Math.abs(trend.trend.slope) > 0.5 ? 'high' : 'medium',
          recommendations: this.generateTrendRecommendations(trend)
        });
      }

      // Anomaly insights
      if (trend.anomalies.length > 0) {
        insights.push({
          type: 'anomaly',
          metric: trend.metric,
          description: `${trend.anomalies.length} anomalies detected in ${trend.metric}`,
          confidence: 0.8,
          impact: trend.anomalies.length > 5 ? 'high' : 'medium',
          recommendations: [
            'Investigate the root cause of anomalies',
            'Consider adjusting alert thresholds',
            'Review data quality and collection processes'
          ]
        });
      }

      // Seasonality insights (for longer time ranges)
      if (trend.timeRange.end - trend.timeRange.start > 7 * 24 * 60 * 60 * 1000) {
        const seasonality = this.detectSeasonality(trend.dataPoints);
        if (seasonality.detected) {
          insights.push({
            type: 'seasonality',
            metric: trend.metric,
            description: `Seasonal pattern detected in ${trend.metric} with ${seasonality.period} period`,
            confidence: seasonality.confidence,
            impact: 'medium',
            recommendations: [
              'Account for seasonal patterns in forecasting',
              'Adjust resource allocation based on seasonal patterns',
              'Monitor for seasonal anomaly deviations'
            ]
          });
        }
      }
    }

    return insights.sort((a, b) => b.confidence - a.confidence);
  }

  public generatePredictions(trend: HistoricalTrend, futurePoints: number = 24): TrendPrediction[] {
    if (!this.config.enablePredictions) {
      return [];
    }

    const dataPoints = trend.dataPoints;
    if (dataPoints.length < 10) {
      return [];
    }

    // Simple linear regression for prediction
    const { slope, intercept } = this.calculateLinearRegression(dataPoints);
    const lastTimestamp = dataPoints[dataPoints.length - 1].timestamp;
    const timeInterval = this.getTimeInterval(dataPoints);

    const predictions: TrendPrediction[] = [];
    
    for (let i = 1; i <= futurePoints; i++) {
      const futureTimestamp = lastTimestamp + (i * timeInterval);
      const predictedValue = slope * futureTimestamp + intercept;
      
      // Calculate confidence bounds based on historical variance
      const variance = this.calculatePredictionVariance(dataPoints, slope, intercept);
      const confidence = Math.max(0.1, 1 - (variance / predictedValue));
      const margin = Math.sqrt(variance) * 1.96; // 95% confidence interval

      predictions.push({
        timestamp: futureTimestamp,
        value: predictedValue,
        confidence,
        upperBound: predictedValue + margin,
        lowerBound: Math.max(0, predictedValue - margin)
      });
    }

    return predictions;
  }

  public compareTrends(trends: HistoricalTrend[]): {
    correlations: Array<{
      metric1: string;
      metric2: string;
      correlation: number;
      significance: 'low' | 'medium' | 'high';
    }>;
    insights: string[];
  } {
    const correlations: Array<{
      metric1: string;
      metric2: string;
      correlation: number;
      significance: 'low' | 'medium' | 'high';
    }> = [];
    const insights: string[] = [];

    // Calculate pairwise correlations
    for (let i = 0; i < trends.length; i++) {
      for (let j = i + 1; j < trends.length; j++) {
        const correlation = this.calculateCorrelation(trends[i].dataPoints, trends[j].dataPoints);
        
        if (!isNaN(correlation)) {
          let significance: 'low' | 'medium' | 'high' = 'low';
          if (Math.abs(correlation) > 0.7) significance = 'high';
          else if (Math.abs(correlation) > 0.4) significance = 'medium';

          correlations.push({
            metric1: trends[i].metric,
            metric2: trends[j].metric,
            correlation,
            significance
          });

          // Generate insights for strong correlations
          if (significance === 'high') {
            const direction = correlation > 0 ? 'positively' : 'negatively';
            insights.push(
              `${trends[i].metric} and ${trends[j].metric} are strongly ${direction} correlated (${correlation.toFixed(3)})`
            );
          }
        }
      }
    }

    return { correlations, insights };
  }

  // Helper methods
  private filterMetricsByTimeRange(metrics: PrivacyMetric[], timeRange: string): PrivacyMetric[] {
    const range = this.getTimeRange(timeRange);
    return metrics.filter(m => m.timestamp >= range.start && m.timestamp <= range.end);
  }

  private aggregateMetrics(metrics: PrivacyMetric[], granularity: string): Array<{
    timestamp: number;
    value: number;
    metadata?: Record<string, any>;
  }> {
    if (metrics.length === 0) return [];

    const intervalMs = this.getGranularityInterval(granularity);
    const grouped = new Map<number, number[]>();

    // Group metrics by time intervals
    metrics.forEach(metric => {
      const intervalStart = Math.floor(metric.timestamp / intervalMs) * intervalMs;
      
      if (!grouped.has(intervalStart)) {
        grouped.set(intervalStart, []);
      }
      grouped.get(intervalStart)!.push(metric.value);
    });

    // Aggregate each group
    const aggregated: Array<{
      timestamp: number;
      value: number;
      metadata?: Record<string, any>;
    }> = [];

    grouped.forEach((values, timestamp) => {
      const avgValue = values.reduce((sum, val) => sum + val, 0) / values.length;
      aggregated.push({
        timestamp,
        value: avgValue,
        metadata: {
          count: values.length,
          min: Math.min(...values),
          max: Math.max(...values)
        }
      });
    });

    return aggregated.sort((a, b) => a.timestamp - b.timestamp);
  }

  private calculateStatistics(dataPoints: Array<{ timestamp: number; value: number }>): {
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
  } {
    if (dataPoints.length === 0) {
      return {
        min: 0,
        max: 0,
        avg: 0,
        median: 0,
        stdDev: 0,
        trend: { direction: 'stable', slope: 0, correlation: 0 }
      };
    }

    const values = dataPoints.map(p => p.value);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    const sortedValues = [...values].sort((a, b) => a - b);
    const median = sortedValues.length % 2 === 0
      ? (sortedValues[sortedValues.length / 2 - 1] + sortedValues[sortedValues.length / 2]) / 2
      : sortedValues[Math.floor(sortedValues.length / 2)];

    const trend = this.calculateTrend(dataPoints);

    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: mean,
      median,
      stdDev,
      trend
    };
  }

  private calculateTrend(dataPoints: Array<{ timestamp: number; value: number }>): {
    direction: 'up' | 'down' | 'stable';
    slope: number;
    correlation: number;
  } {
    if (dataPoints.length < 2) {
      return { direction: 'stable', slope: 0, correlation: 0 };
    }

    const { slope, correlation } = this.calculateLinearRegression(dataPoints);
    
    let direction: 'up' | 'down' | 'stable' = 'stable';
    if (Math.abs(slope) > 0.001) {
      direction = slope > 0 ? 'up' : 'down';
    }

    return { direction, slope, correlation };
  }

  private calculateLinearRegression(dataPoints: Array<{ timestamp: number; value: number }>): {
    slope: number;
    intercept: number;
    correlation: number;
  } {
    const n = dataPoints.length;
    if (n < 2) return { slope: 0, intercept: 0, correlation: 0 };

    const x = dataPoints.map(p => p.timestamp);
    const y = dataPoints.map(p => p.value);

    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumXX = x.reduce((sum, val) => sum + val * val, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate correlation coefficient
    const meanX = sumX / n;
    const meanY = sumY / n;
    
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

    const correlation = numerator / Math.sqrt(sumXSquared * sumYSquared);

    return { slope, intercept, correlation };
  }

  private detectAnomalies(
    dataPoints: Array<{ timestamp: number; value: number }>,
    statistics: { mean: number; stdDev: number }
  ): Array<{ timestamp: number; value: number; score: number }> {
    const anomalies: Array<{ timestamp: number; value: number; score: number }> = [];

    dataPoints.forEach(point => {
      const zScore = Math.abs(point.value - statistics.mean) / statistics.stdDev;
      
      if (zScore > this.config.outlierThreshold) {
        anomalies.push({
          timestamp: point.timestamp,
          value: point.value,
          score: Math.min(zScore / this.config.outlierThreshold, 1)
        });
      }
    });

    return anomalies;
  }

  private detectSeasonality(dataPoints: Array<{ timestamp: number; value: number }>): {
    detected: boolean;
    period: number;
    confidence: number;
  } {
    // Simple seasonality detection using autocorrelation
    if (dataPoints.length < 24) {
      return { detected: false, period: 0, confidence: 0 };
    }

    const values = dataPoints.map(p => p.value);
    const maxLag = Math.min(dataPoints.length / 2, 168); // Check up to 1 week for hourly data
    
    let maxCorrelation = 0;
    let bestPeriod = 0;

    for (let lag = 1; lag < maxLag; lag++) {
      const correlation = this.calculateAutocorrelation(values, lag);
      if (correlation > maxCorrelation) {
        maxCorrelation = correlation;
        bestPeriod = lag;
      }
    }

    return {
      detected: maxCorrelation > 0.6,
      period: bestPeriod,
      confidence: maxCorrelation
    };
  }

  private calculateAutocorrelation(values: number[], lag: number): number {
    if (lag >= values.length) return 0;

    const n = values.length - lag;
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    
    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      const xDiff = values[i] - mean;
      const yDiff = values[i + lag] - mean;
      numerator += xDiff * yDiff;
      denominator += xDiff * xDiff;
    }

    return denominator === 0 ? 0 : numerator / denominator;
  }

  private calculateCorrelation(
    data1: Array<{ timestamp: number; value: number }>,
    data2: Array<{ timestamp: number; value: number }>
  ): number {
    // Align data points by timestamp
    const aligned = this.alignDataPoints(data1, data2);
    
    if (aligned.length < 3) return NaN;

    const values1 = aligned.map(p => p.value1);
    const values2 = aligned.map(p => p.value2);

    const mean1 = values1.reduce((sum, val) => sum + val, 0) / values1.length;
    const mean2 = values2.reduce((sum, val) => sum + val, 0) / values2.length;

    let numerator = 0;
    let sumXSquared = 0;
    let sumYSquared = 0;

    for (let i = 0; i < aligned.length; i++) {
      const xDiff = values1[i] - mean1;
      const yDiff = values2[i] - mean2;
      numerator += xDiff * yDiff;
      sumXSquared += xDiff * xDiff;
      sumYSquared += yDiff * yDiff;
    }

    const denominator = Math.sqrt(sumXSquared * sumYSquared);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  private alignDataPoints(
    data1: Array<{ timestamp: number; value: number }>,
    data2: Array<{ timestamp: number; value: number }>
  ): Array<{ timestamp: number; value1: number; value2: number }> {
    const aligned: Array<{ timestamp: number; value1: number; value2: number }> = [];
    const map2 = new Map(data2.map(p => [p.timestamp, p.value]));

    data1.forEach(point1 => {
      const value2 = map2.get(point1.timestamp);
      if (value2 !== undefined) {
        aligned.push({
          timestamp: point1.timestamp,
          value1: point1.value,
          value2
        });
      }
    });

    return aligned;
  }

  private calculatePredictionVariance(
    dataPoints: Array<{ timestamp: number; value: number }>,
    slope: number,
    intercept: number
  ): number {
    const residuals = dataPoints.map(point => {
      const predicted = slope * point.timestamp + intercept;
      return point.value - predicted;
    });

    const mean = residuals.reduce((sum, val) => sum + val, 0) / residuals.length;
    return residuals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / residuals.length;
  }

  private getTimeInterval(dataPoints: Array<{ timestamp: number }>): number {
    if (dataPoints.length < 2) return 3600000; // Default 1 hour

    const intervals: number[] = [];
    for (let i = 1; i < dataPoints.length; i++) {
      intervals.push(dataPoints[i].timestamp - dataPoints[i - 1].timestamp);
    }

    return intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
  }

  private generateTrendRecommendations(trend: HistoricalTrend): string[] {
    const recommendations: string[] = [];

    if (trend.trend.direction === 'up' && trend.trend.slope > 0.1) {
      recommendations.push('Monitor the increasing trend - it may indicate growing system load');
      recommendations.push('Consider capacity planning based on current growth rate');
    } else if (trend.trend.direction === 'down' && trend.trend.slope < -0.1) {
      recommendations.push('Investigate the decreasing trend - it may indicate system issues');
      recommendations.push('Review recent changes that might have affected this metric');
    }

    if (trend.statistics.stdDev / trend.statistics.avg > 0.3) {
      recommendations.push('High variability detected - consider implementing stabilization measures');
    }

    if (trend.anomalies.length > trend.dataPoints.length * 0.1) {
      recommendations.push('High anomaly rate detected - review data quality and collection processes');
    }

    return recommendations;
  }

  private getTimeRange(timeRange: string): { start: number; end: number } {
    const now = Date.now();
    const ranges = {
      '1h': now - 60 * 60 * 1000,
      '6h': now - 6 * 60 * 60 * 1000,
      '24h': now - 24 * 60 * 60 * 1000,
      '7d': now - 7 * 24 * 60 * 60 * 1000,
      '30d': now - 30 * 24 * 60 * 60 * 1000,
      '90d': now - 90 * 24 * 60 * 60 * 1000
    };
    
    return {
      start: ranges[timeRange as keyof typeof ranges] || ranges['24h'],
      end: now
    };
  }

  private getGranularityInterval(granularity: string): number {
    const intervals = {
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000
    };
    
    return intervals[granularity as keyof typeof intervals] || intervals['hour'];
  }

  // Configuration management
  public updateConfig(newConfig: Partial<TrendAnalysisConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.clearCache();
  }

  public getConfig(): TrendAnalysisConfig {
    return { ...this.config };
  }

  // Cache management
  public clearCache(): void {
    this.cache.clear();
  }

  public getCacheSize(): number {
    return this.cache.size;
  }

  // Export functionality
  public exportTrends(trends: HistoricalTrend[]): string {
    return JSON.stringify({
      trends,
      exportedAt: Date.now(),
      config: this.config
    }, null, 2);
  }

  // Batch analysis
  public async analyzeMultipleMetrics(
    metrics: PrivacyMetric[],
    metricNames: string[]
  ): Promise<HistoricalTrend[]> {
    const trends: HistoricalTrend[] = [];

    for (const metricName of metricNames) {
      const metricData = metrics.filter(m => m.metricType === metricName);
      if (metricData.length > 0) {
        const trend = await this.analyzeTrends(metricData, metricName);
        trends.push(trend);
      }
    }

    return trends;
  }
}

export default HistoricalTrendAnalyzer;
