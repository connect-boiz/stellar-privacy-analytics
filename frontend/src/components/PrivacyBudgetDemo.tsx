import React, { useState, useEffect } from 'react';
import { AlertCircle, TrendingDown, TrendingUp, Info, RefreshCw, Download, Settings } from 'lucide-react';
import { toast } from 'react-hot-toast';
import axios from 'axios';

// Mock data for demonstration
const mockBudgetData = {
  datasetId: 'demo-dataset',
  datasetName: 'Customer Analytics Dataset',
  currentEpsilon: 0.73,
  maxEpsilon: 1.0,
  percentageUsed: 73,
  lastUpdated: new Date().toISOString(),
  status: 'warning' as const
};

const mockHistoryData = [
  { date: '2024-03-01', epsilon: 0.95, percentageUsed: 95, operation: 'Query' },
  { date: '2024-03-02', epsilon: 0.92, percentageUsed: 92, operation: 'Analysis' },
  { date: '2024-03-03', epsilon: 0.88, percentageUsed: 88, operation: 'Export' },
  { date: '2024-03-04', epsilon: 0.85, percentageUsed: 85, operation: 'Query' },
  { date: '2024-03-05', epsilon: 0.82, percentageUsed: 82, operation: 'Analysis' },
  { date: '2024-03-06', epsilon: 0.80, percentageUsed: 80, operation: 'Query' },
  { date: '2024-03-07', epsilon: 0.78, percentageUsed: 78, operation: 'Export' },
  { date: '2024-03-08', epsilon: 0.76, percentageUsed: 76, operation: 'Query' },
  { date: '2024-03-09', epsilon: 0.74, percentageUsed: 74, operation: 'Analysis' },
  { date: '2024-03-10', epsilon: 0.73, percentageUsed: 73, operation: 'Query' },
];

