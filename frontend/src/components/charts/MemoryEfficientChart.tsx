import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { AlertCircle, Loader2, RefreshCw, Zap, Activity, BarChart3, Memory, TrendingDown } from 'lucide-react';
import { toast } from 'react-hot-toast';
import MemoryMonitor from '../utils/memoryMonitor';
import { DataPoint, memoryAwareSampling, progressiveDataLoader, validateDataQuality } from '../utils/dataSampling';

interface MemoryEfficientChartProps {
  data?: DataPoint[];
  dataKey?: string;
  title?: string;
  height?: number;
  maxPoints?: number;
  enableProgressiveLoading?: boolean;
  onPerformanceMetrics?: (metrics: PerformanceMetrics) => void;
  fallbackMode?: 'simplified' | 'disabled' | 'sampling';
  memoryThreshold?: number;
}

interface PerformanceMetrics {
  renderTime: number;
  memoryUsage: number;
  pointsRendered: number;
  samplingRate: number;
  memoryPressure: 'low' | 'medium' | 'high' | 'critical';
}

interface ChartConfig {
  colors: {
    primary: string;
    gradient: string;
    warning: string;
    critical: string;
  };
  animationDuration: number;
  enableGpuAcceleration: boolean;
  chunkSize: number;
}

const defaultConfig: ChartConfig = {
  colors: {
    primary: '#3b82f6',
    gradient: 'rgba(59, 130, 246, 0.3)',
    warning: '#f59e0b',
    critical: '#ef4444'
  },
  animationDuration: 300,
  enableGpuAcceleration: true,
  chunkSize: 1000
};

