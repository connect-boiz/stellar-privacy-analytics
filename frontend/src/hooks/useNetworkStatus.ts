import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

interface NetworkStatus {
  isOnline: boolean;
  isSlow: boolean;
  lastChecked: Date;
  queuedRequests: number;
  cacheSize: number;
  connectionType?: string;
}

interface UseNetworkStatusReturn extends NetworkStatus {
  testConnection: () => Promise<boolean>;
  clearCache: () => void;
  retryQueuedRequests: () => void;
  isTesting: boolean;
}

export const useNetworkStatus = (): UseNetworkStatusReturn => {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: navigator.onLine,
    isSlow: false,
    lastChecked: new Date(),
    queuedRequests: 0,
    cacheSize: 0,
    connectionType: (navigator as any).connection?.effectiveType
  });
  const [isTesting, setIsTesting] = useState(false);

  const updateStatus = useCallback(() => {
    const diagnostics = api.getErrorDiagnostics();
    const connection = (navigator as any).connection;
    
    setStatus(prev => ({
      ...prev,
      isOnline: diagnostics.isOnline,
      queuedRequests: diagnostics.queuedRequests,
      cacheSize: diagnostics.cacheSize,
      lastChecked: new Date(),
      connectionType: connection?.effectiveType,
      isSlow: connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g'
    }));
  }, []);

  const testConnection = useCallback(async (): Promise<boolean> => {
    setIsTesting(true);
    try {
      const result = await api.testConnection();
      updateStatus();
      return result;
    } catch (error) {
      updateStatus();
      return false;
    } finally {
      setIsTesting(false);
    }
  }, [updateStatus]);

  const clearCache = useCallback(() => {
    api.clearCache();
    updateStatus();
  }, [updateStatus]);

  const retryQueuedRequests = useCallback(() => {
    // This would trigger processing of queued requests
    // The API client automatically processes queue when online
    updateStatus();
  }, [updateStatus]);

  useEffect(() => {
    // Initial status
    updateStatus();

    // Listen for network status changes
    const handleStatusChange = () => {
      updateStatus();
    };

    api.onNetworkStatusChange(handleStatusChange);

    // Listen for browser network events
    const handleOnline = () => {
      updateStatus();
    };

    const handleOffline = () => {
      updateStatus();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for connection changes
    const connection = (navigator as any).connection;
    if (connection) {
      const handleConnectionChange = () => {
        updateStatus();
      };
      connection.addEventListener('change', handleConnectionChange);
    }

    // Update status periodically
    const interval = setInterval(updateStatus, 30000); // Every 30 seconds

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      
      if (connection) {
        connection.removeEventListener('change', handleConnectionChange);
      }
      
      clearInterval(interval);
    };
  }, [updateStatus]);

  return {
    ...status,
    testConnection,
    clearCache,
    retryQueuedRequests,
    isTesting
  };
};
