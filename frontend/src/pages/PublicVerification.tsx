import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { Shield, Search, CheckCircle, AlertTriangle, ExternalLink, Download } from 'lucide-react';

interface VerificationResult {
  isValid: boolean;
  certificationType: string;
  organizationName: string;
  issuedDate: string;
  expiryDate: string;
  status: string;
}

const PublicVerification: React.FC = () => {
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    if (!verificationCode.trim()) {
      toast.error('Please enter a verification code');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Mock API call - replace with actual API
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock verification result
      if (verificationCode === 'abc123def456') {
        setResult({
          isValid: true,
          certificationType: 'GDPR',
          organizationName: 'Tech Corp',
          issuedDate: '2024-01-15',
          expiryDate: '2025-01-15',
          status: 'validated',
        });
      } else if (verificationCode === 'xyz789uvw456') {
        setResult({
          isValid: false,
          certificationType: 'CCPA',
          organizationName: 'Data Inc',
          issuedDate: '2024-02-01',
          expiryDate: '2025-02-01',
          status: 'pending',
        });
      } else {
        setError('Invalid verification code. Please check and try again.');
      }
    } catch (err) {
      setError('Verification failed. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (isValid: boolean, status: string) => {
    if (isValid && status === 'validated') {
      return <CheckCircle className="w-8 h-8 text-green-500" />;
    }
    return <AlertTriangle className="w-8 h-8 text-red-500" />;
  };

  const getStatusColor = (isValid: boolean, status: string) => {
    if (isValid && status === 'validated') {
      return 'text-green-600 bg-green-50 border-green-200';
    }
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      'GDPR': 'bg-blue-100 text-blue-800',
      'CCPA': 'bg-orange-100 text-orange-800',
      'HIPAA': 'bg-purple-100 text-purple-800',
      'ISO27001': 'bg-green-100 text-green-800',
      'SOC2': 'bg-indigo-100 text-indigo-800',
      'CUSTOM': 'bg-gray-100 text-gray-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4"
          >
            <Shield className="w-8 h-8 text-white" />
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl font-bold text-gray-900 mb-4"
          >
            Privacy Certification Verification
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-gray-600 max-w-2xl mx-auto"
          >
            Verify the authenticity of privacy certifications and compliance badges issued through the Stellar Privacy Analytics platform.
          </motion.p>
        </div>

        {/* Verification Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="max-w-2xl mx-auto mb-8"
        >
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">
              Verify Certification
            </h2>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="verificationCode" className="block text-sm font-medium text-gray-700 mb-2">
                  Verification Code
                </label>
                <div className="relative">
                  <input
                    id="verificationCode"
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    placeholder="Enter the verification code from the certificate"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-12"
                    onKeyPress={(e) => e.key === 'Enter' && handleVerify()}
                  />
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <Search className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </div>

              <button
                onClick={handleVerify}
                disabled={loading}
                className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                    />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    Verify Certification
                  </>
                )}
              </button>
            </div>

            {/* Sample Codes for Demo */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-2">
                <strong>Sample verification codes for testing:</strong>
              </p>
              <div className="space-y-1">
                <p className="text-sm font-mono text-gray-700">abc123def456 - Valid GDPR Certificate</p>
                <p className="text-sm font-mono text-gray-700">xyz789uvw456 - Pending CCPA Certificate</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto mb-8"
          >
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <p className="text-red-800">{error}</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Verification Result */}
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto"
          >
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              {/* Result Header */}
              <div className={`p-6 border-b ${result.isValid && result.status === 'validated' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(result.isValid, result.status)}
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">
                        {result.isValid && result.status === 'validated' ? 'Valid Certification' : 'Invalid Certification'}
                      </h3>
                      <p className={`text-sm ${result.isValid && result.status === 'validated' ? 'text-green-600' : 'text-red-600'}`}>
                        {result.isValid && result.status === 'validated' 
                          ? 'This certification is valid and active' 
                          : 'This certification is not valid or active'}
                      </p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 text-sm font-medium rounded-full border ${getStatusColor(result.isValid, result.status)}`}>
                    {result.status}
                  </span>
                </div>
              </div>

              {/* Certification Details */}
              <div className="p-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Certification Details</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Organization</p>
                    <p className="font-medium text-gray-900">{result.organizationName}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Certification Type</p>
                    <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(result.certificationType)}`}>
                      {result.certificationType}
                    </span>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Issue Date</p>
                    <p className="font-medium text-gray-900">
                      {new Date(result.issuedDate).toLocaleDateString()}
                    </p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Expiry Date</p>
                    <p className="font-medium text-gray-900">
                      {new Date(result.expiryDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Verification Code */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-600 mb-1">Verification Code</p>
                  <p className="font-mono text-sm bg-gray-100 p-2 rounded">{verificationCode}</p>
                </div>

                {/* Actions */}
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.href);
                      toast.success('Link copied to clipboard');
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Share Verification
                  </button>
                  
                  <button
                    onClick={() => {
                      window.print();
                      toast.success('Print dialog opened');
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Information Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="max-w-4xl mx-auto mt-12"
        >
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">About Privacy Certifications</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">What is a Privacy Certification?</h3>
                <p className="text-gray-600 mb-4">
                  Privacy certifications are formal validations that an organization's data processing practices comply with specific privacy regulations and standards. They demonstrate commitment to data protection and privacy.
                </p>
                
                <h3 className="text-lg font-medium text-gray-900 mb-3">Supported Standards</h3>
                <ul className="space-y-2 text-gray-600">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    GDPR (General Data Protection Regulation)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    CCPA (California Consumer Privacy Act)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    HIPAA (Health Insurance Portability and Accountability Act)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    ISO 27001 (Information Security Management)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    SOC 2 (Service Organization Control)
                  </li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">Verification Process</h3>
                <p className="text-gray-600 mb-4">
                  Each certification issued through our platform includes a unique verification code. This code can be used to verify the authenticity and current status of the certification.
                </p>
                
                <h3 className="text-lg font-medium text-gray-900 mb-3">Certificate Status</h3>
                <ul className="space-y-2 text-gray-600">
                  <li className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span><strong>Validated:</strong> Certificate is active and valid</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                    <span><strong>Pending:</strong> Certificate is under review</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <span><strong>Expired:</strong> Certificate has expired</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-600 rounded-full"></div>
                    <span><strong>Revoked:</strong> Certificate has been revoked</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default PublicVerification;
