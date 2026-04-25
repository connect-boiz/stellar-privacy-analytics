/**
 * Memory monitoring utilities for chart rendering optimization
 */

interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  usagePercentage: number;
}

interface MemoryThresholds {
  warning: number;    // 0.8 = 80%
  critical: number;   // 0.9 = 90%
  emergency: number;  // 0.95 = 95%
}

export class MemoryMonitor {
  private static instance: MemoryMonitor;
  private thresholds: MemoryThresholds = {
    warning: 0.8,
    critical: 0.9,
    emergency: 0.95
  };
  private monitoringInterval: NodeJS.Timeout | null = null;
  private callbacks: Map<string, (memory: MemoryInfo) => void> = new Map();

  static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  private getMemoryInfo(): MemoryInfo | null {
    if (!performance.memory) {
      console.warn('Performance memory API not available');
      return null;
    }

    const memory = performance.memory;
    const usagePercentage = memory.usedJSHeapSize / memory.jsHeapSizeLimit;

    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      usagePercentage
    };
  }

  public checkMemory(): MemoryInfo | null {
    return this.getMemoryInfo();
  }

  public isMemoryPressureLevel(level: 'warning' | 'critical' | 'emergency'): boolean {
    const memory = this.getMemoryInfo();
    if (!memory) return false;

    return memory.usagePercentage >= this.thresholds[level];
  }

  public getRecommendedMaxPoints(basePoints: number): number {
    const memory = this.getMemoryInfo();
    if (!memory) return basePoints;

    if (memory.usagePercentage >= this.thresholds.emergency) {
      return Math.floor(basePoints * 0.1); // 90% reduction
    } else if (memory.usagePercentage >= this.thresholds.critical) {
      return Math.floor(basePoints * 0.25); // 75% reduction
    } else if (memory.usagePercentage >= this.thresholds.warning) {
      return Math.floor(basePoints * 0.5); // 50% reduction
    }

    return basePoints;
  }

  public startMonitoring(intervalMs: number = 1000): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      const memory = this.getMemoryInfo();
      if (memory) {
        this.callbacks.forEach(callback => callback(memory));
      }
    }, intervalMs);
  }

  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  public subscribe(id: string, callback: (memory: MemoryInfo) => void): void {
    this.callbacks.set(id, callback);
  }

  public unsubscribe(id: string): void {
    this.callbacks.delete(id);
  }

  public forceGarbageCollection(): boolean {
    // @ts-ignore - window.gc may not be available in all browsers
    if (window.gc) {
      // @ts-ignore
      window.gc();
      return true;
    }
    return false;
  }

  public formatMemorySize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}

export default MemoryMonitor;
