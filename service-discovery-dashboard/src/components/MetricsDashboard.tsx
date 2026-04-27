import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';

interface ServiceMetrics {
  totalRequests: number;
  successRequests: number;
  errorRequests: number;
  successRate: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
}

interface TimeSeriesData {
  timestamp: string;
  requests: number;
  errors: number;
  responseTime: number;
}

const MetricsDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<Record<string, ServiceMetrics>>({});
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<string>('all');

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, [selectedService]);

  const fetchMetrics = async () => {
    try {
      const [metricsResponse] = await Promise.all([
        fetch(`/api/v1/service-discovery/metrics${selectedService !== 'all' ? `?serviceName=${selectedService}` : ''}`)
      ]);

      const metricsData = await metricsResponse.json();
      setMetrics(metricsData);

      // Generate mock time series data for demonstration
      const mockTimeSeries: TimeSeriesData[] = Array.from({ length: 24 }, (_, i) => ({
        timestamp: `${i}:00`,
        requests: Math.floor(Math.random() * 1000) + 500,
        errors: Math.floor(Math.random() * 50),
        responseTime: Math.floor(Math.random() * 200) + 50
      }));
      setTimeSeriesData(mockTimeSeries);

    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const getServiceNames = () => {
    return Object.keys(metrics);
  };

  const getTotalMetrics = (): ServiceMetrics => {
    const allMetrics = Object.values(metrics);
    if (allMetrics.length === 0) {
      return {
        totalRequests: 0,
        successRequests: 0,
        errorRequests: 0,
        successRate: 0,
        averageResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0
      };
    }

    return allMetrics.reduce((acc, curr) => ({
      totalRequests: acc.totalRequests + curr.totalRequests,
      successRequests: acc.successRequests + curr.successRequests,
      errorRequests: acc.errorRequests + curr.errorRequests,
      successRate: ((acc.successRequests + curr.successRequests) / (acc.totalRequests + curr.totalRequests)) * 100,
      averageResponseTime: (acc.averageResponseTime + curr.averageResponseTime) / 2,
      p95ResponseTime: (acc.p95ResponseTime + curr.p95ResponseTime) / 2,
      p99ResponseTime: (acc.p99ResponseTime + curr.p99ResponseTime) / 2
    }), {
      totalRequests: 0,
      successRequests: 0,
      errorRequests: 0,
      successRate: 0,
      averageResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0
    });
  };

  const totalMetrics = getTotalMetrics();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Metrics Dashboard</h2>
        <div className="flex items-center space-x-4">
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="all">All Services</option>
            {getServiceNames().map(service => (
              <option key={service} value={service}>{service}</option>
            ))}
          </select>
          <button 
            onClick={fetchMetrics}
            className="btn-secondary flex items-center"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="metric-card">
          <div className="flex items-center">
            <Activity className="h-8 w-8 text-blue-600" />
            <div className="ml-4">
              <p className="metric-label">Total Requests</p>
              <p className="metric-value">{totalMetrics.totalRequests.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-green-600" />
            <div className="ml-4">
              <p className="metric-label">Success Rate</p>
              <p className="metric-value">{totalMetrics.successRate.toFixed(1)}%</p>
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="flex items-center">
            <Clock className="h-8 w-8 text-purple-600" />
            <div className="ml-4">
              <p className="metric-label">Avg Response Time</p>
              <p className="metric-value">{totalMetrics.averageResponseTime}ms</p>
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="flex items-center">
            <XCircle className="h-8 w-8 text-red-600" />
            <div className="ml-4">
              <p className="metric-label">Error Requests</p>
              <p className="metric-value">{totalMetrics.errorRequests.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Request Volume Chart */}
        <div className="metric-card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Request Volume (24h)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeSeriesData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="requests" 
                stroke="#3B82F6" 
                strokeWidth={2}
                name="Requests"
              />
              <Line 
                type="monotone" 
                dataKey="errors" 
                stroke="#EF4444" 
                strokeWidth={2}
                name="Errors"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Response Time Chart */}
        <div className="metric-card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Response Times (24h)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeSeriesData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="responseTime" 
                stroke="#10B981" 
                strokeWidth={2}
                name="Response Time (ms)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Service-specific Metrics */}
      {Object.keys(metrics).length > 0 && (
        <div className="metric-card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Service Metrics</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Service
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Requests
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Success Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Avg Response
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    P95 Response
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    P99 Response
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Object.entries(metrics).map(([serviceName, serviceMetrics]) => (
                  <tr key={serviceName}>
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                      {serviceName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {serviceMetrics.totalRequests.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center">
                        <div className="flex-1 bg-gray-200 rounded-full h-2 mr-2">
                          <div 
                            className="bg-green-600 h-2 rounded-full" 
                            style={{ width: `${serviceMetrics.successRate}%` }}
                          ></div>
                        </div>
                        <span>{serviceMetrics.successRate.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {serviceMetrics.averageResponseTime}ms
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {serviceMetrics.p95ResponseTime}ms
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {serviceMetrics.p99ResponseTime}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Performance Indicators */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="metric-card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Status</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Overall Health</span>
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                totalMetrics.successRate >= 95 ? 'status-healthy' :
                totalMetrics.successRate >= 90 ? 'status-unknown' :
                'status-unhealthy'
              }`}>
                {totalMetrics.successRate >= 95 ? 'Excellent' :
                 totalMetrics.successRate >= 90 ? 'Good' : 'Poor'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Response Time</span>
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                totalMetrics.averageResponseTime <= 100 ? 'status-healthy' :
                totalMetrics.averageResponseTime <= 500 ? 'status-unknown' :
                'status-unhealthy'
              }`}>
                {totalMetrics.averageResponseTime <= 100 ? 'Fast' :
                 totalMetrics.averageResponseTime <= 500 ? 'Normal' : 'Slow'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Error Rate</span>
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                totalMetrics.errorRequests / totalMetrics.totalRequests <= 0.01 ? 'status-healthy' :
                totalMetrics.errorRequests / totalMetrics.totalRequests <= 0.05 ? 'status-unknown' :
                'status-unhealthy'
              }`}>
                {((totalMetrics.errorRequests / totalMetrics.totalRequests) * 100).toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        <div className="metric-card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Services by Requests</h3>
          <div className="space-y-3">
            {Object.entries(metrics)
              .sort(([,a], [,b]) => b.totalRequests - a.totalRequests)
              .slice(0, 5)
              .map(([serviceName, serviceMetrics]) => (
                <div key={serviceName} className="flex items-center justify-between">
                  <span className="text-sm text-gray-900">{serviceName}</span>
                  <span className="text-sm font-medium text-gray-900">
                    {serviceMetrics.totalRequests.toLocaleString()}
                  </span>
                </div>
              ))}
          </div>
        </div>

        <div className="metric-card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Alert Summary</h3>
          <div className="space-y-3">
            <div className="flex items-center">
              <AlertTriangle className="h-4 w-4 text-yellow-500 mr-2" />
              <span className="text-sm text-gray-600">Slow Response Times</span>
            </div>
            <div className="flex items-center">
              <XCircle className="h-4 w-4 text-red-500 mr-2" />
              <span className="text-sm text-gray-600">High Error Rates</span>
            </div>
            <div className="flex items-center">
              <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
              <span className="text-sm text-gray-600">All Systems Operational</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetricsDashboard;
