import React, { useState, useCallback, useEffect, useRef } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { v4 as uuidv4 } from 'uuid';
import { 
  ChevronRight, 
  ChevronDown, 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff, 
  Download,
  Upload,
  Settings,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Copy
} from 'lucide-react';

// Type definitions for schema fields
export interface SchemaField {
  id: string;
  name: string;
  type: 'string' | 'integer' | 'boolean' | 'enum';
  description?: string;
  constraints: {
    min?: number;
    max?: number;
    pattern?: string;
    enumValues?: string[];
  };
  position: {
    x: number;
    y: number;
  };
  required: boolean;
  visible: boolean;
}

export interface SchemaConnection {
  id: string;
  sourceFieldId: string;
  targetFieldId: string;
  type: 'one-to-one' | 'one-to-many';
}

export interface ZKConstraint {
  type: 'bounds' | 'uniqueness' | 'differential_privacy';
  fieldId: string;
  parameters: {
    min?: number;
    max?: number;
    epsilon?: number;
    delta?: number;
    confidence?: number;
    noiseScale?: number;
  };
}

export interface SchemaConfig {
  name: string;
  description?: string;
  fields: SchemaField[];
  connections: SchemaConnection[];
  constraints: ZKConstraint[];
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    version: string;
    lastTested?: Date;
    testResults?: TestResult[];
  };
}

export interface TestResult {
  success: boolean;
  timestamp: number;
  errors: string[];
  warnings: string[];
  testData: Record<string, any>;
}

export interface DragItem {
  type: 'field' | 'connection';
  id: string;
  data: SchemaField | SchemaConnection;
}

export interface DropZone {
  id: string;
  type: 'root' | 'field' | 'connection';
  fieldId?: string;
  accepts: string[];
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface SchemaBuilderProps {
  initialSchema?: Partial<SchemaConfig>;
  onSchemaChange?: (schema: SchemaConfig) => void;
  onValidationResult?: (result: TestResult) => void;
  autoSave?: boolean;
  className?: string;
}

const SchemaBuilder: React.FC<SchemaBuilderProps> = ({
  initialSchema,
  onSchemaChange,
  onValidationResult,
  autoSave = true,
  className = ''
}) => {
  const [schema, setSchema] = useState<SchemaConfig>({
    name: 'Untitled Schema',
    description: '',
    fields: [],
    connections: [],
    constraints: [],
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '1.0.0'
    },
    ...initialSchema
  });

  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [validationResult, setValidationResult] = useState<TestResult | null>(null);
  const [isAutoSaving, setIsAutoSaving] = useState(autoSave);

  // Auto-save functionality
  useEffect(() => {
    if (autoSave && schema.name !== 'Untitled Schema') {
      const timeout = setTimeout(() => {
        saveSchemaToLocalStorage(schema);
      }, 2000); // Wait 2 seconds after last change
      
      return () => clearTimeout(timeout);
    }
  }, [schema, autoSave, schema.name]);

  // Load schema from local storage on mount
  useEffect(() => {
    const savedSchema = loadSchemaFromLocalStorage();
    if (savedSchema) {
      setSchema(savedSchema);
    }
  }, []);

  const handleDragStart = useCallback((item: DragItem) => {
    setDraggedItem(item);
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
    setIsDragging(false);
  }, []);

  const addField = useCallback((type: SchemaField['type']) => {
    const newField: SchemaField = {
      id: uuidv4(),
      name: `field_${schema.fields.length + 1}`,
      type,
      description: '',
      constraints: {},
      position: {
        x: 50 + (schema.fields.length % 3) * 320,
        y: 50 + Math.floor(schema.fields.length / 3) * 150
      },
      required: false,
      visible: true
    };

    setSchema(prev => ({
      ...prev,
      fields: [...prev.fields, newField],
      metadata: {
        ...prev.metadata,
        updatedAt: new Date()
      }
    }));
  }, [schema.fields.length]);

