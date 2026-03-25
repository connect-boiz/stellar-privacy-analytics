import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Database, 
  Filter, 
  Plus, 
  Trash2, 
  Eye, 
  Save, 
  Play, 
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  Star,
  ArrowRight,
  Settings
} from 'lucide-react';
import { AggregationType, AnalysisFilter } from '@stellar/shared/types/analytics';

interface DataField {
  id: string;
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  description: string;
  sampleValues?: string[];
}

interface QueryStep {
  id: string;
  type: 'select' | 'filter' | 'aggregate' | 'group';
  field?: string;
  operator?: string;
  value?: any;
  aggregation?: AggregationType;
  label: string;
}

interface FavoriteQuery {
  id: string;
  name: string;
  description: string;
  steps: QueryStep[];
  privacyCost: number;
  createdAt: Date;
  lastUsed?: Date;
}

const mockDataFields: DataField[] = [
  {
    id: 'user_id',
    name: 'User ID',
    type: 'string',
    description: 'Unique identifier for users',
    sampleValues: ['user_123', 'user_456']
  },
  {
    id: 'transaction_amount',
    name: 'Transaction Amount',
    type: 'number',
    description: 'Amount of transaction in USD',
    sampleValues: ['100.50', '250.00', '75.25']
  },
  {
    id: 'transaction_date',
    name: 'Transaction Date',
    type: 'date',
    description: 'Date when transaction occurred',
    sampleValues: ['2024-01-15', '2024-01-16']
  },
  {
    id: 'user_type',
    name: 'User Type',
    type: 'string',
    description: 'Category of user',
    sampleValues: ['premium', 'basic', 'enterprise']
  },
  {
    id: 'is_active',
    name: 'Active Status',
    type: 'boolean',
    description: 'Whether user is currently active',
    sampleValues: ['true', 'false']
  }
];

const aggregationOptions = [
  { value: AggregationType.COUNT, label: 'Count', description: 'Number of records' },
  { value: AggregationType.SUM, label: 'Sum', description: 'Total sum of values' },
  { value: AggregationType.AVERAGE, label: 'Average', description: 'Mean value' },
  { value: AggregationType.MEDIAN, label: 'Median', description: 'Middle value' },
  { value: AggregationType.MIN, label: 'Minimum', description: 'Smallest value' },
  { value: AggregationType.MAX, label: 'Maximum', description: 'Largest value' },
  { value: AggregationType.STD_DEV, label: 'Std Dev', description: 'Standard deviation' }
];

const filterOperators = [
  { value: 'eq', label: 'Equals', types: ['string', 'number', 'boolean', 'date'] },
  { value: 'ne', label: 'Not Equals', types: ['string', 'number', 'boolean', 'date'] },
  { value: 'gt', label: 'Greater Than', types: ['number', 'date'] },
  { value: 'gte', label: 'Greater or Equal', types: ['number', 'date'] },
  { value: 'lt', label: 'Less Than', types: ['number', 'date'] },
  { value: 'lte', label: 'Less or Equal', types: ['number', 'date'] },
  { value: 'in', label: 'In List', types: ['string', 'number'] },
  { value: 'contains', label: 'Contains', types: ['string'] }
];

