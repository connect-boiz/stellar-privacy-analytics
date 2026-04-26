import { logger } from '../utils/logger';

export interface StreamOptions {
  batchSize: number;
  maxMemoryUsage: number; // MB
  enableCompression: boolean;
  checkpointInterval: number;
}

export interface ProcessingStats {
  totalProcessed: number;
  totalBatches: number;
  averageBatchSize: number;
  processingTime: number;
  memoryUsage: number;
  errors: number;
}

export interface BatchProcessor<T, R> {
  (batch: T[]): Promise<R[]>;
}

export class StreamingDataProcessor<T, R> {
  private options: StreamOptions;
  private stats: ProcessingStats;
  private isProcessing: boolean = false;
  private currentBatch: T[] = [];
  private memoryMonitor: any;

  constructor(options: Partial<StreamOptions> = {}) {
    this.options = {
      batchSize: 1000,
      maxMemoryUsage: 512, // 512MB
      enableCompression: true,
      checkpointInterval: 10000, // 10 seconds
      ...options
    };

    this.stats = {
      totalProcessed: 0,
      totalBatches: 0,
      averageBatchSize: 0,
      processingTime: 0,
      memoryUsage: 0,
      errors: 0
    };

    logger.info('Streaming Data Processor initialized', { options: this.options });
  }

  /**
   * Process array data with memory-efficient batching
   */
  async processArray(
    data: T[],
    processor: BatchProcessor<T, R>,
    onBatch?: (batch: R[], batchIndex: number) => void
  ): Promise<ProcessingStats> {
    if (this.isProcessing) {
      throw new Error('Processor is already running');
    }

    this.isProcessing = true;
    const startTime = Date.now();
    this.resetStats();

    try {
      logger.info('Starting array processing', { totalItems: data.length });

      const results: R[] = [];
      let batchIndex = 0;

      for (let i = 0; i < data.length; i++) {
        this.currentBatch.push(data[i]);

        // Process batch when it reaches the size limit or memory limit
        if (this.currentBatch.length >= this.options.batchSize || 
            this.isMemoryLimitReached() || 
            i === data.length - 1) {

          const batchResults = await this.processBatchSync(processor);
          results.push(...batchResults);

          if (onBatch) {
            onBatch(batchResults, batchIndex);
          }

          batchIndex++;
          this.currentBatch = [];

          // Process in chunks to prevent blocking
          if (i % (this.options.batchSize * 10) === 0) {
            // Small delay to allow other operations
          }
        }
      }

      this.stats.processingTime = Date.now() - startTime;
      this.stats.averageBatchSize = this.stats.totalProcessed / this.stats.totalBatches;

      logger.info('Array processing completed', {
        totalProcessed: this.stats.totalProcessed,
        totalBatches: this.stats.totalBatches,
        processingTime: this.stats.processingTime,
        errors: this.stats.errors
      });

      return { ...this.stats };

    } catch (error: any) {
      logger.error('Array processing failed', { error: error.message });
      this.stats.errors++;
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single batch synchronously
   */
  private async processBatchSync(processor: BatchProcessor<T, R>): Promise<R[]> {
    const batch = [...this.currentBatch];
    
    try {
      const results = await processor(batch);
      
      this.stats.totalProcessed += batch.length;
      this.stats.totalBatches++;
      
      // Update memory usage
      if (this.memoryMonitor) {
        this.stats.memoryUsage = this.memoryMonitor.getCurrentMetrics().heapUsed;
      }

      logger.debug('Batch processed', {
        batchSize: batch.length,
        results: results.length,
        batchNumber: this.stats.totalBatches
      });

      return results;

    } catch (error: any) {
      this.stats.errors++;
      logger.error('Batch processing failed', {
        batchSize: batch.length,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check if memory limit is reached
   */
  private isMemoryLimitReached(): boolean {
    if (!this.memoryMonitor) {
      return false;
    }

    const metrics = this.memoryMonitor.getCurrentMetrics();
    const memoryUsageMB = metrics.heapUsed / 1024 / 1024;
    
    return memoryUsageMB >= this.options.maxMemoryUsage;
  }

  /**
   * Reset processing statistics
   */
  private resetStats(): void {
    this.stats = {
      totalProcessed: 0,
      totalBatches: 0,
      averageBatchSize: 0,
      processingTime: 0,
      memoryUsage: 0,
      errors: 0
    };
  }

  /**
   * Set memory monitor for better memory management
   */
  setMemoryMonitor(memoryMonitor: any): void {
    this.memoryMonitor = memoryMonitor;
  }

  /**
   * Get current processing status
   */
  getStatus(): {
    isProcessing: boolean;
    currentBatchSize: number;
    stats: ProcessingStats;
    options: StreamOptions;
  } {
    return {
      isProcessing: this.isProcessing,
      currentBatchSize: this.currentBatch.length,
      stats: { ...this.stats },
      options: { ...this.options }
    };
  }

  /**
   * Update processing options
   */
  updateOptions(options: Partial<StreamOptions>): void {
    this.options = { ...this.options, ...options };
    logger.info('Streaming processor options updated', { options: this.options });
  }

  /**
   * Force cleanup of current batch
   */
  flushCurrentBatch(): void {
    if (this.currentBatch.length > 0) {
      logger.warn('Flushing current batch', { batchSize: this.currentBatch.length });
      this.currentBatch = [];
    }
  }
}

export default StreamingDataProcessor;