  const removeField = useCallback((fieldId: string) => {
    setSchema(prev => ({
      ...prev,
      fields: prev.fields.filter(field => field.id !== fieldId),
      connections: prev.connections.filter(conn => 
        conn.sourceFieldId !== fieldId && conn.targetFieldId !== fieldId
      ),
      metadata: {
        ...prev.metadata,
        updatedAt: new Date()
      }
    }));
  }, []);

  const updateField = useCallback((fieldId: string, updates: Partial<SchemaField>) => {
    setSchema(prev => ({
      ...prev,
      fields: prev.fields.map(field => 
        field.id === fieldId ? { ...field, ...updates } : field
      ),
      metadata: {
        ...prev.metadata,
        updatedAt: new Date()
      }
    }));
  }, []);

  const duplicateField = useCallback((fieldId: string) => {
    const field = schema.fields.find(f => f.id === fieldId);
    if (!field) return;

    const newField: SchemaField = {
      ...field,
      id: uuidv4(),
      name: `${field.name}_copy`,
      position: {
        x: field.position.x + 320,
        y: field.position.y
      }
    };

    setSchema(prev => ({
      ...prev,
      fields: [...prev.fields, newField],
      metadata: {
        ...prev.metadata,
        updatedAt: new Date()
      }
    }));
  }, [schema.fields]);

  const testSchema = useCallback(async () => {
    if (!schema.fields.length) {
      const result: TestResult = {
        success: false,
        timestamp: Date.now(),
        errors: ['No fields defined in schema'],
        warnings: [],
        testData: {}
      };
      setValidationResult(result);
      onValidationResult?.(result);
      return result;
    }

    const testData = generateTestData(schema);
    const startTime = Date.now();
    
    try {
      // This would integrate with your Rust backend verifier
      const result = await validateSchemaWithRust(schema, testData);
      const endTime = Date.now();
      
      const testResult: TestResult = {
        success: result.success,
        timestamp: endTime,
        errors: result.errors || [],
        warnings: result.warnings || [],
        testData
      };
      
      setValidationResult(testResult);
      onValidationResult?.(testResult);
      
      // Update schema metadata
      setSchema(prev => ({
        ...prev,
        metadata: {
          ...prev.metadata,
          lastTested: new Date(),
          testResults: [...(prev.metadata.testResults || []), testResult]
        }
      }));
      
      return testResult;
    } catch (error) {
      const testResult: TestResult = {
        success: false,
        timestamp: Date.now(),
        errors: [error.message],
        warnings: [],
        testData
      };
      
      setValidationResult(testResult);
      onValidationResult?.(testResult);
      return testResult;
    }
  }, [schema]);

  const generateTestData = (schema: SchemaConfig): Record<string, any> => {
    const testData: Record<string, any> = {};
    
    for (const field of schema.fields) {
      switch (field.type) {
        case 'string':
          testData[field.name] = field.description || 'sample_string';
          break;
        case 'integer':
          testData[field.name] = field.constraints.min || 0;
          if (field.constraints.max !== undefined) {
            testData[field.name] = Math.min(field.constraints.max, field.constraints.min + 100);
          }
          break;
        case 'boolean':
          testData[field.name] = Math.random() > 0.5;
          break;
        case 'enum':
          if (field.constraints.enumValues && field.constraints.enumValues.length > 0) {
            testData[field.name] = field.constraints.enumValues[0];
          }
          break;
        default:
          testData[field.name] = null;
          break;
      }
    }
    
    return testData;
  };

