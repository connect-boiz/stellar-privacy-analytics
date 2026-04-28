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

export class StreamingDataProcessor<T, R> extends EventEmitter {
  private options: StreamOptions;
  private stats: ProcessingStats;
  private isProcessing: boolean = false;
  private currentBatch: T[] = [];
  private memoryMonitor: any;

  constructor(options: Partial<StreamOptions> = {}) {
    super();

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
   * Process data stream with batch processing
   */
  async processStream(
    inputStream: stream.Readable,
    processor: BatchProcessor<T, R>,
    outputStream?: stream.Writable
  ): Promise<ProcessingStats> {
    if (this.isProcessing) {
      throw new Error('Processor is already running');
    }

    this.isProcessing = true;
    const startTime = Date.now();
    this.resetStats();

    try {
      logger.info('Starting stream processing');

      // Create transform stream for batch processing
      const batchTransform = new Transform({
        objectMode: true,
        transform: (chunk: T, encoding: any, callback: any) => {
          this.currentBatch.push(chunk);

          // Check if batch is ready or memory limit reached
          if (this.currentBatch.length >= this.options.batchSize || 
              this.isMemoryLimitReached()) {
            this.processBatch(processor, callback);
          } else {
            callback();
          }
        },

        flush: (callback: any) => {
          // Process remaining items in batch
          if (this.currentBatch.length > 0) {
            this.processBatch(processor, callback);
          } else {
            callback();
          }
        }
      });

      // Set up output stream
      let finalStream = batchTransform;
      if (outputStream) {
        finalStream.pipe(outputStream);
      }

      // Process the stream
      await new Promise((resolve, reject) => {
        inputStream
          .pipe(batchTransform)
          .on('error', reject)
          .on('finish', resolve);
      });

      this.stats.processingTime = Date.now() - startTime;
      this.stats.averageBatchSize = this.stats.totalProcessed / this.stats.totalBatches;

      logger.info('Stream processing completed', {
        totalProcessed: this.stats.totalProcessed,
        totalBatches: this.stats.totalBatches,
        processingTime: this.stats.processingTime,
        errors: this.stats.errors
      });

      return { ...this.stats };

    } catch (error: any) {
      logger.error('Stream processing failed', { error: error.message });
      this.stats.errors++;
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process array data with streaming approach
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

          // Emit progress
          this.emit('progress', {
            processed: i + 1,
            total: data.length,
            percentage: ((i + 1) / data.length) * 100,
            batchIndex
          });

          // Allow event loop to process other tasks
          if (i % (this.options.batchSize * 10) === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
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
   * Create a memory-efficient data generator
   */
  static *createDataGenerator<T>(
    dataSource: () => T,
    maxItems?: number
  ): Generator<T> {
    let count = 0;
    while (!maxItems || count < maxItems) {
      yield dataSource();
      count++;
    }
  }

  /**
   * Process generator with streaming
   */
  async processGenerator(
    generator: Generator<T>,
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
      logger.info('Starting generator processing');

      const results: R[] = [];
      let batchIndex = 0;
      let processedCount = 0;

      for (const item of generator) {
        this.currentBatch.push(item);
        processedCount++;

        // Process batch when ready
        if (this.currentBatch.length >= this.options.batchSize || 
            this.isMemoryLimitReached()) {

          const batchResults = await this.processBatchSync(processor);
          results.push(...batchResults);

          if (onBatch) {
            onBatch(batchResults, batchIndex);
          }

          batchIndex++;
          this.currentBatch = [];

          // Emit progress
          this.emit('progress', {
            processed: processedCount,
            total: null, // Unknown total for generators
            batchIndex
          });
        }
      }

      // Process remaining items
      if (this.currentBatch.length > 0) {
        const batchResults = await this.processBatchSync(processor);
        results.push(...batchResults);

        if (onBatch) {
          onBatch(batchResults, batchIndex);
        }
      }

      this.stats.processingTime = Date.now() - startTime;
      this.stats.averageBatchSize = this.stats.totalProcessed / this.stats.totalBatches;

      logger.info('Generator processing completed', {
        totalProcessed: this.stats.totalProcessed,
        totalBatches: this.stats.totalBatches,
        processingTime: this.stats.processingTime,
        errors: this.stats.errors
      });

      return { ...this.stats };

    } catch (error: any) {
      logger.error('Generator processing failed', { error: error.message });
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

      this.emit('batch-processed', {
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
   * Process batch in transform stream
   */
  private processBatch(
    processor: BatchProcessor<T, R>,
    callback: (error?: Error, data?: any) => void
  ): void {
    const batch = [...this.currentBatch];
    this.currentBatch = [];

    processor(batch)
      .then(results => {
        this.stats.totalProcessed += batch.length;
        this.stats.totalBatches++;

        // Push each result to the stream
        results.forEach(result => {
          this.push(result);
        });

        this.emit('batch-processed', {
          batchSize: batch.length,
          results: results.length,
          batchNumber: this.stats.totalBatches
        });

        callback();
      })
      .catch(error => {
        this.stats.errors++;
        logger.error('Batch processing failed', {
          batchSize: batch.length,
          error: error.message
        });
        callback(error);
      });
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
