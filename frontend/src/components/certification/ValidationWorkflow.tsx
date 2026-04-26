import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { X, CheckCircle, AlertCircle, Clock, ExternalLink, FileText } from 'lucide-react';
import { Certification } from '../../services/certificationService';

interface ValidationWorkflowProps {
  certification: Certification;
  onClose: () => void;
}

const ValidationWorkflow: React.FC<ValidationWorkflowProps> = ({
  certification,
  onClose
}) => {
  const [selectedValidator, setSelectedValidator] = useState<'automated' | 'manual' | 'third_party'>('automated');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validators = [
    {
      type: 'automated' as const,
      name: 'Automated Validation',
      description: 'Quick automated compliance check using our AI-powered system',
      icon: CheckCircle,
      color: 'blue',
      duration: '2-5 minutes'
    },
    {
      type: 'manual' as const,
      name: 'Manual Review',
      description: 'Detailed manual review by our privacy experts',
      icon: FileText,
      color: 'yellow',
      duration: '1-2 business days'
    },
    {
      type: 'third_party' as const,
      name: 'Third-Party Audit',
      description: 'Independent third-party validation and certification',
      icon: ExternalLink,
      color: 'green',
      duration: '3-5 business days'
    }
  ];

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Mock validation submission
      await new Promise(resolve => setTimeout(resolve, 2000));
      toast.success(`Validation request submitted using ${selectedValidator} validator`);
      onClose();
    } catch (error) {
      toast.error('Failed to submit validation request');
    } finally {
      setIsSubmitting(false);
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
            <h2 className="text-2xl font-bold text-gray-900">
              Validation Workflow
            </h2>
            <p className="text-gray-600 mt-1">
              Choose a validation method for {certification.certificationType} certification
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
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-2">Certification Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Organization:</span>
                <span className="ml-2 font-medium">{certification.organizationName}</span>
              </div>
              <div>
                <span className="text-gray-600">Type:</span>
                <span className="ml-2 font-medium">{certification.certificationType}</span>
              </div>
              <div>
                <span className="text-gray-600">Privacy Level:</span>
                <span className="ml-2 font-medium">{certification.privacyLevel}</span>
              </div>
              <div>
                <span className="text-gray-600">Current Status:</span>
                <span className="ml-2 font-medium">{certification.status}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Select Validation Method</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {validators.map((validator) => (
              <motion.div
                key={validator.type}
                whileHover={{ scale: 1.02 }}
                onClick={() => setSelectedValidator(validator.type)}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedValidator === validator.type
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center mb-3">
                  <validator.icon className={`w-6 h-6 mr-2 ${
                    validator.color === 'blue' ? 'text-blue-600' :
                    validator.color === 'yellow' ? 'text-yellow-600' :
                    'text-green-600'
                  }`} />
                  <h4 className="font-medium text-gray-900">{validator.name}</h4>
                </div>
                <p className="text-sm text-gray-600 mb-2">{validator.description}</p>
                <div className="flex items-center text-xs text-gray-500">
                  <Clock className="w-3 h-3 mr-1" />
                  {validator.duration}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-3">Validation Process</h3>
          <div className="space-y-3">
            {[
              'Initial compliance assessment',
              'Documentation review',
              'Technical validation',
              'Final certification issuance'
            ].map((step, index) => (
              <div key={index} className="flex items-center">
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium mr-3">
                  {index + 1}
                </div>
                <span className="text-gray-700">{step}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Start Validation
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ValidationWorkflow;
