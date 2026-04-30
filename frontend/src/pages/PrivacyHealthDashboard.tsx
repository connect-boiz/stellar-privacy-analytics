import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Shield,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Clock,
  Database,
  Users,
  Activity,
  DollarSign,
  Zap,
  RefreshCw,
  Plus,
  Download,
  Settings,
  Eye,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "react-hot-toast";
import { downloadJsonFile } from "../utils/exportHelpers";

interface PrivacyMetrics {
  epsilonUsed: number;
  epsilonTotal: number;
  epsilonBudget: number;
  privacyScore: number;
  noiseInjected: number;
  dataGrantsActive: number;
  dataGrantsExpired: number;
  lastUpdated: string;
}

interface DataGrant {
  id: string;
  name: string;
  provider: string;
  epsilonAllocated: number;
  epsilonUsed: number;
  expiresAt: string;
  status: "active" | "expiring" | "expired";
}

interface BudgetConsumptionData {
  time: string;
  consumption: number;
  budget: number;
}

interface PrivacyScoreBreakdown {
  category: string;
  value: number;
  max: number;
  color: string;
}

const PrivacyHealthDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<PrivacyMetrics | null>(null);
  const [grants, setGrants] = useState<DataGrant[]>([]);
  const [consumptionData, setConsumptionData] = useState<
    BudgetConsumptionData[]
  >([]);
  const [scoreBreakdown, setScoreBreakdown] = useState<PrivacyScoreBreakdown[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedTab, setSelectedTab] = useState<
    "overview" | "grants" | "analysis"
  >("overview");
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(
    null,
  );

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStart) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 60) {
      const tabOrder: Array<"overview" | "grants" | "analysis"> = [
        "overview",
        "grants",
        "analysis",
      ];
      const currentIndex = tabOrder.indexOf(selectedTab);
      if (deltaX < 0 && currentIndex < tabOrder.length - 1) {
        setSelectedTab(tabOrder[currentIndex + 1]);
      }
      if (deltaX > 0 && currentIndex > 0) {
        setSelectedTab(tabOrder[currentIndex - 1]);
      }
    }

    setTouchStart(null);
  };

  // Mock data - replace with actual API calls
  useEffect(() => {
    const loadDashboardData = async () => {
      setIsLoading(true);

      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Mock metrics
      setMetrics({
        epsilonUsed: 750000,
        epsilonTotal: 1000000,
        epsilonBudget: 250000,
        privacyScore: 78,
        noiseInjected: 12500,
        dataGrantsActive: 12,
        dataGrantsExpired: 3,
        lastUpdated: new Date().toISOString(),
      });

      // Mock data grants
      setGrants([
        {
          id: "1",
          name: "Customer Analytics",
          provider: "DataCorp Inc.",
          epsilonAllocated: 500000,
          epsilonUsed: 450000,
          expiresAt: "2024-03-15",
          status: "expiring",
        },
        {
          id: "2",
          name: "Market Research",
          provider: "Research Labs",
          epsilonAllocated: 300000,
          epsilonUsed: 150000,
          expiresAt: "2024-06-30",
          status: "active",
        },
        {
          id: "3",
          name: "User Behavior Study",
          provider: "Analytics Pro",
          epsilonAllocated: 200000,
          epsilonUsed: 150000,
          expiresAt: "2024-02-28",
          status: "expired",
        },
      ]);

      // Mock consumption data
      setConsumptionData([
        { time: "Jan", consumption: 200000, budget: 250000 },
        { time: "Feb", consumption: 450000, budget: 500000 },
        { time: "Mar", consumption: 750000, budget: 750000 },
        { time: "Apr", consumption: 850000, budget: 1000000 },
        { time: "May", consumption: 950000, budget: 1000000 },
        { time: "Jun", consumption: 750000, budget: 1000000 },
      ]);

      // Mock privacy score breakdown
      setScoreBreakdown([
        {
          category: "Encryption Strength",
          value: 95,
          max: 100,
          color: "#10b981",
        },
        { category: "Noise Injection", value: 80, max: 100, color: "#3b82f6" },
        {
          category: "Data Minimization",
          value: 70,
          max: 100,
          color: "#f59e0b",
        },
        { category: "Access Control", value: 85, max: 100, color: "#8b5cf6" },
        { category: "Audit Compliance", value: 60, max: 100, color: "#ef4444" },
      ]);

      setIsLoading(false);
    };

    loadDashboardData();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Simulate refresh
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsRefreshing(false);
  };

  const handleTopUp = () => {
    // Open top-up modal or navigate to payment page
    console.log("Navigate to top-up page");
  };

  const handleExportReport = () => {
    if (!metrics) {
      toast.error("No dashboard data available to export");
      return;
    }

    downloadJsonFile(
      {
        exportedAt: new Date().toISOString(),
        summary: {
          epsilonUsed: metrics.epsilonUsed,
          epsilonTotal: metrics.epsilonTotal,
          epsilonBudget: metrics.epsilonBudget,
          privacyScore: metrics.privacyScore,
          noiseInjected: metrics.noiseInjected,
          dataGrantsActive: metrics.dataGrantsActive,
          dataGrantsExpired: metrics.dataGrantsExpired,
          lastUpdated: metrics.lastUpdated,
        },
        grants,
        consumptionData,
        scoreBreakdown,
      },
      `privacy-report-${format(new Date(), "yyyy-MM-dd")}.json`,
    );

    toast.success("Privacy report exported");
  };

  const getPrivacyScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getPrivacyScoreBg = (score: number) => {
    if (score >= 80) return "bg-green-100";
    if (score >= 60) return "bg-yellow-100";
    return "bg-red-100";
  };

  const getEpsilonProgress = () => {
    if (!metrics) return 0;
    return (metrics.epsilonUsed / metrics.epsilonTotal) * 100;
  };

  const getBudgetStatus = () => {
    if (!metrics) return "normal";
    const percentage = (metrics.epsilonUsed / metrics.epsilonTotal) * 100;
    if (percentage >= 90) return "critical";
    if (percentage >= 75) return "warning";
    return "normal";
  };

  const budgetStatus = getBudgetStatus();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Privacy Health Dashboard
            </h1>
            <p className="text-gray-600 mt-1">
              Monitor your organization's privacy budget and data sovereignty
            </p>
          </div>
          <div className="flex space-x-3">
            <Button
              variant="outline"
              onClick={handleExportReport}
              className="flex items-center space-x-2"
            >
              <Download className="h-4 w-4" />
              <span>Export Report</span>
            </Button>
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center space-x-2"
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
              <span>Refresh</span>
            </Button>
            <Button
              onClick={handleTopUp}
              className="flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>Top Up Budget</span>
            </Button>
          </div>
        </div>

        {/* Critical Alert */}
        {budgetStatus === "critical" && (
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-800">
              Critical Privacy Budget Level
            </AlertTitle>
            <AlertDescription className="text-red-700">
              Your privacy budget is critically low (
              {getEpsilonProgress().toFixed(1)}% used). Consider topping up your
              budget to avoid service interruption.
            </AlertDescription>
          </Alert>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Privacy Budget Used
              </CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics?.epsilonUsed?.toLocaleString() || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                of {metrics?.epsilonTotal?.toLocaleString() || 0} ε
              </p>
              <Progress value={getEpsilonProgress()} className="mt-2" />
              <p
                className={`text-xs mt-1 ${
                  budgetStatus === "critical"
                    ? "text-red-600"
                    : budgetStatus === "warning"
                      ? "text-yellow-600"
                      : "text-green-600"
                }`}
              >
                {getEpsilonProgress().toFixed(1)}% used
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Privacy Score
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${getPrivacyScoreColor(metrics?.privacyScore || 0)}`}
              >
                {metrics?.privacyScore || 0}/100
              </div>
              <p className="text-xs text-muted-foreground">
                Overall privacy health
              </p>
              <div
                className={`mt-2 px-2 py-1 rounded-full text-xs font-medium ${getPrivacyScoreBg(metrics?.privacyScore || 0)} ${getPrivacyScoreColor(metrics?.privacyScore || 0)}`}
              >
                {metrics?.privacyScore >= 80
                  ? "Excellent"
                  : metrics?.privacyScore >= 60
                    ? "Good"
                    : "Needs Attention"}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Active Data Grants
              </CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics?.dataGrantsActive || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {metrics?.dataGrantsExpired || 0} expired
              </p>
              <div className="flex items-center space-x-2 mt-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-xs text-green-600">Active</span>
                <div className="w-2 h-2 bg-red-500 rounded-full ml-2"></div>
                <span className="text-xs text-red-600">Expired</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Noise Injected
              </CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics?.noiseInjected?.toLocaleString() || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Privacy-preserving noise
              </p>
              <div className="flex items-center space-x-1 mt-2">
                <TrendingUp className="h-3 w-3 text-green-600" />
                <span className="text-xs text-green-600">
                  +12% from last month
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts and Details */}
        <Tabs
          value={selectedTab}
          onValueChange={setSelectedTab}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="space-y-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <TabsList
              className="flex flex-wrap gap-2"
              aria-label="Privacy dashboard sections"
            >
              <TabsTrigger
                value="overview"
                className="min-h-[44px] px-4 py-3 text-sm"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="grants"
                className="min-h-[44px] px-4 py-3 text-sm"
              >
                Data Grants
              </TabsTrigger>
              <TabsTrigger
                value="analysis"
                className="min-h-[44px] px-4 py-3 text-sm"
              >
                Privacy Analysis
              </TabsTrigger>
            </TabsList>
            <div className="text-sm text-gray-500 sm:ml-auto">
              Swipe left or right to navigate sections
            </div>
          </div>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Budget Consumption Chart */}
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle>Privacy Budget Consumption</CardTitle>
                  <CardDescription>
                    Monthly epsilon usage vs budget allocation
                  </CardDescription>
                </CardHeader>
                <CardContent className="min-h-[320px] min-w-0">
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={consumptionData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="consumption"
                        stackId="1"
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.6}
                        name="Epsilon Used"
                      />
                      <Area
                        type="monotone"
                        dataKey="budget"
                        stackId="2"
                        stroke="#10b981"
                        fill="#10b981"
                        fillOpacity={0.3}
                        name="Budget Allocation"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Privacy Score Breakdown */}
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle>Privacy Score Breakdown</CardTitle>
                  <CardDescription>Detailed privacy metrics</CardDescription>
                </CardHeader>
                <CardContent className="min-h-[320px] min-w-0">
                  <div className="space-y-4">
                    {scoreBreakdown.map((item, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{item.category}</span>
                          <span>
                            {item.value}/{item.max}
                          </span>
                        </div>
                        <Progress
                          value={(item.value / item.max) * 100}
                          className="h-2"
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="grants" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Active Data Grants</CardTitle>
                <CardDescription>
                  Manage and monitor your data access grants
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {grants.map((grant) => (
                    <div
                      key={grant.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <h3 className="font-medium">{grant.name}</h3>
                          <Badge
                            variant={
                              grant.status === "active"
                                ? "default"
                                : grant.status === "expiring"
                                  ? "secondary"
                                  : "destructive"
                            }
                          >
                            {grant.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600">
                          {grant.provider}
                        </p>
                        <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                          <span>
                            ε {grant.epsilonUsed.toLocaleString()} /{" "}
                            {grant.epsilonAllocated.toLocaleString()}
                          </span>
                          <span>
                            Expires:{" "}
                            {format(new Date(grant.expiresAt), "MMM dd, yyyy")}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button variant="outline" size="sm">
                          <Settings className="h-4 w-4 mr-1" />
                          Manage
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Privacy Trends */}
              <Card>
                <CardHeader>
                  <CardTitle>Privacy Score Trends</CardTitle>
                  <CardDescription>
                    Historical privacy performance
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={consumptionData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="consumption"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        name="Privacy Score"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Recommendations */}
              <Card>
                <CardHeader>
                  <CardTitle>Privacy Recommendations</CardTitle>
                  <CardDescription>
                    Suggestions to improve your privacy posture
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                      <div>
                        <p className="font-medium text-sm">
                          Increase Noise Injection
                        </p>
                        <p className="text-xs text-gray-600">
                          Consider adding more statistical noise to improve
                          privacy guarantees
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2"></div>
                      <div>
                        <p className="font-medium text-sm">Audit Compliance</p>
                        <p className="text-xs text-gray-600">
                          Update audit logs to meet compliance requirements
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                      <div>
                        <p className="font-medium text-sm">Data Minimization</p>
                        <p className="text-xs text-gray-600">
                          Reduce data collection to essential fields only
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default PrivacyHealthDashboard;