const PrivacyBudgetDemo: React.FC = () => {
  const [budget, setBudget] = useState(mockBudgetData);
  const [history, setHistory] = useState(mockHistoryData);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [alertShown, setAlertShown] = useState(false);

  // Color coding based on budget consumption
  const getBudgetColor = (percentage: number) => {
    if (percentage >= 90) return '#ef4444'; // Red
    if (percentage >= 70) return '#f59e0b'; // Yellow/Amber
    return '#10b981'; // Green
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical': return '#ef4444';
      case 'warning': return '#f59e0b';
      case 'healthy': return '#10b981';
      default: return '#6b7280';
    }
  };

  // Simulate real-time updates
  const simulateConsumption = () => {
    setLoading(true);
    
    setTimeout(() => {
      const consumption = Math.random() * 0.05; // Random consumption
      const newEpsilon = Math.min(budget.currentEpsilon + consumption, budget.maxEpsilon);
      const newPercentage = (newEpsilon / budget.maxEpsilon) * 100;
      
      let newStatus: 'healthy' | 'warning' | 'critical';
      if (newPercentage >= 90) {
        newStatus = 'critical';
      } else if (newPercentage >= 70) {
        newStatus = 'warning';
      } else {
        newStatus = 'healthy';
      }

      const updatedBudget = {
        ...budget,
        currentEpsilon: newEpsilon,
        percentageUsed: parseFloat(newPercentage.toFixed(2)),
        lastUpdated: new Date().toISOString(),
        status: newStatus
      };

      setBudget(updatedBudget);

      // Add to history
      const newHistoryEntry = {
        date: new Date().toISOString().split('T')[0],
        epsilon: parseFloat(newEpsilon.toFixed(3)),
        percentageUsed: parseFloat(newPercentage.toFixed(2)),
        operation: ['Query', 'Analysis', 'Export'][Math.floor(Math.random() * 3)]
      };

      setHistory([newHistoryEntry, ...history.slice(0, 29)]);

      // Check for alerts
      if (newPercentage >= 90 && !alertShown) {
        toast.error(
          `Privacy budget critically low! Only ${(100 - newPercentage).toFixed(1)}% remaining.`,
          {
            duration: 5000,
            icon: <AlertCircle className="w-5 h-5" />,
          }
        );
        setAlertShown(true);
      } else if (newPercentage >= 70 && newPercentage < 90 && budget.status !== 'warning') {
        toast.warning(
          `Privacy budget warning: ${(100 - newPercentage).toFixed(1)}% remaining.`,
          {
            duration: 4000,
            icon: <TrendingDown className="w-5 h-5" />,
          }
        );
      }

      setLoading(false);
      toast.success('Budget updated successfully');
    }, 1000);
  };

  // Reset budget for demo
  const resetBudget = () => {
    setBudget({
      ...budget,
      currentEpsilon: 0,
      percentageUsed: 0,
      lastUpdated: new Date().toISOString(),
      status: 'healthy'
    });
    setHistory([]);
    setAlertShown(false);
    toast.success('Budget reset successfully');
  };

  // Prepare data for gauge chart
  const gaugeData = [
    { name: 'Used', value: budget.percentageUsed, color: getBudgetColor(budget.percentageUsed) },
    { name: 'Remaining', value: 100 - budget.percentageUsed, color: '#e5e7eb' }
  ];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Privacy Budget Dashboard</h2>
            <p className="text-gray-600">Real-time monitoring of differential privacy budget consumption</p>
          </div>
          <div className="flex items-center space-x-3">
            <div className={`px-3 py-1 rounded-full text-xs font-medium text-white`}
                 style={{ backgroundColor: getStatusColor(budget.status) }}>
              {budget.status.toUpperCase()}
            </div>
            <button
              onClick={simulateConsumption}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Simulate Query</span>
            </button>
            <button
              onClick={resetBudget}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Reset Budget
            </button>
          </div>
        </div>

        {/* Main Dashboard */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Gauge Chart */}
          <div className="lg:col-span-1">
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 text-center">Current Status</h3>
              
              {/* Simple SVG Gauge */}
              <div className="relative w-48 h-32 mx-auto">
                <svg viewBox="0 0 200 120" className="w-full h-full">
                  {/* Background arc */}
                  <path
                    d="M 30 90 A 70 70 0 0 1 170 90"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="20"
                    strokeLinecap="round"
                  />
                  {/* Used arc */}
                  <path
                    d="M 30 90 A 70 70 0 0 1 170 90"
                    fill="none"
                    stroke={getBudgetColor(budget.percentageUsed)}
                    strokeWidth="20"
                    strokeLinecap="round"
                    strokeDasharray={`${(budget.percentageUsed / 100) * 220} 220`}
                  />
                  {/* Scale markers */}
                  {[0, 25, 50, 75, 100].map((value) => {
                    const angle = 180 + (value * 1.8); // Convert to degrees
                    const radian = (angle * Math.PI) / 180;
                    const x1 = 100 + Math.cos(radian) * 75;
                    const y1 = 90 + Math.sin(radian) * 75;
                    const x2 = 100 + Math.cos(radian) * 85;
                    const y2 = 90 + Math.sin(radian) * 85;
                    
                    return (
                      <line key={value} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#9ca3af" strokeWidth="2" />
                    );
                  })}
                </svg>
                
                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ top: '60%' }}>
                  <div 
                    className="text-3xl font-bold"
                    style={{ color: getBudgetColor(budget.percentageUsed) }}
                  >
                    {(100 - budget.percentageUsed).toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-600">Remaining</div>
                  <div className="text-xs text-gray-500 mt-1">
                    ε = {(budget.maxEpsilon - budget.currentEpsilon).toFixed(3)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats and Info */}
          <div className="lg:col-span-2 space-y-4">
            {/* Current Budget */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Current Epsilon</span>
                <span className="text-lg font-bold text-gray-900">
                  {budget.currentEpsilon.toFixed(3)} / {budget.maxEpsilon}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="h-3 rounded-full transition-all duration-500"
                  style={{ 
                    width: `${budget.percentageUsed}%`,
                    backgroundColor: getBudgetColor(budget.percentageUsed)
                  }}
                ></div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {budget.maxEpsilon}
                </div>
                <div className="text-sm text-blue-800">Max Epsilon</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-600">
                  {(budget.maxEpsilon - budget.currentEpsilon).toFixed(3)}
                </div>
                <div className="text-sm text-green-800">Remaining</div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {budget.percentageUsed.toFixed(1)}%
                </div>
                <div className="text-sm text-yellow-800">Used</div>
              </div>
            </div>

            {/* Info Card */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-blue-900">Understanding Epsilon (ε)</h4>
                  <p className="text-sm text-blue-800 mt-1">
                    Epsilon measures privacy loss in differential privacy. Lower values mean stronger privacy protection. 
                    Each analytics query consumes some epsilon, and when it's depleted, no further queries can be made safely.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 mt-6">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <TrendingDown className="w-4 h-4" />
            <span>{showHistory ? 'Hide' : 'Show'} History</span>
          </button>
          <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
            <Download className="w-4 h-4" />
            <span>Export Report</span>
          </button>
          <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* History View */}
      {showHistory && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">30-Day Budget History</h3>
          
          {/* Simple Line Chart Representation */}
          <div className="space-y-2">
            {history.slice(0, 10).map((entry, index) => (
              <div key={index} className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
                <div className="w-20 text-sm text-gray-600">{entry.date}</div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div 
                        className="h-2 rounded-full"
                        style={{ 
                          width: `${entry.percentageUsed}%`,
                          backgroundColor: getBudgetColor(entry.percentageUsed)
                        }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-12 text-right">
                      {entry.percentageUsed.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="w-16 text-sm text-gray-600">{entry.operation}</div>
                <div className="w-12 text-sm font-medium text-gray-900 text-right">
                  {entry.epsilon.toFixed(3)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Responsive Design Note */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Info className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-semibold text-yellow-900">Responsive Design Features</h4>
            <ul className="text-sm text-yellow-800 mt-1 space-y-1">
              <li>• Adapts seamlessly between tablet and desktop views</li>
              <li>• Touch-friendly interface for mobile devices</li>
              <li>• Real-time updates with automatic layout adjustments</li>
              <li>• Color-coded alerts for accessibility</li>
              <li>• Toast notifications that work across all screen sizes</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyBudgetDemo;
