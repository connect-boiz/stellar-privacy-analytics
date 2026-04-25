import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, AlertTriangle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../services/api';

interface NetworkStatusIndicatorProps {
  className?: string;
}

interface NetworkStatus {
  isOnline: boolean;
  isSlow: boolean;
  lastChecked: Date;
  queuedRequests: number;
}

export const NetworkStatusIndicator: React.FC<NetworkStatusIndicatorProps> = ({ 
  className = '' 
}) => {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: navigator.onLine,
    isSlow: false,
    lastChecked: new Date(),
    queuedRequests: 0
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    // Initial status
    updateNetworkStatus();

    // Listen for network status changes
    const handleStatusChange = (online: boolean) => {
      updateNetworkStatus();
    };

    api.onNetworkStatusChange(handleStatusChange);

    // Update status periodically
    const interval = setInterval(updateNetworkStatus, 30000); // Every 30 seconds

    return () => {
      clearInterval(interval);
    };
  }, []);

  const updateNetworkStatus = () => {
    const diagnostics = api.getErrorDiagnostics();
    setStatus(prev => ({
      ...prev,
      isOnline: diagnostics.isOnline,
      queuedRequests: diagnostics.queuedRequests,
      lastChecked: new Date()
    }));
  };

  const testConnection = async () => {
    setIsTesting(true);
    try {
      const isOnline = await api.testConnection();
      setStatus(prev => ({
        ...prev,
        isOnline,
        lastChecked: new Date()
      }));
    } catch (error) {
      setStatus(prev => ({
        ...prev,
        isOnline: false,
        lastChecked: new Date()
      }));
    } finally {
      setIsTesting(false);
    }
  };

  const getStatusColor = () => {
    if (!status.isOnline) return 'text-red-500';
    if (status.queuedRequests > 0) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getStatusIcon = () => {
    if (!status.isOnline) return WifiOff;
    if (status.queuedRequests > 0) return AlertTriangle;
    return Wifi;
  };

  const getStatusText = () => {
    if (!status.isOnline) return 'Offline';
    if (status.queuedRequests > 0) return `${status.queuedRequests} queued`;
    return 'Online';
  };

  const Icon = getStatusIcon();

  return (
    <div className={`relative ${className}`}>
      {/* Status Indicator */}
      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center space-x-2 px-3 py-2 rounded-lg bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow ${getStatusColor()}`}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <Icon className="w-4 h-4" />
        <span className="text-sm font-medium">{getStatusText()}</span>
        <motion.div
          animate={{ rotate: isTesting ? 360 : 0 }}
          transition={{ duration: 1, repeat: isTesting ? Infinity : 0, ease: "linear" }}
        >
          {isTesting && <RefreshCw className="w-3 h-3" />}
        </motion.div>
      </motion.button>

      {/* Expanded Details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="absolute top-full right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-50"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Connection Status</span>
                <span className={`text-sm font-bold ${getStatusColor()}`}>
                  {getStatusText()}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Cached Items</span>
                <span className="text-sm font-medium text-gray-900">
                  {api.getCacheSize()}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Queued Requests</span>
                <span className="text-sm font-medium text-gray-900">
                  {status.queuedRequests}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Last Checked</span>
                <span className="text-sm text-gray-900">
                  {status.lastChecked.toLocaleTimeString()}
                </span>
              </div>

              <div className="pt-2 border-t border-gray-100 space-y-2">
                <button
                  onClick={testConnection}
                  disabled={isTesting}
                  className="w-full px-3 py-2 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isTesting ? 'Testing...' : 'Test Connection'}
                </button>

                <button
                  onClick={() => api.clearCache()}
                  className="w-full px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Clear Cache
                </button>
              </div>

              {!status.isOnline && (
                <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                  <p className="text-xs text-yellow-800">
                    You're currently offline. Some features may be limited. Cached data will be displayed where available.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
