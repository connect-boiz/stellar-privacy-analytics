import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Area, AreaChart, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { TrendingUp, TrendingDown, Minus, DollarSign, Shield, Activity } from 'lucide-react';

import { BudgetAllocation, SimulationResult, ScenarioImpact } from '../../types/privacyBudget';

interface BudgetVisualizationChartProps {
  data: BudgetAllocation[] | SimulationResult | ScenarioImpact[];
  type: 'allocation' | 'comparison' | 'impact' | 'trend' | 'radar';
  height?: number;
  showLegend?: boolean;
  colors?: string[];
  title?: string;
  subtitle?: string;
}

const BudgetVisualizationChart: React.FC<BudgetVisualizationChartProps> = ({
  data,
  type,
  height = 400,
  showLegend = true,
  colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'],
  title,
  subtitle
}) => {
  const chartData = useMemo(() => {
    switch (type) {
      case 'allocation':
        return transformAllocationData(data as BudgetAllocation[]);
      case 'comparison':
        return transformComparisonData(data as SimulationResult);
      case 'impact':
        return transformImpactData(data as ScenarioImpact[]);
      case 'trend':
        return transformTrendData(data as any);
      case 'radar':
        return transformRadarData(data as any);
      default:
        return [];
    }
  }, [data, type]);

  const renderChart = () => {
    switch (type) {
      case 'allocation':
        return <AllocationChart data={chartData} height={height} colors={colors} showLegend={showLegend} />;
      case 'comparison':
        return <ComparisonChart data={chartData} height={height} colors={colors} showLegend={showLegend} />;
      case 'impact':
        return <ImpactChart data={chartData} height={height} colors={colors} />;
      case 'trend':
        return <TrendChart data={chartData} height={height} colors={colors} />;
      case 'radar':
        return <RadarChart data={chartData} height={height} colors={colors} />;
      default:
        return null;
    }
  };

  return (
    <div className="w-full">
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h3 className="text-lg font-semibold text-gray-900">{title}</h3>}
          {subtitle && <p className="text-sm text-gray-600">{subtitle}</p>}
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
};

// Allocation Chart Component
const AllocationChart: React.FC<{
  data: any[];
  height: number;
  colors: string[];
  showLegend: boolean;
}> = ({ data, height, colors, showLegend }) => {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900">{label}</p>
          <p className="text-sm text-gray-600">
            Amount: ${data.amount.toLocaleString()}
          </p>
          <p className="text-sm text-gray-600">
            Percentage: {data.percentage.toFixed(1)}%
          </p>
          <p className="text-sm text-gray-600">
            ROI: {(data.roi * 100).toFixed(1)}%
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
      <XAxis 
        dataKey="name" 
        tick={{ fill: '#6B7280', fontSize: 12 }}
        angle={-45}
        textAnchor="end"
        height={60}
      />
      <YAxis 
        tick={{ fill: '#6B7280', fontSize: 12 }}
        label={{ value: 'Amount ($)', angle: -90, position: 'insideLeft', style: { fill: '#6B7280' } }}
      />
      <Tooltip content={<CustomTooltip />} />
      {showLegend && <Legend />}
      <Bar dataKey="amount" fill={colors[0]} radius={[8, 8, 0, 0]} />
    </BarChart>
  );
};

// Comparison Chart Component
const ComparisonChart: React.FC<{
  data: any[];
  height: number;
  colors: string[];
  showLegend: boolean;
}> = ({ data, height, colors, showLegend }) => {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.value.toFixed(2)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
      <XAxis 
        dataKey="name" 
        tick={{ fill: '#6B7280', fontSize: 12 }}
        angle={-45}
        textAnchor="end"
        height={60}
      />
      <YAxis 
        tick={{ fill: '#6B7280', fontSize: 12 }}
        label={{ value: 'Score', angle: -90, position: 'insideLeft', style: { fill: '#6B7280' } }}
      />
      <Tooltip content={<CustomTooltip />} />
      {showLegend && <Legend />}
      <Bar dataKey="baseline" fill={colors[0]} radius={[4, 4, 0, 0]} />
      <Bar dataKey="scenario" fill={colors[1]} radius={[4, 4, 0, 0]} />
    </BarChart>
  );
};

// Impact Chart Component
const ImpactChart: React.FC<{
  data: any[];
  height: number;
  colors: string[];
}> = ({ data, height, colors }) => {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900">{label}</p>
          <p className="text-sm text-gray-600">
            Baseline: {data.baseline.toFixed(2)}
          </p>
          <p className="text-sm text-gray-600">
            Scenario: {data.scenario.toFixed(2)}
          </p>
          <p className="text-sm text-gray-600">
            Change: {data.changePercent.toFixed(1)}%
          </p>
          <div className="flex items-center mt-1">
            {data.changePercent > 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
            ) : data.changePercent < 0 ? (
              <TrendingDown className="h-4 w-4 text-red-500 mr-1" />
            ) : (
              <Minus className="h-4 w-4 text-gray-500 mr-1" />
            )}
            <span className="text-sm font-medium">{data.significance}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
      <XAxis 
        dataKey="metric" 
        tick={{ fill: '#6B7280', fontSize: 12 }}
        angle={-45}
        textAnchor="end"
        height={60}
      />
      <YAxis 
        tick={{ fill: '#6B7280', fontSize: 12 }}
        label={{ value: 'Change (%)', angle: -90, position: 'insideLeft', style: { fill: '#6B7280' } }}
      />
      <Tooltip content={<CustomTooltip />} />
      <Bar 
        dataKey="changePercent" 
        fill={(entry: any) => entry.changePercent > 0 ? colors[1] : colors[3]}
        radius={[4, 4, 0, 0]}
      />
    </BarChart>
  );
};

