import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';

interface PrivacyMetrics {
  epsilonUsed: number;
  epsilonTotal: number;
  epsilonBudget: number;
  privacyScore: number;
  noiseInjected: number;
  dataGrantsActive: number;
  dataGrantsExpired: number;
  lastUpdated: string;
}

interface DataGrant {
  id: string;
  name: string;
  provider: string;
  epsilonAllocated: number;
  epsilonUsed: number;
  expiresAt: string;
  status: 'active' | 'expiring' | 'expired';
}

const PrivacyHealthDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<PrivacyMetrics | null>(null);
  const [grants, setGrants] = useState<DataGrant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'grants' | 'analysis'>('overview');

  useEffect(() => {
    const loadDashboardData = async () => {
      setIsLoading(true);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setMetrics({
        epsilonUsed: 750000,
        epsilonTotal: 1000000,
        epsilonBudget: 250000,
        privacyScore: 78,
        noiseInjected: 12500,
        dataGrantsActive: 12,
        dataGrantsExpired: 3,
        lastUpdated: new Date().toISOString()
      });

      setGrants([
        {
          id: '1',
          name: 'Customer Analytics',
          provider: 'DataCorp Inc.',
          epsilonAllocated: 500000,
          epsilonUsed: 450000,
          expiresAt: '2024-03-15',
          status: 'expiring'
        },
        {
          id: '2',
          name: 'Market Research',
          provider: 'Research Labs',
          epsilonAllocated: 300000,
          epsilonUsed: 150000,
          expiresAt: '2024-06-30',
          status: 'active'
        },
        {
          id: '3',
          name: 'User Behavior Study',
          provider: 'Analytics Pro',
          epsilonAllocated: 200000,
          epsilonUsed: 150000,
          expiresAt: '2024-02-28',
          status: 'expired'
        }
      ]);

      setIsLoading(false);
    };

    loadDashboardData();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsRefreshing(false);
  };

  const handleTopUp = () => {
    console.log('Navigate to top-up page');
  };

  const getPrivacyScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getPrivacyScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-100';
    if (score >= 60) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  const getEpsilonProgress = () => {
    if (!metrics) return 0;
    return (metrics.epsilonUsed / metrics.epsilonTotal) * 100;
  };

  const getBudgetStatus = () => {
    if (!metrics) return 'normal';
    const percentage = (metrics.epsilonUsed / metrics.epsilonTotal) * 100;
    if (percentage >= 90) return 'critical';
    if (percentage >= 75) return 'warning';
    return 'normal';
  };

  const budgetStatus = getBudgetStatus();

  if (isLoading) {
    return <SimplePrivacyDashboardSkeleton />;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Privacy Health Dashboard</h1>
            <p className="text-gray-600 mt-1">Monitor your organization's privacy budget and data sovereignty</p>
          </div>
          <div className="flex space-x-3">
            <button 
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              <svg className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Refresh</span>
            </button>
            <Button onClick={handleTopUp} className="flex items-center space-x-2">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span>Top Up Budget</span>
            </Button>
          </div>
        </div>

        {/* Critical Alert */}
        {budgetStatus === 'critical' && (
          <div className="border border-red-200 bg-red-50 p-4 rounded-md">
            <div className="flex">
              <svg className="h-4 w-4 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.502 0L4.232 15.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Critical Privacy Budget Level</h3>
                <p className="text-sm text-red-700 mt-1">
                  Your privacy budget is critically low ({getEpsilonProgress().toFixed(1)}% used). 
                  Consider topping up your budget to avoid service interruption.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg border shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Privacy Budget Used</p>
                <p className="text-2xl font-bold text-gray-900">
                  {metrics?.epsilonUsed?.toLocaleString() || 0}
                </p>
                <p className="text-xs text-gray-500">
                  of {metrics?.epsilonTotal?.toLocaleString() || 0} ε
                </p>
              </div>
              <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="mt-4">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${
                    budgetStatus === 'critical' ? 'bg-red-600' : 
                    budgetStatus === 'warning' ? 'bg-yellow-600' : 'bg-green-600'
                  }`}
                  style={{ width: `${getEpsilonProgress()}%` }}
                ></div>
              </div>
              <p className={`text-xs mt-1 ${
                budgetStatus === 'critical' ? 'text-red-600' : 
                budgetStatus === 'warning' ? 'text-yellow-600' : 'text-green-600'
              }`}>
                {getEpsilonProgress().toFixed(1)}% used
              </p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Privacy Score</p>
                <p className={`text-2xl font-bold ${getPrivacyScoreColor(metrics?.privacyScore || 0)}`}>
                  {metrics?.privacyScore || 0}/100
                </p>
                <p className="text-xs text-gray-500">Overall privacy health</p>
              </div>
              <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="mt-4">
              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getPrivacyScoreBg(metrics?.privacyScore || 0)} ${getPrivacyScoreColor(metrics?.privacyScore || 0)}`}>
                {metrics?.privacyScore >= 80 ? 'Excellent' : metrics?.privacyScore >= 60 ? 'Good' : 'Needs Attention'}
              </span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Data Grants</p>
                <p className="text-2xl font-bold text-gray-900">{metrics?.dataGrantsActive || 0}</p>
                <p className="text-xs text-gray-500">
                  {metrics?.dataGrantsExpired || 0} expired
                </p>
              </div>
              <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            </div>
            <div className="mt-4 flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-xs text-green-600">Active</span>
              <div className="w-2 h-2 bg-red-500 rounded-full ml-2"></div>
              <span className="text-xs text-red-600">Expired</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Noise Injected</p>
                <p className="text-2xl font-bold text-gray-900">{metrics?.noiseInjected?.toLocaleString() || 0}</p>
                <p className="text-xs text-gray-500">Privacy-preserving noise</p>
              </div>
              <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="mt-4 flex items-center space-x-1">
              <svg className="h-3 w-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <span className="text-xs text-green-600">+12% from last month</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg border">
          <div className="border-b">
            <nav className="flex space-x-8 px-6" aria-label="Tabs">
              {['overview', 'grants', 'analysis'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Privacy Budget Consumption</h3>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="grid grid-cols-6 gap-4 text-center">
                      {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((month, index) => (
                        <div key={month}>
                          <div className="text-xs text-gray-600">{month}</div>
                          <div className="mt-2 h-20 bg-gray-200 rounded relative">
                            <div 
                              className="absolute bottom-0 left-0 right-0 bg-blue-500 rounded"
                              style={{ height: `${Math.random() * 80 + 20}%` }}
                            ></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Privacy Score Breakdown</h3>
                  <div className="space-y-3">
                    {[
                      { category: 'Encryption Strength', value: 95, max: 100 },
                      { category: 'Noise Injection', value: 80, max: 100 },
                      { category: 'Data Minimization', value: 70, max: 100 },
                      { category: 'Access Control', value: 85, max: 100 },
                      { category: 'Audit Compliance', value: 60, max: 100 }
                    ].map((item, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{item.category}</span>
                          <span>{item.value}/{item.max}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${(item.value / item.max) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'grants' && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Active Data Grants</h3>
                {grants.map((grant) => (
                  <div key={grant.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h4 className="font-medium">{grant.name}</h4>
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          grant.status === 'active' ? 'bg-green-100 text-green-800' :
                          grant.status === 'expiring' ? 'bg-yellow-100 text-yellow-800' : 
                          'bg-red-100 text-red-800'
                        }`}>
                          {grant.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">{grant.provider}</p>
                      <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                        <span>ε {grant.epsilonUsed.toLocaleString()} / {grant.epsilonAllocated.toLocaleString()}</span>
                        <span>Expires: {new Date(grant.expiresAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                      <Button variant="outline" size="sm">
                        Manage
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'analysis' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Privacy Recommendations</h3>
                  <div className="space-y-3">
                    {[
                      { type: 'blue', title: 'Increase Noise Injection', desc: 'Consider adding more statistical noise to improve privacy guarantees' },
                      { type: 'yellow', title: 'Audit Compliance', desc: 'Update audit logs to meet compliance requirements' },
                      { type: 'green', title: 'Data Minimization', desc: 'Reduce data collection to essential fields only' }
                    ].map((rec, index) => (
                      <div key={index} className="flex items-start space-x-3 p-3 border rounded-lg">
                        <div className={`w-2 h-2 bg-${rec.type}-500 rounded-full mt-2`}></div>
                        <div>
                          <p className="font-medium text-sm">{rec.title}</p>
                          <p className="text-xs text-gray-600">{rec.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyHealthDashboard;
