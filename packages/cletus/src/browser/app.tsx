import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigFile, configExists } from '../file-manager';
import { InkInitWizard } from '../components/InkInitWizard';
import { MainPage } from './pages/MainPage';
import { ChatPage } from './pages/ChatPage';
import './styles.css';

type AppView = 'loading' | 'init' | 'main' | 'chat';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('loading');
  const [config, setConfig] = useState<ConfigFile | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  useEffect(() => {
    async function checkConfig() {
      const exists = await configExists();
      if (exists) {
        const cfg = new ConfigFile();
        await cfg.load();
        setConfig(cfg);
        setView('main');
      } else {
        setView('init');
      }
    }
    checkConfig();
  }, []);

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
      <InkInitWizard
        onComplete={(cfg) => {
          setConfig(cfg);
          setView('main');
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
        onExit={() => {
          if (typeof window !== 'undefined') {
            window.close();
          }
        }}
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
