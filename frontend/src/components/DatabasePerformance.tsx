import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Database, 
  Activity, 
  TrendingUp, 
  TrendingDown,
  Zap,
  Clock,
  BarChart3,
  Settings,
  Play,
  Pause,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Download,
  Filter,
  Eye
} from 'lucide-react';

interface PerformanceMetrics {
  timestamp: Date;
  queryCount: number;
  averageExecutionTime: number;
  slowQueries: number;
  cacheHitRate: number;
  indexUsage: Record<string, number>;
  tableSizes: Record<string, number>;
  connectionPoolUsage: number;
  memoryUsage: number;
  diskIOPS: number;
}

interface QueryPlan {
  query: string;
  executionTime: number;
  rowsExamined: number;
  rowsReturned: number;
  indexUsed?: string;
  recommendations: string[];
}

interface IndexRecommendation {
  tableName: string;
  columnName: string;
  indexType: string;
  estimatedImprovement: number;
  priority: string;
}

interface LoadTestResult {
  totalQueries: number;
  averageExecutionTime: number;
  maxExecutionTime: number;
  minExecutionTime: number;
  p95ExecutionTime: number;
  queriesPerSecond: number;
  errors: number;
  duration: number;
}

export const DatabasePerformance: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'queries' | 'indexes' | 'optimization'>('overview');
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [slowQueries, setSlowQueries] = useState<QueryPlan[]>([]);
  const [indexRecommendations, setIndexRecommendations] = useState<IndexRecommendation[]>([]);
  const [loadTestResults, setLoadTestResults] = useState<LoadTestResult | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [queryToAnalyze, setQueryToAnalyze] = useState<string>('');
  const [testQueries, setTestQueries] = useState<string[]>([
    'SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL \'7 days\'',
    'SELECT * FROM analytics_events WHERE event_type = \'page_view\' ORDER BY timestamp DESC LIMIT 100',
    'SELECT u.id, u.email, COUNT(o.id) as order_count FROM users u LEFT JOIN orders o ON u.id = o.user_id GROUP BY u.id',
    'SELECT * FROM large_table WHERE status = \'active\' AND category IN (\'A\', \'B\', \'C\')'
  ]);

  useEffect(() => {
    fetchPerformanceMetrics();
    fetchSlowQueries();
    fetchIndexRecommendations();
  }, []);

  const fetchPerformanceMetrics = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/performance/metrics`);
      const data = await response.json();
      setMetrics(data.metrics);
    } catch (error) {
      console.error('Failed to fetch performance metrics:', error);
    }
  };

  const fetchSlowQueries = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/performance/slow-queries`);
      const data = await response.json();
      setSlowQueries(data.queries);
    } catch (error) {
      console.error('Failed to fetch slow queries:', error);
    }
  };

  const fetchIndexRecommendations = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/performance/indexes/${selectedTable || 'users'}`);
      const data = await response.json();
      setIndexRecommendations(data.recommendations || []);
    } catch (error) {
      console.error('Failed to fetch index recommendations:', error);
    }
  };

  const analyzeQuery = async () => {
    if (!queryToAnalyze.trim()) return;

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/performance/analyze-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryToAnalyze })
      });

      const data = await response.json();
      alert(`Query Analysis:\nExecution Time: ${data.analysis.executionTime}ms\nCost: ${data.analysis.cost}\nRecommendations: ${data.analysis.recommendations.join(', ')}`);
    } catch (error) {
      console.error('Failed to analyze query:', error);
      alert('Failed to analyze query');
    }
  };

  const runLoadTest = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/performance/load-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          queries: testQueries,
          concurrency: 10,
          duration: 60000 
        })
      });

      const data = await response.json();
      setLoadTestResults(data.results);
    } catch (error) {
      console.error('Failed to run load test:', error);
      alert('Failed to run load test');
    }
  };

  const optimizeDatabase = async () => {
    setIsOptimizing(true);
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/performance/optimize`, {
        method: 'POST'
      });

      if (response.ok) {
        alert('Database optimization completed successfully!');
        fetchPerformanceMetrics(); // Refresh metrics
      }
    } catch (error) {
      console.error('Failed to optimize database:', error);
      alert('Failed to optimize database');
    } finally {
      setIsOptimizing(false);
    }
  };

  const createIndex = async (recommendation: IndexRecommendation) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/performance/indexes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recommendation)
      });

      if (response.ok) {
        alert('Index created successfully!');
        fetchIndexRecommendations(); // Refresh recommendations
      }
    } catch (error) {
      console.error('Failed to create index:', error);
      alert('Failed to create index');
    }
  };

  const generateReport = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/performance/report`);
      const data = await response.json();
      
      // Download report as JSON
      const blob = new Blob([JSON.stringify(data.report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `performance-report-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to generate report:', error);
      alert('Failed to generate report');
    }
  };

  const formatExecutionTime = (time: number): string => {
    if (time < 100) return `${time}ms`;
    if (time < 1000) return `${(time / 1000).toFixed(2)}s`;
    return `${(time / 1000).toFixed(1)}s`;
  };

  const getPerformanceColor = (value: number, threshold: number): string => {
    if (value > threshold * 2) return 'text-red-600';
    if (value > threshold) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Database Performance</h1>
            <p className="text-gray-600 mt-1">Query optimization and monitoring</p>
          </div>
          <div className="flex items-center space-x-2">
            <Database className="h-5 w-5 text-blue-500" />
            <span className="text-sm font-medium text-blue-600">Optimized</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'overview', name: 'Overview', icon: BarChart3 },
              { id: 'queries', name: 'Query Analysis', icon: Activity },
              { id: 'indexes', name: 'Index Management', icon: Database },
              { id: 'optimization', name: 'Optimization', icon: Settings }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <tab.icon className="h-4 w-4" />
                  <span>{tab.name}</span>
                </div>
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          <AnimatePresence mode="wait">
            {activeTab === 'overview' && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {metrics && (
                  <>
                    {/* Key Metrics */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="bg-blue-50 rounded-lg p-4">
                        <div className="flex items-center space-x-3">
                          <Activity className="h-8 w-8 text-blue-600" />
                          <div>
                            <h3 className="font-medium text-blue-900">Avg Query Time</h3>
                            <p className={`text-2xl font-bold ${getPerformanceColor(metrics.averageExecutionTime, 500)}`}>
                              {formatExecutionTime(metrics.averageExecutionTime)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-green-50 rounded-lg p-4">
                        <div className="flex items-center space-x-3">
                          <TrendingUp className="h-8 w-8 text-green-600" />
                          <div>
                            <h3 className="font-medium text-green-900">Cache Hit Rate</h3>
                            <p className={`text-2xl font-bold ${getPerformanceColor(metrics.cacheHitRate * 100, 80)}`}>
                              {(metrics.cacheHitRate * 100).toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-yellow-50 rounded-lg p-4">
                        <div className="flex items-center space-x-3">
                          <AlertTriangle className="h-8 w-8 text-yellow-600" />
                          <div>
                            <h3 className="font-medium text-yellow-900">Slow Queries</h3>
                            <p className="text-2xl font-bold text-yellow-700">
                              {metrics.slowQueries}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-purple-50 rounded-lg p-4">
                        <div className="flex items-center space-x-3">
                          <Database className="h-8 w-8 text-purple-600" />
                          <div>
                            <h3 className="font-medium text-purple-900">Total Queries</h3>
                            <p className="text-2xl font-bold text-purple-700">
                              {metrics.queryCount.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Performance Chart */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-medium text-gray-900 mb-4">Performance Trend</h3>
                      <div className="h-64 flex items-center justify-center">
                        <div className="text-center">
                          <BarChart3 className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                          <p className="text-gray-600">Performance chart would be rendered here</p>
                          <p className="text-sm text-gray-500">Last 30 days query performance</p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {activeTab === 'queries' && (
              <motion.div
                key="queries"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Query Analysis */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">Query Analysis</h3>
                  <div className="flex space-x-4">
                    <input
                      type="text"
                      value={queryToAnalyze}
                      onChange={(e) => setQueryToAnalyze(e.target.value)}
                      placeholder="Enter SQL query to analyze..."
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={analyzeQuery}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                      Analyze
                    </button>
                  </div>
                </div>

                {/* Slow Queries */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Slow Queries</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Query
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Execution Time
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Rows
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Index Used
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {slowQueries.slice(0, 10).map((query, index) => (
                          <tr key={index}>
                            <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                              {query.query}
                            </td>
                            <td className="px-6 py-4 text-sm">
                              <span className={getPerformanceColor(query.executionTime, 1000)}>
                                {formatExecutionTime(query.executionTime)}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {query.rowsReturned.toLocaleString()}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {query.indexUsed || 'None'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'indexes' && (
              <motion.div
                key="indexes"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Index Management */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">Index Management</h3>
                  <div className="flex space-x-4">
                    <input
                      type="text"
                      value={selectedTable}
                      onChange={(e) => setSelectedTable(e.target.value)}
                      placeholder="Enter table name..."
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={fetchIndexRecommendations}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Analyze
                    </button>
                  </div>
                </div>

                {/* Index Recommendations */}
                {indexRecommendations.length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Index Recommendations</h3>
                    <div className="space-y-3">
                      {indexRecommendations.map((rec, index) => (
                        <div key={index} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-medium text-gray-900">
                                {rec.tableName}.{rec.columnName}
                              </h4>
                              <p className="text-sm text-gray-600">
                                Type: {rec.indexType} | Priority: {rec.priority}
                              </p>
                              <p className="text-sm text-green-600">
                                Estimated improvement: {(rec.estimatedImprovement * 100).toFixed(1)}%
                              </p>
                            </div>
                            <button
                              onClick={() => createIndex(rec)}
                              className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                            >
                              <CheckCircle className="h-4 w-4" />
                              Create
                            </button>
                          </div>
                          <p className="text-sm text-gray-600 mt-2">
                            {rec.reason}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'optimization' && (
              <motion.div
                key="optimization"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Optimization Controls */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">Database Optimization</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      onClick={optimizeDatabase}
                      disabled={isOptimizing}
                      className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isOptimizing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                          <span>Optimizing...</span>
                        </>
                      ) : (
                        <>
                          <Settings className="h-4 w-4" />
                          <span>Auto Optimize</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={generateReport}
                      className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      <span>Generate Report</span>
                    </button>
                  </div>
                </div>

                {/* Load Testing */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">Load Testing</h3>
                  <button
                    onClick={runLoadTest}
                    className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    <Zap className="h-4 w-4" />
                    <span>Run Load Test</span>
                  </button>
                </div>

                {/* Load Test Results */}
                {loadTestResults && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-3">Load Test Results</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Total Queries:</span>
                        <span className="font-medium">{loadTestResults.totalQueries.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Avg Time:</span>
                        <span className="font-medium">{formatExecutionTime(loadTestResults.averageExecutionTime)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">QPS:</span>
                        <span className="font-medium">{loadTestResults.queriesPerSecond.toFixed(1)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">P95:</span>
                        <span className="font-medium">{formatExecutionTime(loadTestResults.p95ExecutionTime)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Errors:</span>
                        <span className="font-medium text-red-600">{loadTestResults.errors}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Duration:</span>
                        <span className="font-medium">{(loadTestResults.duration / 1000).toFixed(1)}s</span>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
