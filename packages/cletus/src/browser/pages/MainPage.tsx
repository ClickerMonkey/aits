import React, { useState } from 'react';
import { MessageSquare, Settings, Plus, Sparkles } from 'lucide-react';
import { Button } from '../components/ui/button';
import { ScrollArea } from '../components/ui/scroll-area';
import { ChatList } from '../components/ChatList';
import { SettingsView } from '../components/SettingsView';
import type { Config } from '../../schemas';

interface MainPageProps {
  config: Config;
  onChatSelect: (chatId: string) => void;
  onConfigChange: () => Promise<void>;
}

type MainView = 'chats' | 'settings';

export const MainPage: React.FC<MainPageProps> = ({ config, onChatSelect, onConfigChange }) => {
  const [view, setView] = useState<MainView>('chats');
  const [showNewChat, setShowNewChat] = useState(false);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-card/50 backdrop-blur-sm flex flex-col">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3 mb-6">
            <Sparkles className="w-8 h-8 text-neon-cyan" />
            <h1 className="text-2xl font-bold neon-text-purple">Cletus</h1>
          </div>
          <div className="text-sm text-muted-foreground">
            Welcome, <span className="text-neon-cyan font-semibold">{config.user.name}</span>
          </div>
        </div>

        <nav className="flex-1 p-4">
          <div className="space-y-2">
            <Button
              variant={view === 'chats' ? 'default' : 'ghost'}
              className="w-full justify-start gap-3"
              onClick={() => {
                setView('chats');
                window.history.pushState({}, '', '/');
              }}
            >
              <MessageSquare className="w-4 h-4" />
              Chats
            </Button>
            <Button
              variant={view === 'settings' ? 'default' : 'ghost'}
              className="w-full justify-start gap-3 text-foreground hover:text-foreground"
              onClick={() => {
                setView('settings');
                window.history.pushState({}, '', '/settings');
              }}
            >
              <Settings className="w-4 h-4" />
              Settings
            </Button>
          </div>
        </nav>

        <div className="p-4 border-t border-border">
          <div className="text-xs text-muted-foreground text-center">
            <div className="neon-text-purple font-mono">Browser Mode</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-border bg-card/30 backdrop-blur-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold neon-text-cyan">
                {view === 'chats' ? 'Your Chats' : 'Settings'}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {view === 'chats'
                  ? `${config.chats.length} conversation${config.chats.length !== 1 ? 's' : ''}`
                  : 'Manage your preferences'
                }
              </p>
            </div>
            {view === 'chats' && (
              <Button variant="neon" className="gap-2" onClick={() => setShowNewChat(true)}>
                <Plus className="w-4 h-4" />
                New Chat
              </Button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <ScrollArea className="flex-1 p-6">
          {view === 'chats' ? (
            <ChatList
              config={config}
              onChatSelect={(chatId) => {
                window.history.pushState({}, '', `/chat/${chatId}`);
                onChatSelect(chatId);
              }}
              onConfigChange={onConfigChange}
              forceShowCreate={showNewChat}
              onCreateClose={() => setShowNewChat(false)}
            />
          ) : (
            <SettingsView config={config} />
          )}
        </ScrollArea>
      </div>
    </div>
  );
};
