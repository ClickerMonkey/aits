import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MainPage } from './pages/MainPage';
import { InitPage } from './pages/InitPage';
import { WebSocketProvider, useWebSocket } from './WebSocketContext';
import type { Config } from '../schemas';

type AppView = 'loading' | 'init' | 'main';

const AppContent: React.FC = () => {
  const [view, setView] = useState<AppView>('loading');
  const [config, setConfig] = useState<Config | null>(null);
  const { ws, isConnected } = useWebSocket();

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      // Unified layout handles routing internally
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Request config when WebSocket connects
  useEffect(() => {
    if (!isConnected || !ws) return;

    console.log('[App] WebSocket connected, requesting config');
    ws.send({ type: 'get_config' });

    // Listen for config-related messages
    const unsubscribe = ws.onMessage((message) => {
      switch (message.type) {
        case 'config':
          console.log('[App] Received config');
          setConfig(message.data);
          setView('main');
          break;

        case 'config_not_found':
          console.log('[App] Config not found, showing init page');
          setView('init');
          break;

        case 'error':
          console.error('[App] WebSocket error:', message.data.message);
          break;
      }
    });

    return unsubscribe;
  }, [isConnected, ws]);

  const reloadConfig = async () => {
    if (ws && isConnected) {
      ws.send({ type: 'get_config' });
    }
  };

  if (view === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-4">
        <div className="spinner"></div>
        <p className="neon-text-cyan">Loading...</p>
      </div>
    );
  }

  if (view === 'init') {
    return (
      <InitPage
        onComplete={() => {
          reloadConfig();
        }}
      />
    );
  }

  if (view === 'main' && config) {
    return (
      <MainPage
        config={config}
      />
    );
  }

  return (
    <div className="flex h-screen items-center justify-center flex-col gap-4">
      <div className="spinner"></div>
      <p className="neon-text-cyan">Loading...</p>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <WebSocketProvider>
      <AppContent />
    </WebSocketProvider>
  );
};

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
