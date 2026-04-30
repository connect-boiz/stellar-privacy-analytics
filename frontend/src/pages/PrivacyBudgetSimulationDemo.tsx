import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import PrivacyBudgetSimulation from '../services/privacyBudgetSimulation';
import WhatIfScenarioModeling from '../services/whatIfScenarioModeling';
import OptimizationRecommendationEngine from '../services/optimizationRecommendationEngine';
import SimulationExportSharing from '../services/simulationExportSharing';
import HistoricalScenarioComparison from '../services/historicalScenarioComparison';
import BudgetManagementIntegration from '../services/budgetManagementIntegration';
import BudgetVisualizationChart from '../components/simulation/BudgetVisualizationChart';

import { 
  PrivacyBudget, 
  BudgetAllocation, 
  SimulationScenario, 
  SimulationResult,
  AllocationCategory 
} from '../types/privacyBudget';

const PrivacyBudgetSimulationDemo: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'simulation' | 'scenarios' | 'optimization' | 'comparison' | 'export'>('overview');
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentScenario, setCurrentScenario] = useState<SimulationScenario | null>(null);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [budgets, setBudgets] = useState<PrivacyBudget[]>([]);
  const [scenarios, setScenarios] = useState<SimulationScenario[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);

  // Initialize services
  useEffect(() => {
    const initializeServices = async () => {
      try {
        // Initialize simulation engine
        const simulationEngine = PrivacyBudgetSimulation.getInstance({
          maxIterations: 1000,
          convergenceThreshold: 0.001,
          monteCarloRuns: 1000,
          confidenceLevel: 0.95,
          timeStep: 1,
          optimizationAlgorithm: 'genetic'
        });

        // Initialize what-if modeling
        const whatIfModeling = WhatIfScenarioModeling.getInstance({
          maxScenarios: 50,
          defaultTimeHorizon: 365,
          confidenceLevels: [0.8, 0.9, 0.95],
          sensitivityFactors: [0.8, 0.9, 1.0, 1.1, 1.2],
          optimizationTargets: ['roi', 'risk', 'privacy', 'utility']
        });

        // Initialize optimization engine
        const optimizationEngine = OptimizationRecommendationEngine.getInstance({
          maxRecommendations: 10,
          minImpactThreshold: 0.05,
          confidenceThreshold: 0.7,
          riskTolerance: 0.3,
          timeHorizon: 365,
          optimizationTargets: ['roi', 'risk', 'privacy', 'utility']
        });

        // Initialize export sharing
        const exportSharing = SimulationExportSharing.getInstance(
          {
            defaultFormat: 'json',
            includeMetadata: true,
            includeRecommendations: true,
            includeProjections: true,
            includeSensitivity: false,
            compressionEnabled: false,
            encryptionEnabled: false,
            watermarkEnabled: false
          },
          {
            defaultExpiration: 30,
            maxShares: 10,
            requireAuthentication: true,
            allowDownload: true,
            allowComments: false,
            trackAccess: true
          }
        );

        // Initialize historical comparison
        const historicalComparison = HistoricalScenarioComparison.getInstance({
          maxHistoricalScenarios: 100,
          timeRange: 365,
          comparisonMetrics: ['totalROI', 'riskScore', 'privacyScore', 'utilityScore', 'efficiency', 'complianceScore'],
          trendAnalysisEnabled: true,
          patternRecognitionEnabled: true,
          benchmarkingEnabled: true
        });

        // Initialize budget management integration
        const budgetManagement = BudgetManagementIntegration.getInstance({
          apiEndpoint: '/api/budget-management',
          wsEndpoint: 'ws://localhost:8080/budget-ws',
          refreshInterval: 30000,
          syncEnabled: true,
          autoApprovalThreshold: 10000,
          alertThresholds: {
            budgetUtilization: 0.9,
            roiDecline: 0.15,
            riskIncrease: 0.2,
            complianceDrop: 0.1,
            efficiencyDrop: 0.15
          }
        });

        // Create sample budget
        const sampleBudget = await budgetManagement.createBudget({
          name: 'Demo Privacy Budget',
          description: 'Sample budget for demonstration',
          totalBudget: 1000000,
          allocatedBudget: 0,
          remainingBudget: 1000000,
          currency: 'USD',
          period: 'yearly',
          startDate: Date.now(),
          endDate: Date.now() + (365 * 24 * 60 * 60 * 1000),
          status: 'active',
          owner: 'demo-user',
          department: 'Privacy & Compliance',
          constraints: {
            maxPerAnalysis: 100000,
            minPrivacyLevel: 0.8,
            requiredApprovals: ['manager'],
            restrictedCategories: [],
            complianceFrameworks: ['GDPR', 'CCPA'],
            geographicRestrictions: ['US', 'EU', 'CA']
          },
          allocations: []
        }, false);

        setBudgets([sampleBudget.budget]);

        // Create sample allocations
        const sampleAllocations: BudgetAllocation[] = [
          {
            id: 'alloc-1',
            category: {
              id: 'data_collection',
              name: 'Data Collection',
              type: 'data_collection',
              description: 'Budget for data collection activities',
              minAllocation: 0.1,
              maxAllocation: 0.4,
              impactFactors: []
            },
            amount: 200000,
            percentage: 20,
            description: 'Budget allocated to data collection',
            priority: 'high',
            expectedROI: 0.12,
            riskLevel: 'medium',
            dependencies: [],
            constraints: {
              timeConstraints: { minDuration: 30, maxDuration: 365 },
              resourceConstraints: { maxDataVolume: 1000, maxUsers: 50, maxQueries: 10000 },
              privacyConstraints: { minAnonymizationLevel: 0.8, maxDataRetention: 2555, requiredConsent: true }
            },
            performance: {
              actualROI: 0.12,
              utilizationRate: 0.85,
              efficiency: 0.8,
              complianceScore: 0.9,
              userSatisfaction: 0.85,
              lastUpdated: Date.now()
            }
          },
          {
            id: 'alloc-2',
            category: {
              id: 'data_analysis',
              name: 'Data Analysis',
              type: 'data_analysis',
              description: 'Budget for data analysis and processing',
              minAllocation: 0.2,
              maxAllocation: 0.5,
              impactFactors: []
            },
            amount: 300000,
            percentage: 30,
            description: 'Budget allocated to data analysis',
            priority: 'high',
            expectedROI: 0.18,
            riskLevel: 'low',
            dependencies: ['alloc-1'],
            constraints: {
              timeConstraints: { minDuration: 60, maxDuration: 180 },
              resourceConstraints: { maxDataVolume: 500, maxUsers: 25, maxQueries: 5000 },
              privacyConstraints: { minAnonymizationLevel: 0.9, maxDataRetention: 730, requiredConsent: true }
            },
            performance: {
              actualROI: 0.18,
              utilizationRate: 0.92,
              efficiency: 0.88,
              complianceScore: 0.95,
              userSatisfaction: 0.9,
              lastUpdated: Date.now()
            }
          },
          {
            id: 'alloc-3',
            category: {
              id: 'compliance',
              name: 'Compliance',
              type: 'compliance',
              description: 'Budget for compliance and governance',
              minAllocation: 0.1,
              maxAllocation: 0.3,
              impactFactors: []
            },
            amount: 250000,
            percentage: 25,
            description: 'Budget allocated to compliance activities',
            priority: 'critical',
            expectedROI: 0.08,
            riskLevel: 'low',
            dependencies: [],
            constraints: {
              timeConstraints: { minDuration: 90, maxDuration: 365 },
              resourceConstraints: { maxDataVolume: 100, maxUsers: 10, maxQueries: 1000 },
              privacyConstraints: { minAnonymizationLevel: 0.95, maxDataRetention: 1825, requiredConsent: true }
            },
            performance: {
              actualROI: 0.08,
              utilizationRate: 0.95,
              efficiency: 0.92,
              complianceScore: 0.98,
              userSatisfaction: 0.88,
              lastUpdated: Date.now()
            }
          },
          {
            id: 'alloc-4',
            category: {
              id: 'monitoring',
              name: 'Privacy Monitoring',
              type: 'monitoring',
              description: 'Budget for privacy monitoring and alerting',
              minAllocation: 0.05,
              maxAllocation: 0.15,
              impactFactors: []
            },
            amount: 150000,
            percentage: 15,
            description: 'Budget allocated to privacy monitoring',
            priority: 'medium',
            expectedROI: 0.15,
            riskLevel: 'low',
            dependencies: [],
            constraints: {
              timeConstraints: { minDuration: 30, maxDuration: 365 },
              resourceConstraints: { maxDataVolume: 200, maxUsers: 15, maxQueries: 2000 },
              privacyConstraints: { minAnonymizationLevel: 0.8, maxDataRetention: 90, requiredConsent: false }
            },
            performance: {
              actualROI: 0.15,
              utilizationRate: 0.88,
              efficiency: 0.85,
              complianceScore: 0.92,
              userSatisfaction: 0.82,
              lastUpdated: Date.now()
            }
          },
          {
            id: 'alloc-5',
            category: {
              id: 'research',
              name: 'Privacy Research',
              type: 'research',
              description: 'Budget for privacy research and innovation',
              minAllocation: 0.02,
              maxAllocation: 0.1,
              impactFactors: []
            },
            amount: 100000,
            percentage: 10,
            description: 'Budget allocated to privacy research',
            priority: 'low',
            expectedROI: 0.10,
            riskLevel: 'medium',
            dependencies: [],
            constraints: {
              timeConstraints: { minDuration: 120, maxDuration: 365 },
              resourceConstraints: { maxDataVolume: 50, maxUsers: 5, maxQueries: 500 },
              privacyConstraints: { minAnonymizationLevel: 0.9, maxDataRetention: 365, requiredConsent: true }
            },
            performance: {
              actualROI: 0.10,
              utilizationRate: 0.75,
              efficiency: 0.7,
              complianceScore: 0.85,
              userSatisfaction: 0.78,
              lastUpdated: Date.now()
            }
          }
        ];

        // Update budget with allocations
        const updatedBudget = {
          ...sampleBudget.budget,
          allocations: sampleAllocations,
          allocatedBudget: sampleAllocations.reduce((sum, alloc) => sum + alloc.amount, 0),
          remainingBudget: sampleBudget.budget.totalBudget - sampleAllocations.reduce((sum, alloc) => sum + alloc.amount, 0)
        };

        setBudgets([updatedBudget]);

        // Create sample scenario
        const sampleScenario: SimulationScenario = {
          id: 'scenario-demo',
          name: 'Demo Scenario',
          description: 'Sample scenario for demonstration',
          type: 'baseline',
          baseBudget: updatedBudget,
          allocations: sampleAllocations,
          parameters: {
            timeHorizon: 365,
            confidenceLevel: 0.95,
            riskTolerance: 0.3,
            optimizationGoal: {
              primary: 'maximize_roi',
              weights: {
                roi: 0.4,
                risk: 0.2,
                privacy: 0.2,
                utility: 0.2
              }
            },
            sensitivity: 'medium',
            monteCarloRuns: 1000
          },
          assumptions: [
            {
              id: 'market_growth',
              name: 'Market Growth',
              description: 'Expected market growth rate',
              type: 'market',
              value: 0.05,
              confidence: 0.8,
              impact: 'medium',
              source: 'market_analysis'
            }
          ],
          constraints: {
            totalBudgetLimit: updatedBudget.totalBudget,
            categoryLimits: {},
            minimumPrivacyLevel: 0.8,
            complianceRequirements: ['GDPR', 'CCPA'],
            businessObjectives: []
          },
          createdAt: Date.now(),
          createdBy: 'demo-user',
          tags: ['demo', 'baseline'],
          status: 'active'
        };

        setCurrentScenario(sampleScenario);
        setScenarios([sampleScenario]);

        setIsInitialized(true);
        toast.success('Privacy Budget Simulation System initialized successfully');

      } catch (error) {
        console.error('Failed to initialize services:', error);
        toast.error('Failed to initialize privacy budget simulation system');
      }
    };

    initializeServices();
  }, []);

  // Simulation methods
  const runSimulation = async () => {
    if (!currentScenario || isSimulating) return;

    setIsSimulating(true);
    try {
      const simulationEngine = PrivacyBudgetSimulation.getInstance();
      const result = await simulationEngine.runSimulation(currentScenario);
      
      setSimulationResult(result);
      toast.success('Simulation completed successfully');
    } catch (error) {
      console.error('Simulation failed:', error);
      toast.error('Simulation failed');
    } finally {
      setIsSimulating(false);
    }
  };

  const createWhatIfScenario = async (templateId: string) => {
    if (!currentScenario) return;

    try {
      const whatIfModeling = WhatIfScenarioModeling.getInstance();
      const whatIfScenario = whatIfModeling.createWhatIfScenario(currentScenario, templateId);
      
      setScenarios([...scenarios, whatIfScenario]);
      setCurrentScenario(whatIfScenario);
      
      toast.success('What-if scenario created successfully');
    } catch (error) {
      console.error('Failed to create what-if scenario:', error);
      toast.error('Failed to create what-if scenario');
    }
  };

  const compareScenarios = async (scenarioIds: string[]) => {
    try {
      const whatIfModeling = WhatIfScenarioModeling.getInstance();
      const comparison = await whatIfModeling.compareScenarios(scenarioIds);
      
      toast.success('Scenario comparison completed');
      return comparison;
    } catch (error) {
      console.error('Failed to compare scenarios:', error);
      toast.error('Failed to compare scenarios');
      return null;
    }
  };

  const exportResults = async (format: 'json' | 'csv' | 'excel' | 'pdf') => {
    if (!simulationResult) return;

    try {
      const exportSharing = SimulationExportSharing.getInstance();
      const exportData = await exportSharing.exportSimulationResult(simulationResult, format);
      
      // In a real implementation, this would trigger a download
      console.log('Export data:', exportData);
      toast.success(`Results exported as ${format.toUpperCase()}`);
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export results');
    }
  };

  const generateRecommendations = async () => {
    if (!simulationResult) return;

    try {
      const optimizationEngine = OptimizationRecommendationEngine.getInstance();
      const context = {
        currentAllocations: simulationResult.allocations,
        simulationResult,
        baselineMetrics: simulationResult.metrics,
        constraints: currentScenario.constraints,
        objectives: currentScenario.parameters.optimizationGoal,
        historicalData: []
      };
      
      const recommendations = optimizationEngine.generateRecommendations(context);
      
      console.log('Generated recommendations:', recommendations);
      toast.success(`Generated ${recommendations.length} recommendations`);
      return recommendations;
    } catch (error) {
      console.error('Failed to generate recommendations:', error);
      toast.error('Failed to generate recommendations');
      return [];
    }
  };

  const analyzeHistoricalTrends = async () => {
    if (!currentScenario || !simulationResult) return;

    try {
      const historicalComparison = HistoricalScenarioComparison.getInstance();
      const analysis = await historicalComparison.compareWithHistorical(currentScenario, simulationResult);
      
      console.log('Historical analysis:', analysis);
      toast.success('Historical analysis completed');
      return analysis;
    } catch (error) {
      console.error('Failed to analyze historical trends:', error);
      toast.error('Failed to analyze historical trends');
      return null;
    }
  };

  // Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab budgets={budgets} scenarios={scenarios} />;
      case 'simulation':
        return <SimulationTab 
          scenario={currentScenario}
          result={simulationResult}
          isSimulating={isSimulating}
          onRunSimulation={runSimulation}
        />;
      case 'scenarios':
        return <ScenariosTab 
          scenarios={scenarios}
          currentScenario={currentScenario}
          onSelectScenario={setCurrentScenario}
          onCreateWhatIf={createWhatIfScenario}
          onCompareScenarios={compareScenarios}
        />;
      case 'optimization':
        return <OptimizationTab 
          result={simulationResult}
          onGenerateRecommendations={generateRecommendations}
        />;
      case 'comparison':
        return <ComparisonTab 
          scenarios={scenarios}
          onAnalyzeHistoricalTrends={analyzeHistoricalTrends}
        />;
      case 'export':
        return <ExportTab 
          result={simulationResult}
          onExport={exportResults}
        />;
      default:
        return null;
    }
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Initializing Privacy Budget Simulation System...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">Privacy Budget Simulation</h1>
              <span className="ml-4 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                Interactive Demo
              </span>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={runSimulation}
                disabled={isSimulating || !currentScenario}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSimulating ? 'Simulating...' : 'Run Simulation'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', label: 'Overview', icon: '📊' },
              { id: 'simulation', label: 'Simulation', icon: '🔬' },
              { id: 'scenarios', label: 'What-If Scenarios', icon: '🎯' },
              { id: 'optimization', label: 'Optimization', icon: '⚡' },
              { id: 'comparison', label: 'Comparison', icon: '📈' },
              { id: 'export', label: 'Export', icon: '📤' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="py-6">
        {renderTabContent()}
      </div>
    </div>
  );
};

