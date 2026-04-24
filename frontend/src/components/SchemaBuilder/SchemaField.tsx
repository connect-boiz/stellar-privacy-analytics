import React from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, Eye, EyeOff } from 'lucide-react';

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

export interface DragItem {
  type: 'field' | 'connection';
  id: string;
  data: SchemaField | SchemaConnection;
}

export interface FieldControlsProps {
  field: SchemaField;
  onUpdate: (field: Partial<SchemaField>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}

export const FieldControls: React.FC<FieldControlsProps> = ({ 
  field, 
  onUpdate, 
  onRemove, 
  onDuplicate 
}) => {
  return (
    <div className="flex items-start space-x-2">
      <input
        type={field.type === 'enum' ? 'text' : field.type}
        value={field.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        className="px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        placeholder="Field name"
      />
      
      {field.type === 'enum' && (
        <select
          value={field.constraints.enumValues?.[0] || ''}
          onChange={(e) => {
            const updatedValues = field.constraints.enumValues?.includes(e.target.value) 
              ? field.constraints.enumValues.filter(v => v !== e.target.value) 
              : [...( field.constraints.enumValues || [], e.target.value)];
            onUpdate({ 
              constraints: { 
                ...field.constraints, 
                enumValues: updatedValues 
              }
            });
          }}
          className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {field.constraints.enumValues?.map((value, index) => (
            <option key={index}>{value}</option>
          ))}
        </select>
      )}
      
      {field.type === 'integer' && (
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-medium text-gray-700">Min Value</label>
            <input
              type="number"
              value={field.constraints.min || ''}
              onChange={(e) => onUpdate({ 
                constraints: { 
                  ...field.constraints, 
                  min: e.target.value ? parseInt(e.target.value) : undefined 
                }
              })}
              className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Minimum value"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Max Value</label>
            <input
              type="number"
              value={field.constraints.max || ''}
              onChange={(e) => onUpdate({ 
                constraints: { 
                  ...field.constraints, 
                  max: e.target.value ? parseInt(e.target.value) : undefined 
                }
              }}
              className="w-full px-2 py-1 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Maximum value"
            />
          </div>
        </>
      )}
      
      {field.type === 'boolean' && (
        <div className="mt-2">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => onUpdate({ required: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm text-gray-600">Required</span>
          </div>
        </>
      )}
      
      {field.type === 'string' && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-700">Pattern</label>
          <input
            type="text"
            value={field.constraints.pattern || ''}
            onChange={(e) => onUpdate({ 
              constraints: { 
                ...field.constraints, 
                pattern: e.target.value 
              }
            })}
            className="w-full px-2 py-1 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Regular expression"
          />
        </div>
      )}
      
      <div className="flex items-center space-x-2">
        <button
          onClick={onDuplicate}
          className="p-1 text-blue-500 hover:text-blue-700"
        >
          <Eye className="w-4 h-4" />
        </button>
        <button
          onClick={onRemove}
          className="p-1 text-red-500 hover:text-red-700"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default FieldControls;
