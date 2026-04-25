import { useState, useEffect, useRef } from 'react';

interface UseWebSocketReturn {
  lastMessage: MessageEvent | null;
  readyState: 'connecting' | 'open' | 'closing' | 'closed';
  sendMessage: (message: string) => void;
  reconnect: () => void;
}

export const useWebSocket = (url: string): UseWebSocketReturn => {
  const [lastMessage, setLastMessage] = useState<MessageEvent | null>(null);
  const [readyState, setReadyState] = useState<'connecting' | 'open' | 'closing' | 'closed'>('connecting');
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 1000;

  const connect = () => {
    try {
      ws.current = new WebSocket(url);
      
      ws.current.onopen = () => {
        setReadyState('open');
        reconnectAttemptsRef.current = 0;
        console.log('WebSocket connected');
      };

      ws.current.onmessage = (event: MessageEvent) => {
        setLastMessage(event);
      };

      ws.current.onclose = (event) => {
        setReadyState('closed');
        console.log('WebSocket disconnected', event);

        // Attempt to reconnect if not a normal closure
        if (!event.wasClean && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = reconnectDelay * Math.pow(2, reconnectAttemptsRef.current - 1);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`Attempting to reconnect (${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
            connect();
          }, delay);
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setReadyState('closed');
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setReadyState('closed');
    }
  };

  const sendMessage = (message: string) => {
    if (ws.current && readyState === 'open') {
      try {
        ws.current.send(message);
      } catch (error) {
        console.error('Failed to send WebSocket message:', error);
      }
    } else {
      console.warn('WebSocket is not connected');
    }
  };

  const reconnect = () => {
    if (ws.current) {
      ws.current.close();
    }
    reconnectAttemptsRef.current = 0;
    connect();
  };

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [url]);

  return {
    lastMessage,
    readyState,
    sendMessage,
    reconnect
  };
};
