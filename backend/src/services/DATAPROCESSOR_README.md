# DataProcessor - Memory-Efficient Large Dataset Processing

## Overview

The `DataProcessor` service provides high-performance data processing with automatic memory management, garbage collection, and leak prevention. It's designed to handle large datasets without causing memory issues.

## Key Features

- **Chunked Processing**: Breaks large datasets into manageable chunks
- **Automatic Garbage Collection**: Triggers GC when memory usage exceeds threshold
- **Memory Monitoring**: Real-time memory usage tracking and alerts
- **Streaming Support**: Process data streams with backpressure handling
- **Parallel Processing**: Concurrent task execution with controlled concurrency
- **Progress Tracking**: Emit events for monitoring progress
- **Abort Capability**: Cancel ongoing processing operations

## Usage Examples

### 1. Basic Dataset Processing

```typescript
import { DataProcessor } from './services/dataProcessor';

const processor = new DataProcessor({
  chunkSize: 1000,           // Process 1000 records at a time
  maxMemoryUsage: 512,       // Max 512 MB
  gcThreshold: 80,           // Trigger GC at 80% memory usage
  batchSize: 100,            // Batch size for events
});

// Monitor memory warnings
processor.on('memoryWarning', ({ memoryPercent }) => {
  console.warn(`High memory: ${memoryPercent.toFixed(2)}%`);
});

processor.on('memoryCritical', ({ memoryPercent }) => {
  console.error(`Critical memory: ${memoryPercent.toFixed(2)}%`);
});

// Process a large dataset
const largeDataset = await loadLargeDataset(); // e.g., 1 million records

const result = await processor.processDataset(
  largeDataset,
  async (chunk, chunkIndex) => {
    // Process each chunk
    const processed = chunk.map(record => transformRecord(record));
    
    // Save results
    await saveToDatabase(processed);
    
    return processed;
  }
);

if (result.success) {
  console.log(`Processed ${result.metrics.totalRecordsProcessed} records`);
  console.log(`Average time per record: ${result.metrics.averageProcessingTime.toFixed(2)}ms`);
} else {
  console.error('Processing failed:', result.error);
}
```

### 2. Streaming Data Processing

```typescript
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';

async function* streamGenerator(filePath: string) {
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  let buffer = '';
  
  for await (const chunk of stream) {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    for (const line of lines) {
      if (line.trim()) {
        yield JSON.parse(line);
      }
    }
  }
  
  // Process remaining data
  if (buffer.trim()) {
    yield JSON.parse(buffer);
  }
}

const stream = streamGenerator('large-data.jsonl');

const result = await processor.processStream(
  stream,
  async (item) => {
    // Process each item from the stream
    return await analyzeAndEnrich(item);
  }
);
```

### 3. Parallel Processing with Concurrency Control

```typescript
const tasks = datasets.map(dataset => async () => {
  return await processSingleDataset(dataset);
});

const result = await processor.processParallel(tasks, {
  maxConcurrent: 4  // Process 4 datasets simultaneously
});

console.log(`Successfully processed ${result.data?.length || 0} datasets`);
```

### 4. Advanced Configuration

```typescript
const processor = new DataProcessor({
  // Chunking
  chunkSize: 500,              // Smaller chunks for memory-constrained environments
  
  // Memory management
  maxMemoryUsage: 256,         // 256 MB limit
  gcThreshold: 70,             // More aggressive GC at 70%
  
  // Performance
  enableStreaming: true,       // Enable streaming mode
  batchSize: 50,               // Smaller batches for more frequent checkpoints
  enableParallelProcessing: true,
  maxConcurrentTasks: 2,       // Lower concurrency for stability
});

// Get real-time memory info
const memoryInfo = processor.getMemoryInfo();
console.log(`Memory usage: ${memoryInfo.percentage.toFixed(2)}%`);
console.log(`Heap used: ${(memoryInfo.usage.heapUsed / 1024 / 1024).toFixed(2)} MB`);

// Get processing status
const status = processor.getStatus();
console.log(`Processing: ${status.isProcessing ? 'active' : 'idle'}`);
console.log(`Active tasks: ${status.activeTasks}`);
```

### 5. Error Handling and Cleanup

```typescript
try {
  const result = await processor.processDataset(
    largeDataset,
    async (chunk) => {
      // Your processing logic here
      return processChunk(chunk);
    }
  );
  
  if (!result.success) {
    throw new Error(result.error);
  }
  
} catch (error) {
  console.error('Processing failed:', error);
  
  // Abort any ongoing processing
  processor.abort();
  
} finally {
  // Always cleanup on shutdown
  await processor.shutdown();
}
```

### 6. Integration with Express API

