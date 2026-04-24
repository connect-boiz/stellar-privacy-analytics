import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { PerformanceObserver, performance } from 'perf_hooks';

export interface DataProcessingOptions {
  chunkSize?: number;
  maxMemoryUsage?: number; // in MB
  enableStreaming?: boolean;
  gcThreshold?: number; // Memory usage percentage to trigger GC (0-100)
  batchSize?: number;
  enableParallelProcessing?: boolean;
  maxConcurrentTasks?: number;
}

export interface ProcessingMetrics {
  totalRecordsProcessed: number;
  totalBytesProcessed: number;
  averageProcessingTime: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  gcStats: {
    totalGCTime: number;
    totalGCRuns: number;
    lastGCRun?: Date;
  };
  errors: number;
  warnings: number;
}

export interface ProcessingResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metrics: ProcessingMetrics;
  processingTime: number;
}

/**
 * DataProcessor - High-performance data processing service with memory management
 * 
 * Features:
 * - Chunked processing for large datasets
 * - Automatic garbage collection triggering
 * - Memory leak prevention
 * - Streaming support
 * - Parallel processing with concurrency control
 * - Real-time memory monitoring
 */
export class DataProcessor extends EventEmitter {
  private options: Required<DataProcessingOptions>;
  private metrics: ProcessingMetrics;
  private isProcessing: boolean = false;
  private abortController: AbortController | null = null;
  private memoryMonitorInterval: NodeJS.Timeout | null = null;
  private processingQueue: Array<{
    data: any;
    resolve: (result: any) => void;
    reject: (error: Error) => void;
  }> = [];
  private activeTasks: Set<Promise<any>> = new Set();

  constructor(options: DataProcessingOptions = {}) {
    super();
    
    this.options = {
      chunkSize: options.chunkSize || 1000,
      maxMemoryUsage: options.maxMemoryUsage || 512, // 512 MB default
      enableStreaming: options.enableStreaming ?? true,
      gcThreshold: options.gcThreshold || 80, // 80% memory usage triggers GC
      batchSize: options.batchSize || 100,
      enableParallelProcessing: options.enableParallelProcessing ?? true,
      maxConcurrentTasks: options.maxConcurrentTasks || 4,
    };

    this.metrics = {
      totalRecordsProcessed: 0,
      totalBytesProcessed: 0,
      averageProcessingTime: 0,
      memoryUsage: {
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        rss: 0,
      },
      gcStats: {
        totalGCTime: 0,
        totalGCRuns: 0,
      },
      errors: 0,
      warnings: 0,
    };

    this.startMemoryMonitoring();
    this.setupPerformanceObserver();

    logger.info('DataProcessor initialized', {
      chunkSize: this.options.chunkSize,
      maxMemoryUsage: this.options.maxMemoryUsage,
      gcThreshold: this.options.gcThreshold,
      batchSize: this.options.batchSize,
    });
  }

