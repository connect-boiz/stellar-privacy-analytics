import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, BarChart, Bar, ComposedChart } from 'recharts';
import { AlertCircle, Info, TrendingDown, Calendar, Shield, GripVertical, Plus, Minus, AlertTriangle, Download, TrendingUp, Zap, Target, Sliders, Clock, CheckCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import { format, subDays, startOfDay, differenceInDays } from 'date-fns';

interface PrivacyBudget {
  datasetId: string;
  datasetName: string;
  currentEpsilon: number;
  maxEpsilon: number;
  percentageUsed: number;
  lastUpdated: string;
  status: 'healthy' | 'warning' | 'critical';
}

interface BudgetHistory {
  date: string;
  epsilon: number;
  percentageUsed: number;
  operation: string;
}

interface BudgetAllocation {
  id: string;
  name: string;
  currentEpsilon: number;
  requestedEpsilon: number;
  priority: number;
  impact: 'low' | 'medium' | 'high';
  dataset: string;
  lastQuery: string;
}

interface ApiResponse {
  success: boolean;
  data: PrivacyBudget;
  history: BudgetHistory[];
}

interface BudgetAllocationData {
  id: string;
  analysisName: string;
  allocated: number;
  estimatedUsage: number;
  priority: number;
  impact: 'low' | 'medium' | 'high';
  dataset: string;
}

const defaultAllocations: BudgetAllocation[] = [
  {
    id: 'alloc-1',
    name: 'Customer Segmentation',
    currentEpsilon: 0.5,
    requestedEpsilon: 0.8,
    priority: 1,
    impact: 'high',
    dataset: 'Customer Analytics',
    lastQuery: '2 hours ago'
  },
  {
    id: 'alloc-2',
    name: 'Revenue Analysis',
    currentEpsilon: 0.3,
    requestedEpsilon: 0.5,
    priority: 2,
    impact: 'medium',
    dataset: 'Financial Data',
    lastQuery: '1 day ago'
  },
  {
    id: 'alloc-3',
    name: 'User Behavior Study',
    currentEpsilon: 0.2,
    requestedEpsilon: 0.4,
    priority: 3,
    impact: 'low',
    dataset: 'User Analytics',
    lastQuery: '3 days ago'
  },
  {
    id: 'alloc-4',
    name: 'Trend Analysis',
    currentEpsilon: 0.15,
    requestedEpsilon: 0.3,
    priority: 4,
    impact: 'low',
    dataset: 'Marketing',
    lastQuery: '5 days ago'
  }
];

const optimizationSuggestions = [
  {
    id: 'opt-1',
    title: 'Combine Queries',
    description: 'Combine your customer segmentation queries to save 0.3 ε per analysis',
    savings: 0.3,
    impact: 'high'
  },
  {
    id: 'opt-2',
    title: 'Reduce Frequency',
    description: 'Reduce daily reporting frequency from hourly to every 6 hours',
    savings: 0.15,
    impact: 'medium'
  },
  {
    id: 'opt-3',
    title: 'Use Aggregate Data',
    description: 'Use pre-aggregated data for dashboard metrics',
    savings: 0.25,
    impact: 'high'
  }
];

const PrivacyBudgetDashboard: React.FC<{ datasetId: string }> = ({ datasetId }) => {
  const [budget, setBudget] = useState<PrivacyBudget | null>(null);
  const [history, setHistory] = useState<BudgetHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [alertShown, setAlertShown] = useState(false);
  const [showAllocation, setShowAllocation] = useState(false);
  const [allocations, setAllocations] = useState<BudgetAllocation[]>(defaultAllocations);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [totalBudget] = useState(1.0);
  const [showExportModal, setShowExportModal] = useState(false);

  const getBudgetColor = useCallback((percentage: number) => {
    if (percentage >= 90) return '#ef4444';
    if (percentage >= 70) return '#f59e0b';
    return '#10b981';
  }, []);

  const getStatusColor = useCallback((status: string) => {
    switch (status) {
      case 'critical': return '#ef4444';
      case 'warning': return '#f59e0b';
      case 'healthy': return '#10b981';
      default: return '#6b7280';
    }
  }, []);

  const fetchBudgetData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await axios.get<ApiResponse>(`/api/v1/privacy/budget/${datasetId}`);
      
      if (response.data.success) {
        setBudget(response.data.data);
        setHistory(response.data.history || []);
        
        if (response.data.data.percentageUsed >= 90 && !alertShown) {
          toast.error(
            `Privacy budget critically low! Only ${(100 - response.data.data.percentageUsed).toFixed(1)}% remaining.`,
            { duration: 5000, icon: <AlertCircle className="w-5 h-5" /> }
          );
          setAlertShown(true);
        } else if (response.data.data.percentageUsed >= 70 && response.data.data.percentageUsed < 90 && !alertShown) {
          toast.warning(
            `Privacy budget warning: ${(100 - response.data.data.percentageUsed).toFixed(1)}% remaining.`,
            { duration: 4000, icon: <TrendingDown className="w-5 h-5" /> }
          );
        }
      } else {
        setError('Failed to fetch budget data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      toast.error('Failed to load privacy budget data');
    } finally {
      setLoading(false);
    }
  }, [datasetId, alertShown]);

  const generateMockHistory = useCallback((): BudgetHistory[] => {
    const history: BudgetHistory[] = [];
    const today = startOfDay(new Date());
    
    for (let i = 29; i >= 0; i--) {
      const date = format(subDays(today, i), 'yyyy-MM-dd');
      const baseEpsilon = 1.0;
      const consumption = Math.random() * 0.3;
      
      history.push({
        date,
        epsilon: Math.max(0, baseEpsilon - (consumption * (30 - i))),
        percentageUsed: Math.min(100, consumption * (30 - i) * 100),
        operation: i % 3 === 0 ? 'Query' : i % 3 === 1 ? 'Analysis' : 'Export'
      });
    }
    
    return history;
  }, []);

  useEffect(() => {
    fetchBudgetData();
    const interval = setInterval(fetchBudgetData, 30000);
    return () => clearInterval(interval);
  }, [fetchBudgetData]);

  const gaugeData = budget ? [
    { name: 'Used', value: budget.percentageUsed, color: getBudgetColor(budget.percentageUsed) },
    { name: 'Remaining', value: 100 - budget.percentageUsed, color: '#e5e7eb' }
  ] : [];

  const totalUsed = useMemo(() => 
    allocations.reduce((sum, a) => sum + a.currentEpsilon, 0),
    [allocations]
  );

  const totalRequested = useMemo(() => 
    allocations.reduce((sum, a) => sum + a.requestedEpsilon, 0),
    [allocations]
  );

  const handleDragStart = (id: string) => {
    setDraggedItem(id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedItem || draggedItem === targetId) return;

    const draggedIndex = allocations.findIndex(a => a.id === draggedItem);
    const targetIndex = allocations.findIndex(a => a.id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;

    const newAllocations = [...allocations];
    const [draggedItem_] = newAllocations.splice(draggedIndex, 1);
    newAllocations.splice(targetIndex, 0, draggedItem_);
    
    const updatedAllocations = newAllocations.map((a, i) => ({
      ...a,
      priority: i + 1
    }));
    
    setAllocations(updatedAllocations);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  const adjustAllocation = (id: string, delta: number) => {
    setAllocations(prev => prev.map(a => {
      if (a.id !== id) return a;
      const newValue = Math.max(0.01, Math.min(totalBudget, a.currentEpsilon + delta));
      return { ...a, currentEpsilon: Math.round(newValue * 100) / 100 };
    }));
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const exportReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      totalBudget: totalBudget,
      used: totalUsed,
      remaining: totalBudget - totalUsed,
      allocations: allocations.map(a => ({
        name: a.name,
        epsilon: a.currentEpsilon,
        priority: a.priority,
        impact: a.impact
      }))
    };
    
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `privacy-budget-${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Budget report exported');
  };

  const allocateBudget = (allocation: BudgetAllocation, newAmount: number) => {
    setAllocations(prev => prev.map(a => 
      a.id === allocation.id 
        ? { ...a, currentEpsilon: newAmount }
        : a
    ));
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="text-sm font-semibold text-gray-900">
            {payload[0].name}: {payload[0].value.toFixed(1)}%
          </p>
          {budget && (
            <p className="text-xs text-gray-600 mt-1">
              ε = {budget.currentEpsilon.toFixed(3)} / {budget.maxEpsilon}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-white rounded-lg border border-gray-200">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !budget) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center space-x-2 text-red-600">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm font-medium">{error || 'No budget data available'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Shield className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Privacy Budget</h2>
              <p className="text-sm text-gray-600">{budget.datasetName}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`px-3 py-1 rounded-full text-xs font-medium text-white`}
                 style={{ backgroundColor: getStatusColor(budget.status) }}>
              {budget.status.toUpperCase()}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="flex flex-col items-center">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Current Budget Status</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={gaugeData}
                  cx="50%"
                  cy="50%"
                  startAngle={180}
                  endAngle={0}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {gaugeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            
            <div className="relative -mt-32 text-center">
              <div className="text-3xl font-bold text-gray-900">
                {(100 - budget.percentageUsed).toFixed(1)}%
              </div>
              <div className="text-sm text-gray-600">Remaining</div>
              <div className="text-xs text-gray-500 mt-1">
                ε = {budget.currentEpsilon.toFixed(3)}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Current Epsilon</span>
                <span className="text-lg font-bold text-gray-900">
                  {budget.currentEpsilon.toFixed(3)}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="h-2 rounded-full transition-all duration-300"
                  style={{ 
                    width: `${budget.percentageUsed}%`,
                    backgroundColor: getBudgetColor(budget.percentageUsed)
                  }}
                ></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-600">
                  {budget.maxEpsilon}
                </div>
                <div className="text-sm text-blue-800">Max Epsilon</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-600">
                  {(budget.maxEpsilon - budget.currentEpsilon).toFixed(3)}
                </div>
                <div className="text-sm text-green-800">Remaining</div>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Last updated</span>
              <span>{format(new Date(budget.lastUpdated), 'MMM dd, HH:mm')}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <button
            onClick={() => setShowAllocation(!showAllocation)}
            className="flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Sliders className="w-4 h-4" />
            <span>{showAllocation ? 'Hide' : 'Allocate'} Budget</span>
          </button>
          
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center justify-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Calendar className="w-4 h-4" />
            <span>{showHistory ? 'Hide' : 'Show'} History</span>
          </button>

          <button
            onClick={exportReport}
            className="flex items-center justify-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showAllocation && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white rounded-lg border border-gray-200 p-6 overflow-hidden"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Budget Allocation</h3>
                <p className="text-sm text-gray-600">Drag and drop to prioritize analyses</p>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-600">Total Allocated: {totalUsed.toFixed(2)} ε</div>
                <div className="text-sm text-gray-600">Available: {(totalBudget - totalUsed).toFixed(2)} ε</div>
              </div>
            </div>

            <div className="space-y-3">
              {allocations.map((allocation) => (
                <motion.div
                  key={allocation.id}
                  draggable
                  onDragStart={() => handleDragStart(allocation.id)}
                  onDragOver={(e) => handleDragOver(e, allocation.id)}
                  onDragEnd={handleDragEnd}
                  className={`bg-gray-50 rounded-lg p-4 border border-gray-200 cursor-move transition-all ${
                    draggedItem === allocation.id ? 'opacity-50 scale-95' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <GripVertical className="h-5 w-5 text-gray-400" />
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-gray-900">{allocation.name}</span>
                          <span className={`px-2 py-0.5 text-xs rounded capitalize ${getImpactColor(allocation.impact)}`}>
                            {allocation.impact}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {allocation.dataset} • {allocation.lastQuery}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => adjustAllocation(allocation.id, -0.1)}
                          disabled={allocation.currentEpsilon <= 0.1}
                          className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <div className="w-16 text-center font-mono text-sm">
                          {allocation.currentEpsilon.toFixed(2)} ε
                        </div>
                        <button
                          onClick={() => adjustAllocation(allocation.id, 0.1)}
                          disabled={totalUsed >= totalBudget}
                          className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="w-24 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${(allocation.currentEpsilon / totalBudget) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <div className="flex items-center space-x-2 mb-2">
                  <Zap className="h-5 w-5 text-purple-600" />
                  <span className="font-semibold text-purple-900">Optimization Tips</span>
                </div>
                <div className="space-y-2">
                  {optimizationSuggestions.map(suggestion => (
                    <div key={suggestion.id} className="text-sm">
                      <div className="font-medium text-purple-800">{suggestion.title}</div>
                      <div className="text-purple-700">{suggestion.description}</div>
                      <div className="text-xs text-purple-600">Save {suggestion.savings} ε</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                <div className="flex items-center space-x-2 mb-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <span className="font-semibold text-amber-900">Budget Alerts</span>
                </div>
                <div className="space-y-2 text-sm">
                  {totalRequested > totalBudget ? (
                    <div className="flex items-start space-x-2 text-red-700">
                      <AlertCircle className="h-4 w-4 mt-0.5" />
                      <span>Budget exceeded by {(totalRequested - totalBudget).toFixed(2)} ε</span>
                    </div>
                  ) : (
                    <div className="flex items-start space-x-2 text-green-700">
                      <CheckCircle className="h-4 w-4 mt-0.5" />
                      <span>Budget within limits</span>
                    </div>
                  )}
                  {allocations.some(a => a.impact === 'high' && a.currentEpsilon < 0.3) && (
                    <div className="flex items-start space-x-2 text-yellow-700">
                      <AlertTriangle className="h-4 w-4 mt-0.5" />
                      <span>High-priority analysis underfunded</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <div className="flex items-center space-x-2 mb-2">
                  <Target className="h-5 w-5 text-blue-600" />
                  <span className="font-semibold text-blue-900">Impact Analysis</span>
                </div>
                <div className="space-y-2 text-sm">
                  {allocations.slice(0, 3).map(a => (
                    <div key={a.id} className="flex items-center justify-between">
                      <span className="text-blue-800">{a.name}</span>
                      <span className={`px-2 py-0.5 text-xs rounded ${
                        a.impact === 'high' ? 'bg-red-100 text-red-700' :
                        a.impact === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {a.impact}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showHistory && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            30-Day Budget History
          </h3>
          
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={history.length > 0 ? history : generateMockHistory()}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(value) => format(new Date(value), 'MMM dd')}
              />
              <YAxis 
                label={{ value: 'Epsilon (ε)', angle: -90, position: 'insideLeft' }}
                domain={[0, 'dataMax']}
              />
              <Tooltip 
                labelFormatter={(value) => format(new Date(value as string), 'MMM dd, yyyy')}
                formatter={(value: number) => [value.toFixed(3), 'Epsilon']}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="epsilon" 
                stroke="#3b82f6" 
                strokeWidth={2}
                dot={{ fill: '#3b82f6', r: 3 }}
                name="Epsilon Remaining"
              />
              <Line 
                type="monotone" 
                dataKey="percentageUsed" 
                stroke="#ef4444" 
                strokeWidth={2}
                dot={{ fill: '#ef4444', r: 3 }}
                name="Percentage Used"
                yAxisId="right"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-semibold text-blue-900">Understanding Privacy Budget</h4>
            <p className="text-sm text-blue-800 mt-1">
              Your privacy budget (epsilon) represents the total amount of privacy loss allowed for this dataset. 
              Each analytics query consumes some of this budget. When the budget is depleted, no further queries can be made 
              to protect individual privacy. The system automatically monitors and alerts you when the budget gets low.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyBudgetDashboard;