/**
 * Advanced data sampling and aggregation algorithms for memory-efficient chart rendering
 */

export interface DataPoint {
  timestamp: number;
  value: number;
  [key: string]: number | string;
}

export interface SamplingOptions {
  maxPoints: number;
  preserveExtrema?: boolean;
  adaptiveSampling?: boolean;
  memoryThreshold?: number;
}

/**
 * Largest Triangle Three Buckets (LTTB) algorithm
 * Preserves visual characteristics while significantly reducing data points
 */
export function lttbSampling(data: DataPoint[], maxPoints: number): DataPoint[] {
  if (data.length <= maxPoints) return data;

  const sampled: DataPoint[] = [];
  const bucketSize = (data.length - 2) / (maxPoints - 2);

  // Always include first point
  sampled.push(data[0]);

  for (let i = 0; i < maxPoints - 2; i++) {
    const bucketStart = Math.floor(i * bucketSize) + 1;
    const bucketEnd = Math.floor((i + 1) * bucketSize) + 1;
    const nextBucketStart = Math.floor((i + 2) * bucketSize) + 1;

    // Get current bucket
    const currentBucket = data.slice(bucketStart, Math.min(bucketEnd, data.length));
    if (currentBucket.length === 0) continue;

    // Get next bucket average point
    const nextBucket = data.slice(
      nextBucketStart,
      Math.min(nextBucketStart + bucketSize, data.length)
    );
    const nextAvgPoint = nextBucket.length > 0
      ? nextBucket.reduce((sum, p) => sum + p.value, 0) / nextBucket.length
      : data[data.length - 1].value;

    // Find the point in current bucket that creates the largest triangle
    let maxArea = -1;
    let selectedPoint = currentBucket[0];

    const prevPoint = sampled[sampled.length - 1];

    currentBucket.forEach(point => {
      // Calculate triangle area
      const area = Math.abs(
        (prevPoint.value - nextAvgPoint) * (point.timestamp - prevPoint.timestamp) -
        (prevPoint.value - point.value) * (nextAvgPoint - prevPoint.timestamp)
      ) / 2;

      if (area > maxArea) {
        maxArea = area;
        selectedPoint = point;
      }
    });

    sampled.push(selectedPoint);
  }

  // Always include last point
  sampled.push(data[data.length - 1]);

  return sampled;
}

/**
 * Min-Max sampling algorithm
 * Preserves important peaks and valleys
 */
export function minMaxSampling(data: DataPoint[], maxPoints: number): DataPoint[] {
  if (data.length <= maxPoints) return data;

  const sampled: DataPoint[] = [];
  const bucketSize = Math.ceil(data.length / maxPoints);

  for (let i = 0; i < data.length; i += bucketSize) {
    const bucket = data.slice(i, i + bucketSize);
    if (bucket.length === 0) continue;

    // Find min and max in bucket
    let minPoint = bucket[0];
    let maxPoint = bucket[0];

    bucket.forEach(point => {
      if (point.value < minPoint.value) minPoint = point;
      if (point.value > maxPoint.value) maxPoint = point;
    });

    // Add min and max if they're different
    if (minPoint.timestamp !== maxPoint.timestamp) {
      sampled.push(minPoint.timestamp < maxPoint.timestamp ? minPoint : maxPoint);
      sampled.push(minPoint.timestamp < maxPoint.timestamp ? maxPoint : minPoint);
    } else {
      sampled.push(minPoint);
    }
  }

  // If we still have too many points, apply LTTB
  if (sampled.length > maxPoints) {
    return lttbSampling(sampled, maxPoints);
  }

  return sampled.slice(0, maxPoints);
}

/**
 * Adaptive sampling based on data variance
 */
export function adaptiveSampling(data: DataPoint[], maxPoints: number): DataPoint[] {
  if (data.length <= maxPoints) return data;

  // Calculate variance in different regions
  const windowSize = Math.min(100, Math.floor(data.length / 10));
  const variances: number[] = [];

  for (let i = 0; i < data.length - windowSize; i += windowSize) {
    const window = data.slice(i, i + windowSize);
    const mean = window.reduce((sum, p) => sum + p.value, 0) / window.length;
    const variance = window.reduce((sum, p) => sum + Math.pow(p.value - mean, 2), 0) / window.length;
    variances.push(variance);
  }

  // Allocate more points to high-variance regions
  const totalVariance = variances.reduce((sum, v) => sum + v, 0);
  const pointsPerBucket = variances.map(v => 
    Math.max(1, Math.floor((v / totalVariance) * maxPoints))
  );

  const sampled: DataPoint[] = [];
  let dataIndex = 0;

  pointsPerBucket.forEach((points, bucketIndex) => {
    const bucketStart = bucketIndex * windowSize;
    const bucketEnd = Math.min(bucketStart + windowSize, data.length);
    const bucket = data.slice(bucketStart, bucketEnd);

    if (bucket.length === 0) return;

    const bucketSampled = lttbSampling(bucket, Math.min(points, bucket.length));
    sampled.push(...bucketSampled);
  });

  return sampled.slice(0, maxPoints);
}

