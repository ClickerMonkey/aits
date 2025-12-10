import React, { useState } from 'react';
import type { ConfigFile } from '../../config';
import { Sidebar } from '../components/Sidebar';
import { ChatList } from '../components/ChatList';
import { SettingsView } from '../components/SettingsView';

interface MainPageProps {
  config: ConfigFile;
  onChatSelect: (chatId: string) => void;
  onExit: () => void;
}

type MainView = 'chats' | 'settings';

export const MainPage: React.FC<MainPageProps> = ({ config, onChatSelect, onExit }) => {
  const [view, setView] = useState<MainView>('chats');

  return (
    <div className="app-container">
      <Sidebar
        currentView={view}
        onViewChange={setView}
        userName={config.getData().user.name}
      />
      <div className="main-content">
        <div className="header">
          <h1>{view === 'chats' ? 'Chats' : 'Settings'}</h1>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
          {view === 'chats' ? (
            <ChatList config={config} onChatSelect={onChatSelect} />
          ) : (
            <SettingsView config={config} />
          )}
        </div>
      </div>
    </div>
  );
};
