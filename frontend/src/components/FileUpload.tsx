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
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onUploadComplete,
  maxFileSize = 1024 * 1024 * 1024, // 1GB default
  allowedTypes = ['text/csv', 'application/json', 'application/octet-stream']
}) => {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > maxFileSize) {
      return `File size exceeds maximum limit of ${formatBytes(maxFileSize)}`;
    }

    // Check file type
    if (!allowedTypes.includes(file.type) && !file.name.endsWith('.parquet')) {
      return 'Invalid file type. Only CSV, JSON, and Parquet files are allowed.';
    }

    return null;
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

  const uploadFileInChunks = async (uploadFile: UploadFile) => {
    try {
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
      console.error('Upload failed:', error);
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'error' }
          : f
      ));
    }
  };

  const handleFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;

    setError(null);
    const validFiles: UploadFile[] = [];

    Array.from(newFiles).forEach(file => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      validFiles.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        status: 'pending'
      });
    });

    setFiles(prev => [...prev, ...validFiles]);

    // Start uploading immediately
    validFiles.forEach(uploadFile => {
      uploadFileInChunks(uploadFile);
    });
  }, [maxFileSize, allowedTypes, onUploadComplete]);

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

      {/* File List */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <h3 className="text-lg font-medium text-gray-900">Uploading Files ({files.length})</h3>
            
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