// Tab Components
const OverviewTab: React.FC<{ budgets: PrivacyBudget[]; scenarios: SimulationScenario[] }> = ({ budgets, scenarios }) => (
  <div className="px-4 sm:px-6 lg:px-8">
    <div className="mb-6">
      <h2 className="text-2xl font-bold text-gray-900">System Overview</h2>
      <p className="text-gray-600">Privacy Budget Simulation System Overview</p>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Budget Summary</h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-600">Total Budgets:</span>
            <span className="font-medium">{budgets.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Active Scenarios:</span>
            <span className="font-medium">{scenarios.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Total Budget Amount:</span>
            <span className="font-medium">
              ${budgets.reduce((sum, b) => sum + b.totalBudget, 0).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">System Status</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Simulation Engine:</span>
            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">Active</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">What-If Modeling:</span>
            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">Active</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Optimization Engine:</span>
            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">Active</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const SimulationTab: React.FC<{
  scenario: SimulationScenario | null;
  result: SimulationResult | null;
  isSimulating: boolean;
  onRunSimulation: () => void;
}> = ({ scenario, result, isSimulating, onRunSimulation }) => (
  <div className="px-4 sm:px-6 lg:px-8">
    <div className="mb-6">
      <h2 className="text-2xl font-bold text-gray-900">Simulation</h2>
      <p className="text-gray-600">Run and analyze privacy budget simulations</p>
    </div>

    {scenario && (
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Current Scenario</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Name:</p>
            <p className="font-medium">{scenario.name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Type:</p>
            <p className="font-medium">{scenario.type}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Time Horizon:</p>
            <p className="font-medium">{scenario.parameters.timeHorizon} days</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Risk Tolerance:</p>
            <p className="font-medium">{(scenario.parameters.riskTolerance * 100).toFixed(0)}%</p>
          </div>
        </div>
      </div>
    )}

    {result && (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Simulation Results</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">
                {(result.metrics.totalROI * 100).toFixed(1)}%
              </p>
              <p className="text-sm text-gray-600">Total ROI</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">
                {result.metrics.riskScore.toFixed(1)}
              </p>
              <p className="text-sm text-gray-600">Risk Score</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">
                {result.metrics.privacyScore.toFixed(1)}
              </p>
              <p className="text-sm text-gray-600">Privacy Score</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-600">
                {result.metrics.efficiency.toFixed(1)}
              </p>
              <p className="text-sm text-gray-600">Efficiency</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Budget Allocation</h3>
          <BudgetVisualizationChart
            data={result.allocations}
            type="allocation"
            height={300}
            showLegend={true}
          />
        </div>
      </div>
    )}
  </div>
);

const ScenariosTab: React.FC<{
  scenarios: SimulationScenario[];
  currentScenario: SimulationScenario | null;
  onSelectScenario: (scenario: SimulationScenario) => void;
  onCreateWhatIf: (templateId: string) => void;
  onCompareScenarios: (scenarioIds: string[]) => Promise<any>;
}> = ({ scenarios, currentScenario, onSelectScenario, onCreateWhatIf, onCompareScenarios }) => (
  <div className="px-4 sm:px-6 lg:px-8">
    <div className="mb-6">
      <h2 className="text-2xl font-bold text-gray-900">What-If Scenarios</h2>
      <p className="text-gray-600">Create and compare different budget allocation scenarios</p>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Scenario Templates</h3>
          <div className="space-y-3">
            {[
              { id: 'budget_increase_10', name: '10% Budget Increase', description: 'Increase budget by 10%' },
              { id: 'budget_decrease_20', name: '20% Budget Decrease', description: 'Decrease budget by 20%' },
              { id: 'reallocate_to_compliance', name: 'Reallocate to Compliance', description: 'Shift budget to compliance' },
              { id: 'risk_mitigation_focus', name: 'Risk Mitigation Focus', description: 'Prioritize risk mitigation' },
              { id: 'roi_optimization', name: 'ROI Optimization', description: 'Maximize return on investment' }
            ].map(template => (
              <div key={template.id} className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900">{template.name}</h4>
                <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                <button
                  onClick={() => onCreateWhatIf(template.id)}
                  className="mt-3 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                >
                  Create Scenario
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Existing Scenarios</h3>
        <div className="space-y-2">
          {scenarios.map(scenario => (
            <div
              key={scenario.id}
              className={`p-3 border rounded-lg cursor-pointer ${
                currentScenario?.id === scenario.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
              }`}
              onClick={() => onSelectScenario(scenario)}
            >
              <h4 className="font-medium text-gray-900">{scenario.name}</h4>
              <p className="text-sm text-gray-600">{scenario.type}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const OptimizationTab: React.FC<{
  result: SimulationResult | null;
  onGenerateRecommendations: () => Promise<any[]>;
}> = ({ result, onGenerateRecommendations }) => (
  <div className="px-4 sm:px-6 lg:px-8">
    <div className="mb-6">
      <h2 className="text-2xl font-bold text-gray-900">Optimization</h2>
      <p className="text-gray-600">Generate and view optimization recommendations</p>
    </div>

    {result && (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Recommendations</h3>
          <button
            onClick={onGenerateRecommendations}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Generate Recommendations
          </button>
        </div>
        
        <div className="space-y-4">
          {result.recommendations.slice(0, 3).map((rec, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-medium text-gray-900">{rec.title}</h4>
                  <p className="text-sm text-gray-600 mt-1">{rec.description}</p>
                  <span className={`inline-block px-2 py-1 text-xs rounded mt-2 ${
                    rec.priority === 'critical' ? 'bg-red-100 text-red-800' :
                    rec.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                    rec.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {rec.priority}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

const ComparisonTab: React.FC<{
  scenarios: SimulationScenario[];
  onAnalyzeHistoricalTrends: () => Promise<any>;
}> = ({ scenarios, onAnalyzeHistoricalTrends }) => (
  <div className="px-4 sm:px-6 lg:px-8">
    <div className="mb-6">
      <h2 className="text-2xl font-bold text-gray-900">Comparison & Analysis</h2>
      <p className="text-gray-600">Compare scenarios and analyze historical trends</p>
    </div>

    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Historical Analysis</h3>
        <button
          onClick={onAnalyzeHistoricalTrends}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          Analyze Trends
        </button>
      </div>
      
      <div className="text-center py-8">
        <p className="text-gray-600">Select scenarios to compare and analyze historical trends</p>
      </div>
    </div>
  </div>
);

const ExportTab: React.FC<{
  result: SimulationResult | null;
  onExport: (format: 'json' | 'csv' | 'excel' | 'pdf') => void;
}> = ({ result, onExport }) => (
  <div className="px-4 sm:px-6 lg:px-8">
    <div className="mb-6">
      <h2 className="text-2xl font-bold text-gray-900">Export Results</h2>
      <p className="text-gray-600">Export simulation results in various formats</p>
    </div>

    {result && (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Export Options</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { format: 'json', label: 'JSON', description: 'Raw data format' },
            { format: 'csv', label: 'CSV', description: 'Spreadsheet format' },
            { format: 'excel', label: 'Excel', description: 'Microsoft Excel' },
            { format: 'pdf', label: 'PDF', description: 'Report format' }
          ].map(option => (
            <button
              key={option.format}
              onClick={() => onExport(option.format as any)}
              className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 text-center"
            >
              <div className="font-medium text-gray-900">{option.label}</div>
              <div className="text-sm text-gray-600 mt-1">{option.description}</div>
            </button>
          ))}
        </div>
      </div>
    )}
  </div>
);

export default PrivacyBudgetSimulationDemo;
