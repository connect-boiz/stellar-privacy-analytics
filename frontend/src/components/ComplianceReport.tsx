import React, { useState } from "react";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  FileText,
  Calendar,
  Scale,
  Globe,
  Heart,
} from "lucide-react";
import {
  downloadJsonFile,
  downloadTextFile,
  openPrintableReport,
} from "../utils/exportHelpers";

interface ComplianceRequirement {
  article: string;
  title: string;
  description: string;
  mandatory: boolean;
  satisfied: boolean;
  riskImpact: number;
  evidence?: string[];
}

interface ComplianceFramework {
  name: string;
  version: string;
  description: string;
  requirements: ComplianceRequirement[];
  complianceScore: number;
  gaps: string[];
  lastAssessed: string;
}

interface ComplianceReportProps {
  frameworks: ComplianceFramework[];
  organizationId?: string;
  onExport?: (format: "pdf" | "json") => void;
  className?: string;
}

const ComplianceReport: React.FC<ComplianceReportProps> = ({
  frameworks,
  organizationId,
  onExport,
  className = "",
}) => {
  const [selectedFramework, setSelectedFramework] = useState<string>(
    frameworks[0]?.name || "",
  );

  const getFrameworkIcon = (framework: string) => {
    switch (framework.toLowerCase()) {
      case "gdpr":
        return <Globe className="h-5 w-5 text-blue-500" />;
      case "ccpa":
        return <Scale className="h-5 w-5 text-green-500" />;
      case "hipaa":
        return <Heart className="h-5 w-5 text-red-500" />;
      default:
        return <Shield className="h-5 w-5 text-gray-500" />;
    }
  };

  const getComplianceColor = (score: number) => {
    if (score >= 0.9) return "text-green-600";
    if (score >= 0.7) return "text-yellow-600";
    return "text-red-600";
  };

  const getComplianceBadgeVariant = (
    score: number,
  ): "default" | "secondary" | "destructive" | "outline" => {
    if (score >= 0.9) return "default";
    if (score >= 0.7) return "secondary";
    return "destructive";
  };

  const getRequirementIcon = (requirement: ComplianceRequirement) => {
    if (requirement.satisfied) {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    } else if (requirement.mandatory) {
      return <XCircle className="h-4 w-4 text-red-500" />;
    } else {
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const calculateOverallCompliance = () => {
    if (frameworks.length === 0) return 0;
    const totalScore = frameworks.reduce(
      (sum, fw) => sum + fw.complianceScore,
      0,
    );
    return totalScore / frameworks.length;
  };

  const getHighRiskGaps = () => {
    return frameworks.flatMap((fw) =>
      fw.requirements
        .filter(
          (req) => !req.satisfied && req.mandatory && req.riskImpact > 0.7,
        )
        .map((req) => ({ framework: fw.name, ...req })),
    );
  };

  const selectedFrameworkData = frameworks.find(
    (fw) => fw.name === selectedFramework,
  );

  const overallCompliance = calculateOverallCompliance();
  const highRiskGaps = getHighRiskGaps();

  const reportData = {
    organizationId,
    exportedAt: new Date().toISOString(),
    overallCompliance,
    highRiskGapCount: highRiskGaps.length,
    frameworks,
    highRiskGaps,
  };

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const buildPrintableHtml = () => {
    const frameworkRows = frameworks
      .map(
        (framework) => `
      <tr>
        <td>${escapeHtml(framework.name)}</td>
        <td>${escapeHtml(framework.version)}</td>
        <td>${(framework.complianceScore * 100).toFixed(1)}%</td>
        <td>${framework.gaps.length}</td>
        <td>${escapeHtml(new Date(framework.lastAssessed).toLocaleDateString())}</td>
      </tr>
    `,
      )
      .join("");

    const highRiskRows = highRiskGaps
      .map(
        (gap) => `
      <tr>
        <td>${escapeHtml(gap.framework)}</td>
        <td>${escapeHtml(gap.article)}</td>
        <td>${escapeHtml(gap.title)}</td>
        <td>${(gap.riskImpact * 100).toFixed(0)}%</td>
      </tr>
    `,
      )
      .join("");

    return `
      <h1>Compliance Executive Summary</h1>
      <p class="muted">Organization: ${escapeHtml(organizationId || "All frameworks")}</p>
      <p><strong>Overall Compliance:</strong> ${(overallCompliance * 100).toFixed(1)}%</p>
      <p><strong>High-Risk Gaps:</strong> ${highRiskGaps.length}</p>
      <h2>Framework Overview</h2>
      <table>
        <thead>
          <tr>
            <th>Framework</th>
            <th>Version</th>
            <th>Compliance</th>
            <th>Gaps</th>
            <th>Last Assessed</th>
          </tr>
        </thead>
        <tbody>
          ${frameworkRows}
        </tbody>
      </table>
      <h2>High-Risk Gaps</h2>
      <table>
        <thead>
          <tr>
            <th>Framework</th>
            <th>Article</th>
            <th>Title</th>
            <th>Risk Impact</th>
          </tr>
        </thead>
        <tbody>
          ${highRiskRows || '<tr><td colspan="4">No high-risk gaps detected.</td></tr>'}
        </tbody>
      </table>
    `;
  };

  const handleExport = (requestedFormat: "pdf" | "json") => {
    if (onExport) {
      onExport(requestedFormat);
      return;
    }

    if (requestedFormat === "json") {
      downloadJsonFile(
        reportData,
        `compliance-report-${format(new Date(), "yyyy-MM-dd")}.json`,
      );
      return;
    }

    const printableHtml = buildPrintableHtml();
    const opened = openPrintableReport(
      "Compliance Executive Summary",
      printableHtml,
    );
    if (!opened) {
      downloadTextFile(
        printableHtml,
        `compliance-report-${format(new Date(), "yyyy-MM-dd")}.html`,
        "text/html;charset=utf-8",
      );
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Executive Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Shield className="h-5 w-5" />
              <span>Compliance Executive Summary</span>
            </div>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("json")}
              >
                <Download className="h-4 w-4 mr-2" />
                Export JSON
              </Button>
              <Button size="sm" onClick={() => handleExport("pdf")}>
                <FileText className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
            </div>
          </CardTitle>
          <CardDescription>
            Overall compliance status across all frameworks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="text-center">
              <div
                className={`text-3xl font-bold ${getComplianceColor(overallCompliance)}`}
              >
                {(overallCompliance * 100).toFixed(1)}%
              </div>
              <p className="text-sm text-muted-foreground">
                Overall Compliance
              </p>
              <Progress value={overallCompliance * 100} className="mt-2" />
            </div>

            <div className="text-center">
              <div className="text-3xl font-bold text-red-600">
                {highRiskGaps.length}
              </div>
              <p className="text-sm text-muted-foreground">High-Risk Gaps</p>
              <Badge variant="destructive" className="mt-2">
                Immediate Action Required
              </Badge>
            </div>

            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">
                {frameworks.length}
              </div>
              <p className="text-sm text-muted-foreground">
                Frameworks Covered
              </p>
              <div className="flex justify-center space-x-1 mt-2">
                {frameworks.map((fw) => getFrameworkIcon(fw.name))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Framework Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {frameworks.map((framework) => (
          <Card
            key={framework.name}
            className={`cursor-pointer transition-all hover:shadow-md ${
              selectedFramework === framework.name ? "ring-2 ring-blue-500" : ""
            }`}
            onClick={() => setSelectedFramework(framework.name)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {getFrameworkIcon(framework.name)}
                  <CardTitle className="text-lg">{framework.name}</CardTitle>
                </div>
                <Badge
                  variant={getComplianceBadgeVariant(framework.complianceScore)}
                >
                  {(framework.complianceScore * 100).toFixed(1)}%
                </Badge>
              </div>
              <CardDescription>
                Version {framework.version} • {framework.requirements.length}{" "}
                requirements
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Progress value={framework.complianceScore * 100} />

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Satisfied:</span>
                    <span className="ml-1 font-medium">
                      {framework.requirements.filter((r) => r.satisfied).length}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Gaps:</span>
                    <span className="ml-1 font-medium text-red-600">
                      {framework.gaps.length}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  Last assessed:{" "}
                  {new Date(framework.lastAssessed).toLocaleDateString()}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detailed Framework Analysis */}
      {selectedFrameworkData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              {getFrameworkIcon(selectedFrameworkData.name)}
              <span>{selectedFrameworkData.name} - Detailed Analysis</span>
            </CardTitle>
            <CardDescription>
              Compliance requirements and gaps for {selectedFrameworkData.name}{" "}
              v{selectedFrameworkData.version}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="requirements" className="w-full">
              <TabsList>
                <TabsTrigger value="requirements">Requirements</TabsTrigger>
                <TabsTrigger value="gaps">Compliance Gaps</TabsTrigger>
                <TabsTrigger value="evidence">Evidence</TabsTrigger>
              </TabsList>

              <TabsContent value="requirements" className="space-y-4">
                <div className="space-y-3">
                  {selectedFrameworkData.requirements.map(
                    (requirement, index) => (
                      <Card
                        key={index}
                        className="border-l-4 border-l-gray-200"
                      >
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                {getRequirementIcon(requirement)}
                                <h4 className="font-medium">
                                  {requirement.article}
                                </h4>
                                {requirement.mandatory && (
                                  <Badge
                                    variant="destructive"
                                    className="text-xs"
                                  >
                                    Mandatory
                                  </Badge>
                                )}
                              </div>
                              <h5 className="text-sm font-medium mb-1">
                                {requirement.title}
                              </h5>
                              <p className="text-sm text-muted-foreground mb-2">
                                {requirement.description}
                              </p>
                              <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                                <span>
                                  Risk Impact:{" "}
                                  {(requirement.riskImpact * 100).toFixed(0)}%
                                </span>
                                <span>
                                  Status:{" "}
                                  {requirement.satisfied
                                    ? "Compliant"
                                    : "Non-Compliant"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ),
                  )}
                </div>
              </TabsContent>

              <TabsContent value="gaps" className="space-y-4">
                {selectedFrameworkData.gaps.length > 0 ? (
                  <div className="space-y-3">
                    {selectedFrameworkData.gaps.map((gap, index) => (
                      <Card key={index} className="border-l-4 border-l-red-200">
                        <CardContent className="pt-4">
                          <div className="flex items-start space-x-2">
                            <XCircle className="h-4 w-4 text-red-500 mt-0.5" />
                            <div>
                              <h4 className="font-medium text-red-700">
                                {gap}
                              </h4>
                              <p className="text-sm text-muted-foreground mt-1">
                                This gap represents a compliance requirement
                                that is not currently satisfied.
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <h4 className="text-lg font-medium text-green-700">
                      No Compliance Gaps
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      All requirements for {selectedFrameworkData.name} are
                      currently satisfied.
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="evidence" className="space-y-4">
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h4 className="text-lg font-medium">Evidence Collection</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Upload and manage evidence for compliance requirements
                  </p>
                  <Button>
                    <FileText className="h-4 w-4 mr-2" />
                    Upload Evidence
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* High-Risk Gaps Summary */}
      {highRiskGaps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <span>High-Risk Compliance Gaps</span>
            </CardTitle>
            <CardDescription>
              Critical compliance issues requiring immediate attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {highRiskGaps.map((gap, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg"
                >
                  <div>
                    <h4 className="font-medium text-red-700">{gap.article}</h4>
                    <p className="text-sm text-red-600">{gap.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Framework: {gap.framework}
                    </p>
                  </div>
                  <Badge variant="destructive">
                    Risk: {(gap.riskImpact * 100).toFixed(0)}%
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>Compliance Recommendations</CardTitle>
          <CardDescription>
            Actionable recommendations to improve compliance posture
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-green-700">
                  Immediate Actions
                </h4>
                <div className="space-y-2">
                  {highRiskGaps.slice(0, 3).map((gap, index) => (
                    <div
                      key={index}
                      className="flex items-center space-x-2 text-sm"
                    >
                      <AlertTriangle className="h-3 w-3 text-red-500" />
                      <span>
                        Address {gap.article} - {gap.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-medium text-blue-700">
                  Long-term Improvements
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-3 w-3 text-blue-500" />
                    <span>Implement automated compliance monitoring</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-3 w-3 text-blue-500" />
                    <span>Establish regular compliance training</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-3 w-3 text-blue-500" />
                    <span>Create evidence management system</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ComplianceReport;
