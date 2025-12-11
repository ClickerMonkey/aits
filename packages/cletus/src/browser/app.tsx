import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { MainPage } from './pages/MainPage';
import { ChatPage } from './pages/ChatPage';
import { InitPage } from './pages/InitPage';
import type { ChatMeta, Config } from '../schemas';

type AppView = 'loading' | 'init' | 'main' | 'chat';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('loading');
  const [config, setConfig] = useState<Config | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/' || path === '/settings') {
        setView('main');
        setSelectedChatId(null);
      } else if (path.startsWith('/chat/')) {
        const chatId = path.split('/')[2];
        setSelectedChatId(chatId);
        setView('chat');
      }
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

          // Check URL to determine initial view
          const path = window.location.pathname;
          if (path.startsWith('/chat/')) {
            const chatId = path.split('/')[2];
            // Verify the chat exists in the config
            const chatExists = message.data.chats.some((c: ChatMeta) => c.id === chatId);
            if (chatExists) {
              setSelectedChatId(chatId);
              setView('chat');
            } else {
              // Chat doesn't exist, redirect to main
              window.history.replaceState({}, '', '/');
              setView('main');
            }
          } else if (path === '/settings') {
            setView('main'); // MainPage handles settings view internally
          } else {
            setView('main');
          }
          break;

        case 'config_not_found':
          setView('init');
          break;

        case 'chat_created':
          // Reload config after chat creation
          ws.send(JSON.stringify({ type: 'get_config' }));
          if (message.data.chatId) {
            setSelectedChatId(message.data.chatId);
            setView('chat');
          }
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

  if (view === 'chat' && selectedChatId && config) {
    return (
      <ChatPage
        chatId={selectedChatId}
        config={config}
        onBack={() => {
          setView('main');
          setSelectedChatId(null);
          window.history.pushState({}, '', '/');
        }}
        onConfigChange={reloadConfig}
      />
    );
  }

  if (view === 'main' && config) {
    return (
      <MainPage
        config={config}
        onChatSelect={(chatId) => {
          setSelectedChatId(chatId);
          setView('chat');
        }}
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
