import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, 
  Users, 
  Eye, 
  BarChart3, 
  Settings,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  Filter
} from 'lucide-react';

interface AnonymizationConfig {
  algorithm: 'k-anonymity' | 'l-diversity' | 't-closeness';
  k?: number;
  l?: number;
  t?: number;
  quasiIdentifiers: string[];
  sensitiveAttribute?: string;
  maxSuppressionRate?: number;
}

interface AnonymizationResult {
  anonymizedData: any[];
  metrics: {
    kValue?: number;
    lValue?: number;
    tValue?: number;
    averageEquivalenceClassSize: number;
    informationLoss: number;
    disclosureRisk: number;
    privacyUtility: number;
    reidentificationRisk: number;
    anonymityLevel: number;
    dataUtilityScore: number;
  };
  processingTime: number;
  suppressedRecords: number;
  equivalenceClasses: Array<{
    size: number;
    diversity: number;
    risk: number;
  }>;
}

interface AlgorithmInfo {
  description: string;
  parameters: Record<string, any>;
  useCases: string[];
}

export const DataAnonymization: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'configure' | 'process' | 'results'>('configure');
  const [config, setConfig] = useState<AnonymizationConfig>({
    algorithm: 'k-anonymity',
    k: 5,
    l: 3,
    t: 0.2,
    quasiIdentifiers: ['age', 'zip_code', 'gender'],
    sensitiveAttribute: 'diagnosis',
    maxSuppressionRate: 0.1
  });
  const [sampleData, setSampleData] = useState<any[]>([]);
  const [result, setResult] = useState<AnonymizationResult | null>(null);
  const [algorithms, setAlgorithms] = useState<Record<string, AlgorithmInfo>>({});
  const [processing, setProcessing] = useState(false);
  const [dataFile, setDataFile] = useState<File | null>(null);

  useEffect(() => {
    // Load sample data
    const sample = [
      { age: 25, zip_code: '10001', gender: 'M', diagnosis: 'Hypertension', income: 50000 },
      { age: 34, zip_code: '10001', gender: 'F', diagnosis: 'Diabetes', income: 65000 },
      { age: 45, zip_code: '10002', gender: 'M', diagnosis: 'Hypertension', income: 72000 },
      { age: 28, zip_code: '10002', gender: 'F', diagnosis: 'Asthma', income: 48000 },
      { age: 52, zip_code: '10003', gender: 'M', diagnosis: 'Heart Disease', income: 81000 },
      { age: 31, zip_code: '10003', gender: 'F', diagnosis: 'Diabetes', income: 59000 },
      { age: 29, zip_code: '10001', gender: 'M', diagnosis: 'Asthma', income: 55000 },
      { age: 41, zip_code: '10002', gender: 'F', diagnosis: 'Hypertension', income: 68000 },
      { age: 36, zip_code: '10003', gender: 'M', diagnosis: 'Heart Disease', income: 75000 },
      { age: 27, zip_code: '10001', gender: 'F', diagnosis: 'Diabetes', income: 46000 }
    ];
    setSampleData(sample);

    // Load algorithm information
    fetchAlgorithms();
  }, []);

  const fetchAlgorithms = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/anonymization/algorithms`);
      const data = await response.json();
      setAlgorithms(data.algorithms);
    } catch (error) {
      console.error('Failed to fetch algorithms:', error);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setDataFile(file);
      // Parse CSV file (simplified)
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const lines = text.split('\n').filter(line => line.trim());
          const headers = lines[0].split(',');
          const data = lines.slice(1).map(line => {
            const values = line.split(',');
            const record: any = {};
            headers.forEach((header, index) => {
              record[header.trim()] = values[index]?.trim();
            });
            return record;
          }).filter(record => Object.keys(record).length > 1);
          
          setSampleData(data);
          setConfig(prev => ({
            ...prev,
            quasiIdentifiers: headers.filter(h => h !== 'diagnosis' && h !== 'income')
          }));
        } catch (error) {
          console.error('Failed to parse CSV:', error);
        }
      };
      reader.readAsText(file);
    }
  };

  const validateConfig = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/anonymization/validate-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, sampleSize: sampleData.length })
      });

      const data = await response.json();
      
      if (data.validation.isValid) {
        alert('Configuration is valid!');
      } else {
        alert(`Configuration errors: ${data.validation.errors.join(', ')}`);
      }
    } catch (error) {
      console.error('Failed to validate config:', error);
      alert('Failed to validate configuration');
    }
  };

  const runAnonymization = async () => {
    setProcessing(true);
    setActiveTab('process');

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/anonymization/anonymize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: sampleData, config })
      });

      const data = await response.json();
      setResult(data.result);
      setActiveTab('results');
    } catch (error) {
      console.error('Failed to run anonymization:', error);
      alert('Failed to run anonymization');
    } finally {
      setProcessing(false);
    }
  };

  const optimizeConfig = async () => {
    setProcessing(true);

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/anonymization/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: sampleData,
          quasiIdentifiers: config.quasiIdentifiers,
          sensitiveAttribute: config.sensitiveAttribute,
          targetUtility: 0.8
        })
      });

      const data = await response.json();
      setConfig(data.optimalConfig);
      alert('Configuration optimized successfully!');
    } catch (error) {
      console.error('Failed to optimize config:', error);
      alert('Failed to optimize configuration');
    } finally {
      setProcessing(false);
    }
  };

  const downloadResult = () => {
    if (!result) return;

    // Convert to CSV
    const headers = Object.keys(result.anonymizedData[0] || {});
    const csvContent = [
      headers.join(','),
      ...result.anonymizedData.map(row => 
        headers.map(header => row[header]).join(',')
      )
    ].join('\n');

    // Download file
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'anonymized_data.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const getAlgorithmDescription = (algorithm: string) => {
    return algorithms[algorithm]?.description || '';
  };

  const getParameterControls = () => {
    switch (config.algorithm) {
      case 'k-anonymity':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">K Value</label>
              <input
                type="number"
                min="2"
                max="100"
                value={config.k}
                onChange={(e) => setConfig(prev => ({ ...prev, k: parseInt(e.target.value) }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">Minimum group size for anonymity (2-100)</p>
            </div>
          </div>
        );
      case 'l-diversity':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">K Value</label>
              <input
                type="number"
                min="2"
                max="100"
                value={config.k}
                onChange={(e) => setConfig(prev => ({ ...prev, k: parseInt(e.target.value) }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">L Value</label>
              <input
                type="number"
                min="2"
                max="50"
                value={config.l}
                onChange={(e) => setConfig(prev => ({ ...prev, l: parseInt(e.target.value) }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">Minimum distinct sensitive values per group (2-50)</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Sensitive Attribute</label>
              <input
                type="text"
                value={config.sensitiveAttribute}
                onChange={(e) => setConfig(prev => ({ ...prev, sensitiveAttribute: e.target.value }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>
        );
      case 't-closeness':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">K Value</label>
              <input
                type="number"
                min="2"
                max="100"
                value={config.k}
                onChange={(e) => setConfig(prev => ({ ...prev, k: parseInt(e.target.value) }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">T Value</label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={config.t}
                onChange={(e) => setConfig(prev => ({ ...prev, t: parseFloat(e.target.value) }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">Maximum distribution distance (0-1)</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Sensitive Attribute</label>
              <input
                type="text"
                value={config.sensitiveAttribute}
                onChange={(e) => setConfig(prev => ({ ...prev, sensitiveAttribute: e.target.value }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Data Anonymization</h1>
            <p className="text-gray-600 mt-1">Privacy-preserving data transformation</p>
          </div>
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-green-600">GDPR Compliant</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'configure', name: 'Configure', icon: Settings },
              { id: 'process', name: 'Process', icon: Database },
              { id: 'results', name: 'Results', icon: BarChart3 }
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
            {activeTab === 'configure' && (
              <motion.div
                key="configure"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Algorithm Selection */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Algorithm Selection</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {Object.entries(algorithms).map(([algorithm, info]) => (
                      <div
                        key={algorithm}
                        onClick={() => setConfig(prev => ({ ...prev, algorithm: algorithm as any }))}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                          config.algorithm === algorithm
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <h4 className="font-medium text-gray-900 capitalize">{algorithm.replace('-', ' ')}</h4>
                        <p className="text-sm text-gray-600 mt-2">{info.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Configuration Parameters */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Configuration Parameters</h3>
                  {getParameterControls()}
                </div>

                {/* Data Upload */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Data Source</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Upload CSV File</label>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleFileUpload}
                        className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:rounded-md file:border-0 file:text-sm file:font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Quasi-Identifiers</label>
                      <input
                        type="text"
                        value={config.quasiIdentifiers.join(', ')}
                        onChange={(e) => setConfig(prev => ({ 
                          ...prev, 
                          quasiIdentifiers: e.target.value.split(',').map(s => s.trim()) 
                        }))}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        placeholder="age, zip_code, gender"
                      />
                      <p className="mt-1 text-xs text-gray-500">Comma-separated column names</p>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex space-x-4">
                  <button
                    onClick={validateConfig}
                    disabled={processing}
                    className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <CheckCircle className="h-4 w-4" />
                    <span>Validate Config</span>
                  </button>
                  <button
                    onClick={optimizeConfig}
                    disabled={processing}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Settings className="h-4 w-4" />
                    <span>Optimize</span>
                  </button>
                  <button
                    onClick={runAnonymization}
                    disabled={processing || sampleData.length === 0}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Shield className="h-4 w-4" />
                    <span>Run Anonymization</span>
                  </button>
                </div>

                {/* Sample Data Preview */}
                {sampleData.length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Data Preview ({sampleData.length} records)</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            {Object.keys(sampleData[0]).map(header => (
                              <th key={header} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {sampleData.slice(0, 5).map((row, index) => (
                            <tr key={index}>
                              {Object.values(row).map((value, cellIndex) => (
                                <td key={cellIndex} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                  {value}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'process' && (
              <motion.div
                key="process"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {processing ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <span className="ml-3 text-lg font-medium text-gray-900">Processing anonymization...</span>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Shield className="h-16 w-16 text-green-500 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900">Ready to Process</h3>
                    <p className="text-gray-600 mt-2">Configure your anonymization settings and click "Run Anonymization" to begin.</p>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'results' && result && (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Metrics Summary */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center space-x-3">
                      <Users className="h-8 w-8 text-blue-600" />
                      <div>
                        <h3 className="font-medium text-blue-900">Anonymity Level</h3>
                        <p className="text-2xl font-bold text-blue-700">
                          {(result.metrics.anonymityLevel * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="flex items-center space-x-3">
                      <Shield className="h-8 w-8 text-green-600" />
                      <div>
                        <h3 className="font-medium text-green-900">Privacy Score</h3>
                        <p className="text-2xl font-bold text-green-700">
                          {(result.metrics.privacyUtility * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-yellow-50 rounded-lg p-4">
                    <div className="flex items-center space-x-3">
                      <BarChart3 className="h-8 w-8 text-yellow-600" />
                      <div>
                        <h3 className="font-medium text-yellow-900">Data Utility</h3>
                        <p className="text-2xl font-bold text-yellow-700">
                          {(result.metrics.dataUtilityScore * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-purple-50 rounded-lg p-4">
                    <div className="flex items-center space-x-3">
                      <Clock className="h-8 w-8 text-purple-600" />
                      <div>
                        <h3 className="font-medium text-purple-900">Processing Time</h3>
                        <p className="text-2xl font-bold text-purple-700">
                          {result.processingTime}ms
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Detailed Metrics */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-4">Detailed Metrics</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Algorithm:</span>
                      <span className="font-medium">{config.algorithm}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Records Processed:</span>
                      <span className="font-medium">{result.anonymizedData.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Records Suppressed:</span>
                      <span className="font-medium">{result.suppressedRecords}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Information Loss:</span>
                      <span className="font-medium">{result.metrics.informationLoss.toFixed(3)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Disclosure Risk:</span>
                      <span className="font-medium">{result.metrics.disclosureRisk.toFixed(3)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Avg Class Size:</span>
                      <span className="font-medium">{result.metrics.averageEquivalenceClassSize.toFixed(1)}</span>
                    </div>
                    {result.metrics.kValue && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">K Value:</span>
                        <span className="font-medium">{result.metrics.kValue}</span>
                      </div>
                    )}
                    {result.metrics.lValue && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">L Value:</span>
                        <span className="font-medium">{result.metrics.lValue}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex space-x-4">
                  <button
                    onClick={downloadResult}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download Results</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
