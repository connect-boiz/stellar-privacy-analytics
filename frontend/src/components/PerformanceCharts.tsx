import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar } from 'recharts';
import { AlertCircle, Loader2, RefreshCw, Zap, Cpu, Database, Activity, BarChart3, ChevronDown, ChevronUp, Memory, TrendingDown } from 'lucide-react';
import { toast } from 'react-hot-toast';
import MemoryMonitor from '../utils/memoryMonitor';
import { DataPoint, memoryAwareSampling, progressiveDataLoader, validateDataQuality } from '../utils/dataSampling';
import { PerformanceProfiler, ChartPerformanceOptimizer } from '../utils/performanceProfiler';

interface LargeDatasetChartProps {
  data?: DataPoint[];
  dataKey?: string;
  title?: string;
  height?: number;
  enableVirtualization?: boolean;
  enableSampling?: boolean;
  maxPoints?: number;
  showProgressiveLoading?: boolean;
  onPerformanceMetrics?: (metrics: PerformanceMetrics) => void;
}

interface PerformanceMetrics {
  renderTime: number;
  memoryUsage: number;
  pointsRendered: number;
  samplingRate: number;
}

interface ChartConfig {
  colors: {
    primary: string;
    gradient: string;
  };
  animationDuration: number;
  samplingStrategy: 'lttb' | 'random' | 'first' | 'last';
  enableGpuAcceleration: boolean;
}

const defaultConfig: ChartConfig = {
  colors: {
    primary: '#3b82f6',
    gradient: 'rgba(59, 130, 246, 0.3)'
  },
  animationDuration: 300,
  samplingStrategy: 'lttb',
  enableGpuAcceleration: true
};

const generateLargeDataset = (count: number): DataPoint[] => {
  const baseTime = Date.now() - count * 1000;
  const data: DataPoint[] = [];

  for (let i = 0; i < count; i++) {
    data.push({
      timestamp: baseTime + i * 1000,
      value: Math.sin(i / 50) * 50 + 50 + Math.random() * 10,
      value2: Math.cos(i / 30) * 30 + 70 + Math.random() * 5,
      value3: Math.random() * 100
    });
  }

  return data;
};

const lttbSampling = (data: DataPoint[], maxPoints: number): DataPoint[] => {
  if (data.length <= maxPoints) return data;

  const sampled: DataPoint[] = [];
  const threshold = maxPoints - 2;

  sampled.push(data[0]);

  if (threshold <= 0) return sampled;

  const step = Math.ceil(data.length / threshold);

  for (let i = 0; i < threshold - 1; i++) {
    const idx = i * step;
    sampled.push(data[idx]);
  }

  sampled.push(data[data.length - 1]);

  return sampled;
};

const randomSampling = (data: DataPoint[], maxPoints: number): DataPoint[] => {
  if (data.length <= maxPoints) return data;

  const indices = new Set<number>();

  indices.add(0);
  indices.add(data.length - 1);

  while (indices.size < maxPoints) {
    indices.add(Math.floor(Math.random() * data.length));
  }

  return Array.from(indices)
    .sort((a, b) => a - b)
    .map(i => data[i]);
};

