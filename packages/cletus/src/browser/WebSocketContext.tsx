import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { createTypedWebSocket, TypedWebSocket } from './websocket-types';

interface WebSocketContextType {
  ws: TypedWebSocket | null;
  isConnected: boolean;
}

const WebSocketContext = createContext<WebSocketContextType>({
  ws: null,
  isConnected: false,
});

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context.ws) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<TypedWebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}`;

    console.log('[WebSocketContext] Connecting to:', url);
    const ws = createTypedWebSocket(url);
    wsRef.current = ws;

    // Wait for connection to open
    const checkConnection = setInterval(() => {
      if (ws.isOpen()) {
        console.log('[WebSocketContext] Connected');
        setIsConnected(true);
        clearInterval(checkConnection);
      }
    }, 100);

    // Cleanup on unmount
    return () => {
      clearInterval(checkConnection);
      console.log('[WebSocketContext] Closing connection');
      ws.close();
      wsRef.current = null;
      setIsConnected(false);
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ ws: wsRef.current, isConnected }}>
      {children}
    </WebSocketContext.Provider>
  );
};
