import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { X, Search, CheckCircle, AlertTriangle, ExternalLink, Shield } from 'lucide-react';
import { certificationService, Certification } from '../../services/certificationService';

const PublicVerificationPortal: React.FC = () => {
  const [verificationCode, setVerificationCode] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [certification, setCertification] = useState<Certification | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    if (!verificationCode.trim()) {
      toast.error('Please enter a verification code');
      return;
    }

    setIsSearching(true);
    setError(null);
    setCertification(null);

    try {
      const result = await certificationService.getPublicVerification(verificationCode.trim());
      if (result) {
        setCertification(result);
        toast.success('Certification verified successfully');
      } else {
        setError('Certification not found or has been revoked');
      }
    } catch (err) {
      setError('Failed to verify certification. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'validated':
        return 'text-green-600 bg-green-100';
      case 'pending':
        return 'text-yellow-600 bg-yellow-100';
      case 'expired':
        return 'text-red-600 bg-red-100';
      case 'revoked':
        return 'text-red-700 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

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
              Public Verification Portal
            </h2>
            <p className="text-gray-600 mt-1">
              Verify the authenticity of privacy certifications
            </p>
          </div>
          <button
            onClick={() => window.history.back()}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {!certification && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter Verification Code
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleVerify()}
                  placeholder="Enter certification verification code"
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg font-mono"
                />
                <button
                  onClick={handleVerify}
                  disabled={isSearching}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSearching ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      Verify
                    </>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                  <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
                  <span className="text-red-800">{error}</span>
                </div>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-medium text-blue-900 mb-2">How to verify a certification:</h3>
              <ol className="list-decimal list-inside text-sm text-blue-800 space-y-1">
                <li>Locate the verification code on the certification badge or document</li>
                <li>Enter the code in the field above</li>
                <li>Click "Verify" to check certification status</li>
                <li>Review the certification details and validity</li>
              </ol>
            </div>
          </div>
        )}

        {certification && (
          <div className="space-y-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                <span className="text-green-800 font-medium">Certification Verified Successfully</span>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Certification Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Organization</p>
                  <p className="font-medium text-gray-900">{certification.organizationName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Certification Type</p>
                  <p className="font-medium text-gray-900">{certification.certificationType}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(certification.status)}`}>
                    {certification.status}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Privacy Level</p>
                  <p className="font-medium text-gray-900">{certification.privacyLevel}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Issued Date</p>
                  <p className="font-medium text-gray-900">
                    {new Date(certification.issuedDate).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Expiry Date</p>
                  <p className="font-medium text-gray-900">
                    {new Date(certification.expiryDate).toLocaleDateString()}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-600">Verification Code</p>
                  <code className="text-sm bg-gray-100 px-2 py-1 rounded font-mono">
                    {certification.verificationCode}
                  </code>
                </div>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="font-medium text-yellow-900 mb-2">Important Notice</h3>
              <p className="text-sm text-yellow-800">
                This verification confirms the authenticity of the certification at the time of verification. 
                For the most current status, please contact the issuing organization directly.
              </p>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => {
                  setCertification(null);
                  setVerificationCode('');
                  setError(null);
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Verify Another Certificate
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default PublicVerificationPortal;
