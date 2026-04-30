import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Shield, 
  AlertTriangle, 
  TrendingUp, 
  Users, 
  Clock, 
  Globe,
  Activity,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Settings,
  Download,
  Filter
} from 'lucide-react';
import { toast } from 'react-hot-toast';

import PrivacyDataService from '../../services/privacyDataService';
import AnomalyDetectionEngine from '../../services/anomalyDetectionEngine';
import AccessPatternAnalyzer from '../../services/accessPatternAnalyzer';
import ComplianceMonitor from '../../services/complianceMonitor';
import MemoryEfficientChart from '../charts/MemoryEfficientChart';

import {
  DashboardState,
  PrivacyMetric,
  AnomalyDetection,
  PrivacyAlert,
  ComplianceStatus,
  AccessPattern,
  HistoricalTrend
} from '../../types/privacyMetrics';

interface PrivacyDashboardProps {
  config?: {
    refreshInterval?: number;
    autoRefresh?: boolean;
    defaultTimeRange?: '1h' | '6h' | '24h' | '7d' | '30d';
  };
}

const PrivacyDashboard: React.FC<PrivacyDashboardProps> = ({
  config = {}
}) => {
  const {
    refreshInterval = 30000, // 30 seconds
    autoRefresh = true,
    defaultTimeRange = '24h'
  } = config;

  // State management
  const [dashboardState, setDashboardState] = useState<DashboardState>({
    metrics: [],
    alerts: [],
    anomalies: [],
    compliance: [],
    accessPatterns: [],
    integrations: [],
    lastUpdated: Date.now(),
    filters: {
      timeRange: getTimeRange(defaultTimeRange),
      severity: [],
      categories: [],
      sources: []
    },
    loading: true
  });

  const [selectedTimeRange, setSelectedTimeRange] = useState(defaultTimeRange);
  const [isRealTime, setIsRealTime] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // Service instances
  const dataService = useMemo(() => PrivacyDataService.getInstance({
    apiEndpoint: '/api/privacy',
    wsEndpoint: 'ws://localhost:8080/privacy-ws',
    refreshInterval,
    retryAttempts: 3,
    timeout: 10000
  }), [refreshInterval]);

  const anomalyEngine = useMemo(() => AnomalyDetectionEngine.getInstance({
    sensitivity: 0.7,
    windowSize: 60,
    minDataPoints: 30,
    alertThreshold: 0.8,
    enableML: false
  }), []);

  const patternAnalyzer = useMemo(() => AccessPatternAnalyzer.getInstance({
    timeWindow: 60,
    minAccessCount: 10,
    riskThresholds: {
      frequency: 2.5,
      volume: 3.0,
      time: 0.8,
      location: 0.7
    },
    enableML: false
  }), []);

  const complianceMonitor = useMemo(() => ComplianceMonitor.getInstance(), []);

  // Data fetching
  const fetchDashboardData = useCallback(async () => {
    try {
      setDashboardState(prev => ({ ...prev, loading: true, error: undefined }));

      // Fetch all data in parallel
      const [
        metrics,
        alerts,
        anomalies,
        compliance,
        accessEvents
      ] = await Promise.all([
        dataService.fetchMetrics(dashboardState.filters.timeRange),
        dataService.fetchAlerts(),
        dataService.fetchAnomalies(dashboardState.filters.timeRange),
        dataService.fetchComplianceStatus(),
        dataService.fetchAccessEvents(dashboardState.filters.timeRange)
      ]);

      // Run anomaly detection
      const detectedAnomalies = await anomalyEngine.detectAnomalies(metrics, accessEvents);
      
      // Analyze access patterns
      const accessPatterns = await patternAnalyzer.analyzeAccessPatterns(accessEvents);

      setDashboardState(prev => ({
        ...prev,
        metrics,
        alerts,
        anomalies: [...anomalies, ...detectedAnomalies],
        compliance,
        accessPatterns,
        lastUpdated: Date.now(),
        loading: false
      }));

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setDashboardState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
      toast.error('Failed to load dashboard data');
    }
  }, [dataService, anomalyEngine, patternAnalyzer, dashboardState.filters.timeRange]);

  // Real-time updates
  useEffect(() => {
    if (!isRealTime) return;

    const connectWebSocket = async () => {
      try {
        await dataService.connectWebSocket();
        
        // Subscribe to real-time updates
        const unsubscribeMetrics = dataService.subscribe('metrics', (data) => {
          setDashboardState(prev => ({
            ...prev,
            metrics: [...prev.metrics.slice(-99), data],
            lastUpdated: Date.now()
          }));
        });

        const unsubscribeAlerts = dataService.subscribe('alerts', (alert) => {
          setDashboardState(prev => ({
            ...prev,
            alerts: [alert, ...prev.alerts.slice(0, 49)]
          }));
          toast.error(`New alert: ${alert.title}`);
        });

        const unsubscribeAnomalies = dataService.subscribe('anomalies', (anomaly) => {
          setDashboardState(prev => ({
            ...prev,
            anomalies: [anomaly, ...prev.anomalies.slice(0, 49)]
          }));
          toast.warning(`Anomaly detected: ${anomaly.description}`);
        });

        return () => {
          unsubscribeMetrics();
          unsubscribeAlerts();
          unsubscribeAnomalies();
        };

      } catch (error) {
        console.error('WebSocket connection failed:', error);
        toast.error('Real-time connection failed');
      }
    };

    const cleanup = connectWebSocket();

    return () => {
      cleanup.then(cleanupFn => cleanupFn?.());
    };
  }, [isRealTime, dataService]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchDashboardData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchDashboardData]);

  // Initial data load
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Event handlers
  const handleTimeRangeChange = (newRange: string) => {
    setSelectedTimeRange(newRange);
    setDashboardState(prev => ({
      ...prev,
      filters: {
        ...prev.filters,
        timeRange: getTimeRange(newRange)
      }
    }));
  };

  const handleRefresh = () => {
    fetchDashboardData();
  };

  const handleAlertAcknowledge = async (alertId: string) => {
    try {
      await dataService.acknowledgeAlert(alertId);
      setDashboardState(prev => ({
        ...prev,
        alerts: prev.alerts.map(alert =>
          alert.id === alertId
            ? { ...alert, status: 'acknowledged', acknowledgedAt: Date.now() }
            : alert
        )
      }));
      toast.success('Alert acknowledged');
    } catch (error) {
      toast.error('Failed to acknowledge alert');
    }
  };

  const handleAlertResolve = async (alertId: string, notes?: string) => {
    try {
      await dataService.resolveAlert(alertId, notes);
      setDashboardState(prev => ({
        ...prev,
        alerts: prev.alerts.map(alert =>
          alert.id === alertId
            ? { ...alert, status: 'resolved', resolvedAt: Date.now() }
            : alert
        )
      }));
      toast.success('Alert resolved');
    } catch (error) {
      toast.error('Failed to resolve alert');
    }
  };

  // Calculate summary metrics
  const summaryMetrics = useMemo(() => {
    const criticalAlerts = dashboardState.alerts.filter(a => a.severity === 'critical' && a.status === 'active').length;
    const activeAnomalies = dashboardState.anomalies.filter(a => a.status === 'active').length;
    const overallCompliance = calculateOverallCompliance(dashboardState.compliance);
    const riskScore = calculateRiskScore(dashboardState.anomalies, dashboardState.alerts);

    return {
      criticalAlerts,
      activeAnomalies,
      overallCompliance,
      riskScore,
      totalAccess: dashboardState.accessPatterns.reduce((sum, p) => sum + p.accessFrequency, 0)
    };
  }, [dashboardState]);

  // Render loading state
  if (dashboardState.loading && dashboardState.metrics.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading privacy dashboard...</p>
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
              <Shield className="h-8 w-8 text-blue-600 mr-3" />
              <h1 className="text-xl font-semibold text-gray-900">Privacy Monitoring Dashboard</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Time Range Selector */}
              <select
                value={selectedTimeRange}
                onChange={(e) => handleTimeRangeChange(e.target.value)}
                className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="1h">Last Hour</option>
                <option value="6h">Last 6 Hours</option>
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>

              {/* Real-time Toggle */}
              <button
                onClick={() => setIsRealTime(!isRealTime)}
                className={`p-2 rounded-md ${
                  isRealTime
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                <Activity className="h-4 w-4" />
              </button>

              {/* Refresh */}
              <button
                onClick={handleRefresh}
                className="p-2 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                <RefreshCw className="h-4 w-4" />
              </button>

              {/* Settings */}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <SummaryCard
            title="Critical Alerts"
            value={summaryMetrics.criticalAlerts}
            icon={AlertTriangle}
            color="red"
            trend={dashboardState.alerts.filter(a => a.severity === 'critical').length > 0 ? 'up' : 'stable'}
          />
          
          <SummaryCard
            title="Active Anomalies"
            value={summaryMetrics.activeAnomalies}
            icon={AlertCircle}
            color="yellow"
            trend={summaryMetrics.activeAnomalies > 5 ? 'up' : 'stable'}
          />
          
          <SummaryCard
            title="Compliance Score"
            value={`${summaryMetrics.overallCompliance}%`}
            icon={CheckCircle}
            color="green"
            trend={summaryMetrics.overallCompliance > 90 ? 'up' : 'down'}
          />
          
          <SummaryCard
            title="Risk Score"
            value={summaryMetrics.riskScore}
            icon={Shield}
            color="blue"
            trend={summaryMetrics.riskScore > 70 ? 'up' : 'stable'}
          />
          
          <SummaryCard
            title="Total Access"
            value={summaryMetrics.totalAccess.toLocaleString()}
            icon={Users}
            color="purple"
            trend="up"
          />
        </div>
      </div>

      {/* Main Dashboard Grid */}
      <div className="px-4 sm:px-6 lg:px-8 pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Privacy Metrics Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Privacy Metrics</h2>
            <MemoryEfficientChart
              data={dashboardState.metrics.map(m => ({
                timestamp: m.timestamp,
                value: m.value,
                type: m.metricType
              }))}
              dataKey="value"
              title="Real-time Privacy Metrics"
              height={300}
              maxPoints={100}
              enableProgressiveLoading={true}
            />
          </div>

          {/* Recent Alerts */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Alerts</h2>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {dashboardState.alerts.slice(0, 10).map(alert => (
                <AlertItem
                  key={alert.id}
                  alert={alert}
                  onAcknowledge={() => handleAlertAcknowledge(alert.id)}
                  onResolve={(notes) => handleAlertResolve(alert.id, notes)}
                />
              ))}
              {dashboardState.alerts.length === 0 && (
                <p className="text-gray-500 text-center py-4">No active alerts</p>
              )}
            </div>
          </div>

          {/* Anomaly Detection */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Anomaly Detection</h2>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {dashboardState.anomalies.slice(0, 10).map(anomaly => (
                <AnomalyItem key={anomaly.id} anomaly={anomaly} />
              ))}
              {dashboardState.anomalies.length === 0 && (
                <p className="text-gray-500 text-center py-4">No anomalies detected</p>
              )}
            </div>
          </div>

          {/* Compliance Status */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Compliance Status</h2>
            <div className="space-y-3">
              {dashboardState.compliance.map(status => (
                <ComplianceItem key={status.id} status={status} />
              ))}
              {dashboardState.compliance.length === 0 && (
                <p className="text-gray-500 text-center py-4">No compliance data available</p>
              )}
            </div>
          </div>
        </div>

        {/* Access Patterns */}
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Access Patterns</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {dashboardState.accessPatterns.slice(0, 3).map(pattern => (
              <AccessPatternCard key={pattern.userId} pattern={pattern} />
            ))}
            {dashboardState.accessPatterns.length === 0 && (
              <p className="text-gray-500 text-center py-4 col-span-3">No access pattern data available</p>
            )}
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Dashboard Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Refresh Interval</label>
                <select className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                  <option value="10000">10 seconds</option>
                  <option value="30000">30 seconds</option>
                  <option value="60000">1 minute</option>
                  <option value="300000">5 minutes</option>
                </select>
              </div>
              <div>
                <label className="flex items-center">
                  <input type="checkbox" checked={autoRefresh} className="mr-2" />
                  Auto-refresh
                </label>
              </div>
              <div>
                <label className="flex items-center">
                  <input type="checkbox" checked={isRealTime} className="mr-2" />
                  Real-time updates
                </label>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper components
interface SummaryCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<any>;
  color: 'red' | 'yellow' | 'green' | 'blue' | 'purple';
  trend: 'up' | 'down' | 'stable';
}

const SummaryCard: React.FC<SummaryCardProps> = ({ title, value, icon: Icon, color, trend }) => {
  const colorClasses = {
    red: 'bg-red-50 text-red-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600'
  };

  const trendIcons = {
    up: <TrendingUp className="h-4 w-4 text-green-500" />,
    down: <TrendingUp className="h-4 w-4 text-red-500 transform rotate-180" />,
    stable: <div className="h-4 w-4 bg-gray-300 rounded-full" />
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`p-3 rounded-full ${colorClasses[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
      <div className="mt-4 flex items-center">
        {trendIcons[trend]}
        <span className="ml-2 text-sm text-gray-500">
          {trend === 'up' ? 'Increasing' : trend === 'down' ? 'Decreasing' : 'Stable'}
        </span>
      </div>
    </div>
  );
};

interface AlertItemProps {
  alert: PrivacyAlert;
  onAcknowledge: () => void;
  onResolve: (notes?: string) => void;
}

const AlertItem: React.FC<AlertItemProps> = ({ alert, onAcknowledge, onResolve }) => {
  const severityColors = {
    low: 'bg-gray-100 text-gray-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800'
  };

  return (
    <div className="border-l-4 border-gray-200 p-3 hover:bg-gray-50">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center">
            <span className={`px-2 py-1 text-xs rounded-full ${severityColors[alert.severity]}`}>
              {alert.severity.toUpperCase()}
            </span>
            <h4 className="ml-2 text-sm font-medium text-gray-900">{alert.title}</h4>
          </div>
          <p className="mt-1 text-sm text-gray-600">{alert.message}</p>
          <p className="mt-1 text-xs text-gray-500">
            {new Date(alert.timestamp).toLocaleString()}
          </p>
        </div>
        <div className="ml-4 flex space-x-2">
          {alert.status === 'active' && (
            <>
              <button
                onClick={onAcknowledge}
                className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
              >
                Acknowledge
              </button>
              <button
                onClick={() => onResolve('Resolved from dashboard')}
                className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200"
              >
                Resolve
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const AnomalyItem: React.FC<{ anomaly: AnomalyDetection }> = ({ anomaly }) => {
  const severityColors = {
    low: 'bg-gray-100 text-gray-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800'
  };

  return (
    <div className="border-l-4 border-yellow-400 p-3 hover:bg-gray-50">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center">
            <span className={`px-2 py-1 text-xs rounded-full ${severityColors[anomaly.severity]}`}>
              {anomaly.severity.toUpperCase()}
            </span>
            <h4 className="ml-2 text-sm font-medium text-gray-900">{anomaly.anomalyType}</h4>
          </div>
          <p className="mt-1 text-sm text-gray-600">{anomaly.description}</p>
          <p className="mt-1 text-xs text-gray-500">
            Confidence: {(anomaly.confidence * 100).toFixed(1)}%
          </p>
        </div>
        <span className={`px-2 py-1 text-xs rounded ${
          anomaly.status === 'active' ? 'bg-red-100 text-red-700' :
          anomaly.status === 'investigating' ? 'bg-yellow-100 text-yellow-700' :
          'bg-green-100 text-green-700'
        }`}>
          {anomaly.status}
        </span>
      </div>
    </div>
  );
};

const ComplianceItem: React.FC<{ status: ComplianceStatus }> = ({ status }) => {
  const statusColors = {
    compliant: 'bg-green-100 text-green-800',
    non_compliant: 'bg-red-100 text-red-800',
    partial: 'bg-yellow-100 text-yellow-800',
    pending_review: 'bg-gray-100 text-gray-800'
  };

  return (
    <div className="flex items-center justify-between p-3 border-b border-gray-200">
      <div>
        <h4 className="text-sm font-medium text-gray-900">{status.requirement}</h4>
        <p className="text-xs text-gray-500">{status.framework} - {status.category}</p>
      </div>
      <div className="text-right">
        <span className={`px-2 py-1 text-xs rounded-full ${statusColors[status.status]}`}>
          {status.status.replace('_', ' ').toUpperCase()}
        </span>
        <p className="text-sm font-medium text-gray-900 mt-1">{status.score}%</p>
      </div>
    </div>
  );
};

const AccessPatternCard: React.FC<{ pattern: AccessPattern }> = ({ pattern }) => {
  const riskLevel = pattern.riskIndicators.unusualFrequency || 
                   pattern.riskIndicators.unusualTime || 
                   pattern.riskIndicators.unusualLocation ? 
                   'high' : 'low';

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-900">{pattern.userId}</h4>
        <span className={`px-2 py-1 text-xs rounded ${
          riskLevel === 'high' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
        }`}>
          {riskLevel} risk
        </span>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Access Frequency:</span>
          <span className="font-medium">{pattern.accessFrequency}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Resources:</span>
          <span className="font-medium">{Object.keys(pattern.resourceTypes).length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Trend:</span>
          <span className={`font-medium ${
            pattern.trendDirection === 'increasing' ? 'text-red-600' :
            pattern.trendDirection === 'decreasing' ? 'text-green-600' :
            'text-gray-600'
          }`}>
            {pattern.trendDirection}
          </span>
        </div>
      </div>
    </div>
  );
};

// Helper functions
function getTimeRange(range: string): { start: number; end: number } {
  const now = Date.now();
  const ranges = {
    '1h': now - 60 * 60 * 1000,
    '6h': now - 6 * 60 * 60 * 1000,
    '24h': now - 24 * 60 * 60 * 1000,
    '7d': now - 7 * 24 * 60 * 60 * 1000,
    '30d': now - 30 * 24 * 60 * 60 * 1000
  };
  
  return {
    start: ranges[range as keyof typeof ranges] || ranges['24h'],
    end: now
  };
}

function calculateOverallCompliance(compliance: ComplianceStatus[]): number {
  if (compliance.length === 0) return 0;
  return Math.round(compliance.reduce((sum, c) => sum + c.score, 0) / compliance.length);
}

function calculateRiskScore(anomalies: AnomalyDetection[], alerts: PrivacyAlert[]): number {
  const anomalyWeight = 0.6;
  const alertWeight = 0.4;
  
  const anomalyScore = anomalies.length > 0 ? 
    Math.min(100, anomalies.reduce((sum, a) => {
      const severityWeight = { low: 1, medium: 2, high: 3, critical: 4 };
      return sum + (a.confidence * 100 * severityWeight[a.severity]);
    }, 0) / anomalies.length) : 0;
  
  const alertScore = alerts.length > 0 ?
    Math.min(100, alerts.reduce((sum, a) => {
      const severityWeight = { low: 1, medium: 2, high: 3, critical: 4 };
      return sum + (severityWeight[a.severity] * 25);
    }, 0) / alerts.length) : 0;
  
  return Math.round((anomalyScore * anomalyWeight) + (alertScore * alertWeight));
}

export default PrivacyDashboard;
