# Memory-Efficient Chart Rendering System

This directory contains a comprehensive memory-efficient chart rendering system designed to prevent browser crashes on systems with limited RAM when rendering complex visualizations.

## Features

### ✅ Memory-Efficient Chart Rendering Algorithms
- **LTTB (Largest Triangle Three Buckets)** sampling algorithm that preserves visual characteristics while reducing data points
- **Min-Max sampling** to preserve important peaks and valleys
- **Adaptive sampling** based on data variance
- **Memory-aware sampling** that adapts to available memory

### ✅ Data Sampling and Aggregation for Large Datasets
- Multiple sampling strategies (LTTB, Min-Max, Adaptive, Random)
- Time-based aggregation for time series data
- Progressive data loading with chunked processing
- Data quality validation and cleaning

### ✅ Progressive Rendering with Loading Indicators
- Chunk-based data loading to prevent UI blocking
- Real-time progress indicators
- Smooth user experience during data processing
- Configurable chunk sizes and loading strategies

### ✅ Memory Usage Monitoring and Optimization
- Real-time memory pressure detection
- Automatic memory threshold monitoring
- Dynamic point reduction based on available memory
- Garbage collection triggers when needed

### ✅ Fallback Rendering for Low-Memory Devices
- **Simplified mode**: Minimal chart rendering for critical memory situations
- **Sampling mode**: Aggressive data reduction
- **Disabled mode**: Fallback to text-based display
- Automatic fallback mode switching

### ✅ Performance Profiling and Optimization
- FPS monitoring and frame drop detection
- Render time measurement
- Memory usage tracking
- Performance scoring system
- Exportable performance metrics

### ✅ Error Handling for Memory Constraints
- Graceful degradation under memory pressure
- Automatic recovery mechanisms
- User notifications for memory issues
- Fallback data processing

## Components

### MemoryEfficientChart
The main chart component that integrates all memory optimization features.

```tsx
import MemoryEfficientChart from './charts/MemoryEfficientChart';

<MemoryEfficientChart
  data={chartData}
  dataKey="value"
  title="Performance Chart"
  height={400}
  maxPoints={5000}
  enableProgressiveLoading={true}
  onPerformanceMetrics={handleMetrics}
  fallbackMode="sampling"
  memoryThreshold={0.8}
/>
```

### MemoryMonitor
Utility class for monitoring memory usage and detecting memory pressure.

```tsx
import MemoryMonitor from '../utils/memoryMonitor';

const monitor = MemoryMonitor.getInstance();
const memoryInfo = monitor.checkMemory();
const recommendedMaxPoints = monitor.getRecommendedMaxPoints(5000);
```

### DataSampling
Advanced data sampling and aggregation algorithms.

```tsx
import { lttbSampling, memoryAwareSampling } from '../utils/dataSampling';

const sampled = lttbSampling(data, maxPoints);
const optimized = memoryAwareSampling(data, basePoints, memoryUsage);
```

### PerformanceProfiler
Performance monitoring and optimization utilities.

```tsx
import { PerformanceProfiler } from '../utils/performanceProfiler';

const profiler = PerformanceProfiler.getInstance();
profiler.startProfiling();
const metrics = profiler.stopProfiling();
```

## Usage Examples

### Basic Usage
```tsx
import React from 'react';
import MemoryEfficientChart from './charts/MemoryEfficientChart';
import { DataPoint } from '../utils/dataSampling';

const MyChartComponent: React.FC = () => {
  const data: DataPoint[] = generateLargeDataset(10000);

  return (
    <MemoryEfficientChart
      data={data}
      dataKey="value"
      title="My Chart"
      height={400}
    />
  );
};
```

### Advanced Configuration
```tsx
const handlePerformanceMetrics = (metrics) => {
  console.log('Render time:', metrics.renderTime);
  console.log('Memory usage:', metrics.memoryUsage);
  console.log('Memory pressure:', metrics.memoryPressure);
};

<MemoryEfficientChart
  data={largeDataset}
  dataKey="value"
  title="Advanced Chart"
  height={500}
  maxPoints={10000}
  enableProgressiveLoading={true}
  fallbackMode="simplified"
  memoryThreshold={0.75}
  onPerformanceMetrics={handlePerformanceMetrics}
/>
```

