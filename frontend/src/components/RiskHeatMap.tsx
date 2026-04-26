import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Shield, 
  AlertTriangle, 
  TrendingUp, 
  Activity,
  BarChart3,
  Eye
} from 'lucide-react';

interface HeatMapData {
  low: { count: number; workflows: Array<{ id: string; name: string; score: number; assessedAt: string }> };
  medium: { count: number; workflows: Array<{ id: string; name: string; score: number; assessedAt: string }> };
  high: { count: number; workflows: Array<{ id: string; name: string; score: number; assessedAt: string }> };
  critical: { count: number; workflows: Array<{ id: string; name: string; score: number; assessedAt: string }> };
}

interface RiskHeatMapProps {
  data: HeatMapData;
  onWorkflowClick?: (workflowId: string) => void;
  className?: string;
}

const RiskHeatMap: React.FC<RiskHeatMapProps> = ({ 
  data, 
  onWorkflowClick, 
  className = '' 
}) => {
  const totalWorkflows = Object.values(data).reduce((sum, category) => sum + category.count, 0);
  const highRiskWorkflows = data.high.count + data.critical.count;
  const riskPercentage = totalWorkflows > 0 ? (highRiskWorkflows / totalWorkflows) * 100 : 0;

  const getRiskColor = (category: string) => {
    switch (category) {
      case 'low': return 'bg-green-500';
      case 'medium': return 'bg-yellow-500';
      case 'high': return 'bg-orange-500';
      case 'critical': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getRiskBgColor = (category: string) => {
    switch (category) {
      case 'low': return 'bg-green-50 border-green-200';
      case 'medium': return 'bg-yellow-50 border-yellow-200';
      case 'high': return 'bg-orange-50 border-orange-200';
      case 'critical': return 'bg-red-50 border-red-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const getRiskTextColor = (category: string) => {
    switch (category) {
      case 'low': return 'text-green-700';
      case 'medium': return 'text-yellow-700';
      case 'high': return 'text-orange-700';
      case 'critical': return 'text-red-700';
      default: return 'text-gray-700';
    }
  };

  const getRiskIcon = (category: string) => {
    switch (category) {
      case 'low': return <Shield className="h-5 w-5 text-green-500" />;
      case 'medium': return <Activity className="h-5 w-5 text-yellow-500" />;
      case 'high': return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      case 'critical': return <AlertTriangle className="h-5 w-5 text-red-500" />;
      default: return <BarChart3 className="h-5 w-5 text-gray-500" />;
    }
  };

  const getRiskBadgeVariant = (category: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (category) {
      case 'low': return 'default';
      case 'medium': return 'secondary';
      case 'high': return 'destructive';
      case 'critical': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-700">Low Risk</p>
                <p className="text-2xl font-bold text-green-900">{data.low.count}</p>
              </div>
              <Shield className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-yellow-700">Medium Risk</p>
                <p className="text-2xl font-bold text-yellow-900">{data.medium.count}</p>
              </div>
              <Activity className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-700">High Risk</p>
                <p className="text-2xl font-bold text-orange-900">{data.high.count}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-700">Critical Risk</p>
                <p className="text-2xl font-bold text-red-900">{data.critical.count}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>Risk Overview</span>
          </CardTitle>
          <CardDescription>
            Overall risk distribution and compliance status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">High Risk Workflows</span>
                  <span className="text-sm text-muted-foreground">
                    {highRiskWorkflows} of {totalWorkflows}
                  </span>
                </div>
                <Progress 
                  value={riskPercentage} 
                  className="h-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {riskPercentage.toFixed(1)}% require attention
                </p>
              </div>
              
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Risk Distribution</h4>
                {Object.entries(data).map(([category, categoryData]) => (
                  <div key={category} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${getRiskColor(category)}`}></div>
                      <span className="text-sm capitalize">{category}</span>
                    </div>
                    <Badge variant={getRiskBadgeVariant(category)}>
                      {categoryData.count}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Heat Map */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Object.entries(data).map(([category, categoryData]) => (
          <Card 
            key={category} 
            className={`border-l-4 ${getRiskBgColor(category)} hover:shadow-md transition-shadow`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg capitalize flex items-center space-x-2">
                  {getRiskIcon(category)}
                  <span>{category}</span>
                </CardTitle>
                <Badge variant={getRiskBadgeVariant(category)}>
                  {categoryData.count}
                </Badge>
              </div>
              <CardDescription className={getRiskTextColor(category)}>
                {category === 'critical' && 'Immediate action required'}
                {category === 'high' && 'Requires urgent attention'}
                {category === 'medium' && 'Monitor closely'}
                {category === 'low' && 'Acceptable risk level'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {categoryData.workflows.slice(0, 3).map((workflow) => (
                  <div 
                    key={workflow.id} 
                    className={`p-2 rounded border ${getRiskBgColor(category)} cursor-pointer hover:opacity-80 transition-opacity`}
                    onClick={() => onWorkflowClick?.(workflow.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h5 className="text-sm font-medium truncate">{workflow.name}</h5>
                        <p className="text-xs text-muted-foreground">
                          Score: {(workflow.score * 100).toFixed(1)}%
                        </p>
                      </div>
                      <Eye className="h-4 w-4 text-muted-foreground ml-2 flex-shrink-0" />
                    </div>
                  </div>
                ))}
                
                {categoryData.workflows.length > 3 && (
                  <div className={`text-sm text-center py-2 ${getRiskTextColor(category)}`}>
                    +{categoryData.workflows.length - 3} more workflows
                  </div>
                )}

                {categoryData.workflows.length === 0 && (
                  <div className={`text-sm text-center py-4 ${getRiskTextColor(category)}`}>
                    No workflows in this category
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Risk Trends */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <TrendingUp className="h-5 w-5" />
            <span>Key Insights</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-green-700">Positive Indicators</h4>
              <ul className="text-sm space-y-1">
                {data.low.count > 0 && (
                  <li className="flex items-center space-x-2">
                    <Shield className="h-3 w-3 text-green-500" />
                    <span>{data.low.count} workflows with low risk profile</span>
                  </li>
                )}
                {riskPercentage < 25 && (
                  <li className="flex items-center space-x-2">
                    <TrendingUp className="h-3 w-3 text-green-500" />
                    <span>Overall risk level is manageable</span>
                  </li>
                )}
              </ul>
            </div>
            
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-red-700">Areas of Concern</h4>
              <ul className="text-sm space-y-1">
                {data.critical.count > 0 && (
                  <li className="flex items-center space-x-2">
                    <AlertTriangle className="h-3 w-3 text-red-500" />
                    <span>{data.critical.count} critical risks need immediate action</span>
                  </li>
                )}
                {riskPercentage > 50 && (
                  <li className="flex items-center space-x-2">
                    <AlertTriangle className="h-3 w-3 text-red-500" />
                    <span>More than half of workflows require attention</span>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RiskHeatMap;