const LargeDatasetChart: React.FC<LargeDatasetChartProps> = ({
  data: initialData,
  dataKey = 'value',
  title = 'Performance Chart',
  height = 400,
  enableVirtualization = true,
  enableSampling = true,
  maxPoints = 5000,
  showProgressiveLoading = true,
  onPerformanceMetrics
}) => {
  const [data, setData] = useState<DataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [config] = useState<ChartConfig>(defaultConfig);
  const [gpuEnabled, setGpuEnabled] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();

  const processData = useCallback((rawData: DataPoint[], maxPts: number) => {
    const startTime = performance.now();

    let processed: DataPoint[];
    if (enableSampling) {
      processed = lttbSampling(rawData, maxPts);
    } else {
      processed = rawData.slice(0, maxPts);
    }

    const renderTime = performance.now() - startTime;
    const memoryUsage = (performance as any).memory?.usedJSHeapSize || 0;

    const metrics: PerformanceMetrics = {
      renderTime,
      memoryUsage,
      pointsRendered: processed.length,
      samplingRate: rawData.length / processed.length
    };

    setPerformanceMetrics(metrics);

    if (onPerformanceMetrics) {
      onPerformanceMetrics(metrics);
    }

    return processed;
  }, [enableSampling, onPerformanceMetrics]);

  const loadData = useCallback(async (count: number) => {
    setIsLoading(true);
    setLoadProgress(0);

    if (showProgressiveLoading) {
      const batchSize = count / 10;
      let loadedData: DataPoint[] = [];

      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        const batch = generateLargeDataset(Math.floor(batchSize)).map((p, idx) => ({
          ...p,
          timestamp: p.timestamp + i * batchSize * 1000
        }));
        loadedData = [...loadedData, ...batch];
        setLoadProgress((i + 1) * 10);
      }

      const processed = processData(loadedData, maxPoints);
      setData(processed);
    } else {
      await new Promise(resolve => setTimeout(resolve, 100));
      const generated = generateLargeDataset(count);
      const processed = processData(generated, maxPoints);
      setData(processed);
    }

    setIsLoading(false);
  }, [maxPoints, processData, showProgressiveLoading]);

  useEffect(() => {
    if (initialData) {
      const processed = processData(initialData, maxPoints);
      setData(processed);
    } else {
      loadData(10000);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [initialData, maxPoints, processData, loadData]);

  useEffect(() => {
    const handleMemoryWarning = () => {
      if (performance.memory && performance.memory.jsHeapSizeLimit > 0) {
        const usage = performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit;
        if (usage > 0.8) {
          toast.warning(
            `High memory usage detected: ${(usage * 100).toFixed(0)}%`,
            { icon: <AlertCircle className="w-5 h-5" /> }
          );
        }
      }
    };

    window.addEventListener('memorywarning', handleMemoryWarning);
    return () => window.removeEventListener('memorywarning', handleMemoryWarning);
  }, []);

  const sampledData = useMemo(() => {
    if (!enableSampling || data.length <= maxPoints) return data;
    return lttbSampling(data, maxPoints);
  }, [data, enableSampling, maxPoints]);

  const toggleGpuAcceleration = useCallback(() => {
    setGpuEnabled(prev => {
      const newValue = !prev;
      toast.success(newValue ? 'GPU acceleration enabled' : 'GPU acceleration disabled');
      return newValue;
    });
  }, []);

  const refreshData = useCallback(() => {
    loadData(data.length);
  }, [loadData, data.length]);

  const formatValue = (value: number) => value.toFixed(1);
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6" style={{ height }}>
        <div className="flex flex-col items-center justify-center h-full">
          <Loader2 className="h-8 w-8 text-blue-600 animate-spin mb-4" />
          <div className="w-64 bg-gray-200 rounded-full h-2 mb-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${loadProgress}%` }}
            />
          </div>
          <p className="text-sm text-gray-600">Loading dataset... {loadProgress}%</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">{title}</h3>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={refreshData}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
              title="Refresh data"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={toggleGpuAcceleration}
              className={`p-2 rounded-lg ${gpuEnabled ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-100'
                }`}
              title={gpuEnabled ? 'GPU acceleration ON' : 'GPU acceleration OFF'}
            >
              <Zap className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowStats(!showStats)}
              className={`p-2 rounded-lg ${showStats ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              <Activity className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {showStats && performanceMetrics && (
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Points: </span>
              <span className="font-medium">{performanceMetrics.pointsRendered.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-gray-500">Render: </span>
              <span className="font-medium">{performanceMetrics.renderTime.toFixed(2)}ms</span>
            </div>
            <div>
              <span className="text-gray-500">Memory: </span>
              <span className="font-medium">
                {(performanceMetrics.memoryUsage / 1024 / 1024).toFixed(1)} MB
              </span>
            </div>
            <div>
              <span className="text-gray-500">Sample Rate: </span>
              <span className="font-medium">{performanceMetrics.samplingRate.toFixed(1)}x</span>
            </div>
          </div>
        </div>
      )}

      <div ref={containerRef} style={{ height, willChange: gpuEnabled ? 'transform' : 'auto' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sampledData}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={config.colors.primary} stopOpacity={0.3} />
                <stop offset="95%" stopColor={config.colors.primary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatTime}
              stroke="#9ca3af"
              fontSize={12}
            />
            <YAxis
              tickFormatter={formatValue}
              stroke="#9ca3af"
              fontSize={12}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
              labelFormatter={(timestamp) => formatTime(timestamp as number)}
              formatter={(value: number) => [formatValue(value), dataKey]}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={config.colors.primary}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorValue)"
              isAnimationActive={true}
              animationDuration={config.animationDuration}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {enableVirtualization && data.length > maxPoints && (
        <div className="px-4 py-2 bg-blue-50 border-t border-blue-200 text-xs text-blue-700">
          <div className="flex items-center justify-between">
            <span>
              Showing {sampledData.length.toLocaleString()} of {data.length.toLocaleString()} points
              (sampled {data.length / sampledData.length:.1f}x)
            </span>
            <label className="flex items-center space-x-1">
              <input
                type="checkbox"
                checked={enableSampling}
                onChange={() => { }}
                className="rounded border-blue-300"
              />
              <span>LTTB Sampling</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

export default LargeDatasetChart;