// Trend Chart Component
const TrendChart: React.FC<{
  data: any[];
  height: number;
  colors: string[];
}> = ({ data, height, colors }) => {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.value.toFixed(2)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
      <XAxis 
        dataKey="time" 
        tick={{ fill: '#6B7280', fontSize: 12 }}
      />
      <YAxis 
        tick={{ fill: '#6B7280', fontSize: 12 }}
        label={{ value: 'Value', angle: -90, position: 'insideLeft', style: { fill: '#6B7280' } }}
      />
      <Tooltip content={<CustomTooltip />} />
      <Legend />
      <Line type="monotone" dataKey="baseline" stroke={colors[0]} strokeWidth={2} dot={{ fill: colors[0] }} />
      <Line type="monotone" dataKey="scenario" stroke={colors[1]} strokeWidth={2} dot={{ fill: colors[1] }} />
      <Line type="monotone" dataKey="upperBound" stroke={colors[2]} strokeWidth={1} strokeDasharray="5 5" dot={false} />
      <Line type="monotone" dataKey="lowerBound" stroke={colors[2]} strokeWidth={1} strokeDasharray="5 5" dot={false} />
    </LineChart>
  );
};

// Radar Chart Component
const RadarChart: React.FC<{
  data: any[];
  height: number;
  colors: string[];
}> = ({ data, height, colors }) => {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.value.toFixed(1)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
      <PolarGrid stroke="#E5E7EB" />
      <PolarAngleAxis dataKey="metric" tick={{ fill: '#6B7280', fontSize: 12 }} />
      <PolarRadiusAxis 
        angle={90} 
        domain={[0, 100]} 
        tick={{ fill: '#6B7280', fontSize: 10 }}
      />
      <Radar 
        name="Baseline" 
        dataKey="baseline" 
        stroke={colors[0]} 
        fill={colors[0]} 
        fillOpacity={0.3}
        strokeWidth={2}
      />
      <Radar 
        name="Scenario" 
        dataKey="scenario" 
        stroke={colors[1]} 
        fill={colors[1]} 
        fillOpacity={0.3}
        strokeWidth={2}
      />
      <Tooltip content={<CustomTooltip />} />
      <Legend />
    </RadarChart>
  );
};

// Data transformation functions
function transformAllocationData(allocations: BudgetAllocation[]): any[] {
  return allocations.map(alloc => ({
    name: alloc.category.name,
    amount: alloc.amount,
    percentage: alloc.percentage,
    roi: alloc.expectedROI,
    risk: alloc.riskLevel,
    priority: alloc.priority
  }));
}

function transformComparisonData(result: SimulationResult): any[] {
  const metrics = [
    { name: 'ROI', baseline: 0.12, scenario: result.metrics.totalROI },
    { name: 'Risk', baseline: 50, scenario: result.metrics.riskScore },
    { name: 'Privacy', baseline: 75, scenario: result.metrics.privacyScore },
    { name: 'Utility', baseline: 70, scenario: result.metrics.utilityScore },
    { name: 'Efficiency', baseline: 65, scenario: result.metrics.efficiency },
    { name: 'Compliance', baseline: 80, scenario: result.metrics.complianceScore }
  ];

  return metrics.map(metric => ({
    name: metric.name,
    baseline: metric.baseline,
    scenario: metric.scenario
  }));
}

function transformImpactData(impacts: ScenarioImpact[]): any[] {
  return impacts.map(impact => ({
    metric: impact.metric,
    baseline: impact.baseline,
    scenario: impact.scenario,
    change: impact.change,
    changePercent: impact.changePercent,
    significance: impact.significance
  }));
}

function transformTrendData(projections: any[]): any[] {
  // This would transform projection data into trend format
  // For now, return sample data
  return [
    { time: 'Month 1', baseline: 100, scenario: 110, upperBound: 115, lowerBound: 105 },
    { time: 'Month 2', baseline: 105, scenario: 118, upperBound: 125, lowerBound: 111 },
    { time: 'Month 3', baseline: 110, scenario: 125, upperBound: 135, lowerBound: 115 },
    { time: 'Month 4', baseline: 115, scenario: 132, upperBound: 145, lowerBound: 119 },
    { time: 'Month 5', baseline: 120, scenario: 138, upperBound: 155, lowerBound: 121 },
    { time: 'Month 6', baseline: 125, scenario: 143, upperBound: 165, lowerBound: 121 }
  ];
}

function transformRadarData(data: any[]): any[] {
  // This would transform data into radar format
  // For now, return sample data
  return [
    { metric: 'ROI', baseline: 75, scenario: 85 },
    { metric: 'Risk', baseline: 60, scenario: 45 },
    { metric: 'Privacy', baseline: 80, scenario: 90 },
    { metric: 'Utility', baseline: 70, scenario: 78 },
    { metric: 'Efficiency', baseline: 65, scenario: 75 },
    { metric: 'Compliance', baseline: 85, scenario: 92 }
  ];
}

export default BudgetVisualizationChart;
