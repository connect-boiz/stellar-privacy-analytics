import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  AlertTriangle,
  Calendar,
  BarChart3
} from 'lucide-react';

interface TrendData {
  date: string;
  overallScore: number;
  low: number;
  medium: number;
  high: number;
  critical: number;
  totalAssessments: number;
}

interface RiskTrendsChartProps {
  data: TrendData[];
  timeframe: string;
  className?: string;
}

const RiskTrendsChart: React.FC<RiskTrendsChartProps> = ({ 
  data, 
  timeframe,
  className = '' 
}) => {
  const calculateTrend = (values: number[]) => {
    if (values.length < 2) return { direction: 'stable', change: 0 };
    const recent = values.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, values.length);
    const previous = values.slice(-14, -7).reduce((a, b) => a + b, 0) / Math.min(7, values.length);
    const change = ((recent - previous) / previous) * 100;
    
    if (change > 5) return { direction: 'increasing', change };
    if (change < -5) return { direction: 'decreasing', change };
    return { direction: 'stable', change };
  };

  const overallTrend = calculateTrend(data.map(d => d.overallScore));
  const criticalTrend = calculateTrend(data.map(d => d.critical));

  const getTrendIcon = (direction: string) => {
    switch (direction) {
      case 'increasing': return <TrendingUp className="h-4 w-4 text-red-500" />;
      case 'decreasing': return <TrendingDown className="h-4 w-4 text-green-500" />;
      default: return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getTrendColor = (direction: string) => {
    switch (direction) {
      case 'increasing': return 'text-red-600';
      case 'decreasing': return 'text-green-600';
      default: return 'text-gray-600';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const latestData = data[data.length - 1];
  const previousData = data[data.length - 2] || latestData;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Trend Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Overall Risk</p>
                <div className="flex items-center space-x-2">
                  <p className="text-2xl font-bold">
                    {((latestData?.overallScore || 0) * 100).toFixed(1)}%
                  </p>
                  {getTrendIcon(overallTrend.direction)}
                </div>
                <p className={`text-xs ${getTrendColor(overallTrend.direction)}`}>
                  {overallTrend.change > 0 ? '+' : ''}{overallTrend.change.toFixed(1)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Critical Risks</p>
                <div className="flex items-center space-x-2">
                  <p className="text-2xl font-bold text-red-600">
                    {latestData?.critical || 0}
                  </p>
                  {getTrendIcon(criticalTrend.direction)}
                </div>
                <p className={`text-xs ${getTrendColor(criticalTrend.direction)}`}>
                  {criticalTrend.change > 0 ? '+' : ''}{criticalTrend.change.toFixed(1)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Assessments</p>
                <p className="text-2xl font-bold">
                  {latestData?.totalAssessments || 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  Last {timeframe}
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Risk Trend</p>
                <div className="flex items-center space-x-2 mt-1">
                  {getTrendIcon(overallTrend.direction)}
                  <span className={`text-sm font-medium ${getTrendColor(overallTrend.direction)}`}>
                    {overallTrend.direction === 'increasing' && 'Worsening'}
                    {overallTrend.direction === 'decreasing' && 'Improving'}
                    {overallTrend.direction === 'stable' && 'Stable'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Compared to previous period
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Score Over Time */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <TrendingUp className="h-5 w-5" />
            <span>Risk Score Trends</span>
          </CardTitle>
          <CardDescription>
            Overall privacy risk score over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={formatDate}
                />
                <YAxis 
                  domain={[0, 1]}
                  tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                />
                <Tooltip 
                  labelFormatter={(value) => formatDate(value as string)}
                  formatter={(value: number) => [`${(value * 100).toFixed(1)}%`, 'Risk Score']}
                />
                <Area 
                  type="monotone" 
                  dataKey="overallScore" 
                  stroke="#ef4444" 
                  fill="#ef4444" 
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Risk Categories Over Time */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>Risk Categories Distribution</span>
          </CardTitle>
          <CardDescription>
            Number of workflows in each risk category over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={formatDate}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(value) => formatDate(value as string)}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="critical" 
                  stroke="#ef4444" 
                  strokeWidth={2}
                  name="Critical"
                />
                <Line 
                  type="monotone" 
                  dataKey="high" 
                  stroke="#f97316" 
                  strokeWidth={2}
                  name="High"
                />
                <Line 
                  type="monotone" 
                  dataKey="medium" 
                  stroke="#eab308" 
                  strokeWidth={2}
                  name="Medium"
                />
                <Line 
                  type="monotone" 
                  dataKey="low" 
                  stroke="#22c55e" 
                  strokeWidth={2}
                  name="Low"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Assessment Volume */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Calendar className="h-5 w-5" />
            <span>Assessment Volume</span>
          </CardTitle>
          <CardDescription>
            Number of risk assessments completed over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={formatDate}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(value) => formatDate(value as string)}
                  formatter={(value: number) => [value, 'Assessments']}
                />
                <Bar 
                  dataKey="totalAssessments" 
                  fill="#3b82f6"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Key Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Activity className="h-5 w-5" />
            <span>Key Insights</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-green-700">Positive Trends</h4>
              <div className="space-y-2">
                {overallTrend.direction === 'decreasing' && (
                  <div className="flex items-center space-x-2 text-sm">
                    <TrendingDown className="h-4 w-4 text-green-500" />
                    <span>Overall risk score is improving</span>
                  </div>
                )}
                {criticalTrend.direction === 'decreasing' && (
                  <div className="flex items-center space-x-2 text-sm">
                    <TrendingDown className="h-4 w-4 text-green-500" />
                    <span>Critical risks are decreasing</span>
                  </div>
                )}
                {latestData.low > previousData.low && (
                  <div className="flex items-center space-x-2 text-sm">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    <span>More workflows achieving low risk status</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-red-700">Areas of Concern</h4>
              <div className="space-y-2">
                {overallTrend.direction === 'increasing' && (
                  <div className="flex items-center space-x-2 text-sm">
                    <TrendingUp className="h-4 w-4 text-red-500" />
                    <span>Overall risk score is worsening</span>
                  </div>
                )}
                {criticalTrend.direction === 'increasing' && (
                  <div className="flex items-center space-x-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <span>Critical risks are increasing</span>
                  </div>
                )}
                {latestData.critical > 0 && (
                  <div className="flex items-center space-x-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <span>{latestData.critical} workflows need immediate attention</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RiskTrendsChart;