  /**
   * Process a large dataset with chunking and memory management
   */
  async processDataset<T>(
    dataset: any[],
    processor: (chunk: any[], index: number) => Promise<T>,
    options?: { skipGC?: boolean; priority?: 'low' | 'normal' | 'high' }
  ): Promise<ProcessingResult<T[]>> {
    const startTime = performance.now();
    this.abortController = new AbortController();
    
    try {
      this.isProcessing = true;
      const results: T[] = [];
      const totalChunks = Math.ceil(dataset.length / this.options.chunkSize);
      
      logger.info('Starting dataset processing', {
        totalRecords: dataset.length,
        chunkSize: this.options.chunkSize,
        totalChunks,
      });

      // Process in chunks
      for (let i = 0; i < dataset.length; i += this.options.chunkSize) {
        if (this.abortController?.signal.aborted) {
          throw new Error('Processing aborted');
        }

        const chunk = dataset.slice(i, i + this.options.chunkSize);
        const chunkIndex = Math.floor(i / this.options.chunkSize);
        
        this.emit('chunkStarted', { chunkIndex, chunkSize: chunk.length });
        
        try {
          // Check memory before processing chunk
          await this.checkAndTriggerGC(options?.skipGC);
          
          const chunkStartTime = performance.now();
          const result = await processor(chunk, chunkIndex);
          const chunkEndTime = performance.now();
          
          results.push(result);
          
          this.metrics.totalRecordsProcessed += chunk.length;
          this.metrics.totalBytesProcessed += Buffer.byteLength(JSON.stringify(chunk));
          this.updateAverageProcessingTime(chunkEndTime - chunkStartTime);
          
          this.emit('chunkCompleted', {
            chunkIndex,
            chunkSize: chunk.length,
            processingTime: chunkEndTime - chunkStartTime,
          });

          // Force GC after each chunk if memory is high
          if (this.getMemoryUsagePercent() > this.options.gcThreshold) {
            await this.forceGarbageCollection();
          }

        } catch (error) {
          this.metrics.errors++;
          this.emit('chunkError', { chunkIndex, error });
          throw error;
        }
      }

      const endTime = performance.now();
      const processingTime = endTime - startTime;
      
      this.isProcessing = false;
      
      logger.info('Dataset processing completed', {
        totalRecords: dataset.length,
        processingTime,
        averageTimePerRecord: processingTime / dataset.length,
      });

      return {
        success: true,
        data: results,
        metrics: { ...this.metrics },
        processingTime,
      };

    } catch (error: any) {
      this.isProcessing = false;
      this.metrics.errors++;
      
      logger.error('Dataset processing failed', {
        error: error.message,
        totalRecords: dataset.length,
      });

      return {
        success: false,
        error: error.message,
        metrics: { ...this.metrics },
        processingTime: performance.now() - startTime,
      };
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Process data stream with backpressure handling
   */
  async processStream<T>(
    stream: AsyncIterable<any>,
    processor: (item: any) => Promise<T>
  ): Promise<ProcessingResult<T[]>> {
    const startTime = performance.now();
    const results: T[] = [];
    let itemCount = 0;
    
    try {
      this.isProcessing = true;
      
      for await (const item of stream) {
        if (this.abortController?.signal.aborted) {
          break;
        }

        await this.checkAndTriggerGC();
        
        const result = await processor(item);
        results.push(result);
        itemCount++;
        
        this.metrics.totalRecordsProcessed++;
        
        // Periodic cleanup
        if (itemCount % this.options.batchSize === 0) {
          this.emit('batchCompleted', { batchSize: this.options.batchSize });
          await this.cleanup();
        }
      }

      const processingTime = performance.now() - startTime;
      this.isProcessing = false;

      return {
        success: true,
        data: results,
        metrics: { ...this.metrics },
        processingTime,
      };

    } catch (error: any) {
      this.isProcessing = false;
      this.metrics.errors++;

      return {
        success: false,
        error: error.message,
        metrics: { ...this.metrics },
        processingTime: performance.now() - startTime,
      };
    }
  }

  /**
   * Process multiple tasks in parallel with concurrency control
   */
  async processParallel<T>(
    tasks: Array<() => Promise<T>>,
    options?: { maxConcurrent?: number }
  ): Promise<ProcessingResult<T[]>> {
    const startTime = performance.now();
    const maxConcurrent = options?.maxConcurrent || this.options.maxConcurrentTasks;
    const results: T[] = [];
    
    try {
      this.isProcessing = true;
      
      // Process tasks with limited concurrency
      for (let i = 0; i < tasks.length; i += maxConcurrent) {
        const batch = tasks.slice(i, i + maxConcurrent);
        
        await this.checkAndTriggerGC();
        
        const batchResults = await Promise.all(
          batch.map(async (task, index) => {
            try {
              const result = await task();
              this.metrics.totalRecordsProcessed++;
              return { success: true, result };
            } catch (error) {
              this.metrics.errors++;
              return { success: false, error };
            }
          })
        );

        for (const batchResult of batchResults) {
          if (batchResult.success && batchResult.result !== undefined) {
            results.push(batchResult.result);
          }
        }

        // Cleanup after each batch
        await this.cleanup();
      }

      const processingTime = performance.now() - startTime;
      this.isProcessing = false;

      return {
        success: true,
        data: results,
        metrics: { ...this.metrics },
        processingTime,
      };

    } catch (error: any) {
      this.isProcessing = false;

      return {
        success: false,
        error: error.message,
        metrics: { ...this.metrics },
        processingTime: performance.now() - startTime,
      };
    }
  }

  /**
   * Check memory usage and trigger GC if needed
   */
  private async checkAndTriggerGC(skipGC?: boolean): Promise<void> {
    const memoryPercent = this.getMemoryUsagePercent();
    
    if (memoryPercent > this.options.gcThreshold && !skipGC) {
      logger.warn('High memory usage detected, triggering GC', {
        memoryPercent: memoryPercent.toFixed(2),
        threshold: this.options.gcThreshold,
      });
      
      await this.forceGarbageCollection();
    }
  }

  /**
   * Force garbage collection (if available)
   */
  private async forceGarbageCollection(): Promise<void> {
    const startTime = performance.now();
    
    try {
      // @ts-ignore - global.gc() is available when Node.js is run with --expose-gc flag
      if (global.gc) {
        // @ts-ignore
        global.gc();
        this.metrics.gcStats.totalGCRuns++;
        const gcTime = performance.now() - startTime;
        this.metrics.gcStats.totalGCTime += gcTime;
        this.metrics.gcStats.lastGCRun = new Date();
        
        logger.debug('Garbage collection completed', {
          gcTime: gcTime.toFixed(2),
          totalGCRuns: this.metrics.gcStats.totalGCRuns,
        });
      } else {
        logger.warn('GC not exposed - run Node.js with --expose-gc flag for better memory management');
        // Fallback: manual cleanup
        await this.cleanup();
      }
    } catch (error) {
      logger.error('Garbage collection failed:', error);
      this.metrics.warnings++;
    }
  }

  /**
   * Cleanup resources and free memory
   */
  private async cleanup(): Promise<void> {
    // Clear any cached data
    this.emit('cleanup');
    
    // Wait for event loop to process cleanup
    await new Promise(resolve => setImmediate(resolve));
    
    // Update memory metrics
    this.updateMemoryMetrics();
  }

  /**
   * Get current memory usage percentage
   */
  private getMemoryUsagePercent(): number {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    return (heapUsedMB / this.options.maxMemoryUsage) * 100;
  }

  /**
   * Update memory metrics
   */
  private updateMemoryMetrics(): void {
    const memUsage = process.memoryUsage();
    this.metrics.memoryUsage = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
    };
  }

  /**
   * Update average processing time
   */
  private updateAverageProcessingTime(currentTime: number): void {
    const total = this.metrics.totalRecordsProcessed;
    const oldAvg = this.metrics.averageProcessingTime;
    this.metrics.averageProcessingTime = ((oldAvg * (total - 1)) + currentTime) / total;
  }

  /**
   * Start memory monitoring
   */
  private startMemoryMonitoring(): void {
    this.memoryMonitorInterval = setInterval(() => {
      this.updateMemoryMetrics();
      
      const memoryPercent = this.getMemoryUsagePercent();
      
      if (memoryPercent > 90) {
        logger.error('Critical memory usage detected!', {
          memoryPercent: memoryPercent.toFixed(2),
          heapUsed: (this.metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
        });
        this.emit('memoryCritical', { memoryPercent });
      } else if (memoryPercent > this.options.gcThreshold) {
        logger.warn('High memory usage detected', {
          memoryPercent: memoryPercent.toFixed(2),
          heapUsed: (this.metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
        });
        this.emit('memoryWarning', { memoryPercent });
      }
      
    }, 5000); // Check every 5 seconds
  }

  /**
   * Setup performance observer for GC monitoring
   */
  private setupPerformanceObserver(): void {
    try {
      const obs = new PerformanceObserver((items) => {
        const entries = items.getEntries();
        for (const entry of entries) {
          if (entry.entryType === 'gc') {
            const gcEntry = entry as any;
            this.metrics.gcStats.totalGCRuns++;
            this.metrics.gcStats.totalGCTime += gcEntry.duration;
            this.metrics.gcStats.lastGCRun = new Date();
            
            logger.debug('GC event detected', {
              kind: gcEntry.kind,
              duration: gcEntry.duration,
            });
          }
        }
      });
      
      obs.observe({ entryTypes: ['gc'] });
    } catch (error) {
      logger.warn('Performance observer setup failed (GC monitoring unavailable):', error);
    }
  }

  /**
   * Abort ongoing processing
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      logger.info('Processing aborted');
    }
  }

  /**
   * Get current processing status
   */
  getStatus(): {
    isProcessing: boolean;
    queueLength: number;
    activeTasks: number;
    metrics: ProcessingMetrics;
  } {
    return {
      isProcessing: this.isProcessing,
      queueLength: this.processingQueue.length,
      activeTasks: this.activeTasks.size,
      metrics: { ...this.metrics },
    };
  }

  /**
   * Get detailed memory info
   */
  getMemoryInfo(): {
    usage: NodeJS.MemoryUsage;
    percentage: number;
    limits: {
      maxMemoryUsage: number;
      gcThreshold: number;
    };
  } {
    const usage = process.memoryUsage();
    return {
      usage,
      percentage: this.getMemoryUsagePercent(),
      limits: {
        maxMemoryUsage: this.options.maxMemoryUsage,
        gcThreshold: this.options.gcThreshold,
      },
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('DataProcessor shutting down...');
    
    // Stop accepting new tasks
    this.isProcessing = true;
    
    // Abort ongoing processing
    this.abort();
    
    // Stop memory monitoring
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
    }
    
    // Wait for active tasks to complete
    if (this.activeTasks.size > 0) {
      logger.info(`Waiting for ${this.activeTasks.size} active tasks to complete...`);
      await Promise.allSettled(this.activeTasks);
    }
    
    // Final cleanup
    await this.cleanup();
    await this.forceGarbageCollection();
    
    logger.info('DataProcessor shutdown completed');
  }
}

export default DataProcessor;
