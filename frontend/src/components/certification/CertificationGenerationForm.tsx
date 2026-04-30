import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { X, Plus, FileText, Shield } from 'lucide-react';
import { CertificationRequest } from '../../services/certificationService';

interface CertificationGenerationFormProps {
  onSubmit: (request: CertificationRequest) => void;
  onClose: () => void;
}

const CertificationGenerationForm: React.FC<CertificationGenerationFormProps> = ({
  onSubmit,
  onClose
}) => {
  const [formData, setFormData] = useState<CertificationRequest>({
    analysisId: '',
    certificationType: 'GDPR',
    organizationName: '',
    contactEmail: '',
    privacyLevel: 'medium',
    customRequirements: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.analysisId || !formData.organizationName || !formData.contactEmail) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  const certificationTypes = [
    { value: 'GDPR', label: 'GDPR', description: 'General Data Protection Regulation' },
    { value: 'CCPA', label: 'CCPA', description: 'California Consumer Privacy Act' },
    { value: 'HIPAA', label: 'HIPAA', description: 'Health Insurance Portability and Accountability Act' },
    { value: 'ISO27001', label: 'ISO 27001', description: 'Information Security Management' },
    { value: 'SOC2', label: 'SOC 2', description: 'Service Organization Control 2' },
    { value: 'CUSTOM', label: 'Custom', description: 'Custom privacy certification' }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Shield className="w-6 h-6 text-blue-600" />
              Generate New Certification
            </h2>
            <p className="text-gray-600 mt-1">
              Create a new privacy certification for your analysis
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Analysis ID *
            </label>
            <input
              type="text"
              value={formData.analysisId}
              onChange={(e) => setFormData({ ...formData, analysisId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter analysis ID"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Certification Type *
            </label>
            <select
              value={formData.certificationType}
              onChange={(e) => setFormData({ ...formData, certificationType: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {certificationTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label} - {type.description}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Organization Name *
            </label>
            <input
              type="text"
              value={formData.organizationName}
              onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter organization name"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contact Email *
            </label>
            <input
              type="email"
              value={formData.contactEmail}
              onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="privacy@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Privacy Level *
            </label>
            <div className="flex gap-4">
              {[
                { value: 'low', label: 'Low', color: 'green' },
                { value: 'medium', label: 'Medium', color: 'yellow' },
                { value: 'high', label: 'High', color: 'red' }
              ].map((level) => (
                <label key={level.value} className="flex items-center">
                  <input
                    type="radio"
                    value={level.value}
                    checked={formData.privacyLevel === level.value}
                    onChange={(e) => setFormData({ ...formData, privacyLevel: e.target.value as any })}
                    className="mr-2"
                  />
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    level.color === 'green' ? 'bg-green-100 text-green-800' :
                    level.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {level.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {formData.certificationType === 'CUSTOM' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Custom Requirements
              </label>
              <textarea
                value={formData.customRequirements}
                onChange={(e) => setFormData({ ...formData, customRequirements: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={4}
                placeholder="Describe your custom privacy requirements..."
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Generate Certification
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default CertificationGenerationForm;
