import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Database, Upload, Lock, Eye, Download, Trash2, Search } from 'lucide-react';
import { SecureDataUpload } from '../components/SecureDataUpload';
import { UploadReceipt } from '../lib/stellarWallet';
import { toast } from 'react-hot-toast';

export const DataManagement: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);
  const [showSecureUpload, setShowSecureUpload] = useState(false);
  const [recentUploads, setRecentUploads] = useState<UploadReceipt[]>([]);

  const handleUploadComplete = (receipt: UploadReceipt) => {
    setRecentUploads(prev => [receipt, ...prev]);
    toast.success('Data uploaded successfully to Stellar blockchain!');
    setShowSecureUpload(false);
  };

  const datasets = [
    {
      id: '1',
      name: 'Customer Behavior Data',
      size: '2.4 GB',
      records: 125000,
      encrypted: true,
      privacyLevel: 'High',
      uploadedAt: '2024-01-15',
      status: 'processed'
    },
    {
      id: '2',
      name: 'Sales Q4 2023',
      size: '856 MB',
      records: 45000,
      encrypted: true,
      privacyLevel: 'Maximum',
      uploadedAt: '2024-01-10',
      status: 'processing'
    },
    {
      id: '3',
      name: 'Marketing Campaign Results',
      size: '1.2 GB',
      records: 89000,
      encrypted: true,
      privacyLevel: 'High',
      uploadedAt: '2024-01-08',
      status: 'processed'
    },
    {
      id: '4',
      name: 'User Analytics 2023',
      size: '3.7 GB',
      records: 234000,
      encrypted: true,
      privacyLevel: 'Maximum',
      uploadedAt: '2024-01-05',
      status: 'processed'
    }
  ];

  const filteredDatasets = datasets.filter(dataset =>
    dataset.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleDatasetSelection = (id: string) => {
    setSelectedDatasets(prev =>
      prev.includes(id)
        ? prev.filter(datasetId => datasetId !== id)
        : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Data Management</h1>
            <p className="text-gray-600 mt-1">Secure data storage and processing</p>
          </div>
          <div className="flex items-center space-x-2">
            <Lock className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-green-600">All Data Encrypted</span>
          </div>
        </div>
      </div>

      {/* Upload Section */}
      {!showSecureUpload ? (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Upload New Dataset</h2>
            <button
              onClick={() => setShowSecureUpload(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
            >
              <Lock className="h-4 w-4 mr-2" />
              Secure Upload
            </button>
          </div>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer">
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <div className="mt-4">
              <p className="text-lg font-medium text-gray-900">Click to start secure upload</p>
              <p className="text-sm text-gray-600 mt-1">CSV, JSON, or Parquet files up to 10GB</p>
            </div>
          </div>
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <div className="flex">
              <Lock className="h-5 w-5 text-blue-400 mt-0.5" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">Enhanced Security Features</h3>
                <p className="text-sm text-blue-700 mt-1">
                  New secure upload provides client-side encryption, zero-knowledge proofs, and Stellar blockchain integration.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <SecureDataUpload onUploadComplete={handleUploadComplete} />
      )}

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Datasets ({filteredDatasets.length})</h2>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search datasets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {selectedDatasets.length > 0 && (
              <button className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200">
                Delete Selected ({selectedDatasets.length})
              </button>
            )}
          </div>
        </div>

        {/* Dataset List */}
        <div className="space-y-3">
          {filteredDatasets.map((dataset) => (
            <motion.div
              key={dataset.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <input
                    type="checkbox"
                    checked={selectedDatasets.includes(dataset.id)}
                    onChange={() => toggleDatasetSelection(dataset.id)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Database className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="flex items-center">
                      <h3 className="font-medium text-gray-900">{dataset.name}</h3>
                      <span className={`ml-2 px-2 py-1 text-xs font-medium rounded ${
                        dataset.privacyLevel === 'Maximum' ? 'bg-purple-100 text-purple-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {dataset.privacyLevel}
                      </span>
                      {dataset.encrypted && (
                        <Lock className="ml-2 h-4 w-4 text-green-500" />
                      )}
                    </div>
                    <div className="flex items-center mt-1 space-x-4 text-sm text-gray-500">
                      <span>{dataset.size}</span>
                      <span>{dataset.records.toLocaleString()} records</span>
                      <span>Uploaded {dataset.uploadedAt}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {dataset.status === 'processing' ? (
                    <div className="flex items-center">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span className="ml-2 text-sm text-blue-600">Processing</span>
                    </div>
                  ) : (
                    <>
                      <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                        <Eye className="h-4 w-4" />
                      </button>
                      <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                        <Download className="h-4 w-4" />
                      </button>
                      <button className="p-2 text-gray-400 hover:text-red-600 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Storage Summary */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Storage Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">8.2 GB</div>
            <div className="text-sm text-gray-600 mt-1">Total Storage Used</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">{datasets.length}</div>
            <div className="text-sm text-gray-600 mt-1">Total Datasets</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">493K</div>
            <div className="text-sm text-gray-600 mt-1">Total Records</div>
          </div>
        </div>
      </div>

      {/* Privacy Information */}
      <div className="bg-green-50 rounded-lg p-6">
        <div className="flex">
          <Lock className="h-5 w-5 text-green-400 mt-0.5" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-green-800">Enterprise-Grade Security</h3>
            <div className="mt-2 text-sm text-green-700">
              <p>All datasets are protected with multiple layers of security:</p>
              <ul className="mt-2 list-disc list-inside space-y-1">
                <li>AES-256 encryption at rest and in transit</li>
                <li>Role-based access control</li>
                <li>Automatic data retention policies</li>
                <li>Complete audit logging</li>
                <li>Regular security audits and penetration testing</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
