import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Shield, 
  AlertTriangle, 
  TrendingUp, 
  CheckCircle, 
  Clock, 
  BarChart3,
  Activity,
  FileText,
  Settings
} from 'lucide-react';
import { RiskAssessmentSkeleton } from '@/components/skeletons';

interface RiskAssessment {
  id: string;
  workflowId: string;
  overallScore: number;
  category: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: Array<{
    category: string;
    score: number;
    description: string;
  }>;
  mitigationStrategies: Array<{
    strategy: string;
    priority: string;
    effort: string;
    impact: number;
  }>;
  assessedAt: string;
  recommendations: string[];
}

interface HeatMapData {
  low: { count: number; workflows: any[] };
  medium: { count: number; workflows: any[] };
  high: { count: number; workflows: any[] };
  critical: { count: number; workflows: any[] };
}

const RiskAssessmentDashboard: React.FC = () => {
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [heatMapData, setHeatMapData] = useState<HeatMapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTimeframe, setSelectedTimeframe] = useState('30d');
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchDashboardData();
  }, [selectedTimeframe]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch heat map data
      const heatMapResponse = await fetch(`/api/v1/risk-assessment/heatmap`);
      const heatMapResult = await heatMapResponse.json();
      if (heatMapResult.success) {
        setHeatMapData(heatMapResult.data);
      }

      // Fetch dashboard data
      const dashboardResponse = await fetch(`/api/v1/risk-assessment/dashboard?timeframe=${selectedTimeframe}`);
      const dashboardResult = await dashboardResponse.json();
      if (dashboardResult.success) {
        setAssessments(dashboardResult.data.recentAssessments || []);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (category: string) => {
    switch (category) {
      case 'low': return 'bg-green-500';
      case 'medium': return 'bg-yellow-500';
      case 'high': return 'bg-orange-500';
      case 'critical': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getRiskBadgeVariant = (category: string) => {
    switch (category) {
      case 'low': return 'default';
      case 'medium': return 'secondary';
      case 'high': return 'destructive';
      case 'critical': return 'destructive';
      default: return 'outline';
    }
  };

  const totalWorkflows = heatMapData ? 
    Object.values(heatMapData).reduce((sum, category) => sum + category.count, 0) : 0;

  const highRiskWorkflows = heatMapData ? 
    heatMapData.high.count + heatMapData.critical.count : 0;

  const riskPercentage = totalWorkflows > 0 ? (highRiskWorkflows / totalWorkflows) * 100 : 0;

  if (loading) {
    return <RiskAssessmentSkeleton />;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Privacy Risk Assessment Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor and manage privacy risks across your data workflows
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
          <Button size="sm">
            <FileText className="h-4 w-4 mr-2" />
            New Assessment
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Workflows</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalWorkflows}</div>
            <p className="text-xs text-muted-foreground">
              Active data workflows
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Risk Workflows</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{highRiskWorkflows}</div>
            <p className="text-xs text-muted-foreground">
              Require immediate attention
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Risk Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{riskPercentage.toFixed(1)}%</div>
            <Progress value={riskPercentage} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Mitigations</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {assessments.reduce((sum, a) => sum + a.mitigationStrategies.length, 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Actions to be completed
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="heatmap">Risk Heat Map</TabsTrigger>
          <TabsTrigger value="assessments">Recent Assessments</TabsTrigger>
          <TabsTrigger value="mitigations">Mitigations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Risk Distribution</CardTitle>
                <CardDescription>
                  Distribution of risk categories across all workflows
                </CardDescription>
              </CardHeader>
              <CardContent>
                {heatMapData && (
                  <div className="space-y-4">
                    {Object.entries(heatMapData).map(([category, data]) => (
                      <div key={category} className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className={`w-3 h-3 rounded-full ${getRiskColor(category)}`}></div>
                          <span className="capitalize">{category}</span>
                        </div>
                        <Badge variant={getRiskBadgeVariant(category)}>
                          {data.count} workflows
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Recommendations</CardTitle>
                <CardDescription>
                  Latest privacy improvement recommendations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {assessments.slice(0, 3).map((assessment) => (
                    assessment.recommendations.slice(0, 2).map((rec, index) => (
                      <div key={`${assessment.id}-${index}`} className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <p className="text-sm">{rec}</p>
                      </div>
                    ))
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="heatmap" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Risk Heat Map</CardTitle>
              <CardDescription>
                Visual representation of privacy risks across workflows
              </CardDescription>
            </CardHeader>
            <CardContent>
              {heatMapData && (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {Object.entries(heatMapData).map(([category, data]) => (
                    <Card key={category} className={`border-l-4 ${getRiskColor(category).replace('bg-', 'border-l-')}`}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg capitalize">{category}</CardTitle>
                        <CardDescription>{data.count} workflows</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {data.workflows.slice(0, 3).map((workflow) => (
                            <div key={workflow.id} className="text-sm">
                              <div className="font-medium">{workflow.name}</div>
                              <div className="text-muted-foreground">
                                Score: {(workflow.score * 100).toFixed(1)}%
                              </div>
                            </div>
                          ))}
                          {data.workflows.length > 3 && (
                            <div className="text-sm text-muted-foreground">
                              +{data.workflows.length - 3} more
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assessments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Risk Assessments</CardTitle>
              <CardDescription>
                Latest privacy risk assessments completed
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {assessments.map((assessment) => (
                  <Card key={assessment.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">
                          Workflow {assessment.workflowId}
                        </CardTitle>
                        <Badge variant={getRiskBadgeVariant(assessment.category)}>
                          {assessment.category.toUpperCase()}
                        </Badge>
                      </div>
                      <CardDescription>
                        Assessed on {new Date(assessment.assessedAt).toLocaleDateString()}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">Overall Risk Score</span>
                            <span className="text-sm">{(assessment.overallScore * 100).toFixed(1)}%</span>
                          </div>
                          <Progress value={assessment.overallScore * 100} />
                        </div>
                        
                        <div>
                          <h4 className="text-sm font-medium mb-2">Risk Factors</h4>
                          <div className="space-y-1">
                            {assessment.riskFactors.map((factor, index) => (
                              <div key={index} className="flex items-center justify-between text-sm">
                                <span className="capitalize">{factor.category.replace('_', ' ')}</span>
                                <span>{(factor.score * 100).toFixed(1)}%</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {assessment.recommendations.length > 0 && (
                          <Alert>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Recommendations</AlertTitle>
                            <AlertDescription>
                              <ul className="list-disc list-inside space-y-1">
                                {assessment.recommendations.slice(0, 2).map((rec, index) => (
                                  <li key={index} className="text-sm">{rec}</li>
                                ))}
                              </ul>
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mitigations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mitigation Strategies</CardTitle>
              <CardDescription>
                Recommended actions to reduce privacy risks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {assessments.map((assessment) =>
                  assessment.mitigationStrategies.map((strategy, index) => (
                    <Card key={`${assessment.id}-${index}`}>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium">{strategy.strategy}</h4>
                          <div className="flex gap-2">
                            <Badge variant={strategy.priority === 'urgent' ? 'destructive' : 'secondary'}>
                              {strategy.priority}
                            </Badge>
                            <Badge variant="outline">{strategy.effort} effort</Badge>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>Impact: {strategy.impact}%</span>
                          <span>Category: {strategy.priority}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RiskAssessmentDashboard;