export const QueryConstructor: React.FC = () => {
  const [querySteps, setQuerySteps] = useState<QueryStep[]>([]);
  const [selectedField, setSelectedField] = useState<string>('');
  const [draggedStep, setDraggedStep] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [favoriteQueries, setFavoriteQueries] = useState<FavoriteQuery[]>([]);
  const [queryName, setQueryName] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [privacyCost, setPrivacyCost] = useState(0);

  const calculatePrivacyCost = useCallback((steps: QueryStep[]) => {
    let cost = 0;
    steps.forEach(step => {
      switch (step.type) {
        case 'select':
          cost += 0.1;
          break;
        case 'filter':
          cost += 0.2;
          break;
        case 'aggregate':
          cost += 0.5;
          break;
        case 'group':
          cost += 0.3;
          break;
      }
    });
    return Math.min(cost, 10); // Cap at 10 privacy units
  }, []);

  const validateQuery = useCallback((steps: QueryStep[]) => {
    const errors: string[] = [];
    
    if (steps.length === 0) {
      errors.push('Query must have at least one step');
    }

    const hasSelect = steps.some(step => step.type === 'select');
    if (!hasSelect) {
      errors.push('Query must include at least one field selection');
    }

    steps.forEach((step, index) => {
      if (step.type === 'filter' && (!step.field || !step.operator || step.value === undefined)) {
        errors.push(`Filter step ${index + 1} is incomplete`);
      }
      if (step.type === 'aggregate' && (!step.field || !step.aggregation)) {
        errors.push(`Aggregate step ${index + 1} is incomplete`);
      }
    });

    setValidationErrors(errors);
    return errors.length === 0;
  }, []);

  const addStep = useCallback((type: QueryStep['type'], field?: string) => {
    const newStep: QueryStep = {
      id: `step-${Date.now()}`,
      type,
      field: field || '',
      label: `${type.charAt(0).toUpperCase() + type.slice(1)} ${field || ''}`
    };

    setQuerySteps(prev => {
      const updated = [...prev, newStep];
      setPrivacyCost(calculatePrivacyCost(updated));
      validateQuery(updated);
      return updated;
    });
  }, [calculatePrivacyCost, validateQuery]);

  const removeStep = useCallback((stepId: string) => {
    setQuerySteps(prev => {
      const updated = prev.filter(step => step.id !== stepId);
      setPrivacyCost(calculatePrivacyCost(updated));
      validateQuery(updated);
      return updated;
    });
  }, [calculatePrivacyCost, validateQuery]);

  const updateStep = useCallback((stepId: string, updates: Partial<QueryStep>) => {
    setQuerySteps(prev => {
      const updated = prev.map(step => 
        step.id === stepId ? { ...step, ...updates } : step
      );
      setPrivacyCost(calculatePrivacyCost(updated));
      validateQuery(updated);
      return updated;
    });
  }, [calculatePrivacyCost, validateQuery]);

  const saveFavorite = useCallback(() => {
    if (!queryName.trim()) {
      setValidationErrors(['Please enter a name for your favorite query']);
      return;
    }

    const favorite: FavoriteQuery = {
      id: `fav-${Date.now()}`,
      name: queryName,
      description: `Query with ${querySteps.length} steps`,
      steps: [...querySteps],
      privacyCost,
      createdAt: new Date()
    };

    setFavoriteQueries(prev => [...prev, favorite]);
    setQueryName('');
    setValidationErrors([]);
  }, [queryName, querySteps, privacyCost]);

  const loadFavorite = useCallback((favorite: FavoriteQuery) => {
    setQuerySteps([...favorite.steps]);
    setPrivacyCost(favorite.privacyCost);
    validateQuery(favorite.steps);
  }, [validateQuery]);

  const executeQuery = useCallback(async () => {
    if (!validateQuery(querySteps)) {
      return;
    }

    // Simulate query execution
    console.log('Executing query:', querySteps);
    // In real implementation, this would call the backend API
  }, [querySteps, validateQuery]);

  const handleDragStart = (stepId: string) => {
    setDraggedStep(stepId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetStepId: string) => {
    e.preventDefault();
    if (!draggedStep || draggedStep === targetStepId) return;

    const draggedIndex = querySteps.findIndex(step => step.id === draggedStep);
    const targetIndex = querySteps.findIndex(step => step.id === targetStepId);

    const newSteps = [...querySteps];
    const [removed] = newSteps.splice(draggedIndex, 1);
    newSteps.splice(targetIndex, 0, removed);

    setQuerySteps(newSteps);
    setDraggedStep(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Query Constructor</h1>
              <p className="text-gray-600 mt-1">Build privacy-preserved queries without code</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <DollarSign className="h-5 w-5 text-yellow-500" />
                <span className="text-sm font-medium">Privacy Cost: {privacyCost.toFixed(1)}</span>
              </div>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
              >
                <Eye className="h-4 w-4 mr-2" />
                {showPreview ? 'Hide' : 'Show'} Preview
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Data Fields Panel */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center mb-4">
                <Database className="h-5 w-5 text-blue-500 mr-2" />
                <h2 className="text-lg font-semibold">Available Fields</h2>
              </div>
              <div className="space-y-2">
                {mockDataFields.map(field => (
                  <motion.div
                    key={field.id}
                    whileHover={{ scale: 1.02 }}
                    className="p-3 border border-gray-200 rounded-lg hover:border-blue-300 cursor-pointer"
                    onClick={() => {
                      setSelectedField(field.id);
                      addStep('select', field.id);
                    }}
                  >
                    <div className="font-medium text-gray-900">{field.name}</div>
                    <div className="text-sm text-gray-500 mt-1">{field.description}</div>
                    <div className="flex items-center mt-2 space-x-2">
                      <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                        {field.type}
                      </span>
                      {field.sampleValues && (
                        <span className="text-xs text-gray-500">
                          {field.sampleValues.slice(0, 2).join(', ')}
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Quick Actions */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-900 mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => addStep('filter')}
                    className="w-full flex items-center px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    Add Filter
                  </button>
                  <button
                    onClick={() => addStep('aggregate')}
                    className="w-full flex items-center px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Add Aggregation
                  </button>
                  <button
                    onClick={() => addStep('group')}
                    className="w-full flex items-center px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Group By
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Query Builder */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Query Steps</h2>
                <div className="flex items-center space-x-2">
                  {querySteps.length > 0 && (
                    <>
                      <input
                        type="text"
                        placeholder="Query name..."
                        value={queryName}
                        onChange={(e) => setQueryName(e.target.value)}
                        className="px-3 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={saveFavorite}
                        className="flex items-center px-3 py-1 text-sm bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200"
                      >
                        <Star className="h-4 w-4 mr-1" />
                        Save
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Query Steps */}
              <div className="space-y-3 min-h-[200px]">
                <AnimatePresence>
                  {querySteps.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center py-12 text-gray-500"
                    >
                      <Database className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p>Start building your query by selecting fields or adding actions</p>
                    </motion.div>
                  ) : (
                    querySteps.map((step, index) => (
                      <motion.div
                        key={step.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        draggable
                        onDragStart={() => handleDragStart(step.id)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, step.id)}
                        className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-blue-300 cursor-move"
                      >
                        <div className="flex-1">
                          <div className="flex items-center">
                            <span className="text-sm font-medium text-gray-500 mr-3">
                              Step {index + 1}
                            </span>
                            <span className="font-medium text-gray-900">{step.label}</span>
                            <ArrowRight className="h-4 w-4 mx-2 text-gray-400" />
                            
                            {/* Step-specific controls */}
                            {step.type === 'select' && (
                              <select
                                value={step.field || ''}
                                onChange={(e) => updateStep(step.id, { 
                                  field: e.target.value,
                                  label: `Select ${e.target.value}`
                                })}
                                className="px-3 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">Select field...</option>
                                {mockDataFields.map(field => (
                                  <option key={field.id} value={field.id}>{field.name}</option>
                                ))}
                              </select>
                            )}

                            {step.type === 'filter' && (
                              <div className="flex items-center space-x-2">
                                <select
                                  value={step.field || ''}
                                  onChange={(e) => updateStep(step.id, { field: e.target.value })}
                                  className="px-2 py-1 text-sm border border-gray-300 rounded-lg"
                                >
                                  <option value="">Field...</option>
                                  {mockDataFields.map(field => (
                                    <option key={field.id} value={field.id}>{field.name}</option>
                                  ))}
                                </select>
                                <select
                                  value={step.operator || ''}
                                  onChange={(e) => updateStep(step.id, { operator: e.target.value })}
                                  className="px-2 py-1 text-sm border border-gray-300 rounded-lg"
                                >
                                  <option value="">Op...</option>
                                  {filterOperators.map(op => (
                                    <option key={op.value} value={op.value}>{op.label}</option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  placeholder="Value..."
                                  value={step.value || ''}
                                  onChange={(e) => updateStep(step.id, { value: e.target.value })}
                                  className="px-2 py-1 text-sm border border-gray-300 rounded-lg"
                                />
                              </div>
                            )}

                            {step.type === 'aggregate' && (
                              <div className="flex items-center space-x-2">
                                <select
                                  value={step.field || ''}
                                  onChange={(e) => updateStep(step.id, { field: e.target.value })}
                                  className="px-2 py-1 text-sm border border-gray-300 rounded-lg"
                                >
                                  <option value="">Field...</option>
                                  {mockDataFields.filter(f => f.type === 'number').map(field => (
                                    <option key={field.id} value={field.id}>{field.name}</option>
                                  ))}
                                </select>
                                <select
                                  value={step.aggregation || ''}
                                  onChange={(e) => updateStep(step.id, { 
                                    aggregation: e.target.value as AggregationType,
                                    label: `${e.target.value} of ${step.field || 'field'}`
                                  })}
                                  className="px-2 py-1 text-sm border border-gray-300 rounded-lg"
                                >
                                  <option value="">Function...</option>
                                  {aggregationOptions.map(agg => (
                                    <option key={agg.value} value={agg.value}>{agg.label}</option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {step.type === 'group' && (
                              <select
                                value={step.field || ''}
                                onChange={(e) => updateStep(step.id, { 
                                  field: e.target.value,
                                  label: `Group by ${e.target.value}`
                                })}
                                className="px-3 py-1 text-sm border border-gray-300 rounded-lg"
                              >
                                <option value="">Select field...</option>
                                {mockDataFields.map(field => (
                                  <option key={field.id} value={field.id}>{field.name}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => removeStep(step.id)}
                          className="ml-4 p-2 text-red-500 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>

              {/* Validation Errors */}
              {validationErrors.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg"
                >
                  <div className="flex items-start">
                    <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2" />
                    <div>
                      <h4 className="text-sm font-medium text-red-800">Validation Errors</h4>
                      <ul className="mt-2 text-sm text-red-700 space-y-1">
                        {validationErrors.map((error, index) => (
                          <li key={index}>• {error}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Action Buttons */}
              {querySteps.length > 0 && (
                <div className="mt-6 flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-sm text-gray-500">
                    <Clock className="h-4 w-4" />
                    <span>Estimated time: ~{(querySteps.length * 30).toFixed(0)}s</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => setShowPreview(!showPreview)}
                      className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Preview
                    </button>
                    <button
                      onClick={executeQuery}
                      disabled={validationErrors.length > 0}
                      className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Execute Query
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Favorite Queries */}
            {favoriteQueries.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6 mt-6">
                <h2 className="text-lg font-semibold mb-4">Favorite Queries</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {favoriteQueries.map(favorite => (
                    <motion.div
                      key={favorite.id}
                      whileHover={{ scale: 1.02 }}
                      className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 cursor-pointer"
                      onClick={() => loadFavorite(favorite)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-gray-900">{favorite.name}</h3>
                          <p className="text-sm text-gray-600 mt-1">{favorite.description}</p>
                          <div className="flex items-center mt-2 space-x-3 text-xs text-gray-500">
                            <span>{favorite.steps.length} steps</span>
                            <span>Cost: {favorite.privacyCost.toFixed(1)}</span>
                            <span>{new Date(favorite.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <Star className="h-5 w-5 text-yellow-500" />
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Preview Modal */}
        <AnimatePresence>
          {showPreview && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-6 z-50"
              onClick={() => setShowPreview(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Query Preview</h3>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    ×
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-2">Generated Query</h4>
                    <pre className="text-sm text-gray-700 overflow-x-auto">
                      {JSON.stringify({
                        select: querySteps.filter(s => s.type === 'select').map(s => s.field),
                        filter: querySteps.filter(s => s.type === 'filter').map(s => ({
                          field: s.field,
                          operator: s.operator,
                          value: s.value
                        })),
                        aggregate: querySteps.filter(s => s.type === 'aggregate').map(s => ({
                          field: s.field,
                          function: s.aggregation
                        })),
                        groupBy: querySteps.filter(s => s.type === 'group').map(s => s.field)
                      }, null, 2)}
                    </pre>
                  </div>

                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-medium text-blue-900 mb-2">Privacy Analysis</h4>
                    <div className="space-y-2 text-sm text-blue-800">
                      <div className="flex items-center justify-between">
                        <span>Privacy Cost:</span>
                        <span className="font-medium">{privacyCost.toFixed(2)} units</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Risk Level:</span>
                        <span className={`font-medium ${
                          privacyCost < 2 ? 'text-green-600' : 
                          privacyCost < 5 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {privacyCost < 2 ? 'Low' : privacyCost < 5 ? 'Medium' : 'High'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Differential Privacy ε:</span>
                        <span className="font-medium">{(privacyCost * 0.1).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-green-50 rounded-lg">
                    <h4 className="font-medium text-green-900 mb-2">Execution Plan</h4>
                    <div className="space-y-1 text-sm text-green-800">
                      {querySteps.map((step, index) => (
                        <div key={step.id} className="flex items-center">
                          <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                          <span>Step {index + 1}: {step.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
