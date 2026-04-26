/**
 * Performance profiling and optimization utilities for chart rendering
 */

// Extend Performance interface to include memory API
declare global {
  interface Performance {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  }

  interface Window {
    gc?: () => void;
  }
}

export interface ProfileMetrics {
  renderTime: number;
  memoryUsage: number;
  fps: number;
  frameDrops: number;
  cpuTime: number;
  timestamp: number;
}

export interface ProfilingOptions {
  sampleInterval: number;
  maxSamples: number;
  enableFpsTracking: boolean;
  enableMemoryTracking: boolean;
  enableCpuTracking: boolean;
}

export class PerformanceProfiler {
  private static instance: PerformanceProfiler;
  private metrics: ProfileMetrics[] = [];
  private isProfiling: boolean = false;
  private options: ProfilingOptions = {
    sampleInterval: 1000,
    maxSamples: 100,
    enableFpsTracking: true,
    enableMemoryTracking: true,
    enableCpuTracking: false
  };
  private intervalId: number | null = null;
  private frameCount: number = 0;
  private lastFrameTime: number = 0;
  private frameDrops: number = 0;
  private rafId: number | null = null;

  static getInstance(): PerformanceProfiler {
    if (!PerformanceProfiler.instance) {
      PerformanceProfiler.instance = new PerformanceProfiler();
    }
    return PerformanceProfiler.instance;
  }

  public setOptions(options: Partial<ProfilingOptions>): void {
    this.options = { ...this.options, ...options };
  }

  public startProfiling(): void {
    if (this.isProfiling) return;

    this.isProfiling = true;
    this.metrics = [];
    this.frameCount = 0;
    this.frameDrops = 0;
    this.lastFrameTime = performance.now();

    // Start FPS tracking
    if (this.options.enableFpsTracking) {
      this.startFpsTracking();
    }

    // Start periodic sampling
    this.intervalId = window.setInterval(() => {
      this.collectMetrics();
    }, this.options.sampleInterval);
  }

  public stopProfiling(): ProfileMetrics[] {
    if (!this.isProfiling) return this.metrics;

    this.isProfiling = false;

    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    return this.metrics;
  }

  private startFpsTracking(): void {
    const trackFrame = (currentTime: number) => {
      if (!this.isProfiling) return;

      this.frameCount++;

      // Check for frame drops (target 60fps = 16.67ms per frame)
      const frameTime = currentTime - this.lastFrameTime;
      if (frameTime > 16.67 * 2) { // More than 2 frames behind
        this.frameDrops++;
      }

      this.lastFrameTime = currentTime;
      this.rafId = requestAnimationFrame(trackFrame);
    };

    this.rafId = requestAnimationFrame(trackFrame);
  }

  private collectMetrics(): void {
    const timestamp = performance.now();
    const metrics: ProfileMetrics = {
      renderTime: 0, // Will be set by specific render measurements
      memoryUsage: 0,
      fps: this.calculateFps(),
      frameDrops: this.frameDrops,
      cpuTime: 0,
      timestamp
    };

    if (this.options.enableMemoryTracking && performance.memory) {
      metrics.memoryUsage = performance.memory.usedJSHeapSize || 0;
    }

    this.metrics.push(metrics);

    // Keep only the most recent samples
    if (this.metrics.length > this.options.maxSamples) {
      this.metrics = this.metrics.slice(-this.options.maxSamples);
    }

    // Reset frame counters for next interval
    this.frameCount = 0;
    this.frameDrops = 0;
  }

  private calculateFps(): number {
    const elapsed = performance.now() - this.lastFrameTime;
    return elapsed > 0 ? (this.frameCount * 1000) / elapsed : 0;
  }

  public measureRenderTime<T>(renderFunction: () => T): T {
    const startTime = performance.now();
    const result = renderFunction();
    const endTime = performance.now();

    if (this.isProfiling && this.metrics.length > 0) {
      this.metrics[this.metrics.length - 1].renderTime = endTime - startTime;
    }

    return result;
  }

  public getMetrics(): ProfileMetrics[] {
    return [...this.metrics];
  }

  public getAverageMetrics(): Partial<ProfileMetrics> {
    if (this.metrics.length === 0) return {};

    const sum = this.metrics.reduce((acc, metric) => ({
      renderTime: acc.renderTime + metric.renderTime,
      memoryUsage: acc.memoryUsage + metric.memoryUsage,
      fps: acc.fps + metric.fps,
      frameDrops: acc.frameDrops + metric.frameDrops,
      cpuTime: acc.cpuTime + metric.cpuTime
    }), { renderTime: 0, memoryUsage: 0, fps: 0, frameDrops: 0, cpuTime: 0 });

    const count = this.metrics.length;
    return {
      renderTime: sum.renderTime / count,
      memoryUsage: sum.memoryUsage / count,
      fps: sum.fps / count,
      frameDrops: sum.frameDrops / count,
      cpuTime: sum.cpuTime / count
    };
  }

  public getPerformanceScore(): number {
    const avg = this.getAverageMetrics();
    if (!avg.renderTime) return 100;

    let score = 100;

    // Penalize slow render times (target: <16ms for 60fps)
    if (avg.renderTime > 16) {
      score -= Math.min(40, (avg.renderTime - 16) * 2);
    }

    // Penalize low FPS
    if (avg.fps && avg.fps < 60) {
      score -= Math.min(30, (60 - avg.fps) * 0.5);
    }

    // Penalize frame drops
    if (avg.frameDrops && avg.frameDrops > 0) {
      score -= Math.min(20, avg.frameDrops * 2);
    }

    // Penalize high memory usage (if available)
    if (avg.memoryUsage && performance.memory && performance.memory.jsHeapSizeLimit) {
      const memoryPressure = avg.memoryUsage / performance.memory.jsHeapSizeLimit;
      if (memoryPressure > 0.8) {
        score -= Math.min(10, (memoryPressure - 0.8) * 50);
      }
    }

    return Math.max(0, Math.round(score));
  }

