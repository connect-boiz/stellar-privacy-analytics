import React from 'react';
import { Eye, EyeOff, Download, RefreshCw, Database, Shield } from 'lucide-react';

interface DataPreviewProps {
  data: any[];
  isLoading?: boolean;
  isAnonymized?: boolean;
  onToggleAnonymization?: () => void;
  onRefresh?: () => void;
  onDownload?: () => void;
}

export const DataPreview: React.FC<DataPreviewProps> = ({
  data,
  isLoading = false,
  isAnonymized = true,
  onToggleAnonymization,
  onRefresh,
  onDownload
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500">
        <Database className="w-12 h-12 mb-3 opacity-50" />
        <p className="text-sm">No data available</p>
        <p className="text-xs mt-1 opacity-75">Data will appear here when computation starts</p>
      </div>
    );
  }

  const columns = Object.keys(data[0] || {});
  const sampleData = data.slice(0, 10); // Show only first 10 rows

  const getCellValue = (value: any, isAnonymized: boolean) => {
    if (value === null || value === undefined) return '—';
    
    if (isAnonymized) {
      // Simple anonymization logic
      if (typeof value === 'string') {
        if (value.length <= 2) return '*'.repeat(value.length);
        return value.substring(0, 2) + '*'.repeat(value.length - 2);
      } else if (typeof value === 'number') {
        return Math.round(value * 0.9 + Math.random() * value * 0.2).toString();
      }
      return '***';
    }
    
    return value.toString();
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <Database className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Data Preview</span>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
            {data.length} rows
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          {/* Anonymization Toggle */}
          <button
            onClick={onToggleAnonymization}
            className={`flex items-center space-x-1 px-2 py-1 rounded text-xs transition-colors ${
              isAnonymized 
                ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            title={isAnonymized ? 'Show real data' : 'Hide sensitive data'}
          >
            <Shield className="w-3 h-3" />
            <span>{isAnonymized ? 'Anonymized' : 'Real'}</span>
          </button>

          {/* Refresh */}
          <button
            onClick={onRefresh}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Refresh data"
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {/* Download */}
          <button
            onClick={onDownload}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Download data"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center space-x-2 text-gray-500">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading data...</span>
          </div>
        </div>
      )}

      {/* Data Table */}
      {!isLoading && (
        <div className="flex-1 overflow-auto">
          <div className="min-w-full">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {columns.map((column, index) => (
                    <th
                      key={index}
                      className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sampleData.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-gray-50">
                    {columns.map((column, colIndex) => (
                      <td
                        key={colIndex}
                        className="px-4 py-2 whitespace-nowrap text-sm text-gray-900"
                      >
                        {getCellValue(row[column], isAnonymized)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Show more indicator */}
            {data.length > 10 && (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
                <div className="flex items-center justify-center text-sm text-gray-500">
                  <span>Showing 10 of {data.length} rows</span>
                  <button className="ml-2 text-blue-600 hover:text-blue-800">
                    Download full dataset
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-gray-200 px-4 py-2">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center space-x-4">
            <span>Sample data from MPC computation</span>
            {isAnonymized && (
              <span className="flex items-center space-x-1">
                <EyeOff className="w-3 h-3" />
                <span>Privacy protected</span>
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <span>Live data</span>
          </div>
        </div>
      </div>
    </div>
  );
};
