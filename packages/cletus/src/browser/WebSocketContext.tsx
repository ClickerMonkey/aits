import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { createTypedWebSocket, TypedWebSocket } from './websocket-types';

interface WebSocketContextType {
  ws: TypedWebSocket | null;
  isConnected: boolean;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const [ws, setWs] = useState<TypedWebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}`;

    console.log('[WebSocketContext] Connecting to:', url);
    const websocket = createTypedWebSocket(url);
    setWs(websocket);

    // Wait for connection to open
    const checkConnection = setInterval(() => {
      if (websocket.isOpen()) {
        console.log('[WebSocketContext] Connected');
        setIsConnected(true);
        clearInterval(checkConnection);
      }
    }, 100);

    // Cleanup on unmount
    return () => {
      clearInterval(checkConnection);
      console.log('[WebSocketContext] Closing connection');
      websocket.close();
      setWs(null);
      setIsConnected(false);
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ ws, isConnected }}>
      {children}
    </WebSocketContext.Provider>
  );
};