/**
 * Time-based aggregation for time series data
 */
export function timeBasedAggregation(
  data: DataPoint[], 
  intervalMs: number,
  aggregationType: 'avg' | 'min' | 'max' | 'sum' = 'avg'
): DataPoint[] {
  if (data.length === 0) return [];

  const aggregated: DataPoint[] = [];
  const startTime = data[0].timestamp;

  for (let time = startTime; time <= data[data.length - 1].timestamp; time += intervalMs) {
    const window = data.filter(
      point => point.timestamp >= time && point.timestamp < time + intervalMs
    );

    if (window.length === 0) continue;

    let aggregatedValue: number;
    switch (aggregationType) {
      case 'avg':
        aggregatedValue = window.reduce((sum, p) => sum + p.value, 0) / window.length;
        break;
      case 'min':
        aggregatedValue = Math.min(...window.map(p => p.value));
        break;
      case 'max':
        aggregatedValue = Math.max(...window.map(p => p.value));
        break;
      case 'sum':
        aggregatedValue = window.reduce((sum, p) => sum + p.value, 0);
        break;
    }

    aggregated.push({
      timestamp: time + intervalMs / 2, // Center of the interval
      value: aggregatedValue,
      count: window.length
    });
  }

  return aggregated;
}

/**
 * Memory-aware sampling that adapts to available memory
 */
export function memoryAwareSampling(
  data: DataPoint[], 
  baseMaxPoints: number,
  memoryUsagePercentage: number,
  options: SamplingOptions = {}
): DataPoint[] {
  const {
    preserveExtrema = true,
    adaptiveSampling = true,
    memoryThreshold = 0.8
  } = options;

  // Adjust max points based on memory pressure
  let adjustedMaxPoints = baseMaxPoints;
  
  if (memoryUsagePercentage > 0.95) {
    adjustedMaxPoints = Math.floor(baseMaxPoints * 0.1); // 90% reduction
  } else if (memoryUsagePercentage > 0.9) {
    adjustedMaxPoints = Math.floor(baseMaxPoints * 0.25); // 75% reduction
  } else if (memoryUsagePercentage > memoryThreshold) {
    adjustedMaxPoints = Math.floor(baseMaxPoints * 0.5); // 50% reduction
  }

  // Choose sampling strategy based on data characteristics and memory pressure
  if (adaptiveSampling && memoryUsagePercentage < memoryThreshold) {
    return adaptiveSampling(data, adjustedMaxPoints);
  } else if (preserveExtrema) {
    return minMaxSampling(data, adjustedMaxPoints);
  } else {
    return lttbSampling(data, adjustedMaxPoints);
  }
}

/**
 * Progressive data loading for large datasets
 */
export function progressiveDataLoader(
  data: DataPoint[],
  chunkSize: number = 1000,
  onChunkLoaded?: (chunk: DataPoint[], progress: number) => void
): Promise<DataPoint[]> {
  return new Promise((resolve) => {
    const result: DataPoint[] = [];
    let currentIndex = 0;
    const totalChunks = Math.ceil(data.length / chunkSize);

    const loadChunk = () => {
      if (currentIndex >= data.length) {
        resolve(result);
        return;
      }

      const chunk = data.slice(currentIndex, currentIndex + chunkSize);
      result.push(...chunk);
      currentIndex += chunkSize;

      const progress = (currentIndex / data.length) * 100;
      onChunkLoaded?.(chunk, progress);

      // Use setTimeout to allow UI updates between chunks
      setTimeout(loadChunk, 0);
    };

    loadChunk();
  });
}

/**
 * Data quality validation
 */
export function validateDataQuality(data: DataPoint[]): {
  isValid: boolean;
  issues: string[];
  cleanedData: DataPoint[];
} {
  const issues: string[] = [];
  const cleanedData: DataPoint[] = [];

  data.forEach((point, index) => {
    // Check for invalid timestamps
    if (typeof point.timestamp !== 'number' || isNaN(point.timestamp)) {
      issues.push(`Invalid timestamp at index ${index}`);
      return;
    }

    // Check for invalid values
    if (typeof point.value !== 'number' || isNaN(point.value) || !isFinite(point.value)) {
      issues.push(`Invalid value at index ${index}`);
      return;
    }

    // Check for duplicates
    if (index > 0 && point.timestamp === data[index - 1].timestamp) {
      issues.push(`Duplicate timestamp at index ${index}`);
      return;
    }

    cleanedData.push(point);
  });

  return {
    isValid: issues.length === 0,
    issues,
    cleanedData
  };
}
