import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Shield, 
  Users, 
  Eye, 
  Lock, 
  Settings, 
  AlertCircle,
  CheckCircle,
  Info,
  BarChart3,
  Filter,
  Database
} from 'lucide-react';

interface PrivacyComponentProps {
  config?: Record<string, any>;
  onConfigChange?: (config: Record<string, any>) => void;
}

export const DifferentialPrivacyComponent: React.FC<PrivacyComponentProps> = ({ 
  config = {}, 
  onConfigChange 
}) => {
  const [epsilon, setEpsilon] = useState(config.epsilon || 0.1);
  const [mechanism, setMechanism] = useState(config.mechanism || 'laplace');

  const updateConfig = (newConfig: Record<string, any>) => {
    const updated = { ...config, ...newConfig };
    onConfigChange?.(updated);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center mb-4">
        <div className="p-2 bg-purple-500 rounded-lg">
          <Shield className="h-5 w-5 text-white" />
        </div>
        <div className="ml-3">
          <h3 className="font-semibold text-gray-900">Differential Privacy</h3>
          <p className="text-sm text-gray-600">Add mathematical noise to protect individual records</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Privacy Budget (ε)
            <span className="ml-1 text-xs text-gray-500">
              (Lower = More Privacy, Higher = More Accuracy)
            </span>
          </label>
          <div className="flex items-center space-x-4">
            <input
              type="range"
              min="0.01"
              max="1.0"
              step="0.01"
              value={epsilon}
              onChange={(e) => {
                setEpsilon(parseFloat(e.target.value));
                updateConfig({ epsilon: parseFloat(e.target.value) });
              }}
              className="flex-1"
            />
            <span className="text-sm font-medium text-gray-900 w-12">{epsilon}</span>
          </div>
          <div className="mt-2 flex items-center">
            <Info className="h-4 w-4 text-blue-500 mr-1" />
            <span className="text-xs text-gray-600">
              Current privacy level: {epsilon < 0.1 ? 'High' : epsilon < 0.5 ? 'Medium' : 'Low'}
            </span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Noise Mechanism
          </label>
          <select
            value={mechanism}
            onChange={(e) => {
              setMechanism(e.target.value);
              updateConfig({ mechanism: e.target.value });
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="laplace">Laplace Mechanism</option>
            <option value="gaussian">Gaussian Mechanism</option>
            <option value="exponential">Exponential Mechanism</option>
          </select>
        </div>

        <div className="bg-blue-50 rounded-lg p-3">
          <div className="flex items-start">
            <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5" />
            <div className="ml-2">
              <p className="text-sm text-blue-800">
                This component adds calibrated noise to your query results, ensuring that 
                individual data points cannot be identified while maintaining statistical utility.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const KAnonymityComponent: React.FC<PrivacyComponentProps> = ({ 
  config = {}, 
  onConfigChange 
}) => {
  const [kValue, setKValue] = useState(config.kValue || 5);
  const [quasiIdentifiers, setQuasiIdentifiers] = useState(config.quasiIdentifiers || []);

  const updateConfig = (newConfig: Record<string, any>) => {
    const updated = { ...config, ...newConfig };
    onConfigChange?.(updated);
  };

  const addQuasiIdentifier = () => {
    const newId = `field_${quasiIdentifiers.length + 1}`;
    const updated = [...quasiIdentifiers, { id: newId, name: '', type: 'categorical' }];
    setQuasiIdentifiers(updated);
    updateConfig({ quasiIdentifiers: updated });
  };

  const updateQuasiIdentifier = (index: number, field: string, value: any) => {
    const updated = quasiIdentifiers.map((qi, i) => 
      i === index ? { ...qi, [field]: value } : qi
    );
    setQuasiIdentifiers(updated);
    updateConfig({ quasiIdentifiers: updated });
  };

  const removeQuasiIdentifier = (index: number) => {
    const updated = quasiIdentifiers.filter((_, i) => i !== index);
    setQuasiIdentifiers(updated);
    updateConfig({ quasiIdentifiers: updated });
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center mb-4">
        <div className="p-2 bg-green-500 rounded-lg">
          <Users className="h-5 w-5 text-white" />
        </div>
        <div className="ml-3">
          <h3 className="font-semibold text-gray-900">K-Anonymity</h3>
          <p className="text-sm text-gray-600">Ensure each record is indistinguishable from at least K others</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            K Value
            <span className="ml-1 text-xs text-gray-500">
              (Minimum group size for anonymity)
            </span>
          </label>
          <div className="flex items-center space-x-4">
            <input
              type="range"
              min="2"
              max="50"
              step="1"
              value={kValue}
              onChange={(e) => {
                setKValue(parseInt(e.target.value));
                updateConfig({ kValue: parseInt(e.target.value) });
              }}
              className="flex-1"
            />
            <span className="text-sm font-medium text-gray-900 w-8">{kValue}</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">
              Quasi-Identifiers
            </label>
            <button
              onClick={addQuasiIdentifier}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              + Add Field
            </button>
          </div>
          
          <div className="space-y-2">
            {quasiIdentifiers.map((qi, index) => (
              <div key={qi.id} className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="Field name"
                  value={qi.name}
                  onChange={(e) => updateQuasiIdentifier(index, 'name', e.target.value)}
                  className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                />
                <select
                  value={qi.type}
                  onChange={(e) => updateQuasiIdentifier(index, 'type', e.target.value)}
                  className="px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                >
                  <option value="categorical">Categorical</option>
                  <option value="numerical">Numerical</option>
                  <option value="temporal">Temporal</option>
                </select>
                <button
                  onClick={() => removeQuasiIdentifier(index)}
                  className="p-1 text-red-500 hover:text-red-700"
                >
                  <AlertCircle className="h-4 w-4" />
                </button>
              </div>
            ))}
            
            {quasiIdentifiers.length === 0 && (
              <div className="text-center py-4 text-gray-500 text-sm">
                No quasi-identifiers defined. Add fields to anonymize.
              </div>
            )}
          </div>
        </div>

        <div className="bg-green-50 rounded-lg p-3">
          <div className="flex items-start">
            <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
            <div className="ml-2">
              <p className="text-sm text-green-800">
                K-Anonymity ensures that any individual's record cannot be distinguished from 
                at least K-1 other records in the dataset.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const DataMaskingComponent: React.FC<PrivacyComponentProps> = ({ 
  config = {}, 
  onConfigChange 
}) => {
  const [maskingRules, setMaskingRules] = useState(config.maskingRules || []);
  const [maskingType, setMaskingType] = useState('partial');

  const updateConfig = (newConfig: Record<string, any>) => {
    const updated = { ...config, ...newConfig };
    onConfigChange?.(updated);
  };

  const addMaskingRule = () => {
    const newRule = {
      id: `rule_${maskingRules.length + 1}`,
      field: '',
      type: maskingType,
      pattern: ''
    };
    const updated = [...maskingRules, newRule];
    setMaskingRules(updated);
    updateConfig({ maskingRules: updated });
  };

  const updateMaskingRule = (index: number, field: string, value: any) => {
    const updated = maskingRules.map((rule, i) => 
      i === index ? { ...rule, [field]: value } : rule
    );
    setMaskingRules(updated);
    updateConfig({ maskingRules: updated });
  };

  const removeMaskingRule = (index: number) => {
    const updated = maskingRules.filter((_, i) => i !== index);
    setMaskingRules(updated);
    updateConfig({ maskingRules: updated });
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center mb-4">
        <div className="p-2 bg-orange-500 rounded-lg">
          <Eye className="h-5 w-5 text-white" />
        </div>
        <div className="ml-3">
          <h3 className="font-semibold text-gray-900">Data Masking</h3>
          <p className="text-sm text-gray-600">Hide or obscure sensitive information</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">
              Masking Rules
            </label>
            <button
              onClick={addMaskingRule}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              + Add Rule
            </button>
          </div>
          
          <div className="space-y-2">
            {maskingRules.map((rule, index) => (
              <div key={rule.id} className="border border-gray-200 rounded-lg p-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Field name"
                    value={rule.field}
                    onChange={(e) => updateMaskingRule(index, 'field', e.target.value)}
                    className="px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                  />
                  <select
                    value={rule.type}
                    onChange={(e) => updateMaskingRule(index, 'type', e.target.value)}
                    className="px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="partial">Partial Mask (****)</option>
                    <option value="full">Full Mask (***** )</option>
                    <option value="hash">Hash (SHA256)</option>
                    <option value="tokenize">Tokenize</option>
                    <option value="null">Replace with NULL</option>
                  </select>
                  <button
                    onClick={() => removeMaskingRule(index)}
                    className="p-1 text-red-500 hover:text-red-700"
                  >
                    <AlertCircle className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            
            {maskingRules.length === 0 && (
              <div className="text-center py-4 text-gray-500 text-sm">
                No masking rules defined. Add rules to protect sensitive fields.
              </div>
            )}
          </div>
        </div>

        <div className="bg-orange-50 rounded-lg p-3">
          <div className="flex items-start">
            <Lock className="h-4 w-4 text-orange-500 mt-0.5" />
            <div className="ml-2">
              <p className="text-sm text-orange-800">
                Data masking replaces sensitive information with masked values while preserving 
                the format and structure of the original data.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AggregationComponent: React.FC<PrivacyComponentProps> = ({ 
  config = {}, 
  onConfigChange 
}) => {
  const [aggregationType, setAggregationType] = useState(config.aggregationType || 'sum');
  const [groupBy, setGroupBy] = useState(config.groupBy || []);
  const [havingClause, setHavingClause] = useState(config.havingClause || '');

  const updateConfig = (newConfig: Record<string, any>) => {
    const updated = { ...config, ...newConfig };
    onConfigChange?.(updated);
  };

  const addGroupByField = () => {
    const updated = [...groupBy, { field: '', alias: '' }];
    setGroupBy(updated);
    updateConfig({ groupBy: updated });
  };

  const updateGroupByField = (index: number, field: string, value: any) => {
    const updated = groupBy.map((gb, i) => 
      i === index ? { ...gb, [field]: value } : gb
    );
    setGroupBy(updated);
    updateConfig({ groupBy: updated });
  };

  const removeGroupByField = (index: number) => {
    const updated = groupBy.filter((_, i) => i !== index);
    setGroupBy(updated);
    updateConfig({ groupBy: updated });
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center mb-4">
        <div className="p-2 bg-blue-500 rounded-lg">
          <BarChart3 className="h-5 w-5 text-white" />
        </div>
        <div className="ml-3">
          <h3 className="font-semibold text-gray-900">Privacy-Preserving Aggregation</h3>
          <p className="text-sm text-gray-600">Aggregate data with built-in privacy protections</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Aggregation Function
          </label>
          <select
            value={aggregationType}
            onChange={(e) => {
              setAggregationType(e.target.value);
              updateConfig({ aggregationType: e.target.value });
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="sum">Sum</option>
            <option value="count">Count</option>
            <option value="avg">Average</option>
            <option value="min">Minimum</option>
            <option value="max">Maximum</option>
            <option value="median">Median</option>
            <option value="percentile">Percentile</option>
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">
              Group By Fields
            </label>
            <button
              onClick={addGroupByField}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              + Add Field
            </button>
          </div>
          
          <div className="space-y-2">
            {groupBy.map((gb, index) => (
              <div key={index} className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="Field name"
                  value={gb.field}
                  onChange={(e) => updateGroupByField(index, 'field', e.target.value)}
                  className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                />
                <input
                  type="text"
                  placeholder="Alias (optional)"
                  value={gb.alias}
                  onChange={(e) => updateGroupByField(index, 'alias', e.target.value)}
                  className="px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={() => removeGroupByField(index)}
                  className="p-1 text-red-500 hover:text-red-700"
                >
                  <AlertCircle className="h-4 w-4" />
                </button>
              </div>
            ))}
            
            {groupBy.length === 0 && (
              <div className="text-center py-4 text-gray-500 text-sm">
                No grouping fields added. Results will be aggregated across all data.
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Having Clause (Optional)
          </label>
          <textarea
            placeholder="e.g., count > 10"
            value={havingClause}
            onChange={(e) => {
              setHavingClause(e.target.value);
              updateConfig({ havingClause: e.target.value });
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={2}
          />
        </div>

        <div className="bg-blue-50 rounded-lg p-3">
          <div className="flex items-start">
            <Filter className="h-4 w-4 text-blue-500 mt-0.5" />
            <div className="ml-2">
              <p className="text-sm text-blue-800">
                This aggregation component automatically applies differential privacy to 
                protect individual contributions while maintaining statistical accuracy.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const DataSourceComponent: React.FC<PrivacyComponentProps> = ({ 
  config = {}, 
  onConfigChange 
}) => {
  const [sourceType, setSourceType] = useState(config.sourceType || 'database');
  const [connectionString, setConnectionString] = useState(config.connectionString || '');
  const [tableName, setTableName] = useState(config.tableName || '');
  const [encryptionEnabled, setEncryptionEnabled] = useState(config.encryptionEnabled || true);

  const updateConfig = (newConfig: Record<string, any>) => {
    const updated = { ...config, ...newConfig };
    onConfigChange?.(updated);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center mb-4">
        <div className="p-2 bg-gray-500 rounded-lg">
          <Database className="h-5 w-5 text-white" />
        </div>
        <div className="ml-3">
          <h3 className="font-semibold text-gray-900">Encrypted Data Source</h3>
          <p className="text-sm text-gray-600">Connect to secure and encrypted data sources</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Source Type
          </label>
          <select
            value={sourceType}
            onChange={(e) => {
              setSourceType(e.target.value);
              updateConfig({ sourceType: e.target.value });
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="database">Database</option>
            <option value="file">Encrypted File</option>
            <option value="api">Secure API</option>
            <option value="data-lake">Data Lake</option>
          </select>
        </div>

        {sourceType === 'database' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Connection String
              </label>
              <input
                type="password"
                placeholder="postgresql://user:pass@host:port/db"
                value={connectionString}
                onChange={(e) => {
                  setConnectionString(e.target.value);
                  updateConfig({ connectionString: e.target.value });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Table/Collection Name
              </label>
              <input
                type="text"
                placeholder="customers"
                value={tableName}
                onChange={(e) => {
                  setTableName(e.target.value);
                  updateConfig({ tableName: e.target.value });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </>
        )}

        {sourceType === 'file' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Encrypted File Path
            </label>
            <input
              type="text"
              placeholder="/path/to/encrypted/data.csv.enc"
              value={connectionString}
              onChange={(e) => {
                setConnectionString(e.target.value);
                updateConfig({ connectionString: e.target.value });
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        )}

        <div>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="encryption"
              checked={encryptionEnabled}
              onChange={(e) => {
                setEncryptionEnabled(e.target.checked);
                updateConfig({ encryptionEnabled: e.target.checked });
              }}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="encryption" className="ml-2 text-sm text-gray-700">
              Enable end-to-end encryption
            </label>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-start">
            <Lock className="h-4 w-4 text-gray-500 mt-0.5" />
            <div className="ml-2">
              <p className="text-sm text-gray-800">
                All data connections are secured with TLS 1.3 and AES-256 encryption. 
                Your data never leaves the secure environment in unencrypted form.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
