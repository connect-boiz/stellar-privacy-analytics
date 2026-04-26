import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  Lock,
  Shield,
  CheckCircle,
  AlertCircle,
  Download,
  X,
  FileText,
  Database,
  Zap
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Modal } from './ui/Modal';

import { WebCryptoService, EncryptedFile, UploadProgress } from '../lib/webCrypto';
import { ZKProofService, ZKProof } from '../lib/zkProof';
import { StellarWalletService, StellarAccount, UploadReceipt } from '../lib/stellarWallet';

interface SecureDataUploadProps {
  onUploadComplete?: (receipt: UploadReceipt) => void;
  maxFileSize?: number; // in bytes
  acceptedFormats?: string[];
}

interface UploadState {
  isUploading: boolean;
  progress: UploadProgress | null;
  stage: 'idle' | 'encrypting' | 'generating-proof' | 'uploading' | 'signing' | 'completed' | 'error';
  error?: string;
}

export const SecureDataUpload: React.FC<SecureDataUploadProps> = ({
  onUploadComplete,
  maxFileSize = 10 * 1024 * 1024 * 1024, // 10GB default
  acceptedFormats = ['.csv', '.json', '.parquet']
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    progress: null,
    stage: 'idle'
  });
  const [encryptionKey, setEncryptionKey] = useState<string>('');
  const [showReceipt, setShowReceipt] = useState<UploadReceipt | null>(null);
  const [stellarAccount, setStellarAccount] = useState<StellarAccount | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generate secure encryption key on component mount
  React.useEffect(() => {
    const key = WebCryptoService.generateSecurePassword();
    setEncryptionKey(key);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      handleFiles(files);
    }
  }, []);

  const handleFiles = (files: File[]) => {
    const validFiles = files.filter(file => {
      // Check file size
      if (file.size > maxFileSize) {
        toast.error(`File ${file.name} exceeds maximum size limit`);
        return false;
      }

      // Check file format
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!acceptedFormats.includes(fileExtension)) {
        toast.error(`File ${file.name} has unsupported format`);
        return false;
      }

      return true;
    });

    setSelectedFiles(prev => [...prev, ...validFiles]);

    if (validFiles.length > 0) {
      toast.success(`${validFiles.length} file(s) added successfully`);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const connectWallet = async () => {
    try {
      const account = await StellarWalletService.connectWallet('freighter');
      setStellarAccount(account);
      toast.success('Wallet connected successfully');
    } catch (error) {
      toast.error('Failed to connect wallet');
      console.error('Wallet connection error:', error);
    }
  };

  const uploadFiles = async () => {
    if (selectedFiles.length === 0) {
      toast.error('Please select files to upload');
      return;
    }

    if (!stellarAccount) {
      toast.error('Please connect your Stellar wallet first');
      return;
    }

    setUploadState({ isUploading: true, progress: null, stage: 'encrypting' });

    try {
      // Process each file
      for (const file of selectedFiles) {
        await processSingleFile(file);
      }

      setUploadState({ isUploading: false, progress: null, stage: 'completed' });
      toast.success('All files uploaded successfully');

    } catch (error) {
      console.error('Upload error:', error);
      setUploadState({
        isUploading: false,
        progress: null,
        stage: 'error',
        error: error instanceof Error ? error.message : 'Upload failed'
      });
      toast.error('Upload failed');
    }
  };

  const processSingleFile = async (file: File) => {
    // Stage 1: Encrypt file
    setUploadState(prev => ({ ...prev, stage: 'encrypting' }));

    const encryptedFile = await WebCryptoService.encryptFile(
      file,
      encryptionKey,
      (progress) => {
        setUploadState(prev => ({ ...prev, progress }));
      }
    );

    // Stage 2: Generate ZK-proof
    setUploadState(prev => ({ ...prev, stage: 'generating-proof' }));

    const zkProof = await ZKProofService.generateFileIntegrityProof(
      file,
      encryptedFile.checksum,
      encryptionKey
    );

    // Stage 3: Simulate upload to storage (in real implementation, this would upload to IPFS/storage)
    setUploadState(prev => ({ ...prev, stage: 'uploading' }));

    const dataCID = await simulateFileUpload(encryptedFile);

    // Stage 4: Sign transaction on Stellar
    setUploadState(prev => ({ ...prev, stage: 'signing' }));

    const receipt = await StellarWalletService.signAndSubmitUploadTransaction(
      stellarAccount!,
      {
        dataCID,
        encryptedDataHash: encryptedFile.checksum,
        zkProofHash: await ZKProofService.serializeProof(zkProof),
        timestamp: Date.now(),
        metadata: {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type
        }
      }
    );

    // Show receipt
    setShowReceipt(receipt);
    onUploadComplete?.(receipt);
  };

  const simulateFileUpload = async (encryptedFile: EncryptedFile): Promise<string> => {
    // Simulate upload progress
    const uploadSize = encryptedFile.data.byteLength;
    const chunkSize = 1024 * 1024; // 1MB chunks
    let uploaded = 0;

    while (uploaded < uploadSize) {
      uploaded = Math.min(uploaded + chunkSize, uploadSize);

      setUploadState(prev => ({
        ...prev,
        progress: {
          loaded: uploaded,
          total: uploadSize,
          percentage: Math.round((uploaded / uploadSize) * 100)
        }
      }));

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Generate mock CID
    return `bafybeigdyrzt5spx7udh7rdhec2okdctn3dbr6xvjb2h2sia4z${Math.random().toString(36).substring(2, 15)}`;
  };

  const downloadReceipt = () => {
    if (showReceipt) {
      StellarWalletService.downloadReceipt(showReceipt);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStageIcon = () => {
    switch (uploadState.stage) {
      case 'encrypting':
        return <Lock className="h-5 w-5 animate-pulse" />;
      case 'generating-proof':
        return <Shield className="h-5 w-5 animate-pulse" />;
      case 'uploading':
        return <Upload className="h-5 w-5 animate-pulse" />;
      case 'signing':
        return <Zap className="h-5 w-5 animate-pulse" />;
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Database className="h-5 w-5" />;
    }
  };

  const getStageText = () => {
    switch (uploadState.stage) {
      case 'encrypting':
        return 'Encrypting files locally...';
      case 'generating-proof':
        return 'Generating zero-knowledge proofs...';
      case 'uploading':
        return 'Uploading encrypted data...';
      case 'signing':
        return 'Signing Stellar transaction...';
      case 'completed':
        return 'Upload completed successfully!';
      case 'error':
        return uploadState.error || 'Upload failed';
      default:
        return 'Ready to upload';
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Secure Data Upload</h2>

        {/* Drag and Drop Zone */}
        <div
          className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${isDragOver
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
            } ${uploadState.isUploading ? 'pointer-events-none opacity-50' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={acceptedFormats.join(',')}
            onChange={handleFileSelect}
            className="hidden"
            disabled={uploadState.isUploading}
          />

          <Upload className="mx-auto h-12 w-12 text-gray-400" />
          <div className="mt-4">
            <p className="text-lg font-medium text-gray-900">
              {uploadState.isUploading ? 'Processing...' : 'Drop files here or click to upload'}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              {acceptedFormats.join(', ')} files up to {formatFileSize(maxFileSize)}
            </p>
          </div>
        </div>

        {/* Security Features */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center p-3 bg-green-50 rounded-lg">
            <Lock className="h-5 w-5 text-green-600 mr-2" />
            <div className="text-sm">
              <div className="font-medium text-green-800">AES-256 Encryption</div>
              <div className="text-green-700">Client-side encryption</div>
            </div>
          </div>
          <div className="flex items-center p-3 bg-blue-50 rounded-lg">
            <Shield className="h-5 w-5 text-blue-600 mr-2" />
            <div className="text-sm">
              <div className="font-medium text-blue-800">ZK-Proofs</div>
              <div className="text-blue-700">Privacy verification</div>
            </div>
          </div>
          <div className="flex items-center p-3 bg-purple-50 rounded-lg">
            <Database className="h-5 w-5 text-purple-600 mr-2" />
            <div className="text-sm">
              <div className="font-medium text-purple-800">Stellar Blockchain</div>
              <div className="text-purple-700">Immutable storage</div>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Files */}
      {selectedFiles.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Selected Files</h3>
          <div className="space-y-2">
            {selectedFiles.map((file, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center">
                  <FileText className="h-5 w-5 text-gray-400 mr-3" />
                  <div>
                    <div className="font-medium text-gray-900">{file.name}</div>
                    <div className="text-sm text-gray-500">{formatFileSize(file.size)}</div>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  disabled={uploadState.isUploading}
                  className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Wallet Connection */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Stellar Wallet</h3>
        {stellarAccount ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500">Connected Account</div>
              <div className="font-mono text-sm text-gray-900">{stellarAccount.publicKey}</div>
              <div className="text-sm text-gray-500">Network: {stellarAccount.network}</div>
            </div>
            <button
              onClick={connectWallet}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Change Wallet
            </button>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-gray-600 mb-4">Connect your Stellar wallet to sign transactions</p>
            <button
              onClick={connectWallet}
              disabled={uploadState.isUploading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              Connect Wallet
            </button>
          </div>
        )}
      </div>

      {/* Upload Progress */}
      <AnimatePresence>
        {uploadState.isUploading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white rounded-lg shadow p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                {getStageIcon()}
                <span className="ml-2 font-medium text-gray-900">{getStageText()}</span>
              </div>
              {uploadState.progress && (
                <span className="text-sm text-gray-500">
                  {uploadState.progress.percentage}%
                </span>
              )}
            </div>

            {uploadState.progress && (
              <div className="w-full bg-gray-200 rounded-full h-2">
                <motion.div
                  className="bg-blue-600 h-2 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadState.progress.percentage}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Button */}
      {selectedFiles.length > 0 && !uploadState.isUploading && (
        <div className="flex justify-center">
          <button
            onClick={uploadFiles}
            disabled={!stellarAccount}
            className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            Upload Files Securely
          </button>
        </div>
      )}

      {/* Receipt Modal */}
      <Modal
        isOpen={showReceipt !== null}
        onClose={() => setShowReceipt(null)}
        title="Upload Receipt"
        size="md"
      >
        <div className="space-y-3">
          <div className="p-3 bg-green-50 rounded-lg">
            <CheckCircle className="h-5 w-5 text-green-600 mb-2" />
            <p className="text-sm text-green-800">Your data has been securely uploaded to the Stellar blockchain</p>
          </div>

          {showReceipt && (
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium text-gray-700">Transaction Hash:</span>
                <div className="font-mono text-xs text-gray-600 break-all">{showReceipt.transactionHash}</div>
              </div>
              <div>
                <span className="font-medium text-gray-700">Data CID:</span>
                <div className="font-mono text-xs text-gray-600 break-all">{showReceipt.dataCID}</div>
              </div>
              <div>
                <span className="font-medium text-gray-700">Network:</span>
                <span className="text-gray-600 ml-2">{showReceipt.network}</span>
              </div>
            </div>
          )}

          <button
            onClick={downloadReceipt}
            className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Download className="h-4 w-4 mr-2" />
            Download Receipt
          </button>
        </div>
      </Modal>
    </div>
  );
};
