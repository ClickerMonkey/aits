import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { UnifiedLayout } from './pages/UnifiedLayout';
import { InitPage } from './pages/InitPage';
import type { Config } from '../schemas';

type AppView = 'loading' | 'init' | 'main';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('loading');
  const [config, setConfig] = useState<Config | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      // Unified layout handles routing internally
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    // Connect to WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
      console.log('WebSocket connected');
      // Request config
      ws.send(JSON.stringify({ type: 'get_config' }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'config':
          setConfig(message.data);
          setView('main');
          break;

        case 'config_not_found':
          setView('init');
          break;

        case 'error':
          console.error('WebSocket error:', message.data.message);
          break;
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket connection error:', error);
      setView('init');
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, []);

  const reloadConfig = async () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'get_config' }));
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
      <UnifiedLayout
        config={config}
        onConfigChange={reloadConfig}
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
