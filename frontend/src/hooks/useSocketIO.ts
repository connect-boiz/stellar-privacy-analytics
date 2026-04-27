import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket, ManagerOptions, SocketOptions } from 'socket.io-client';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed';

interface UseSocketIOReturn {
  socket: Socket | null;
  connectionState: ConnectionState;
  reconnect: () => void;
  disconnect: () => void;
  isOnline: boolean;
  reconnectAttempts: number;
  lastError: string | null;
}

interface UseSocketIOOptions {
  url?: string;
  options?: Partial<ManagerOptions & SocketOptions>;
  autoConnect?: boolean;
  maxReconnectAttempts?: number;
  initialReconnectDelay?: number;
  maxReconnectDelay?: number;
  enableHeartbeat?: boolean;
  heartbeatInterval?: number;
  enableOfflineQueue?: boolean;
}

export const useSocketIO = (options: UseSocketIOOptions = {}): UseSocketIOReturn => {
  const {
    url = process.env.REACT_APP_API_URL || 'http://localhost:3001',
    options: socketOptions = {},
    autoConnect = true,
    maxReconnectAttempts = 10,
    initialReconnectDelay = 1000,
    maxReconnectDelay = 30000,
    enableHeartbeat = true,
    heartbeatInterval = 30000,
    enableOfflineQueue = true
  } = options;

  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const offlineQueueRef = useRef<any[]>([]);

  // Calculate exponential backoff delay
  const getReconnectDelay = useCallback((attempt: number): number => {
    const delay = initialReconnectDelay * Math.pow(2, attempt);
    return Math.min(delay, maxReconnectDelay);
  }, [initialReconnectDelay, maxReconnectDelay]);

  // Handle online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (connectionState === 'disconnected' && socket) {
        socket.connect();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setConnectionState('disconnected');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [connectionState, socket]);

  // Initialize socket connection
  const initializeSocket = useCallback(() => {
    const newSocket = io(url, {
      ...socketOptions,
      autoConnect: false, // We'll manage connection manually
      reconnection: false, // We'll handle reconnection manually for more control
    });

    // Connection events
    newSocket.on('connect', () => {
      setConnectionState('connected');
      setReconnectAttempts(0);
      setLastError(null);
      console.log('Socket.IO connected');

      // Process offline queue
      if (enableOfflineQueue && offlineQueueRef.current.length > 0) {
        offlineQueueRef.current.forEach(({ event, data }) => {
          newSocket.emit(event, data);
        });
        offlineQueueRef.current = [];
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket.IO disconnected:', reason);
      setConnectionState('disconnected');

      // Attempt reconnection if not intentional disconnect
      if (reason !== 'io client disconnect' && reconnectAttempts < maxReconnectAttempts) {
        scheduleReconnect();
      } else if (reconnectAttempts >= maxReconnectAttempts) {
        setConnectionState('failed');
        setLastError('Maximum reconnection attempts exceeded');
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error);
      setLastError(error.message);
      setConnectionState('disconnected');

      if (reconnectAttempts < maxReconnectAttempts) {
        scheduleReconnect();
      } else {
        setConnectionState('failed');
      }
    });

    newSocket.on('reconnect_attempt', () => {
      setConnectionState('reconnecting');
    });

    setSocket(newSocket);

    if (autoConnect) {
      newSocket.connect();
    }

    return newSocket;
  }, [url, socketOptions, autoConnect, maxReconnectAttempts, enableOfflineQueue]);

  // Schedule reconnection with exponential backoff
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    const attempt = reconnectAttempts + 1;
    setReconnectAttempts(attempt);
    const delay = getReconnectDelay(attempt - 1);

    console.log(`Scheduling reconnection attempt ${attempt}/${maxReconnectAttempts} in ${delay}ms`);

    reconnectTimeoutRef.current = setTimeout(() => {
      if (socket && isOnline) {
        socket.connect();
      }
    }, delay);
  }, [reconnectAttempts, maxReconnectAttempts, getReconnectDelay, socket, isOnline]);

  // Heartbeat mechanism
  useEffect(() => {
    if (enableHeartbeat && socket && connectionState === 'connected') {
      heartbeatIntervalRef.current = setInterval(() => {
        socket.emit('heartbeat', { timestamp: Date.now() });
      }, heartbeatInterval);
    } else {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    }

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [enableHeartbeat, socket, connectionState, heartbeatInterval]);

  // Manual reconnect function
  const reconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    setReconnectAttempts(0);
    setLastError(null);
    if (socket) {
      socket.connect();
    } else {
      initializeSocket();
    }
  }, [socket, initializeSocket]);

  // Disconnect function
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    if (socket) {
      socket.disconnect();
    }
    setConnectionState('disconnected');
  }, [socket]);

  // Initialize on mount
  useEffect(() => {
    const newSocket = initializeSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, []); // Empty dependency array since we only want to initialize once

  return {
    socket,
    connectionState,
    reconnect,
    disconnect,
    isOnline,
    reconnectAttempts,
    lastError
  };
};
