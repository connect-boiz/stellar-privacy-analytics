import React, { useState } from 'react';
import { ArrowLeft, Shield, Lock, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import EncryptedDataUploadWizard from '../components/EncryptedDataUploadWizard';

const EncryptedUploadPage: React.FC = () => {
  const navigate = useNavigate();
  const [showDemo, setShowDemo] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>Back to Dashboard</span>
              </button>
              <div className="h-6 w-px bg-gray-300"></div>
              <div className="flex items-center space-x-2">
                <Shield className="w-6 h-6 text-blue-600" />
                <h1 className="text-xl font-bold text-gray-900">Encrypted Data Upload</h1>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowDemo(!showDemo)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {showDemo ? 'Hide Demo' : 'Show Demo'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav className="flex mb-8" aria-label="Breadcrumb">
          <ol className="flex items-center space-x-2 text-sm">
            <li>
              <a href="/dashboard" className="text-gray-500 hover:text-gray-700">
                Dashboard
              </a>
            </li>
            <li>
              <span className="text-gray-300">/</span>
            </li>
            <li className="text-gray-900 font-medium">Encrypted Upload</li>
          </ol>
        </nav>

        {/* Page Title */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Secure Data Upload Wizard
          </h2>
          <p className="text-gray-600">
            Upload your datasets with client-side encryption, local hashing, and blockchain verification. 
            Your data never leaves your device unencrypted.
          </p>
        </div>

        {/* Features Overview */}
        {!showDemo && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Upload className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Drag & Drop Upload</h3>
              </div>
              <p className="text-sm text-gray-600">
                Simply drag and drop your CSV or JSON files. Supports files up to 100MB with real-time validation.
              </p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Lock className="w-5 h-5 text-green-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Client-Side Encryption</h3>
              </div>
              <p className="text-sm text-gray-600">
                Your files are encrypted locally using Web Workers, ensuring data never leaves your device unencrypted.
              </p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-purple-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Privacy Standards</h3>
              </div>
              <p className="text-sm text-gray-600">
                Automatic schema validation against platform privacy standards with PII detection and warnings.
              </p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Metadata Tagging</h3>
              </div>
              <p className="text-sm text-gray-600">
                Add department, sensitivity level, date ranges, and purpose tags for better data organization.
              </p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <Shield className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Blockchain Verification</h3>
              </div>
              <p className="text-sm text-gray-600">
                Every upload creates a Stellar transaction with file hash and metadata for immutable verification.
              </p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <Upload className="w-5 h-5 text-indigo-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Undo Functionality</h3>
              </div>
              <p className="text-sm text-gray-600">
                Cancel uploads before final commit. Remove files from IPFS and cancel Stellar transactions if needed.
              </p>
            </div>
          </div>
        )}

        {/* Upload Wizard */}
        <div className="bg-white rounded-lg border border-gray-200">
          <EncryptedDataUploadWizard />
        </div>

        {/* Technical Details */}
        <div className="mt-8 bg-gray-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Technical Implementation</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-800 mb-2">Client-Side Processing</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Web Workers for non-blocking file hashing</li>
                <li>• SHA-256 hash calculation with progress tracking</li>
                <li>• AES-GCM encryption with randomly generated keys</li>
                <li>• Real-time progress bars and status updates</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-gray-800 mb-2">Blockchain Integration</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Stellar network transaction creation</li>
                <li>• IPFS decentralized storage integration</li>
                <li>• Immutable audit trail with metadata</li>
                <li>• Transaction verification and status tracking</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Security Features */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-start space-x-3">
            <Shield className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-blue-900">Security & Privacy Features</h4>
              <ul className="text-sm text-blue-800 mt-2 space-y-1">
                <li>• Zero-knowledge architecture - data never exposed to server</li>
                <li>• End-to-end encryption with client-side key generation</li>
                <li>• Automatic PII detection and privacy warnings</li>
                <li>• Immutable blockchain records for audit compliance</li>
                <li>• Secure IPFS storage with content addressing</li>
                <li>• Undo functionality for data control and GDPR compliance</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EncryptedUploadPage;
