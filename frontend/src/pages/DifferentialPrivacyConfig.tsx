import React, { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import {
  Sliders,
  Shield,
  TrendingUp,
  AlertTriangle,
  Download,
  Info,
  CheckCircle,
  XCircle,
  Zap,
  Settings,
  RefreshCw,
  Upload,
  FileText
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { secureSettingsStorage } from '../services/secureSettingsStorage';
import { settingsSyncService } from '../services/settingsSync';
import { DifferentialPrivacySchema, validateSettings } from '../services/settingsValidation';

interface NoiseParameters {
  epsilon: number;
  delta: number;
  mechanism: 'laplace' | 'gaussian';
  sensitivity: number;
}

interface PrivacyUtilityTradeoff {
  epsilon: number;
  utilityScore: number;
  privacyLoss: number;
  noiseScale: number;
}

interface PresetConfig {
  id: string;
  name: string;
  description: string;
  epsilon: number;
  delta: number;
  mechanism: 'laplace' | 'gaussian';
  sensitivity: number;
  useCase: string;
}

interface ValidationWarning {
  type: 'error' | 'warning' | 'info';
  message: string;
  recommendation?: string;
}

const PRESET_CONFIGS: PresetConfig[] = [
  {
    id: 'high-privacy',
    name: 'High Privacy',
    description: 'Maximum privacy protection with significant noise',
    epsilon: 0.1,
    delta: 1e-5,
    mechanism: 'gaussian',
    sensitivity: 1.0,
    useCase: 'Sensitive personal data, medical records'
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Good balance between privacy and utility',
    epsilon: 1.0,
    delta: 1e-5,
    mechanism: 'laplace',
    sensitivity: 1.0,
    useCase: 'General analytics, business intelligence'
  },
  {
    id: 'high-utility',
    name: 'High Utility',
    description: 'Lower privacy for better data accuracy',
    epsilon: 5.0,
    delta: 1e-4,
    mechanism: 'laplace',
    sensitivity: 1.0,
    useCase: 'Public datasets, aggregated statistics'
  },
  {
    id: 'research',
    name: 'Research Grade',
    description: 'Optimized for research with controlled access',
    epsilon: 2.0,
    delta: 1e-5,
    mechanism: 'gaussian',
    sensitivity: 1.0,
    useCase: 'Academic research, controlled studies'
  }
];

const DEFAULT_PARAMETERS: NoiseParameters = {
  epsilon: 1.0,
  delta: 1e-5,
  mechanism: 'laplace',
  sensitivity: 1.0
};

const DifferentialPrivacyConfig: React.FC = () => {
  const [parameters, setParameters] = useState<NoiseParameters>(DEFAULT_PARAMETERS);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [tradeoffData, setTradeoffData] = useState<PrivacyUtilityTradeoff[]>([]);
  const [noiseDistribution, setNoiseDistribution] = useState<Array<{ x: number; y: number }>>([]);
  const [warnings, setWarnings] = useState<ValidationWarning[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'yaml'>('json');

  // Calculate noise scale based on parameters
  const calculateNoiseScale = useCallback((params: NoiseParameters): number => {
    if (params.mechanism === 'laplace') {
      return params.sensitivity / params.epsilon;
    } else {
      // Gaussian mechanism
      const sigma = (params.sensitivity * Math.sqrt(2 * Math.log(1.25 / params.delta))) / params.epsilon;
      return sigma;
    }
  }, []);

  // Calculate utility score (inverse of noise scale)
  const calculateUtilityScore = useCallback((noiseScale: number): number => {
    return Math.max(0, 100 - (noiseScale * 10));
  }, []);

  // Calculate privacy loss (higher epsilon = more privacy loss)
  const calculatePrivacyLoss = useCallback((epsilon: number): number => {
    return Math.min(100, epsilon * 20);
  }, []);

  // Generate privacy-utility trade-off data
  const generateTradeoffData = useCallback(() => {
    const data: PrivacyUtilityTradeoff[] = [];
    for (let epsilon = 0.1; epsilon <= 10; epsilon += 0.5) {
      const tempParams = { ...parameters, epsilon };
      const noiseScale = calculateNoiseScale(tempParams);
      const utilityScore = calculateUtilityScore(noiseScale);
      const privacyLoss = calculatePrivacyLoss(epsilon);

      data.push({
        epsilon,
        utilityScore,
        privacyLoss,
        noiseScale
      });
    }
    setTradeoffData(data);
  }, [parameters, calculateNoiseScale, calculateUtilityScore, calculatePrivacyLoss]);

  // Generate noise distribution data for visualization
  const generateNoiseDistribution = useCallback(() => {
    const noiseScale = calculateNoiseScale(parameters);
    const data: Array<{ x: number; y: number }> = [];
    const stdDev = parameters.mechanism === 'laplace' ? noiseScale / Math.sqrt(2) : noiseScale;

    for (let i = -4 * stdDev; i <= 4 * stdDev; i += stdDev / 10) {
      let y: number;
      if (parameters.mechanism === 'laplace') {
        y = (1 / (2 * noiseScale)) * Math.exp(-Math.abs(i) / noiseScale);
      } else {
        y = (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow(i / stdDev, 2));
      }
      data.push({ x: Number(i.toFixed(2)), y: Number(y.toFixed(4)) });
    }

    setNoiseDistribution(data);
  }, [parameters, calculateNoiseScale]);

  // Validate parameters
  const validateParameters = useCallback((params: NoiseParameters): ValidationWarning[] => {
    const warnings: ValidationWarning[] = [];

    if (params.epsilon <= 0) {
      warnings.push({
        type: 'error',
        message: 'Epsilon must be greater than 0',
        recommendation: 'Set epsilon to at least 0.01'
      });
    }

    if (params.epsilon > 100) {
      warnings.push({
        type: 'warning',
        message: 'Very high epsilon value may compromise privacy',
        recommendation: 'Consider using epsilon < 10 for better privacy protection'
      });
    }

    if (params.delta <= 0 || params.delta >= 1) {
      warnings.push({
        type: 'error',
        message: 'Delta must be between 0 and 1 (exclusive)',
        recommendation: 'Set delta to a value like 1e-5 or 1e-6'
      });
    }

    if (params.delta > 0.1 && params.epsilon < 1) {
      warnings.push({
        type: 'warning',
        message: 'High delta with low epsilon is unusual',
        recommendation: 'Consider reducing delta when using low epsilon'
      });
    }

    if (params.sensitivity <= 0) {
      warnings.push({
        type: 'error',
        message: 'Sensitivity must be greater than 0',
        recommendation: 'Set sensitivity based on your data characteristics'
      });
    }

    const noiseScale = calculateNoiseScale(params);
    if (noiseScale > 10) {
      warnings.push({
        type: 'warning',
        message: 'High noise scale may significantly impact utility',
        recommendation: 'Consider increasing epsilon or adjusting sensitivity'
      });
    }

    if (warnings.length === 0) {
      warnings.push({
        type: 'info',
        message: 'Parameters are valid and ready for use'
      });
    }

    return warnings;
  }, [calculateNoiseScale]);

  // Load settings from secure storage on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedSettings = secureSettingsStorage.get<NoiseParameters>('differential_privacy_config');

        if (savedSettings) {
          // Validate loaded settings
          const validation = validateSettings(DifferentialPrivacySchema, savedSettings);

          if (validation.success && validation.data) {
            setParameters(validation.data);
            toast.success('Settings loaded from secure storage');
          } else {
            console.error('Invalid settings in storage:', validation.errors);
            toast.error('Invalid settings found, using defaults');
          }
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };

    loadSettings();
  }, []);

  // Save settings to secure storage when parameters change
  useEffect(() => {
    const saveSettings = async () => {
      try {
        // Validate before saving
        const validation = validateSettings(DifferentialPrivacySchema, parameters);

        if (validation.success) {
          await secureSettingsStorage.set('differential_privacy_config', parameters);
        }
      } catch (error) {
        console.error('Failed to save settings:', error);
      }
    };

    saveSettings();
  }, [parameters]);

  // Update calculations when parameters change
  useEffect(() => {
    generateTradeoffData();
    generateNoiseDistribution();
    setWarnings(validateParameters(parameters));
  }, [parameters, generateTradeoffData, generateNoiseDistribution, validateParameters]);

  // Handle parameter changes
  const handleParameterChange = useCallback((key: keyof NoiseParameters, value: number | string) => {
    setParameters(prev => ({
      ...prev,
      [key]: key === 'mechanism' ? value : Number(value)
    }));
    setSelectedPreset(null);
  }, []);

  // Apply preset configuration
  const applyPreset = useCallback((preset: PresetConfig) => {
    setParameters({
      epsilon: preset.epsilon,
      delta: preset.delta,
      mechanism: preset.mechanism,
      sensitivity: preset.sensitivity
    });
    setSelectedPreset(preset.id);
    toast.success(`Applied ${preset.name} preset`);
  }, []);

  // Export configuration
  const exportConfiguration = useCallback(async () => {
    try {
      const encryptedData = await secureSettingsStorage.exportSettings(['differential_privacy_config']);

      const blob = new Blob([encryptedData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dp-config-encrypted-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('Encrypted configuration exported');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export configuration');
    }
  }, []);

  // Import configuration
  const importConfiguration = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      const content = await file.text();
      await secureSettingsStorage.importSettings(content, 'merge');

      // Reload settings
      const savedSettings = secureSettingsStorage.get<NoiseParameters>('differential_privacy_config');
      if (savedSettings) {
        const validation = validateSettings(DifferentialPrivacySchema, savedSettings);
        if (validation.success && validation.data) {
          setParameters(validation.data);
          toast.success('Configuration imported successfully');
        }
      }
    } catch (error) {
      console.error('Import failed:', error);
      toast.error('Failed to import configuration');
    }
  }, []);

  // Sync settings with backend
  const syncSettings = useCallback(async () => {
    try {
      const result = await settingsSyncService.forceSync(['differential_privacy_config']);

      if (result.success) {
        toast.success('Settings synced with backend');

        // Reload settings after sync
        const savedSettings = secureSettingsStorage.get<NoiseParameters>('differential_privacy_config');
        if (savedSettings) {
          const validation = validateSettings(DifferentialPrivacySchema, savedSettings);
          if (validation.success && validation.data) {
            setParameters(validation.data);
          }
        }
      } else {
        toast.error('Sync failed');
      }
    } catch (error) {
      console.error('Sync failed:', error);
      toast.error('Failed to sync settings');
    }
  }, []);

  // Generate noise sample from backend
  const generateNoiseSample = useCallback(async () => {
    setIsGenerating(true);
    try {
      const response = await axios.post('/api/v1/privacy/noise/generate', {
        epsilon: parameters.epsilon,
        delta: parameters.delta,
        mechanism: parameters.mechanism,
        sensitivity: parameters.sensitivity,
        sampleSize: 1000
      });

      if (response.data.success) {
        toast.success('Noise sample generated successfully');
        // Could visualize the actual sample here
      }
    } catch (error) {
      console.error('Failed to generate noise sample:', error);
      toast.error('Failed to generate noise sample');
    } finally {
      setIsGenerating(false);
    }
  }, [parameters]);

  const currentNoiseScale = calculateNoiseScale(parameters);
  const currentUtilityScore = calculateUtilityScore(currentNoiseScale);
  const currentPrivacyLoss = calculatePrivacyLoss(parameters.epsilon);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Shield className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Differential Privacy Configuration</h1>
              <p className="text-sm text-gray-600">Configure noise parameters for privacy-preserving analytics</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              onClick={() => setShowAdvanced(!showAdvanced)}
              variant="outline"
              className="flex items-center space-x-2"
            >
              <Settings className="w-4 w-4" />
              <span>{showAdvanced ? 'Simple' : 'Advanced'}</span>
            </Button>
            <Button
              onClick={syncSettings}
              variant="outline"
              className="flex items-center space-x-2"
              title="Sync with backend"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Sync</span>
            </Button>
            <label className="inline-flex">
              <Button
                variant="outline"
                className="flex items-center space-x-2 cursor-pointer"
                asChild
              >
                <span>
                  <Upload className="w-4 h-4" />
                  <span>Import</span>
                </span>
              </Button>
              <input
                type="file"
                accept=".json"
                onChange={importConfiguration}
                className="hidden"
              />
            </label>
            <Button
              onClick={exportConfiguration}
              className="flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Preset Configurations */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Preset Configurations</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PRESET_CONFIGS.map((preset) => (
            <motion.div
              key={preset.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => applyPreset(preset)}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${selectedPreset === preset.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center space-x-2 mb-2">
                <Zap className={`w-5 h-5 ${selectedPreset === preset.id ? 'text-blue-600' : 'text-gray-400'}`} />
                <h3 className="font-semibold text-gray-900">{preset.name}</h3>
              </div>
              <p className="text-sm text-gray-600 mb-2">{preset.description}</p>
              <div className="text-xs text-gray-500 space-y-1">
                <div>ε = {preset.epsilon}</div>
                <div>δ = {preset.delta.toExponential(1)}</div>
                <div>{preset.mechanism}</div>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-400">{preset.useCase}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Parameter Controls */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Noise Parameters</h2>

        <div className="space-y-6">
          {/* Epsilon Slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                Epsilon (ε) - Privacy Budget
              </label>
              <span className="text-sm font-mono text-blue-600">{parameters.epsilon.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.01"
              max="10"
              step="0.01"
              value={parameters.epsilon}
              onChange={(e) => handleParameterChange('epsilon', e.target.value)}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0.01 (High Privacy)</span>
              <span>10 (Low Privacy)</span>
            </div>
          </div>

          {/* Delta Slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                Delta (δ) - Failure Probability
              </label>
              <span className="text-sm font-mono text-blue-600">{parameters.delta.toExponential(2)}</span>
            </div>
            <input
              type="range"
              min="1e-10"
              max="1e-1"
              step="1e-6"
              value={parameters.delta}
              onChange={(e) => handleParameterChange('delta', e.target.value)}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>1e-10</span>
              <span>1e-1</span>
            </div>
          </div>

          {/* Sensitivity Slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                Sensitivity - Maximum Impact of One Record
              </label>
              <span className="text-sm font-mono text-blue-600">{parameters.sensitivity.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="10"
              step="0.1"
              value={parameters.sensitivity}
              onChange={(e) => handleParameterChange('sensitivity', e.target.value)}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0.1</span>
              <span>10</span>
            </div>
          </div>

          {/* Mechanism Selection */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Noise Mechanism
            </label>
            <div className="flex space-x-4">
              {(['laplace', 'gaussian'] as const).map((mech) => (
                <button
                  key={mech}
                  onClick={() => handleParameterChange('mechanism', mech)}
                  className={`px-4 py-2 rounded-lg border-2 transition-all ${parameters.mechanism === mech
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                >
                  {mech.charAt(0).toUpperCase() + mech.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Export Format Selection */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Export Format
            </label>
            <div className="flex space-x-4">
              {(['json', 'yaml'] as const).map((format) => (
                <button
                  key={format}
                  onClick={() => setExportFormat(format)}
                  className={`px-4 py-2 rounded-lg border-2 transition-all ${exportFormat === format
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                >
                  {format.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Validation Warnings */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Validation Status</h2>
        <div className="space-y-3">
          {warnings.map((warning, index) => (
            <div
              key={index}
              className={`flex items-start space-x-3 p-3 rounded-lg ${warning.type === 'error'
                ? 'bg-red-50 border border-red-200'
                : warning.type === 'warning'
                  ? 'bg-yellow-50 border border-yellow-200'
                  : 'bg-green-50 border border-green-200'
                }`}
            >
              {warning.type === 'error' ? (
                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              ) : warning.type === 'warning' ? (
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              ) : (
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`text-sm font-medium ${warning.type === 'error'
                  ? 'text-red-800'
                  : warning.type === 'warning'
                    ? 'text-yellow-800'
                    : 'text-green-800'
                  }`}>
                  {warning.message}
                </p>
                {warning.recommendation && (
                  <p className="text-xs text-gray-600 mt-1">Recommendation: {warning.recommendation}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Real-time Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center space-x-2 mb-2">
            <Sliders className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-medium text-gray-700">Noise Scale</h3>
          </div>
          <div className="text-3xl font-bold text-gray-900">{currentNoiseScale.toFixed(3)}</div>
          <p className="text-xs text-gray-500 mt-1">Standard deviation of noise</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center space-x-2 mb-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <h3 className="text-sm font-medium text-gray-700">Utility Score</h3>
          </div>
          <div className="text-3xl font-bold text-gray-900">{currentUtilityScore.toFixed(1)}%</div>
          <p className="text-xs text-gray-500 mt-1">Data utility estimation</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center space-x-2 mb-2">
            <Shield className="w-5 h-5 text-purple-600" />
            <h3 className="text-sm font-medium text-gray-700">Privacy Loss</h3>
          </div>
          <div className="text-3xl font-bold text-gray-900">{currentPrivacyLoss.toFixed(1)}%</div>
          <p className="text-xs text-gray-500 mt-1">Privacy budget consumption</p>
        </div>
      </div>

      {/* Privacy-Utility Trade-off Chart */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Privacy-Utility Trade-off</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={tradeoffData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="epsilon"
              label={{ value: 'Epsilon (ε)', position: 'insideBottom', offset: -5 }}
            />
            <YAxis
              label={{ value: 'Score (%)', angle: -90, position: 'insideLeft' }}
              domain={[0, 100]}
            />
            <Tooltip
              formatter={(value: number) => [value.toFixed(1), '']}
              labelFormatter={(label) => `ε = ${label}`}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="utilityScore"
              stroke="#10b981"
              strokeWidth={2}
              name="Utility Score"
              dot={{ fill: '#10b981' }}
            />
            <Line
              type="monotone"
              dataKey="privacyLoss"
              stroke="#ef4444"
              strokeWidth={2}
              name="Privacy Loss"
              dot={{ fill: '#ef4444' }}
            />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-4 flex items-center justify-center space-x-2 text-sm text-gray-600">
          <Info className="w-4 h-4" />
          <span>Current configuration marked with vertical indicator</span>
        </div>
      </div>

      {/* Noise Distribution Visualization */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Noise Distribution ({parameters.mechanism.charAt(0).toUpperCase() + parameters.mechanism.slice(1)})
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={noiseDistribution}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="x"
              label={{ value: 'Noise Value', position: 'insideBottom', offset: -5 }}
            />
            <YAxis
              label={{ value: 'Probability Density', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip
              formatter={(value: number) => [value.toFixed(4), 'Density']}
              labelFormatter={(label) => `Noise = ${label}`}
            />
            <Area
              type="monotone"
              dataKey="y"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.3}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Backend Integration */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Backend Integration</h2>
        <div className="flex items-center space-x-4">
          <button
            onClick={generateNoiseSample}
            disabled={isGenerating || warnings.some(w => w.type === 'error')}
            className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Generating...</span>
              </>
            ) : (
              <>
                <Zap className="w-5 h-5" />
                <span>Generate Noise Sample</span>
              </>
            )}
          </button>
          <div className="flex-1">
            <p className="text-sm text-gray-600">
              Generate a sample of noise using the current parameters from the backend service.
              This will create 1000 samples for testing and validation.
            </p>
          </div>
        </div>
      </div>

      {/* Information Panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start space-x-3">
          <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-semibold text-blue-900">Understanding Differential Privacy Parameters</h4>
            <div className="mt-2 space-y-2 text-sm text-blue-800">
              <p>
                <strong>Epsilon (ε)</strong>: Controls the privacy guarantee. Lower values provide stronger privacy but add more noise.
                Typical range: 0.1 to 10.
              </p>
              <p>
                <strong>Delta (δ)</strong>: Probability that the privacy guarantee fails. Usually set very small (e.g., 1e-5).
              </p>
              <p>
                <strong>Sensitivity</strong>: Maximum change in output when one record is added/removed.
                Lower sensitivity requires less noise for the same privacy level.
              </p>
              <p>
                <strong>Mechanism</strong>: Laplace is simpler and works for single queries. Gaussian is better for complex queries and compositions.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DifferentialPrivacyConfig;
