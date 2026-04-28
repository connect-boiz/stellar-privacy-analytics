import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import PrivacyDashboard from '../components/dashboard/PrivacyDashboard';
import PrivacyDataService from '../services/privacyDataService';
import AnomalyDetectionEngine from '../services/anomalyDetectionEngine';
import AccessPatternAnalyzer from '../services/accessPatternAnalyzer';
import ComplianceMonitor from '../services/complianceMonitor';
import AlertConfigurationService from '../services/alertConfigurationService';
import HistoricalTrendAnalyzer from '../services/historicalTrendAnalyzer';
import MonitoringIntegrations from '../services/monitoringIntegrations';

const PrivacyMonitoringDemo: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics' | 'alerts' | 'compliance' | 'integrations'>('dashboard');
  const [isInitialized, setIsInitialized] = useState(false);
  const [mockDataEnabled, setMockDataEnabled] = useState(true);

  // Initialize services
  useEffect(() => {
    const initializeServices = async () => {
      try {
        // Initialize data service
        const dataService = PrivacyDataService.getInstance({
          apiEndpoint: '/api/privacy',
          wsEndpoint: 'ws://localhost:8080/privacy-ws',
          refreshInterval: 30000,
          retryAttempts: 3,
          timeout: 10000
        });

        // Connect WebSocket for real-time updates
        if (mockDataEnabled) {
          await dataService.connectWebSocket();
          
          // Subscribe to real-time updates
          dataService.subscribe('metrics', (data) => {
            console.log('Real-time metric update:', data);
          });
          
          dataService.subscribe('alerts', (alert) => {
            toast.error(`New alert: ${alert.title}`);
          });
          
          dataService.subscribe('anomalies', (anomaly) => {
            toast.warning(`Anomaly detected: ${anomaly.description}`);
          });
        }

        // Initialize other services
        const anomalyEngine = AnomalyDetectionEngine.getInstance({
          sensitivity: 0.7,
          windowSize: 60,
          minDataPoints: 30,
          alertThreshold: 0.8,
          enableML: false
        });

        const patternAnalyzer = AccessPatternAnalyzer.getInstance({
          timeWindow: 60,
          minAccessCount: 10,
          riskThresholds: {
            frequency: 2.5,
            volume: 3.0,
            time: 0.8,
            location: 0.7
          },
          enableML: false
        });

        const complianceMonitor = ComplianceMonitor.getInstance();
        const alertService = AlertConfigurationService.getInstance();
        const trendAnalyzer = HistoricalTrendAnalyzer.getInstance();
        const monitoringIntegrations = MonitoringIntegrations.getInstance();

        // Generate some mock data for demonstration
        if (mockDataEnabled) {
          const mockData = dataService.generateMockData();
          console.log('Generated mock data:', mockData);
          
          // Train anomaly detection engine with historical data
          await anomalyEngine.trainModel(mockData.accessEvents);
        }

        setIsInitialized(true);
        toast.success('Privacy monitoring system initialized successfully');
        
      } catch (error) {
        console.error('Failed to initialize services:', error);
        toast.error('Failed to initialize privacy monitoring system');
      }
    };

    initializeServices();
  }, [mockDataEnabled]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <PrivacyDashboard />;
      
      case 'analytics':
        return <AnalyticsTab mockDataEnabled={mockDataEnabled} />;
      
      case 'alerts':
        return <AlertsTab mockDataEnabled={mockDataEnabled} />;
      
      case 'compliance':
        return <ComplianceTab mockDataEnabled={mockDataEnabled} />;
      
      case 'integrations':
        return <IntegrationsTab />;
      
      default:
        return <PrivacyDashboard />;
    }
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Initializing Privacy Monitoring System...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">Privacy Monitoring Demo</h1>
              <span className="ml-4 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                Demo Mode
              </span>
            </div>
            
            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={mockDataEnabled}
                  onChange={(e) => setMockDataEnabled(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-600">Mock Data</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: '📊' },
              { id: 'analytics', label: 'Analytics', icon: '📈' },
              { id: 'alerts', label: 'Alerts', icon: '🚨' },
              { id: 'compliance', label: 'Compliance', icon: '⚖️' },
              { id: 'integrations', label: 'Integrations', icon: '🔗' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="py-6">
        {renderTabContent()}
      </div>
    </div>
  );
};

// Tab Components
const AnalyticsTab: React.FC<{ mockDataEnabled: boolean }> = ({ mockDataEnabled }) => {
  const [insights, setInsights] = useState<any[]>([]);
  const [trends, setTrends] = useState<any[]>([]);

  useEffect(() => {
    if (mockDataEnabled) {
      // Generate sample analytics insights
      const sampleInsights = [
        {
          type: 'trend',
          metric: 'access_volume',
          description: 'Access volume is increasing with 15% growth rate',
          confidence: 0.85,
          impact: 'high',
          recommendations: ['Monitor capacity', 'Review access patterns']
        },
        {
          type: 'anomaly',
          metric: 'compliance_score',
          description: '3 anomalies detected in compliance score',
          confidence: 0.8,
          impact: 'medium',
          recommendations: ['Investigate root cause', 'Review data quality']
        }
      ];

      setInsights(sampleInsights);
    }
  }, [mockDataEnabled]);

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Privacy Analytics</h2>
        <p className="text-gray-600">Advanced analytics and trend analysis for privacy metrics</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Insights */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Insights</h3>
          <div className="space-y-4">
            {insights.map((insight, index) => (
              <div key={index} className="border-l-4 border-blue-400 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900">
                    {insight.type.toUpperCase()}
                  </span>
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    {(insight.confidence * 100).toFixed(0)}% confidence
                  </span>
                </div>
                <p className="text-gray-700">{insight.description}</p>
                <div className="mt-2">
                  <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">
                    {insight.impact} impact
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Trend Analysis */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Trend Analysis</h3>
          <div className="space-y-3">
            {[
              { metric: 'Access Volume', trend: 'up', change: '+15%' },
              { metric: 'Compliance Score', trend: 'down', change: '-3%' },
              { metric: 'Anomaly Rate', trend: 'stable', change: '0%' }
            ].map((trend, index) => (
              <div key={index} className="flex items-center justify-between p-3 border-b border-gray-200">
                <div>
                  <p className="font-medium text-gray-900">{trend.metric}</p>
                  <p className="text-sm text-gray-500">Last 30 days</p>
                </div>
                <div className="text-right">
                  <span className={`text-lg font-bold ${
                    trend.trend === 'up' ? 'text-green-600' :
                    trend.trend === 'down' ? 'text-red-600' :
                    'text-gray-600'
                  }`}>
                    {trend.change}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const AlertsTab: React.FC<{ mockDataEnabled: boolean }> = ({ mockDataEnabled }) => {
  const [alertConfigs, setAlertConfigs] = useState<any[]>([]);

  useEffect(() => {
    if (mockDataEnabled) {
      const alertService = AlertConfigurationService.getInstance();
      const configs = alertService.getAllConfigurations();
      setAlertConfigs(configs);
    }
  }, [mockDataEnabled]);

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Alert Configuration</h2>
        <p className="text-gray-600">Configure and manage privacy monitoring alerts</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {alertConfigs.map((config) => (
          <div key={config.id} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">{config.name}</h3>
              <span className={`px-2 py-1 text-xs rounded ${
                config.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
              }`}>
                {config.enabled ? 'Active' : 'Inactive'}
              </span>
            </div>
            
            <p className="text-sm text-gray-600 mb-4">{config.description}</p>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Severity:</span>
                <span className="font-medium">{config.severity}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Conditions:</span>
                <span className="font-medium">{config.conditions.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Channels:</span>
                <span className="font-medium">{config.channels.length}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ComplianceTab: React.FC<{ mockDataEnabled: boolean }> = ({ mockDataEnabled }) => {
  const [complianceStatus, setComplianceStatus] = useState<any[]>([]);

  useEffect(() => {
    if (mockDataEnabled) {
      const complianceMonitor = ComplianceMonitor.getInstance();
      const status = complianceMonitor.getComplianceStatus();
      setComplianceStatus(status);
    }
  }, [mockDataEnabled]);

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Compliance Monitoring</h2>
        <p className="text-gray-600">Track regulatory compliance status and requirements</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {complianceStatus.map((status) => (
          <div key={status.id} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900">{status.framework}</h3>
                <p className="text-sm text-gray-600">{status.category}</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">{status.score}%</div>
                <span className={`px-2 py-1 text-xs rounded ${
                  status.status === 'compliant' ? 'bg-green-100 text-green-800' :
                  status.status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {status.status}
                </span>
              </div>
            </div>
            
            <div className="border-t border-gray-200 pt-4">
              <p className="text-sm text-gray-600 mb-2">Requirement:</p>
              <p className="font-medium text-gray-900">{status.requirement}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const IntegrationsTab: React.FC = () => {
  const [integrations, setIntegrations] = useState<any[]>([]);

  useEffect(() => {
    const monitoringIntegrations = MonitoringIntegrations.getInstance();
    const allIntegrations = monitoringIntegrations.getAllIntegrations();
    setIntegrations(allIntegrations);
  }, []);

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Monitoring Integrations</h2>
        <p className="text-gray-600">Connect with external monitoring and alerting systems</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {integrations.map((integration) => (
          <div key={integration.id} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">{integration.name}</h3>
              <span className={`px-2 py-1 text-xs rounded ${
                integration.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
              }`}>
                {integration.enabled ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Type:</span>
                <span className="font-medium">{integration.type}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Metrics:</span>
                <span className="font-medium">{integration.metrics.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Last Sync:</span>
                <span className="font-medium">
                  {integration.lastSync > 0 ? 
                    new Date(integration.lastSync).toLocaleTimeString() : 
                    'Never'
                  }
                </span>
              </div>
            </div>
            
            <div className="mt-4 flex space-x-2">
              <button className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200">
                Configure
              </button>
              <button className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200">
                Test
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PrivacyMonitoringDemo;
