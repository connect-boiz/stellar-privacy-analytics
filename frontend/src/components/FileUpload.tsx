import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, FileText, AlertCircle } from 'lucide-react';
import { UploadProgress } from './UploadProgress';

interface UploadFile {
  id: string;
  file: File;
  uploadId?: string;
  status: 'pending' | 'uploading' | 'completed' | 'error';
}

interface FileUploadProps {
  onUploadComplete?: (fileName: string, fileSize: number) => void;
  maxFileSize?: number; // in bytes
  allowedTypes?: string[];
  maxConcurrentUploads?: number;
  enableBatchUpload?: boolean;
  enableRetry?: boolean;
  maxRetries?: number;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onUploadComplete,
  maxFileSize = 1024 * 1024 * 1024, // 1GB default
  allowedTypes = ['text/csv', 'application/json', 'application/octet-stream'],
  maxConcurrentUploads = 3,
  enableBatchUpload = true,
  enableRetry = true,
  maxRetries = 3
}) => {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

  const validateFile = async (file: File): Promise<string | null> => {
    // Check file size
    if (file.size > maxFileSize) {
      return `File size exceeds maximum limit of ${formatBytes(maxFileSize)}`;
    }

    // Check for empty files
    if (file.size === 0) {
      return 'Empty files are not allowed';
    }

    // Check file type and content
    const fileExtension = file.name.toLowerCase().split('.').pop();
    const allowedExtensions = ['csv', 'json', 'parquet', 'txt', 'xlsx', 'xls'];

    if (!allowedExtensions.includes(fileExtension || '')) {
      return `Invalid file type. Allowed formats: ${allowedExtensions.join(', ')}`;
    }

    // For encrypted files, check if they appear to be already encrypted
    if (file.type === 'application/octet-stream' || fileExtension === 'enc') {
      return 'This appears to be an already encrypted file. Please upload the original unencrypted file.';
    }

    // Check for potentially malicious file signatures
    try {
      const signature = await checkFileSignature(file);
      if (!signature.safe) {
        return `Potentially unsafe file detected: ${signature.reason}`;
      }
    } catch (error) {
      return 'Unable to validate file content. Please try again.';
    }

    // Validate file content structure for known formats
    try {
      const contentValidation = await validateFileContent(file);
      if (!contentValidation.valid) {
        return contentValidation.error;
      }
    } catch (error) {
      return 'Unable to validate file structure. Please ensure the file is not corrupted.';
    }

    return null;
  };

  const checkFileSignature = async (file: File): Promise<{ safe: boolean; reason?: string }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        if (!buffer) {
          resolve({ safe: false, reason: 'Unable to read file' });
          return;
        }

        const bytes = new Uint8Array(buffer.slice(0, 16));
        const signature = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

        // Check for known malicious signatures
        const maliciousSignatures = [
          '4d5a', // MZ (Windows executable)
          '7f454c46', // ELF (Linux executable)
          'caffee', // Java class file
          '504b0304', // ZIP (but could contain executables)
        ];

        for (const malicious of maliciousSignatures) {
          if (signature.toLowerCase().startsWith(malicious)) {
            resolve({ safe: false, reason: 'Executable or archive file detected' });
            return;
          }
        }

        // Check for encrypted file patterns (basic check)
        const encryptedPatterns = [
          /^00{8,}/, // Long sequences of zeros
          /^ff{8,}/, // Long sequences of FF
        ];

        for (const pattern of encryptedPatterns) {
          if (pattern.test(signature)) {
            resolve({ safe: false, reason: 'File appears to be encrypted or corrupted' });
            return;
          }
        }

        resolve({ safe: true });
      };
      reader.onerror = () => resolve({ safe: false, reason: 'File read error' });
      reader.readAsArrayBuffer(file.slice(0, 16));
    });
  };

  const validateFileContent = async (file: File): Promise<{ valid: boolean; error?: string }> => {
    const fileExtension = file.name.toLowerCase().split('.').pop();

    if (fileExtension === 'json') {
      return validateJSONFile(file);
    } else if (fileExtension === 'csv') {
      return validateCSVFile(file);
    }

    // For other formats, basic size check
    return { valid: true };
  };

  const validateJSONFile = async (file: File): Promise<{ valid: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          if (!text || text.trim().length === 0) {
            resolve({ valid: false, error: 'JSON file is empty' });
            return;
          }

          JSON.parse(text);
          resolve({ valid: true });
        } catch (error) {
          resolve({ valid: false, error: 'Invalid JSON format' });
        }
      };
      reader.onerror = () => resolve({ valid: false, error: 'Unable to read JSON file' });
      reader.readAsText(file);
    });
  };

  const validateCSVFile = async (file: File): Promise<{ valid: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          if (!text || text.trim().length === 0) {
            resolve({ valid: false, error: 'CSV file is empty' });
            return;
          }

          const lines = text.split('\n').filter(line => line.trim().length > 0);
          if (lines.length < 2) {
            resolve({ valid: false, error: 'CSV file must have at least a header and one data row' });
            return;
          }

          // Basic CSV structure check
          const headerColumns = lines[0].split(',').length;
          const dataColumns = lines[1].split(',').length;

          if (Math.abs(headerColumns - dataColumns) > 2) { // Allow some flexibility
            resolve({ valid: false, error: 'CSV structure appears inconsistent' });
            return;
          }

          resolve({ valid: true });
        } catch (error) {
          resolve({ valid: false, error: 'Unable to validate CSV file' });
        }
      };
      reader.onerror = () => resolve({ valid: false, error: 'Unable to read CSV file' });
      reader.readAsText(file);
    });
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const initializeUpload = async (file: File): Promise<string> => {
    const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/data/upload/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to initialize upload');
    }

    const data = await response.json();
    return data.uploadId;
  };

  const uploadChunk = async (
    uploadId: string,
    chunk: Blob,
    chunkIndex: number,
    totalChunks: number,
    fileName: string,
    fileSize: number
  ): Promise<void> => {
    const formData = new FormData();
    formData.append('file', chunk);
    formData.append('uploadId', uploadId);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('totalChunks', totalChunks.toString());
    formData.append('fileName', fileName);
    formData.append('fileSize', fileSize.toString());

    const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/data/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload chunk ${chunkIndex}`);
    }
  };

  const uploadFileInChunks = async (uploadFile: UploadFile, retryCount = 0) => {
    try {
      setUploadingCount(prev => prev + 1);

      // Initialize upload
      const uploadId = await initializeUpload(uploadFile.file);
      
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, uploadId, status: 'uploading' }
          : f
      ));

      // Split file into chunks and upload
      const totalChunks = Math.ceil(uploadFile.file.size / CHUNK_SIZE);
      
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, uploadFile.file.size);
        const chunk = uploadFile.file.slice(start, end);

        await uploadChunk(
          uploadId!,
          chunk,
          chunkIndex,
          totalChunks,
          uploadFile.file.name,
          uploadFile.file.size
        );
      }

      // Mark as completed
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'completed' }
          : f
      ));

      onUploadComplete?.(uploadFile.file.name, uploadFile.file.size);

    } catch (error) {
      console.error(`Upload failed (attempt ${retryCount + 1}):`, error);
      
      if (enableRetry && retryCount < maxRetries) {
        // Exponential backoff
        const delay = Math.pow(2, retryCount) * 1000;
        setTimeout(() => {
          uploadFileInChunks(uploadFile, retryCount + 1);
        }, delay);
        return;
      }

      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'error' }
          : f
      ));
    } finally {
      setUploadingCount(prev => prev - 1);
    }
  };

  const handleFiles = useCallback(async (newFiles: FileList | null) => {
    if (!newFiles) return;

    setError(null);
    const validFiles: UploadFile[] = [];

    for (const file of Array.from(newFiles)) {
      const validationError = await validateFile(file);
      if (validationError) {
        setError(`${file.name}: ${validationError}`);
        continue; // Skip invalid files but continue with others
      }

      validFiles.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        status: 'pending'
      });
    }

    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);

      if (enableBatchUpload) {
        // Start uploads with concurrency control
        startBatchUpload(validFiles);
      } else {
        // Start uploading immediately without queuing
        validFiles.forEach(uploadFile => {
          uploadFileInChunks(uploadFile);
        });
      }
    }
  }, [maxFileSize, allowedTypes, onUploadComplete, enableBatchUpload, enableRetry, maxRetries]);

  const startBatchUpload = (uploadFiles: UploadFile[]) => {
    let index = 0;

    const processNext = () => {
      if (index >= uploadFiles.length || uploadingCount >= maxConcurrentUploads) {
        return;
      }

      const uploadFile = uploadFiles[index];
      index++;

      uploadFileInChunks(uploadFile).finally(() => {
        // Process next file when current one finishes
        setTimeout(processNext, 100);
      });
    };

    // Start initial batch
    for (let i = 0; i < Math.min(maxConcurrentUploads, uploadFiles.length); i++) {
      processNext();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const handleUploadComplete = (fileId: string) => {
    setFiles(prev => prev.map(f => 
      f.id === fileId 
        ? { ...f, status: 'completed' }
        : f
    ));
  };

  const handleUploadCancel = (fileId: string) => {
    removeFile(fileId);
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400 bg-white'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className={`mx-auto h-12 w-12 transition-colors ${
          isDragging ? 'text-blue-500' : 'text-gray-400'
        }`} />
        
        <div className="mt-4">
          <p className="text-lg font-medium text-gray-900">
            Drop files here or click to upload
          </p>
          <p className="text-sm text-gray-600 mt-1">
            CSV, JSON, or Parquet files up to {formatBytes(maxFileSize)}
          </p>
        </div>
        
        <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          Select Files
        </button>
        
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".csv,.json,.parquet"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-red-50 border border-red-200 rounded-lg"
          >
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Upload Error</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Batch Upload Progress */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-blue-50 border border-blue-200 rounded-lg"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <Upload className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-blue-900">Batch Upload Progress</h3>
                  <p className="text-xs text-blue-700">
                    {files.filter(f => f.status === 'completed').length} of {files.length} files completed
                    {uploadingCount > 0 && ` • ${uploadingCount} uploading`}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-blue-900">
                  {Math.round((files.filter(f => f.status === 'completed').length / files.length) * 100)}%
                </div>
                <div className="w-20 bg-blue-200 rounded-full h-1 mt-1">
                  <div
                    className="bg-blue-600 h-1 rounded-full transition-all duration-300"
                    style={{
                      width: `${(files.filter(f => f.status === 'completed').length / files.length) * 100}%`
                    }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* File List */}
            
            {files.map((uploadFile) => (
              <div key={uploadFile.id}>
                {uploadFile.uploadId ? (
                  <UploadProgress
                    uploadId={uploadFile.uploadId}
                    fileName={uploadFile.file.name}
                    fileSize={uploadFile.file.size}
                    onCancel={() => handleUploadCancel(uploadFile.id)}
                    onComplete={() => handleUploadComplete(uploadFile.id)}
                  />
                ) : (
                  // Pending state - show file info while initializing
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border border-gray-200 rounded-lg p-4 bg-white"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-gray-100 rounded-lg">
                          <FileText className="h-5 w-5 text-gray-600" />
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-900">
                            {uploadFile.file.name}
                          </h4>
                          <p className="text-xs text-gray-500">
                            {formatBytes(uploadFile.file.size)}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <button
                          onClick={() => removeFile(uploadFile.id)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
