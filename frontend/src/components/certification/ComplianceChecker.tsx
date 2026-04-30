import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { X, CheckCircle, AlertTriangle, RefreshCw, Play } from 'lucide-react';
import { Certification, ComplianceCheck } from '../../services/certificationService';

interface ComplianceCheckerProps {
  certification: Certification;
  onClose: () => void;
}

const ComplianceChecker: React.FC<ComplianceCheckerProps> = ({
  certification,
  onClose
}) => {
  const [selectedStandards, setSelectedStandards] = useState<string[]>([certification.certificationType]);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<ComplianceCheck | null>(null);

  const availableStandards = [
    { id: 'GDPR', name: 'GDPR', description: 'General Data Protection Regulation' },
    { id: 'CCPA', name: 'CCPA', description: 'California Consumer Privacy Act' },
    { id: 'HIPAA', name: 'HIPAA', description: 'Health Insurance Portability and Accountability Act' },
    { id: 'ISO27001', name: 'ISO 27001', description: 'Information Security Management' },
    { id: 'SOC2', name: 'SOC 2', description: 'Service Organization Control 2' }
  ];

  const handleStandardToggle = (standard: string) => {
    setSelectedStandards(prev => 
      prev.includes(standard)
        ? prev.filter(s => s !== standard)
        : [...prev, standard]
    );
  };

  const runComplianceCheck = async () => {
    if (selectedStandards.length === 0) {
      toast.error('Please select at least one standard');
      return;
    }

    setIsRunning(true);
    try {
      // Mock compliance check
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const mockResults: ComplianceCheck = {
        id: `check-${Date.now()}`,
        checkType: 'automated',
        standards: selectedStandards,
        status: 'compliant',
        results: selectedStandards.map(standard => ({
          standard,
          passed: Math.random() > 0.2,
          score: Math.floor(Math.random() * 30) + 70,
          maxScore: 100,
          details: `Compliance check for ${standard} completed successfully`
        })),
        checkedAt: new Date().toISOString(),
        checkedBy: 'system',
        recommendations: [
          'Continue monitoring data access patterns',
          'Regular security audits recommended',
          'Update privacy policy as needed'
        ]
      };

      setResults(mockResults);
      toast.success('Compliance check completed');
    } catch (error) {
      toast.error('Failed to run compliance check');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-lg p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Automated Compliance Checking</h2>
            <p className="text-gray-600 mt-1">
              Run compliance checks against industry standards
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Select Standards</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {availableStandards.map((standard) => (
              <label
                key={standard.id}
                className="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selectedStandards.includes(standard.id)}
                  onChange={() => handleStandardToggle(standard.id)}
                  className="mt-1 mr-3"
                />
                <div>
                  <div className="font-medium text-gray-900">{standard.name}</div>
                  <div className="text-sm text-gray-600">{standard.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {results && (
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Results</h3>
            <div className="space-y-3">
              {results.results.map((result, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center">
                      {result.passed ? (
                        <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-red-500 mr-2" />
                      )}
                      <span className="font-medium">{result.standard}</span>
                    </div>
                    <div className="text-sm text-gray-600">
                      Score: {result.score}/{result.maxScore}
                    </div>
                  </div>
                  <div className="text-sm text-gray-600">{result.details}</div>
                </div>
              ))}
            </div>

            {results.recommendations && results.recommendations.length > 0 && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Recommendations</h4>
                <ul className="list-disc list-inside text-sm text-blue-800 space-y-1">
                  {results.recommendations.map((rec, index) => (
                    <li key={index}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Close
          </button>
          <button
            onClick={runComplianceCheck}
            disabled={isRunning || selectedStandards.length === 0}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Running Check...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Compliance Check
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ComplianceChecker;