### Memory Monitoring
```tsx
import { useEffect } from 'react';
import MemoryMonitor from '../utils/memoryMonitor';

const useMemoryMonitoring = () => {
  useEffect(() => {
    const monitor = MemoryMonitor.getInstance();
    
    monitor.subscribe('my-component', (memory) => {
      if (memory.usagePercentage > 0.9) {
        console.warn('Critical memory usage detected');
      }
    });
    
    monitor.startMonitoring(1000);
    
    return () => {
      monitor.unsubscribe('my-component');
      monitor.stopMonitoring();
    };
  }, []);
};
```

## Performance Optimization Strategies

### 1. Data Sampling
- Use LTTB for time series data to preserve visual characteristics
- Apply Min-Max sampling for data with important peaks and valleys
- Implement adaptive sampling based on data variance

### 2. Memory Management
- Monitor memory usage continuously
- Reduce data points when memory pressure is detected
- Trigger garbage collection when appropriate
- Use fallback rendering modes

### 3. Rendering Optimization
- Enable GPU acceleration when available
- Use progressive loading for large datasets
- Implement debouncing/throttling for frequent updates
- Cache rendered results when possible

### 4. Progressive Loading
- Load data in chunks to prevent UI blocking
- Show progress indicators during processing
- Allow user interaction during loading
- Prioritize visible data first

## Configuration Options

### MemoryEfficientChart Props
- `data`: Chart data array
- `dataKey`: Key for the value to display
- `title`: Chart title
- `height`: Chart height in pixels
- `maxPoints`: Maximum number of points to render
- `enableProgressiveLoading`: Enable chunked loading
- `onPerformanceMetrics`: Callback for performance metrics
- `fallbackMode`: Fallback rendering mode ('simplified', 'disabled', 'sampling')
- `memoryThreshold`: Memory usage threshold (0.0-1.0)

### MemoryMonitor Options
- `warning`: Warning threshold (default: 0.8)
- `critical`: Critical threshold (default: 0.9)
- `emergency`: Emergency threshold (default: 0.95)

### Sampling Options
- `maxPoints`: Maximum points after sampling
- `preserveExtrema`: Preserve min/max values
- `adaptiveSampling`: Enable adaptive sampling
- `memoryThreshold`: Memory threshold for adaptive behavior

## Performance Metrics

The system tracks the following performance metrics:

- **Render Time**: Time taken to render the chart
- **Memory Usage**: Current JavaScript heap usage
- **Points Rendered**: Number of points actually rendered
- **Sampling Rate**: Data reduction ratio
- **Memory Pressure**: Current memory pressure level
- **FPS**: Frames per second (when available)
- **Frame Drops**: Number of dropped frames

## Browser Compatibility

- **Chrome**: Full support with memory API
- **Firefox**: Basic support (memory API may be limited)
- **Safari**: Basic support (memory API may be limited)
- **Edge**: Full support with memory API

## Best Practices

1. **Set Appropriate Limits**: Configure `maxPoints` based on your data characteristics
2. **Monitor Performance**: Use performance metrics to optimize your charts
3. **Handle Memory Pressure**: Implement appropriate fallback strategies
4. **Test with Large Datasets**: Verify performance with realistic data sizes
5. **Use Progressive Loading**: Enable for datasets larger than 10,000 points
6. **Configure Memory Thresholds**: Adjust based on your target devices

## Troubleshooting

### Common Issues

**Chart renders slowly**
- Reduce `maxPoints` value
- Enable progressive loading
- Check memory usage metrics

**Browser crashes with large datasets**
- Lower memory threshold
- Use aggressive sampling
- Enable fallback rendering

**Memory warnings appear frequently**
- Check for memory leaks in your application
- Reduce data complexity
- Implement data pagination

**Performance metrics show high render times**
- Enable GPU acceleration
- Reduce animation complexity
- Optimize data structure

## Demo

See `ChartPerformanceDemo.tsx` for a comprehensive demonstration of all features including:
- Variable dataset sizes
- Real-time performance monitoring
- Memory pressure simulation
- Fallback mode testing
- Performance metrics visualization

## Contributing

When contributing to this chart system:

1. Test memory efficiency with large datasets
2. Verify performance metrics accuracy
3. Test fallback modes under memory pressure
4. Ensure browser compatibility
5. Add comprehensive tests for new features

## License

This memory-efficient chart rendering system is part of the Stellar Privacy Analytics project.
