import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Server, 
  AlertTriangle, 
  TrendingUp, 
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';

interface ServiceMetrics {
  totalServices: number;
  healthyServices: number;
  unhealthyServices: number;
  averageResponseTime: number;
  uptime: number;
}

interface Alert {
  id: string;
  type: string;
  severity: string;
  serviceName: string;
  message: string;
  timestamp: string;
}

const ServiceOverview: React.FC = () => {
  const [metrics, setMetrics] = useState<ServiceMetrics>({
    totalServices: 0,
    healthyServices: 0,
    unhealthyServices: 0,
    averageResponseTime: 0,
    uptime: 0
  });
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOverviewData();
    const interval = setInterval(fetchOverviewData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchOverviewData = async () => {
    try {
      const [healthResponse, alertsResponse] = await Promise.all([
        fetch('/api/v1/service-discovery/health'),
        fetch('/api/v1/service-discovery/alerts')
      ]);

      const healthData = await healthResponse.json();
      const alertsData = await alertsResponse.json();

      setMetrics({
        totalServices: healthData.total || 0,
        healthyServices: healthData.healthy || 0,
        unhealthyServices: healthData.unhealthy || 0,
        averageResponseTime: 0, // Would be calculated from metrics endpoint
        uptime: healthData.total > 0 ? (healthData.healthy / healthData.total) * 100 : 0
      });

      setAlerts(alertsData.alerts || []);
    } catch (error) {
      console.error('Failed to fetch overview data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-100';
      case 'high': return 'text-orange-600 bg-orange-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-blue-600 bg-blue-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'service_down': return <XCircle className="h-4 w-4" />;
      case 'slow_response': return <Clock className="h-4 w-4" />;
      case 'high_error_rate': return <AlertTriangle className="h-4 w-4" />;
      case 'circuit_breaker_open': return <AlertCircle className="h-4 w-4" />;
      default: return <AlertTriangle className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="metric-card">
          <div className="flex items-center">
            <Server className="h-8 w-8 text-blue-600" />
            <div className="ml-4">
              <p className="metric-label">Total Services</p>
              <p className="metric-value">{metrics.totalServices}</p>
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-green-600" />
            <div className="ml-4">
              <p className="metric-label">Healthy Services</p>
              <p className="metric-value text-green-600">{metrics.healthyServices}</p>
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="flex items-center">
            <XCircle className="h-8 w-8 text-red-600" />
            <div className="ml-4">
              <p className="metric-label">Unhealthy Services</p>
              <p className="metric-value text-red-600">{metrics.unhealthyServices}</p>
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="flex items-center">
            <TrendingUp className="h-8 w-8 text-purple-600" />
            <div className="ml-4">
              <p className="metric-label">System Uptime</p>
              <p className="metric-value">{metrics.uptime.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Alerts */}
      <div className="metric-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Recent Alerts</h3>
          <span className="text-sm text-gray-500">
            {alerts.length} active alerts
          </span>
        </div>
        
        {alerts.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-2" />
            <p className="text-gray-500">No active alerts</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.slice(0, 5).map((alert) => (
              <div key={alert.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-full ${getSeverityColor(alert.severity)}`}>
                    {getAlertIcon(alert.type)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{alert.serviceName}</p>
                    <p className="text-sm text-gray-500">{alert.message}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                    {alert.severity}
                  </span>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="metric-card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="btn-primary">
            Register New Service
          </button>
          <button className="btn-secondary">
            View All Services
          </button>
          <button className="btn-secondary">
            System Health Check
          </button>
        </div>
      </div>
    </div>
  );
};

export default ServiceOverview;
