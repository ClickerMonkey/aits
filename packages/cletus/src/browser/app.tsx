import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MainPage } from './pages/MainPage';
import { ChatPage } from './pages/ChatPage';
import { InitPage } from './pages/InitPage';
import './styles.css';

type AppView = 'loading' | 'init' | 'main' | 'chat';

interface ConfigData {
  user: {
    name: string;
    pronouns?: string;
    showInput?: boolean;
    showOutput?: boolean;
  };
  assistants: Array<{
    name: string;
    description?: string;
  }>;
  chats: Array<{
    id: string;
    name: string;
    mode: string;
    assistant?: string;
    created: number;
    updated: number;
  }>;
  types: Array<{
    name: string;
    friendlyName: string;
    description?: string;
  }>;
}

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('loading');
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  useEffect(() => {
    async function loadConfig() {
      try {
        const response = await fetch('/api/config');
        if (response.ok) {
          const data = await response.json();
          setConfig(data.data);
          setView('main');
        } else {
          setView('init');
        }
      } catch (error) {
        console.error('Failed to load config:', error);
        setView('init');
      }
    }
    loadConfig();
  }, []);

  const reloadConfig = async () => {
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const data = await response.json();
        setConfig(data.data);
      }
    } catch (error) {
      console.error('Failed to reload config:', error);
    }
  };

  if (view === 'loading') {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (view === 'init') {
    return (
      <InitPage
        onComplete={() => {
          reloadConfig().then(() => setView('main'));
        }}
      />
    );
  }

  if (view === 'chat' && selectedChatId && config) {
    return (
      <ChatPage
        chatId={selectedChatId}
        config={config}
        onBack={() => setView('main')}
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
    <div className="loading-container">
      <div className="spinner"></div>
      <p>Loading...</p>
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
