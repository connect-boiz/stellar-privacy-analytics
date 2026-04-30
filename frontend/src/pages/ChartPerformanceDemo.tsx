import React, { useState, useEffect } from 'react';
import MemoryEfficientChart from '../components/charts/MemoryEfficientChart';
import { DataPoint } from '../utils/dataSampling';
import { toast } from 'react-hot-toast';

const ChartPerformanceDemo: React.FC = () => {
  const [datasetSize, setDatasetSize] = useState(10000);
  const [testData, setTestData] = useState<DataPoint[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const generateTestData = async (size: number): Promise<DataPoint[]> => {
    setIsGenerating(true);
    
    // Simulate async data generation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const baseTime = Date.now() - size * 1000;
    const data: DataPoint[] = [];
    
    for (let i = 0; i < size; i++) {
      data.push({
        timestamp: baseTime + i * 1000,
        value: Math.sin(i / 50) * 50 + 50 + Math.random() * 10,
        value2: Math.cos(i / 30) * 30 + 70 + Math.random() * 5,
        value3: Math.random() * 100,
        category: i % 4 === 0 ? 'A' : i % 4 === 1 ? 'B' : i % 4 === 2 ? 'C' : 'D'
      });
    }
    
    setIsGenerating(false);
    return data;
  };

  useEffect(() => {
    generateTestData(datasetSize).then(setTestData);
  }, [datasetSize]);

  const handlePerformanceMetrics = (metrics: any) => {
    console.log('Chart Performance Metrics:', metrics);
    
    if (metrics.memoryPressure === 'critical') {
      toast.error('Critical memory pressure detected!');
    } else if (metrics.memoryPressure === 'high') {
      toast.warning('High memory usage - optimization active');
    }
  };

  const handleSizeChange = (newSize: number) => {
    if (newSize > 100000) {
      toast.error('Dataset size too large (max: 100,000)');
      return;
    }
    setDatasetSize(newSize);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Memory-Efficient Chart Performance Demo
          </h1>
          <p className="text-gray-600">
            Test chart rendering with various dataset sizes and memory optimization features
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Test Controls</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dataset Size: {datasetSize.toLocaleString()} points
              </label>
              <input
                type="range"
                min="1000"
                max="100000"
                step="1000"
                value={datasetSize}
                onChange={(e) => handleSizeChange(Number(e.target.value))}
                className="w-full"
                disabled={isGenerating}
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>1K</span>
                <span>50K</span>
                <span>100K</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quick Sizes
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSizeChange(1000)}
                  className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm"
                  disabled={isGenerating}
                >
                  1K
                </button>
                <button
                  onClick={() => handleSizeChange(10000)}
                  className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm"
                  disabled={isGenerating}
                >
                  10K
                </button>
                <button
                  onClick={() => handleSizeChange(50000)}
                  className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm"
                  disabled={isGenerating}
                >
                  50K
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <div className="flex items-center">
                {isGenerating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                    <span className="text-sm text-gray-600">Generating data...</span>
                  </>
                ) : (
                  <>
                    <div className="h-4 w-4 bg-green-500 rounded-full mr-2"></div>
                    <span className="text-sm text-gray-600">Ready</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Memory Usage Info */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Memory Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Current Dataset:</span>
              <span className="ml-2 text-gray-600">{testData.length.toLocaleString()} points</span>
            </div>
            <div>
              <span className="font-medium">Estimated Memory:</span>
              <span className="ml-2 text-gray-600">
                ~{(testData.length * 100 / 1024 / 1024).toFixed(2)} MB
              </span>
            </div>
            <div>
              <span className="font-medium">Optimization Features:</span>
              <span className="ml-2 text-green-600">Active</span>
            </div>
            <div>
              <span className="font-medium">Progressive Loading:</span>
              <span className="ml-2 text-green-600">Enabled</span>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Primary Value Chart
            </h3>
            <MemoryEfficientChart
              data={testData}
              dataKey="value"
              title="Primary Metrics"
              height={400}
              maxPoints={5000}
              enableProgressiveLoading={true}
              onPerformanceMetrics={handlePerformanceMetrics}
              fallbackMode="sampling"
              memoryThreshold={0.8}
            />
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Secondary Value Chart
            </h3>
            <MemoryEfficientChart
              data={testData}
              dataKey="value2"
              title="Secondary Metrics"
              height={400}
              maxPoints={3000}
              enableProgressiveLoading={true}
              onPerformanceMetrics={(metrics) => console.log('Secondary chart metrics:', metrics)}
              fallbackMode="simplified"
              memoryThreshold={0.7}
            />
          </div>
        </div>

        {/* Performance Tips */}
        <div className="bg-blue-50 rounded-lg p-6 mt-8">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">Performance Features</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-800">
            <div>
              <h4 className="font-medium mb-2">Memory Optimization:</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>Automatic data sampling (LTTB algorithm)</li>
                <li>Memory pressure detection</li>
                <li>Adaptive point reduction</li>
                <li>Garbage collection triggers</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Rendering Features:</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>Progressive data loading</li>
                <li>Fallback rendering modes</li>
                <li>GPU acceleration control</li>
                <li>Performance profiling</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChartPerformanceDemo;
