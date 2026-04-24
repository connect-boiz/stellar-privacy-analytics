import React from 'react';
import LargeDatasetChart from './components/PerformanceCharts';

const PerformancePage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Performance Analytics</h2>
        <p className="text-gray-600">Optimized rendering for large datasets</p>
      </div>

      <LargeDatasetChart 
        title="Real-Time Data Visualization"
        height={400}
        maxPoints={5000}
        enableVirtualization={true}
        enableSampling={true}
        showProgressiveLoading={true}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <LargeDatasetChart 
          title="Secondary Metrics"
          dataKey="value2"
          height={300}
          maxPoints={3000}
          enableSampling={true}
        />
        
        <LargeDatasetChart 
          title="Tertiary Metrics"
          dataKey="value3"
          height={300}
          maxPoints={3000}
          enableSampling={true}
        />
      </div>
    </div>
  );
};

export default PerformancePage;