const MemoryEfficientChart: React.FC<MemoryEfficientChartProps> = ({
  data: initialData,
  dataKey = 'value',
  title = 'Memory Efficient Chart',
  height = 400,
  maxPoints = 5000,
  enableProgressiveLoading = true,
  onPerformanceMetrics,
  fallbackMode = 'sampling',
  memoryThreshold = 0.8
}) => {
  const [data, setData] = useState<DataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [memoryPressure, setMemoryPressure] = useState<'low' | 'medium' | 'high' | 'critical'>('low');
  const [currentFallbackMode, setCurrentFallbackMode] = useState(fallbackMode);
  const [gpuEnabled, setGpuEnabled] = useState(true);
  const [config] = useState<ChartConfig>(defaultConfig);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const memoryMonitorRef = useRef<MemoryMonitor>(MemoryMonitor.getInstance());
  const chartIdRef = useRef(`chart-${Date.now()}`);

  const getMemoryPressureLevel = useCallback((usagePercentage: number): 'low' | 'medium' | 'high' | 'critical' => {
    if (usagePercentage >= 0.95) return 'critical';
    if (usagePercentage >= 0.9) return 'high';
    if (usagePercentage >= memoryThreshold) return 'medium';
    return 'low';
  }, [memoryThreshold]);

  const processData = useCallback(async (rawData: DataPoint[]) => {
    const startTime = performance.now();
    const memoryInfo = memoryMonitorRef.current.checkMemory();
    
    if (!memoryInfo) {
      console.warn('Memory monitoring not available');
      return rawData.slice(0, maxPoints);
    }

    const pressure = getMemoryPressureLevel(memoryInfo.usagePercentage);
    setMemoryPressure(pressure);

    // Validate data quality
    const validation = validateDataQuality(rawData);
    if (!validation.isValid) {
      console.warn('Data quality issues detected:', validation.issues);
      rawData = validation.cleanedData;
    }

    let processed: DataPoint[];
    let adjustedMaxPoints = maxPoints;

    // Adjust max points based on memory pressure
    if (pressure === 'critical') {
      adjustedMaxPoints = Math.floor(maxPoints * 0.1);
      toast.error('Critical memory usage! Reducing chart complexity.', {
        icon: <AlertCircle className="w-5 h-5 text-red-600" />
      });
    } else if (pressure === 'high') {
      adjustedMaxPoints = Math.floor(maxPoints * 0.25);
      toast.warning('High memory usage detected. Simplifying chart.', {
        icon: <AlertCircle className="w-5 h-5 text-yellow-600" />
      });
    } else if (pressure === 'medium') {
      adjustedMaxPoints = Math.floor(maxPoints * 0.5);
    }

    // Apply memory-aware sampling
    processed = memoryAwareSampling(
      rawData,
      adjustedMaxPoints,
      memoryInfo.usagePercentage,
      {
        preserveExtrema: true,
        adaptiveSampling: pressure === 'low',
        memoryThreshold
      }
    );

    const renderTime = performance.now() - startTime;
    
    const metrics: PerformanceMetrics = {
      renderTime,
      memoryUsage: memoryInfo.usedJSHeapSize,
      pointsRendered: processed.length,
      samplingRate: rawData.length / processed.length,
      memoryPressure: pressure
    };

    setPerformanceMetrics(metrics);
    
    if (onPerformanceMetrics) {
      onPerformanceMetrics(metrics);
    }

    return processed;
  }, [maxPoints, getMemoryPressureLevel, memoryThreshold, onPerformanceMetrics]);

  const loadData = useCallback(async (rawData: DataPoint[]) => {
    setIsLoading(true);
    setLoadProgress(0);

    try {
      if (enableProgressiveLoading && rawData.length > config.chunkSize) {
        // Progressive loading for large datasets
        const processedData = await progressiveDataLoader(
          rawData,
          config.chunkSize,
          (chunk, progress) => {
            setLoadProgress(progress);
          }
        );
        
        const finalData = await processData(processedData);
        setData(finalData);
      } else {
        // Direct processing for smaller datasets
        const processed = await processData(rawData);
        setData(processed);
      }
    } catch (error) {
      console.error('Error processing chart data:', error);
      toast.error('Failed to process chart data');
      
      // Fallback to minimal rendering
      const fallback = rawData.slice(0, Math.min(100, rawData.length));
      setData(fallback);
    } finally {
      setIsLoading(false);
      setLoadProgress(100);
    }
  }, [enableProgressiveLoading, config.chunkSize, processData]);

  useEffect(() => {
    if (initialData && initialData.length > 0) {
      loadData(initialData);
    }

    // Subscribe to memory monitoring
    const chartId = chartIdRef.current;
    memoryMonitorRef.current.subscribe(chartId, (memoryInfo) => {
      const pressure = getMemoryPressureLevel(memoryInfo.usagePercentage);
      setMemoryPressure(pressure);

      // Auto-adjust rendering based on memory pressure
      if (pressure === 'critical' && currentFallbackMode !== 'disabled') {
        setCurrentFallbackMode('simplified');
      }
    });

    memoryMonitorRef.current.startMonitoring(1000);

    return () => {
      memoryMonitorRef.current.unsubscribe(chartId);
      memoryMonitorRef.current.stopMonitoring();
    };
  }, [initialData, loadData, getMemoryPressureLevel, currentFallbackMode]);

  const toggleGpuAcceleration = useCallback(() => {
    setGpuEnabled(prev => {
      const newValue = !prev;
      toast.success(newValue ? 'GPU acceleration enabled' : 'GPU acceleration disabled');
      return newValue;
    });
  }, []);

  const refreshData = useCallback(() => {
    if (initialData) {
      loadData(initialData);
    }
  }, [initialData, loadData]);

  const forceGarbageCollection = useCallback(() => {
    const success = memoryMonitorRef.current.forceGarbageCollection();
    if (success) {
      toast.success('Garbage collection triggered');
    } else {
      toast.error('Garbage collection not available');
    }
  }, []);

  const formatValue = (value: number) => value.toFixed(1);
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getMemoryPressureColor = () => {
    switch (memoryPressure) {
      case 'critical': return config.colors.critical;
      case 'high': return config.colors.warning;
      case 'medium': return '#f59e0b';
      default: return config.colors.primary;
    }
  };

  // Simplified rendering for low-memory situations
  if (currentFallbackMode === 'simplified' && memoryPressure === 'critical') {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6" style={{ height }}>
        <div className="flex flex-col items-center justify-center h-full">
          <TrendingDown className="h-12 w-12 text-red-600 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Low Memory Mode</h3>
          <p className="text-sm text-gray-600 text-center mb-4">
            Chart simplified to prevent memory issues
          </p>
          <div className="text-2xl font-bold" style={{ color: getMemoryPressureColor() }}>
            {data.length > 0 ? data[data.length - 1].value.toFixed(1) : '0'}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Latest value
          </p>
        </div>
      </div>
    );
  }

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
          <p className="text-sm text-gray-600">Processing data... {loadProgress.toFixed(0)}%</p>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6" style={{ height }}>
        <div className="flex flex-col items-center justify-center h-full">
          <BarChart3 className="h-12 w-12 text-gray-400 mb-4" />
          <p className="text-gray-600">No data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" style={{ color: getMemoryPressureColor() }} />
            <h3 className="font-semibold text-gray-900">{title}</h3>
            {memoryPressure !== 'low' && (
              <span className={`px-2 py-1 text-xs rounded-full ${
                memoryPressure === 'critical' ? 'bg-red-100 text-red-700' :
                memoryPressure === 'high' ? 'bg-yellow-100 text-yellow-700' :
                'bg-orange-100 text-orange-700'
              }`}>
                {memoryPressure.toUpperCase()}
              </span>
            )}
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
              className={`p-2 rounded-lg ${
                gpuEnabled ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-100'
              }`}
              title={gpuEnabled ? 'GPU acceleration ON' : 'GPU acceleration OFF'}
            >
              <Zap className="h-4 w-4" />
            </button>
            <button
              onClick={forceGarbageCollection}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
              title="Force garbage collection"
            >
              <Memory className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowStats(!showStats)}
              className={`p-2 rounded-lg ${
                showStats ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Activity className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {showStats && performanceMetrics && (
        <div className={`px-4 py-3 border-b border-gray-200 ${
          memoryPressure === 'critical' ? 'bg-red-50' :
          memoryPressure === 'high' ? 'bg-yellow-50' :
          'bg-gray-50'
        }`}>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
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
                {memoryMonitorRef.current.formatMemorySize(performanceMetrics.memoryUsage)}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Sample: </span>
              <span className="font-medium">{performanceMetrics.samplingRate.toFixed(1)}x</span>
            </div>
            <div>
              <span className="text-gray-500">Pressure: </span>
              <span className={`font-medium ${
                memoryPressure === 'critical' ? 'text-red-600' :
                memoryPressure === 'high' ? 'text-yellow-600' :
                memoryPressure === 'medium' ? 'text-orange-600' :
                'text-green-600'
              }`}>
                {memoryPressure}
              </span>
            </div>
          </div>
        </div>
      )}

      <div 
        ref={containerRef} 
        style={{ 
          height, 
          willChange: gpuEnabled ? 'transform' : 'auto',
          transform: gpuEnabled ? 'translateZ(0)' : 'none'
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={getMemoryPressureColor()} stopOpacity={0.3} />
                <stop offset="95%" stopColor={getMemoryPressureColor()} stopOpacity={0} />
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
              stroke={getMemoryPressureColor()}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorValue)"
              isAnimationActive={memoryPressure === 'low'}
              animationDuration={memoryPressure === 'low' ? config.animationDuration : 0}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {memoryPressure !== 'low' && (
        <div className={`px-4 py-2 border-t text-xs ${
          memoryPressure === 'critical' ? 'bg-red-50 border-red-200 text-red-700' :
          memoryPressure === 'high' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
          'bg-orange-50 border-orange-200 text-orange-700'
        }`}>
          <div className="flex items-center justify-between">
            <span>
              Memory optimization active - {data.length.toLocaleString()} points rendered
            </span>
            <span>
              {memoryPressure === 'critical' ? '90%' :
               memoryPressure === 'high' ? '75%' :
               '50%'} point reduction
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemoryEfficientChart;
