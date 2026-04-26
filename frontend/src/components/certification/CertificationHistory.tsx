import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { X, Calendar, FileText, CheckCircle, AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import { Certification, ValidationRecord, ComplianceCheck } from '../../services/certificationService';

interface CertificationHistoryProps {
  certification: Certification;
  onClose: () => void;
}

const CertificationHistory: React.FC<CertificationHistoryProps> = ({
  certification,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'validation' | 'compliance'>('validation');

  const mockValidationHistory: ValidationRecord[] = [
    {
      id: 'val-1',
      validatorType: 'third_party',
      validatorName: 'EuroPrivacy Validator',
      validationDate: '2024-01-15T10:00:00Z',
      status: 'passed',
      score: 95,
      maxScore: 100,
      details: 'Full compliance with GDPR requirements',
      evidence: ['audit_report.pdf', 'compliance_checklist.xlsx']
    },
    {
      id: 'val-2',
      validatorType: 'automated',
      validatorName: 'Automated System Check',
      validationDate: '2024-01-10T15:30:00Z',
      status: 'passed',
      score: 88,
      maxScore: 100,
      details: 'Automated validation completed successfully'
    }
  ];

  const mockComplianceHistory: ComplianceCheck[] = [
    {
      id: 'comp-1',
      checkType: 'automated',
      standards: ['GDPR'],
      status: 'compliant',
      results: [
        {
          standard: 'GDPR Art. 32',
          passed: true,
          score: 90,
          maxScore: 100,
          details: 'Security of processing measures are adequate'
        },
        {
          standard: 'GDPR Art. 25',
          passed: true,
          score: 85,
          maxScore: 100,
          details: 'Data protection by design implemented'
        }
      ],
      checkedAt: '2024-01-15T10:00:00Z',
      checkedBy: 'system',
      recommendations: [
        'Continue regular security audits',
        'Update documentation regularly'
      ]
    }
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
      case 'compliant':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
      case 'non_compliant':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'pending':
      case 'pending_review':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed':
      case 'compliant':
        return 'bg-green-100 text-green-800';
      case 'failed':
      case 'non_compliant':
        return 'bg-red-100 text-red-800';
      case 'pending':
      case 'pending_review':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Certification History</h2>
            <p className="text-gray-600 mt-1">
              Track validation and compliance history for {certification.organizationName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 mb-6">
          {[
            { id: 'validation', label: 'Validation History', icon: CheckCircle },
            { id: 'compliance', label: 'Compliance History', icon: FileText }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Validation History */}
        {activeTab === 'validation' && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Validation Records</h3>
            {mockValidationHistory.map((record, index) => (
              <motion.div
                key={record.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="border rounded-lg p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center">
                    {getStatusIcon(record.status)}
                    <div className="ml-3">
                      <h4 className="font-medium text-gray-900">{record.validatorName}</h4>
                      <p className="text-sm text-gray-600">{record.validatorType} validation</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(record.status)}`}>
                      {record.status}
                    </span>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(record.validationDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                  <div>
                    <p className="text-sm text-gray-600">Score</p>
                    <p className="font-medium">{record.score}/{record.maxScore}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Date</p>
                    <p className="font-medium">{new Date(record.validationDate).toLocaleString()}</p>
                  </div>
                </div>

                <div className="mb-3">
                  <p className="text-sm text-gray-600 mb-1">Details</p>
                  <p className="text-sm text-gray-800">{record.details}</p>
                </div>

                {record.evidence && record.evidence.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Evidence Files</p>
                    <div className="flex flex-wrap gap-2">
                      {record.evidence.map((file, fileIndex) => (
                        <button
                          key={fileIndex}
                          className="flex items-center gap-1 px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm"
                        >
                          <FileText className="w-3 h-3" />
                          {file}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}

        {/* Compliance History */}
        {activeTab === 'compliance' && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Compliance Checks</h3>
            {mockComplianceHistory.map((check, index) => (
              <motion.div
                key={check.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="border rounded-lg p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center">
                    {getStatusIcon(check.status)}
                    <div className="ml-3">
                      <h4 className="font-medium text-gray-900">
                        {check.standards.join(', ')} Compliance Check
                      </h4>
                      <p className="text-sm text-gray-600">{check.checkType} check</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(check.status)}`}>
                      {check.status}
                    </span>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(check.checkedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-sm text-gray-600 mb-2">Results</p>
                  <div className="space-y-2">
                    {check.results.map((result, resultIndex) => (
                      <div key={resultIndex} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <div className="flex items-center">
                          {result.passed ? (
                            <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-red-500 mr-2" />
                          )}
                          <span className="font-medium">{result.standard}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-medium">
                            {result.score}/{result.maxScore}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mb-3">
                  <p className="text-sm text-gray-600 mb-1">Details</p>
                  <p className="text-sm text-gray-800">{check.results[0]?.details}</p>
                </div>

                {check.recommendations && check.recommendations.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Recommendations</p>
                    <ul className="list-disc list-inside text-sm text-gray-800 space-y-1">
                      {check.recommendations.map((rec, recIndex) => (
                        <li key={recIndex}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
          <button
            onClick={() => {
              toast.success('Renewal process initiated');
              onClose();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <RefreshCw className="w-4 h-4" />
            Renew Certification
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default CertificationHistory;
