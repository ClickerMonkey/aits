import React, { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { ChatList } from '../components/ChatList';
import { SettingsView } from '../components/SettingsView';

interface ConfigData {
  user: {
    name: string;
    pronouns?: string;
  };
  assistants: Array<{
    name: string;
    description?: string;
  }>;
  chats: Array<{
    id: string;
    name: string;
    mode: string;
    created: number;
    updated: number;
  }>;
  types: Array<{
    name: string;
    friendlyName: string;
    description?: string;
  }>;
}

interface MainPageProps {
  config: ConfigData;
  onChatSelect: (chatId: string) => void;
  onConfigChange: () => Promise<void>;
}

type MainView = 'chats' | 'settings';

export const MainPage: React.FC<MainPageProps> = ({ config, onChatSelect, onConfigChange }) => {
  const [view, setView] = useState<MainView>('chats');

  return (
    <div className="app-container">
      <Sidebar
        currentView={view}
        onViewChange={setView}
        userName={config.user.name}
      />
      <div className="main-content">
        <div className="header">
          <h1>{view === 'chats' ? 'Chats' : 'Settings'}</h1>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
          {view === 'chats' ? (
            <ChatList config={config} onChatSelect={onChatSelect} onConfigChange={onConfigChange} />
          ) : (
            <SettingsView config={config} />
          )}
        </div>
      </div>
    </div>
  );
};