  const generateJSONSchema = (): string => {
    const jsonSchema = {
      $schema: 'https://json-schema.org/draft/2020-12',
      type: 'object',
      properties: {},
      required: ['name'],
      additionalProperties: false
    };

    // Add schema properties
    jsonSchema.properties.name = {
      type: 'string',
      description: 'Schema name'
    };
    
    jsonSchema.properties.description = {
      type: 'string',
      description: 'Schema description'
    };

    // Add field properties
    const fieldProperties: Record<string, any> = {};
    const requiredFields: string[] = [];

    for (const field of schema.fields) {
      const fieldSchema: any = {
        type: field.type,
        description: field.description || `Field: ${field.name}`
      };

      // Add constraints based on type
      if (field.type === 'integer') {
        if (field.constraints.min !== undefined) {
          fieldSchema.minimum = field.constraints.min;
        }
        if (field.constraints.max !== undefined) {
          fieldSchema.maximum = field.constraints.max;
        }
      }

      if (field.type === 'string' && field.constraints.pattern) {
        fieldSchema.pattern = field.constraints.pattern;
      }

      if (field.type === 'enum' && field.constraints.enumValues) {
        fieldSchema.enum = field.constraints.enumValues;
      }

      if (field.required) {
        requiredFields.push(field.name);
      }

      fieldProperties[field.name] = fieldSchema;
    }

    jsonSchema.properties.fields = {
      type: 'object',
      properties: fieldProperties,
      required: requiredFields,
      additionalProperties: false
    };

    // Add connections
    if (schema.connections.length > 0) {
      jsonSchema.properties.connections = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            sourceFieldId: { type: 'string' },
            targetFieldId: { type: 'string' },
            type: { type: 'string', enum: ['one-to-one', 'one-to-many'] }
          },
          required: ['id', 'sourceFieldId', 'targetFieldId', 'type']
        }
      };
    }

    // Add constraints
    if (schema.constraints.length > 0) {
      jsonSchema.properties.constraints = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['bounds', 'uniqueness', 'differential_privacy'] },
            fieldId: { type: 'string' },
            parameters: { type: 'object' }
          },
          required: ['type', 'fieldId', 'parameters']
        }
      };
    }

    // Add metadata
    jsonSchema.properties.metadata = {
      type: 'object',
      properties: {
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        version: { type: 'string' },
        lastTested: { type: 'string', format: 'date-time' },
        testResults: { type: 'array' }
      }
    };

    return JSON.stringify(jsonSchema, null, 2);
  };

  const saveSchemaToLocalStorage = (schema: SchemaConfig): void => {
    try {
      localStorage.setItem('schema-builder-schema', JSON.stringify(schema));
      console.log('Schema saved to local storage', { schemaName: schema.name });
    } catch (error) {
      console.error('Failed to save schema to local storage:', error);
    }
  };

  const loadSchemaFromLocalStorage = (): SchemaConfig | null => {
    try {
      const saved = localStorage.getItem('schema-builder-schema');
      return saved ? JSON.parse(saved) : null;
    } catch (error) {
      console.error('Failed to load schema from local storage:', error);
      return null;
    }
  };

  const generateFieldId = (): string => {
    return `field_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  };

  // Mock validation function - would integrate with Rust backend
  const validateSchemaWithRust = async (schema: SchemaConfig, testData: Record<string, any>) => {
    // Simulate API call to Rust backend
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simple validation logic
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const field of schema.fields) {
      if (!field.name || field.name.trim() === '') {
        errors.push(`Field ${field.id} has no name`);
      }

      if (field.type === 'integer') {
        if (field.constraints.min !== undefined && field.constraints.max !== undefined) {
          if (field.constraints.min > field.constraints.max) {
            errors.push(`Field ${field.name}: min value cannot be greater than max value`);
          }
        }
      }

      if (field.type === 'enum' && (!field.constraints.enumValues || field.constraints.enumValues.length === 0)) {
        warnings.push(`Field ${field.name}: enum type has no values defined`);
      }
    }

    return {
      success: errors.length === 0,
      errors,
      warnings
    };
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className={`schema-builder ${className}`}>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Zero-Knowledge Schema Builder
          </h1>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">
              {schema.fields.length} fields
            </span>
            <span className="text-sm text-gray-500">
              v{schema.metadata.version}
            </span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => addField('string')}
              className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              <Plus className="w-4 h-4" />
              String Field
            </button>
            
            <button
              onClick={() => addField('integer')}
              className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
            >
              <Plus className="w-4 h-4" />
              Integer Field
            </button>
            
            <button
              onClick={() => addField('boolean')}
              className="px-3 py-1 bg-purple-500 text-white rounded hover:bg-purple-600"
            >
              <Plus className="w-4 h-4" />
              Boolean Field
            </button>
            
            <button
              onClick={() => addField('enum')}
              className="px-3 py-1 bg-orange-500 text-white rounded hover:bg-orange-600"
            >
              <Plus className="w-4 h-4" />
              Enum Field
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={testSchema}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              disabled={!schema.fields.length}
            >
              <CheckCircle className="w-4 h-4" />
              Test Schema
            </button>
            
            <button
              onClick={() => {
                const jsonSchema = generateJSONSchema();
                navigator.clipboard.writeText(jsonSchema);
              }}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
              disabled={!schema.fields.length}
            >
              <Download className="w-4 h-4" />
              Export JSON
            </button>
            
            <button
              onClick={() => saveSchemaToLocalStorage(schema)}
              className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
            >
              <Upload className="w-4 h-4" />
              Save
            </button>
            
            <button
              onClick={() => {
                if (confirm('Clear all fields and start over?')) {
                  setSchema({
                    name: 'Untitled Schema',
                    fields: [],
                    connections: [],
                    constraints: [],
                    metadata: {
                      createdAt: new Date(),
                      updatedAt: new Date(),
                      version: '1.0.0'
                    }
                  });
                }
              }}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          </div>
        </div>

        {/* Schema Info */}
        <div className="mb-4 p-4 bg-white border border-gray-200 rounded-lg">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Schema Name</label>
              <input
                type="text"
                value={schema.name}
                onChange={(e) => setSchema(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Schema name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <input
                type="text"
                value={schema.description || ''}
                onChange={(e) => setSchema(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Schema description"
              />
            </div>
          </div>
        </div>

        {/* Validation Result */}
        {validationResult && (
          <div className={`mb-4 p-4 rounded-lg ${
            validationResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center mb-2">
              {validationResult.success ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-600" />
              )}
              <span className="ml-2 font-medium">
                {validationResult.success ? 'Validation Passed' : 'Validation Failed'}
              </span>
            </div>
            
            {!validationResult.success && validationResult.errors.length > 0 && (
              <div className="text-red-700">
                <div className="font-medium text-sm mb-1">Errors:</div>
                <ul className="list-disc list-inside text-sm">
                  {validationResult.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {validationResult.warnings.length > 0 && (
              <div className="text-yellow-700">
                <div className="font-medium text-sm mb-1">Warnings:</div>
                <ul className="list-disc list-inside text-sm">
                  {validationResult.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Main Canvas */}
        <div className="relative bg-white rounded-lg shadow-lg border-2 border-gray-200 min-h-[600px] overflow-auto">
          {/* Render fields */}
          <div className="p-4 relative">
            {schema.fields.map((field) => (
              <div
                key={field.id}
                className={`mb-4 p-4 bg-white border rounded-lg shadow-sm ${
                  draggedItem?.id === field.id ? 'ring-2 ring-blue-400' : 'border-gray-200'
                }`}
                style={{
                  position: 'absolute',
                  left: field.position.x,
                  top: field.position.y,
                  width: 300,
                  zIndex: 10
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <div className={`w-6 h-6 text-white rounded flex items-center justify-center ${
                      field.type === 'string' ? 'bg-blue-500' :
                      field.type === 'integer' ? 'bg-green-500' :
                      field.type === 'boolean' ? 'bg-purple-500' :
                      'bg-orange-500'
                    }`}>
                      <span className="text-xs font-medium">
                        {field.type[0].toUpperCase()}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={field.name}
                      onChange={(e) => updateField(field.id, { name: e.target.value })}
                      className="px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Field name"
                    />
                  </div>
                  
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => duplicateField(field.id)}
                      className="p-1 text-blue-500 hover:text-blue-700"
                      title="Duplicate field"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeField(field.id)}
                      className="p-1 text-red-500 hover:text-red-700"
                      title="Remove field"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Field Details */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Type</label>
                    <select
                      value={field.type}
                      onChange={(e) => updateField(field.id, { type: e.target.value as any })}
                      className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    >
                      <option value="string">String</option>
                      <option value="integer">Integer</option>
                      <option value="boolean">Boolean</option>
                      <option value="enum">Enum</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Description</label>
                    <input
                      type="text"
                      value={field.description || ''}
                      onChange={(e) => updateField(field.id, { description: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      placeholder="Field description"
                    />
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => updateField(field.id, { required: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <label className="ml-2 text-xs font-medium text-gray-700">Required</label>
                  </div>

                  {/* Constraints */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">Constraints</label>
                    <div className="space-y-2">
                      {field.type === 'integer' && (
                        <>
                          <div>
                            <label className="block text-xs text-gray-600">Min Value</label>
                            <input
                              type="number"
                              value={field.constraints.min || ''}
                              onChange={(e) => updateField(field.id, { 
                                constraints: { 
                                  ...field.constraints, 
                                  min: e.target.value ? parseInt(e.target.value) : undefined 
                                }
                              })}
                              className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                              placeholder="Minimum value"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600">Max Value</label>
                            <input
                              type="number"
                              value={field.constraints.max || ''}
                              onChange={(e) => updateField(field.id, { 
                                constraints: { 
                                  ...field.constraints, 
                                  max: e.target.value ? parseInt(e.target.value) : undefined 
                                }
                              })}
                              className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                              placeholder="Maximum value"
                            />
                          </div>
                        </>
                      )}
                      
                      {field.type === 'string' && (
                        <div>
                          <label className="block text-xs text-gray-600">Pattern</label>
                          <input
                            type="text"
                            value={field.constraints.pattern || ''}
                            onChange={(e) => updateField(field.id, { 
                              constraints: { 
                                ...field.constraints, 
                                pattern: e.target.value 
                              }
                            })}
                            className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            placeholder="Regular expression"
                          />
                        </div>
                      )}
                      
                      {field.type === 'enum' && (
                        <div>
                          <label className="block text-xs text-gray-600">Enum Values</label>
                          <div className="space-y-1">
                            {field.constraints.enumValues?.map((value, index) => (
                              <div key={index} className="flex items-center space-x-2">
                                <input
                                  type="text"
                                  value={value}
                                  onChange={(e) => {
                                    const updatedValues = [...(field.constraints.enumValues || [])];
                                    updatedValues[index] = e.target.value;
                                    updateField(field.id, { 
                                      constraints: { 
                                        ...field.constraints,
                                        enumValues: updatedValues
                                      }
                                    });
                                  }}
                                  className="flex-1 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                />
                                <button
                                  onClick={() => {
                                    const updatedValues = field.constraints.enumValues?.filter((_, i) => i !== index) || [];
                                    updateField(field.id, { 
                                      constraints: { 
                                        ...field.constraints,
                                        enumValues: updatedValues
                                      }
                                    });
                                  }}
                                  className="p-1 text-red-500 hover:text-red-700"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                            <button
                              onClick={() => {
                                const updatedValues = [...(field.constraints.enumValues || []), ''];
                                updateField(field.id, { 
                                  constraints: { 
                                    ...field.constraints,
                                    enumValues: updatedValues
                                  }
                                });
                              }}
                              className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                            >
                              <Plus className="w-3 h-3" />
                              Add Value
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Status Bar */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gray-50 border-t border-gray-200">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600">
                {validationResult 
                  ? `✅ ${validationResult.success ? 'Validated' : 'Failed'} (${validationResult.errors.length} errors)`
                  : 'Not tested'
                }
              </div>
              <div className="text-sm text-gray-500">
                {validationResult?.timestamp ? 
                  `Last tested: ${new Date(validationResult.timestamp).toLocaleTimeString()}`
                  : ''
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    </DndProvider>
  );
};

export default SchemaBuilder;
