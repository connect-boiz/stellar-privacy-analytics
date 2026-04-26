import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, 
  Pause, 
  Play, 
  X, 
  Check, 
  AlertCircle, 
  Wifi, 
  WifiOff,
  Clock,
  Zap
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';

interface UploadProgress {
  uploadId: string;
  fileName: string;
  fileSize: number;
  uploadedBytes: number;
  percentage: number;
  speed: number;
  timeRemaining: number;
  status: 'pending' | 'uploading' | 'paused' | 'completed' | 'error' | 'cancelled';
  chunksCompleted: number;
  totalChunks: number;
  startTime: number;
  lastUpdateTime: number;
  networkQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

interface UploadProgressProps {
  uploadId: string;
  fileName: string;
  fileSize: number;
  onCancel: () => void;
  onComplete: () => void;
}

export const UploadProgress: React.FC<UploadProgressProps> = ({
  uploadId,
  fileName,
  fileSize,
  onCancel,
  onComplete
}) => {
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Initialize WebSocket connection
    const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:3001');
    socketRef.current = newSocket;
    setSocket(newSocket);

    // Join upload room
    newSocket.emit('join-upload', uploadId);

    // Listen for progress updates
    newSocket.on('upload-progress', (progressData: UploadProgress) => {
      setProgress(progressData);
      setError(null);
      
      if (progressData.status === 'completed') {
        onComplete();
      } else if (progressData.status === 'error') {
        setError('Upload failed. Please try again.');
      }
    });

    // Fetch initial progress
    fetchInitialProgress();

    return () => {
      newSocket.disconnect();
    };
  }, [uploadId]);

  const fetchInitialProgress = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/data/upload/${uploadId}/progress`);
      if (response.ok) {
        const data = await response.json();
        setProgress(data);
      }
    } catch (err) {
      console.error('Failed to fetch initial progress:', err);
    }
  };

  const handlePause = async () => {
    try {
      await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/data/upload/${uploadId}/pause`, {
        method: 'POST',
      });
    } catch (err) {
      setError('Failed to pause upload');
    }
  };

  const handleResume = async () => {
    try {
      await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/data/upload/${uploadId}/resume`, {
        method: 'POST',
      });
    } catch (err) {
      setError('Failed to resume upload');
    }
  };

  const handleCancel = async () => {
    try {
      await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/data/upload/${uploadId}`, {
        method: 'DELETE',
      });
      onCancel();
    } catch (err) {
      setError('Failed to cancel upload');
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    return formatBytes(bytesPerSecond) + '/s';
  };

  const formatTime = (seconds: number): string => {
    if (seconds === 0 || !isFinite(seconds)) return '--';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const getNetworkQualityIcon = (quality: string) => {
    switch (quality) {
      case 'excellent':
        return <Wifi className="h-4 w-4 text-green-500" />;
      case 'good':
        return <Wifi className="h-4 w-4 text-blue-500" />;
      case 'fair':
        return <Wifi className="h-4 w-4 text-yellow-500" />;
      case 'poor':
        return <WifiOff className="h-4 w-4 text-red-500" />;
      default:
        return <Wifi className="h-4 w-4 text-gray-400" />;
    }
  };

  const getNetworkQualityColor = (quality: string) => {
    switch (quality) {
      case 'excellent':
        return 'text-green-600 bg-green-50';
      case 'good':
        return 'text-blue-600 bg-blue-50';
      case 'fair':
        return 'text-yellow-600 bg-yellow-50';
      case 'poor':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  if (!progress) {
    return (
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-600">Initializing upload...</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="border border-gray-200 rounded-lg p-4 bg-white"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Upload className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-gray-900 truncate">
              {fileName}
            </h3>
            <p className="text-xs text-gray-500">
              {formatBytes(progress.uploadedBytes)} / {formatBytes(progress.fileSize)}
            </p>
          </div>
        </div>
        
        {/* Status and Actions */}
        <div className="flex items-center space-x-2">
          {progress.status === 'completed' && (
            <div className="flex items-center space-x-1 text-green-600">
              <Check className="h-4 w-4" />
              <span className="text-xs font-medium">Completed</span>
            </div>
          )}
          
          {progress.status === 'error' && (
            <div className="flex items-center space-x-1 text-red-600">
              <AlertCircle className="h-4 w-4" />
              <span className="text-xs font-medium">Error</span>
            </div>
          )}
          
          {progress.status === 'uploading' && (
            <button
              onClick={handlePause}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              title="Pause upload"
            >
              <Pause className="h-4 w-4" />
            </button>
          )}
          
          {progress.status === 'paused' && (
            <button
              onClick={handleResume}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              title="Resume upload"
            >
              <Play className="h-4 w-4" />
            </button>
          )}
          
          {(progress.status === 'uploading' || progress.status === 'paused') && (
            <button
              onClick={handleCancel}
              className="p-1 text-gray-400 hover:text-red-600 transition-colors"
              title="Cancel upload"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
          <span>{progress.percentage}%</span>
          <span>Chunk {progress.chunksCompleted}/{progress.totalChunks}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <motion.div
            className="bg-blue-600 h-2 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress.percentage}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Upload Details */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        {/* Speed */}
        <div className="flex items-center space-x-2">
          <Zap className="h-3 w-3 text-gray-400" />
          <div>
            <p className="text-gray-500">Speed</p>
            <p className="font-medium text-gray-900">
              {formatSpeed(progress.speed)}
            </p>
          </div>
        </div>

        {/* Time Remaining */}
        <div className="flex items-center space-x-2">
          <Clock className="h-3 w-3 text-gray-400" />
          <div>
            <p className="text-gray-500">Time Left</p>
            <p className="font-medium text-gray-900">
              {formatTime(progress.timeRemaining)}
            </p>
          </div>
        </div>

        {/* Network Quality */}
        <div className="flex items-center space-x-2">
          {getNetworkQualityIcon(progress.networkQuality)}
          <div>
            <p className="text-gray-500">Network</p>
            <p className={`font-medium capitalize ${getNetworkQualityColor(progress.networkQuality)}`}>
              {progress.networkQuality}
            </p>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${
            progress.status === 'uploading' ? 'bg-blue-500 animate-pulse' :
            progress.status === 'paused' ? 'bg-yellow-500' :
            progress.status === 'completed' ? 'bg-green-500' :
            progress.status === 'error' ? 'bg-red-500' :
            'bg-gray-300'
          }`} />
          <div>
            <p className="text-gray-500">Status</p>
            <p className="font-medium text-gray-900 capitalize">
              {progress.status}
            </p>
          </div>
        </div>
      </div>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 p-2 bg-red-50 border border-red-200 rounded-md"
          >
            <p className="text-xs text-red-600">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
