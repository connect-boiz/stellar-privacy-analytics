import React, { useState } from 'react';
import { ArrowLeft, Database, Settings, Download } from 'lucide-react';
import PrivacyBudgetDashboard from '../components/PrivacyBudgetDashboard';
import { useNavigate } from 'react-router-dom';

const PrivacyBudgetPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedDataset, setSelectedDataset] = useState('dataset-1');

  // Mock dataset options
  const datasets = [
    { id: 'dataset-1', name: 'Customer Analytics Dataset' },
    { id: 'dataset-2', name: 'Financial Transactions Dataset' },
    { id: 'dataset-3', name: 'Healthcare Records Dataset' }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>Back to Dashboard</span>
              </button>
              <div className="h-6 w-px bg-gray-300"></div>
              <div className="flex items-center space-x-2">
                <Database className="w-6 h-6 text-blue-600" />
                <h1 className="text-xl font-bold text-gray-900">Privacy Budget Monitor</h1>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Dataset Selector */}
              <select
                value={selectedDataset}
                onChange={(e) => setSelectedDataset(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-sm"
              >
                {datasets.map(dataset => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.name}
                  </option>
                ))}
              </select>
              
              {/* Action Buttons */}
              <button className="flex items-center space-x-2 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </button>
              
              <button className="flex items-center space-x-2 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                <Download className="w-4 h-4" />
                <span>Export</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav className="flex mb-8" aria-label="Breadcrumb">
          <ol className="flex items-center space-x-2 text-sm">
            <li>
              <a href="/dashboard" className="text-gray-500 hover:text-gray-700">
                Dashboard
              </a>
            </li>
            <li>
              <span className="text-gray-300">/</span>
            </li>
            <li className="text-gray-900 font-medium">Privacy Budget</li>
          </ol>
        </nav>

        {/* Page Title */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Privacy Budget Visualization
          </h2>
          <p className="text-gray-600">
            Monitor and manage your differential privacy budget in real-time. Track epsilon consumption, 
            view historical trends, and receive alerts when budget limits are approached.
          </p>
        </div>

        {/* Privacy Budget Dashboard */}
        <PrivacyBudgetDashboard datasetId={selectedDataset} />

        {/* Additional Information Section */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick Stats */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Total Datasets</span>
                <span className="text-sm font-medium text-gray-900">3</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Active Queries</span>
                <span className="text-sm font-medium text-gray-900">12</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Avg. Daily Consumption</span>
                <span className="text-sm font-medium text-gray-900">0.08 ε</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Budget Health</span>
                <span className="text-sm font-medium text-green-600">Good</span>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Query executed</p>
                  <p className="text-xs text-gray-600">Customer Analytics - 2 hours ago</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Budget reset</p>
                  <p className="text-xs text-gray-600">Financial Dataset - 1 day ago</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2"></div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Warning triggered</p>
                  <p className="text-xs text-gray-600">Healthcare Dataset - 3 days ago</p>
                </div>
              </div>
            </div>
          </div>

          {/* Best Practices */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Best Practices</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start space-x-2">
                <span className="text-blue-500 mt-1">•</span>
                <span>Monitor budget consumption regularly</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-blue-500 mt-1">•</span>
                <span>Use smaller epsilon values for sensitive data</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-blue-500 mt-1">•</span>
                <span>Combine multiple queries when possible</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-blue-500 mt-1">•</span>
                <span>Set up alerts for budget thresholds</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-blue-500 mt-1">•</span>
                <span>Review query necessity before execution</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyBudgetPage;