```typescript
import { Router } from 'express';
import { DataProcessor } from '../services/dataProcessor';

const router = Router();
const processor = new DataProcessor({
  chunkSize: 1000,
  maxMemoryUsage: 512,
  gcThreshold: 80,
});

// Upload and process large dataset
router.post('/process', async (req, res) => {
  const { dataset } = req.body;
  
  try {
    const result = await processor.processDataset(
      dataset,
      async (chunk, index) => {
        // Process chunk
        const processed = await transformData(chunk);
        
        // Emit progress to client via WebSocket or Server-Sent Events
        processor.emit('progress', {
          chunk: index,
          total: Math.ceil(dataset.length / processor.options.chunkSize),
          percentage: ((index + 1) / Math.ceil(dataset.length / processor.options.chunkSize)) * 100
        });
        
        return processed;
      }
    );
    
    res.json({
      success: result.success,
      metrics: result.metrics,
      processingTime: result.processingTime,
    });
    
  } catch (error) {
    res.status(500).json({
      error: error.message,
      metrics: processor.getStatus().metrics,
    });
  }
});

// Get processing status
router.get('/status', (req, res) => {
  const status = processor.getStatus();
  res.json(status);
});

// Get memory usage
router.get('/memory', (req, res) => {
  const memoryInfo = processor.getMemoryInfo();
  res.json(memoryInfo);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await processor.shutdown();
  process.exit(0);
});
```

## Best Practices

### 1. Memory Management

```typescript
// ✅ DO: Use appropriate chunk sizes based on available memory
const processor = new DataProcessor({
  chunkSize: calculateOptimalChunkSize(availableMemory),
  maxMemoryUsage: systemMemory * 0.5, // Use 50% of available memory
});

// ❌ DON'T: Process entire dataset at once
const result = await Promise.all(largeDataset.map(process)); // Memory leak!
```

### 2. Garbage Collection

```typescript
// ✅ DO: Run with --expose-gc flag for better memory management
// package.json script:
// "start": "node --expose-gc dist/index.js"

// ✅ DO: Monitor memory and trigger GC proactively
processor.on('memoryWarning', async () => {
  await processor.forceGarbageCollection();
});

// ❌ DON'T: Ignore memory warnings
```

### 3. Error Recovery

```typescript
// ✅ DO: Implement retry logic with exponential backoff
const result = await processor.processDataset(
  dataset,
  async (chunk) => {
    let attempts = 0;
    while (attempts < 3) {
      try {
        return await processChunk(chunk);
      } catch (error) {
        attempts++;
        if (attempts === 3) throw error;
        await sleep(Math.pow(2, attempts) * 1000);
      }
    }
  }
);
```

### 4. Resource Cleanup

```typescript
// ✅ DO: Always cleanup after processing
try {
  const result = await processor.processDataset(data, processorFn);
} finally {
  await processor.shutdown();
}

// ✅ DO: Use abort controller for long-running operations
const controller = new AbortController();
setTimeout(() => controller.abort(), 30000); // Timeout after 30s

// ❌ DON'T: Leave processors running after completion
```

## Performance Tips

1. **Tune chunk size**: Larger chunks = better throughput, smaller chunks = better memory control
2. **Enable parallel processing**: Use `maxConcurrentTasks` based on CPU cores
3. **Monitor memory**: Set up alerts for memory warnings
4. **Use streaming**: For infinite or very large data sources
5. **Batch database operations**: Don't save each record individually

## Troubleshooting

### High Memory Usage

```typescript
// Check memory info
const memoryInfo = processor.getMemoryInfo();
console.log(`Usage: ${memoryInfo.percentage.toFixed(2)}%`);

// Reduce chunk size
const newProcessor = new DataProcessor({
  chunkSize: 500, // Down from 1000
  gcThreshold: 70, // Down from 80
});
```

### Slow Processing

```typescript
// Increase concurrency
const processor = new DataProcessor({
  maxConcurrentTasks: 8, // Up from 4
  enableParallelProcessing: true,
});

// Increase chunk size (if memory allows)
const processor = new DataProcessor({
  chunkSize: 2000, // Up from 1000
});
```

### GC Not Running

Make sure to start Node.js with the `--expose-gc` flag:

```bash
node --expose-gc dist/index.js
```

Or in package.json:

```json
{
  "scripts": {
    "start": "node --expose-gc dist/index.js"
  }
}
```

## API Reference

### Constructor Options

- `chunkSize?: number` - Number of records per chunk (default: 1000)
- `maxMemoryUsage?: number` - Max memory in MB (default: 512)
- `enableStreaming?: boolean` - Enable streaming mode (default: true)
- `gcThreshold?: number` - Memory % to trigger GC (default: 80)
- `batchSize?: number` - Batch size for events (default: 100)
- `enableParallelProcessing?: boolean` - Enable parallel processing (default: true)
- `maxConcurrentTasks?: number` - Max concurrent tasks (default: 4)

### Methods

- `processDataset(dataset, processor, options)` - Process array data in chunks
- `processStream(stream, processor)` - Process async iterable streams
- `processParallel(tasks, options)` - Process tasks in parallel
- `abort()` - Abort ongoing processing
- `getStatus()` - Get current processing status
- `getMemoryInfo()` - Get detailed memory information
- `shutdown()` - Graceful shutdown

### Events

- `chunkStarted` - Emitted when a chunk starts processing
- `chunkCompleted` - Emitted when a chunk completes
- `chunkError` - Emitted when a chunk fails
- `batchCompleted` - Emitted when a batch completes
- `memoryWarning` - Emitted when memory > gcThreshold
- `memoryCritical` - Emitted when memory > 90%
- `cleanup` - Emitted during cleanup

## License

MIT
