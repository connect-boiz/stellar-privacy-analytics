import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Play, BarChart3, TrendingUp, Users, Target, Code, Settings } from 'lucide-react';
import { QueryConstructor } from '../components/QueryConstructor';
import { WalletConnect } from '../components/WalletConnect';

export const Analytics: React.FC = () => {
  const [selectedAnalysis, setSelectedAnalysis] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'traditional' | 'nocode'>('nocode');

  const analysisTypes = [
    {
      id: 'descriptive',
      name: 'Descriptive Analytics',
      description: 'Understand historical patterns and trends',
      icon: BarChart3,
      color: 'bg-blue-500',
      privacy: 'High',
      duration: '2-5 min'
    },
    {
      id: 'predictive',
      name: 'Predictive Modeling',
      description: 'Forecast future outcomes and behaviors',
      icon: TrendingUp,
      color: 'bg-green-500',
      privacy: 'Maximum',
      duration: '5-10 min'
    },
    {
      id: 'segmentation',
      name: 'Customer Segmentation',
      description: 'Identify distinct user groups',
      icon: Users,
      color: 'bg-purple-500',
      privacy: 'High',
      duration: '3-7 min'
    },
    {
      id: 'anomaly',
      name: 'Anomaly Detection',
      description: 'Find unusual patterns and outliers',
      icon: Target,
      color: 'bg-red-500',
      privacy: 'Maximum',
      duration: '4-8 min'
    }
  ];

  const recentAnalyses = [
    {
      id: 1,
      name: 'Customer Behavior Analysis',
      type: 'descriptive',
      status: 'completed',
      accuracy: '94%',
      privacyScore: 'High',
      completedAt: '2 hours ago'
    },
    {
      id: 2,
      name: 'Sales Forecast Q1 2024',
      type: 'predictive',
      status: 'running',
      progress: 67,
      privacyScore: 'Maximum',
      startedAt: '15 min ago'
    },
    {
      id: 3,
      name: 'User Segmentation Study',
      type: 'segmentation',
      status: 'completed',
      accuracy: '89%',
      privacyScore: 'High',
      completedAt: '1 day ago'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">X-Ray Analytics</h1>
            <p className="text-gray-600 mt-1">Privacy-preserving data analysis</p>
          </div>
          <div className="flex items-center space-x-2">
            <Activity className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-green-600">3 Active Analyses</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex space-x-4 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('nocode')}
            className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'nocode'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center">
              <Code className="h-4 w-4 mr-2" />
              No-Code Query Constructor
            </div>
          </button>
          <button
            onClick={() => setActiveTab('traditional')}
            className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'traditional'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center">
              <Settings className="h-4 w-4 mr-2" />
              Traditional Analysis
            </div>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'nocode' ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <QueryConstructor />
          </div>
          <div className="lg:col-span-1">
            <WalletConnect requiredBalance={1.0} />
          </div>
        </div>
      ) : null}

      {/* Traditional Analysis Content */}
      {activeTab === 'traditional' && (
        <>
          {/* Analysis Types */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Start New Analysis</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analysisTypes.map((analysis) => {
                const Icon = analysis.icon;
                return (
                  <motion.div
                    key={analysis.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`border rounded-lg p-4 cursor-pointer transition-all ${
                      selectedAnalysis === analysis.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedAnalysis(analysis.id)}
                  >
                    <div className="flex items-start">
                      <div className={`p-2 rounded-lg ${analysis.color}`}>
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <div className="ml-3 flex-1">
                        <h3 className="font-medium text-gray-900">{analysis.name}</h3>
                        <p className="text-sm text-gray-600 mt-1">{analysis.description}</p>
                        <div className="flex items-center mt-2 space-x-4 text-xs text-gray-500">
                          <span>Privacy: {analysis.privacy}</span>
                          <span>Duration: {analysis.duration}</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
            
            {selectedAnalysis && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 p-4 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">Ready to start analysis?</h4>
                    <p className="text-sm text-gray-600 mt-1">
                      Your data will be processed with maximum privacy protection
                    </p>
                  </div>
                  <button className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                    <Play className="h-4 w-4 mr-2" />
                    Start Analysis
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </>
      )}

      {/* Recent Analyses */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Analyses</h2>
        <div className="space-y-3">
          {recentAnalyses.map((analysis) => (
            <motion.div
              key={analysis.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="border border-gray-200 rounded-lg p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center">
                    <h3 className="font-medium text-gray-900">{analysis.name}</h3>
                    <span className={`ml-2 px-2 py-1 text-xs font-medium rounded ${
                      analysis.privacyScore === 'Maximum' ? 'bg-purple-100 text-purple-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {analysis.privacyScore}
                    </span>
                  </div>
                  <div className="flex items-center mt-2 space-x-4 text-sm text-gray-500">
                    <span>Type: {analysis.type}</span>
                    {analysis.status === 'completed' && (
                      <>
                        <span>Accuracy: {analysis.accuracy}</span>
                        <span>{analysis.completedAt}</span>
                      </>
                    )}
                    {analysis.status === 'running' && (
                      <>
                        <span>{analysis.startedAt}</span>
                        <span>{analysis.progress}% complete</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="ml-4">
                  {analysis.status === 'completed' ? (
                    <button className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded-md">
                      View Results
                    </button>
                  ) : analysis.status === 'running' ? (
                    <div className="flex items-center">
                      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span className="ml-2 text-sm text-blue-600">Running</span>
                    </div>
                  ) : (
                    <button className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md">
                      View Details
                    </button>
                  )}
                </div>
              </div>
              {analysis.status === 'running' && (
                <div className="mt-3">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${analysis.progress}%` }}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Privacy Information */}
      <div className="bg-blue-50 rounded-lg p-6">
        <div className="flex">
          <Activity className="h-5 w-5 text-blue-400 mt-0.5" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Privacy-Protected Analysis</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>All analyses are performed with differential privacy, ensuring that individual data points cannot be identified while maintaining statistical accuracy.</p>
              <ul className="mt-2 list-disc list-inside space-y-1">
                <li>Data is encrypted before processing</li>
                <li>Statistical noise is added to protect privacy</li>
                <li>Results are aggregated and anonymized</li>
                <li>Full audit trail maintained for compliance</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
