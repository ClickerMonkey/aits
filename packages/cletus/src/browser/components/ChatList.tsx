import React, { useState } from 'react';
import { MessageSquare, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import type { Config } from '../../schemas';

interface ChatListProps {
  config: Config;
  onChatSelect: (chatId: string) => void;
  onConfigChange: () => Promise<void>;
  forceShowCreate?: boolean;
  onCreateClose?: () => void;
}

export const ChatList: React.FC<ChatListProps> = ({ config, onChatSelect, onConfigChange, forceShowCreate = false, onCreateClose }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newChatName, setNewChatName] = useState('');

  const showCreate = isCreating || forceShowCreate;

  const chats = config.chats;
  const sortedChats = [...chats].sort((a, b) => b.updated - a.updated);

  const handleCreateChat = async () => {
    if (!newChatName.trim()) return;

    try {
      // Send create chat message via WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}`);

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'create_chat',
          data: { name: newChatName.trim() },
        }));
      };

      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'chat_created') {
          await onConfigChange();
          setIsCreating(false);
          setNewChatName('');
          onCreateClose?.();
          onChatSelect(message.data.chatId);
          ws.close();
        } else if (message.type === 'error') {
          console.error('Failed to create chat:', message.data.message);
          ws.close();
        }
      };
    } catch (error) {
      console.error('Failed to create chat:', error);
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

  return (
    <div className="space-y-6">
      {showCreate && (
        <Card className="border-neon-cyan/50 shadow-lg">
          <CardHeader>
            <CardTitle className="neon-text-cyan">Create New Chat</CardTitle>
            <CardDescription>Start a new conversation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="text"
              placeholder="Enter chat name..."
              value={newChatName}
              onChange={(e) => setNewChatName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateChat()}
              autoFocus
            />
            <div className="flex gap-2">
              <Button variant="neon" onClick={handleCreateChat} className="flex-1">
                Create
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreating(false);
                  setNewChatName('');
                  onCreateClose?.();
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {sortedChats.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center space-y-4">
            <MessageSquare className="w-16 h-16 mx-auto text-muted-foreground" />
            <div>
              <p className="text-lg font-semibold text-muted-foreground">No chats yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create a new chat to get started!
              </p>
            </div>
            <Button variant="neon" onClick={() => setIsCreating(true)}>
              Create Your First Chat
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedChats.map((chat) => (
            <Card
              key={chat.id}
              className="cursor-pointer transition-all hover:scale-105 hover:border-neon-cyan/70 group"
              onClick={() => onChatSelect(chat.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <MessageSquare className="w-5 h-5 text-neon-purple group-hover:text-neon-cyan transition-colors" />
                  <span className="text-xs px-2 py-0.5 rounded-full bg-neon-purple/20 text-neon-purple border border-neon-purple/50">
                    {chat.mode}
                  </span>
                </div>
                <CardTitle className="text-lg mt-3 group-hover:neon-text-cyan transition-all">
                  {chat.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span>{formatDate(chat.updated)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