  public exportMetrics(): string {
    return JSON.stringify({
      metrics: this.metrics,
      average: this.getAverageMetrics(),
      score: this.getPerformanceScore(),
      options: this.options,
      exportedAt: new Date().toISOString()
    }, null, 2);
  }

  public clearMetrics(): void {
    this.metrics = [];
  }
}

/**
 * Chart-specific performance utilities
 */
export class ChartPerformanceOptimizer {
  private static instance: ChartPerformanceOptimizer;
  private renderCache: Map<string, any> = new Map();
  private lastRenderTime: number = 0;

  static getInstance(): ChartPerformanceOptimizer {
    if (!ChartPerformanceOptimizer.instance) {
      ChartPerformanceOptimizer.instance = new ChartPerformanceOptimizer();
    }
    return ChartPerformanceOptimizer.instance;
  }

  public shouldSkipRender(_dataHash: string, renderInterval: number = 100): boolean {
    const now = performance.now();
    const timeSinceLastRender = now - this.lastRenderTime;

    if (timeSinceLastRender < renderInterval) {
      return true;
    }

    return false;
  }

  public getCachedRender(chartId: string): any {
    return this.renderCache.get(chartId);
  }

  public setCachedRender(chartId: string, renderData: any): void {
    // Limit cache size
    if (this.renderCache.size > 10) {
      const firstKey = this.renderCache.keys().next().value;
      if (firstKey) {
        this.renderCache.delete(firstKey);
      }
    }

    this.renderCache.set(chartId, renderData);
    this.lastRenderTime = performance.now();
  }

  public clearCache(): void {
    this.renderCache.clear();
  }

  public optimizeChartConfig(config: any, memoryPressure: 'low' | 'medium' | 'high' | 'critical'): any {
    const optimized = { ...config };

    switch (memoryPressure) {
      case 'critical':
        optimized.animationDuration = 0;
        optimized.enableGpuAcceleration = false;
        optimized.maxPoints = Math.floor(optimized.maxPoints * 0.1);
        break;
      case 'high':
        optimized.animationDuration = 100;
        optimized.maxPoints = Math.floor(optimized.maxPoints * 0.25);
        break;
      case 'medium':
        optimized.animationDuration = 200;
        optimized.maxPoints = Math.floor(optimized.maxPoints * 0.5);
        break;
      default:
        // Keep original config for low memory pressure
        break;
    }

    return optimized;
  }

  public debounceRender<T extends (...args: any[]) => any>(
    fn: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let timeoutId: number | null = null;

    return (...args: Parameters<T>) => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        if (timeoutId !== null) {
          timeoutId = null;
        }
        fn(...args);
      }, delay);
    };
  }

  public throttleRender<T extends (...args: any[]) => any>(
    fn: T,
    interval: number
  ): (...args: Parameters<T>) => void {
    let lastCall = 0;

    return (...args: Parameters<T>) => {
      const now = performance.now();
      if (now - lastCall >= interval) {
        lastCall = now;
        fn(...args);
      }
    };
  }
}

/**
 * Memory leak detection utilities
 */
export class MemoryLeakDetector {
  private static instance: MemoryLeakDetector;
  private objectCounts: Map<string, number> = new Map();
  private isMonitoring: boolean = false;

  static getInstance(): MemoryLeakDetector {
    if (!MemoryLeakDetector.instance) {
      MemoryLeakDetector.instance = new MemoryLeakDetector();
    }
    return MemoryLeakDetector.instance;
  }

  public startMonitoring(): void {
    if (this.isMonitoring) return;
    this.isMonitoring = true;

    // Monitor for potential memory leaks
    const intervalId = window.setInterval(() => {
      this.checkMemoryLeaks();
    }, 5000);

    // Store interval ID for cleanup
    (this as any).monitoringIntervalId = intervalId;
  }

  public stopMonitoring(): void {
    this.isMonitoring = false;
    if ((this as any).monitoringIntervalId) {
      window.clearInterval((this as any).monitoringIntervalId);
      (this as any).monitoringIntervalId = null;
    }
  }

  public trackObject(type: string): void {
    const current = this.objectCounts.get(type) || 0;
    this.objectCounts.set(type, current + 1);
  }

  public releaseObject(type: string): void {
    const current = this.objectCounts.get(type) || 0;
    if (current > 0) {
      this.objectCounts.set(type, current - 1);
    }
  }

  private checkMemoryLeaks(): void {
    if (!performance.memory) return;

    const memoryInfo = {
      used: performance.memory.usedJSHeapSize || 0,
      total: performance.memory.totalJSHeapSize || 0,
      limit: performance.memory.jsHeapSizeLimit || 0
    };

    const usagePercentage = memoryInfo.limit > 0 ? memoryInfo.used / memoryInfo.limit : 0;

    if (usagePercentage > 0.9) {
      console.warn('High memory usage detected:', {
        usage: `${(usagePercentage * 100).toFixed(1)}%`,
        used: `${(memoryInfo.used / 1024 / 1024).toFixed(1)} MB`,
        objectCounts: Object.fromEntries(this.objectCounts)
      });

      // Suggest garbage collection
      if (window.gc) {
        window.gc();
      }
    }
  }

  public getObjectCounts(): Record<string, number> {
    return Object.fromEntries(this.objectCounts);
  }

  public reset(): void {
    this.objectCounts.clear();
  }
}

export default PerformanceProfiler;
