import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Lock, Eye, Clock, CheckCircle, AlertTriangle } from 'lucide-react';

export const PrivacySettings: React.FC = () => {
  const [privacyLevel, setPrivacyLevel] = useState('high');
  const [dataRetention, setDataRetention] = useState('365');
  const [allowDataExport, setAllowDataExport] = useState(true);
  const [allowSharing, setAllowSharing] = useState(false);

  const privacyLevels = [
    {
      value: 'minimal',
      name: 'Minimal',
      description: 'Basic privacy protection',
      features: ['Data encryption', 'Basic access control'],
      risk: 'Low'
    },
    {
      value: 'standard',
      name: 'Standard',
      description: 'Recommended for most use cases',
      features: ['Data encryption', 'Access control', 'Audit logging'],
      risk: 'Medium'
    },
    {
      value: 'high',
      name: 'High',
      description: 'Enhanced privacy protection',
      features: ['Data encryption', 'Access control', 'Audit logging', 'Differential privacy'],
      risk: 'Low'
    },
    {
      value: 'maximum',
      name: 'Maximum',
      description: 'Highest level of privacy protection',
      features: ['Data encryption', 'Access control', 'Audit logging', 'Differential privacy', 'Zero-knowledge proofs'],
      risk: 'Very Low'
    }
  ];

  const auditLogs = [
    {
      id: 1,
      action: 'Data Access',
      resource: 'Customer Dataset',
      user: 'analyst@company.com',
      timestamp: '2024-01-15 14:30:00',
      privacyLevel: 'High',
      success: true
    },
    {
      id: 2,
      action: 'Analysis Run',
      resource: 'Sales Forecast',
      user: 'data-scientist@company.com',
      timestamp: '2024-01-15 13:45:00',
      privacyLevel: 'Maximum',
      success: true
    },
    {
      id: 3,
      action: 'Data Export Attempt',
      resource: 'User Analytics',
      user: 'unknown@external.com',
      timestamp: '2024-01-15 12:20:00',
      privacyLevel: 'High',
      success: false
    }
  ];

  const currentLevel = privacyLevels.find(level => level.value === privacyLevel);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Privacy Settings</h1>
            <p className="text-gray-600 mt-1">Manage your privacy and security preferences</p>
          </div>
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-green-600">Privacy Protected</span>
          </div>
        </div>
      </div>

      {/* Privacy Level Selection */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Privacy Level</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {privacyLevels.map((level) => (
            <motion.div
              key={level.value}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`border rounded-lg p-4 cursor-pointer transition-all ${
                privacyLevel === level.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setPrivacyLevel(level.value)}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-900">{level.name}</h3>
                <span className={`px-2 py-1 text-xs font-medium rounded ${
                  level.risk === 'Very Low' ? 'bg-green-100 text-green-700' :
                  level.risk === 'Low' ? 'bg-blue-100 text-blue-700' :
                  level.risk === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  Risk: {level.risk}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-3">{level.description}</p>
              <ul className="text-xs text-gray-500 space-y-1">
                {level.features.map((feature, index) => (
                  <li key={index} className="flex items-center">
                    <CheckCircle className="h-3 w-3 text-green-500 mr-1" />
                    {feature}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
        {currentLevel && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center">
              <Shield className="h-5 w-5 text-blue-500 mr-2" />
              <span className="text-sm font-medium text-gray-900">
                Current level: {currentLevel.name} - {currentLevel.description}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Data Management Settings */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Data Management</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">Data Retention Period</h3>
              <p className="text-sm text-gray-600">How long to retain processed data</p>
            </div>
            <select
              value={dataRetention}
              onChange={(e) => setDataRetention(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="180">180 days</option>
              <option value="365">1 year</option>
              <option value="730">2 years</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">Allow Data Export</h3>
              <p className="text-sm text-gray-600">Permit users to export analysis results</p>
            </div>
            <button
              onClick={() => setAllowDataExport(!allowDataExport)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                allowDataExport ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  allowDataExport ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">Allow Data Sharing</h3>
              <p className="text-sm text-gray-600">Share anonymized insights with partners</p>
            </div>
            <button
              onClick={() => setAllowSharing(!allowSharing)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                allowSharing ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  allowSharing ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Audit Logs */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Privacy Audit Logs</h2>
        <div className="space-y-3">
          {auditLogs.map((log) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="border border-gray-200 rounded-lg p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-lg ${
                    log.success ? 'bg-green-100' : 'bg-red-100'
                  }`}>
                    {log.success ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center">
                      <h3 className="font-medium text-gray-900">{log.action}</h3>
                      <span className={`ml-2 px-2 py-1 text-xs font-medium rounded ${
                        log.privacyLevel === 'Maximum' ? 'bg-purple-100 text-purple-700' :
                        log.privacyLevel === 'High' ? 'bg-green-100 text-green-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {log.privacyLevel}
                      </span>
                    </div>
                    <div className="flex items-center mt-1 space-x-4 text-sm text-gray-500">
                      <span>{log.resource}</span>
                      <span>{log.user}</span>
                      <span>{log.timestamp}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-medium ${
                    log.success ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {log.success ? 'Success' : 'Blocked'}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Privacy Score */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Privacy Score</h3>
            <p className="text-gray-600 mt-1">Overall privacy protection rating</p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">92/100</div>
            <div className="text-sm text-gray-600">Excellent</div>
          </div>
        </div>
        <div className="mt-4">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full"
              style={{ width: '92%' }}
            />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
          Save Privacy Settings
        </button>
      </div>
    </div>
  );
};
