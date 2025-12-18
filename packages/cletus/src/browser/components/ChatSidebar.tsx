import { ChevronLeft, ChevronRight, Clock, MessageSquare, Plus, Sparkles, User } from 'lucide-react';
import React from 'react';
import type { Config } from '../../schemas';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';

interface ChatSidebarProps {
  config: Config;
  currentChatId: string | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onChatSelect: (chatId: string) => void;
  onProfileClick: () => void;
  onCreateChat?: () => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  config,
  currentChatId,
  isCollapsed,
  onToggleCollapse,
  onChatSelect,
  onProfileClick,
  onCreateChat,
}) => {
  const chats = config.chats;
  const sortedChats = [...chats].sort((a, b) => b.updated - a.updated);

  const handleCreateChat = () => {
    if (onCreateChat) {
      onCreateChat();
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString();
    }
  };

  if (isCollapsed) {
    return (
      <div className="w-16 border-r border-border bg-card/50 backdrop-blur-sm flex flex-col items-center py-4 gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          title="Expand sidebar"
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCreateChat}
          title="New Chat"
        >
          <Plus className="w-5 h-5" />
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          onClick={onProfileClick}
          title="Profile"
        >
          <User className="w-5 h-5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="w-80 border-r border-border bg-card/50 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-neon-cyan" />
          <h2 className="text-lg font-bold neon-text-purple">Cletus</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onProfileClick}
            title="Profile"
          >
            <User className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            title="Collapse sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* New Chat Button */}
      <div className="p-4 border-b border-border">
        <Button
          variant="neon"
          className="w-full gap-2"
          onClick={handleCreateChat}
        >
          <Plus className="w-4 h-4" />
          New Chat
        </Button>
      </div>

      {/* Chat List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {sortedChats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => onChatSelect(chat.id)}
              className={`w-full text-left p-3 rounded-lg transition-all hover:bg-card/80 border ${
                currentChatId === chat.id
                  ? 'bg-card border-neon-cyan/50 shadow-lg'
                  : 'bg-card/50 border-transparent'
              }`}
            >
              <div className="flex items-start gap-2 mb-2">
                <MessageSquare className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                  currentChatId === chat.id ? 'text-neon-cyan' : 'text-neon-purple'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className={`font-medium text-sm truncate ${
                    currentChatId === chat.id ? 'neon-text-cyan' : 'text-foreground'
                  }`}>
                    {chat.title}
                  </div>
                </div>
                <span className="text-xs px-1.5 py-0.5 rounded bg-neon-purple/20 text-neon-purple border border-neon-purple/50 flex-shrink-0">
                  {chat.mode}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground pl-6">
                <Clock className="w-3 h-3" />
                <span>{formatDate(chat.updated)}</span>
              </div>
            </button>
          ))}
          {sortedChats.length === 0 && (
            <div className="text-center text-muted-foreground p-8">
              <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No chats yet</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* User Info Footer */}
      <div className="p-4 border-t border-border">
        <div className="text-xs text-muted-foreground">
          <span className="text-neon-cyan font-semibold">{config.user.name}</span>
        </div>
      </div>
    </div>
  );
};
