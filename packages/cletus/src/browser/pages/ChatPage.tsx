import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Bot } from 'lucide-react';
import { Button } from '../components/ui/button';
import { ScrollArea } from '../components/ui/scroll-area';
import { MessageList } from '../components/MessageList';
import { ChatInput } from '../components/ChatInput';
import type { Message, Config } from '../../schemas';

interface ChatPageProps {
  chatId: string;
  config: Config;
  onBack: () => void;
  onConfigChange: () => Promise<void>;
}

export const ChatPage: React.FC<ChatPageProps> = ({ chatId, config, onBack, onConfigChange }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);

  const chatMeta = config.chats.find((c) => c.id === chatId);

  useEffect(() => {
    // Connect to WebSocket and get messages
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'get_messages',
        data: { chatId },
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'messages') {
        setMessages(message.data.messages || []);
        setLoading(false);
        ws.close();
      } else if (message.type === 'error') {
        console.error('Error loading messages:', message.data.message);
        setLoading(false);
        ws.close();
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setLoading(false);
    };

    wsRef.current = ws;

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [chatId]);

  const handleMessagesUpdate = () => {
    // Messages are updated via WebSocket in ChatInput
    // This is just a callback for when we need to refresh
  };

  if (!chatMeta) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold neon-text-cyan">Chat not found</h2>
          <Button variant="neon" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <div className="border-b border-border bg-card/30 backdrop-blur-sm p-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h2 className="text-xl font-bold neon-text-cyan">{chatMeta.title}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-neon-purple/20 text-neon-purple border border-neon-purple/50">
                  {chatMeta.mode}
                </span>
                {chatMeta.assistant && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Bot className="w-3 h-3" />
                    {chatMeta.assistant}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="spinner mx-auto"></div>
              <p className="text-muted-foreground">Loading messages...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Messages Area */}
            <ScrollArea className="flex-1 p-6">
              <MessageList
                messages={messages}
                showInput={config.user.showInput ?? false}
                showOutput={config.user.showOutput ?? false}
                onMessagesUpdate={setMessages}
              />
            </ScrollArea>

            {/* Input Area */}
            <div className="border-t border-border bg-card/30 backdrop-blur-sm">
              <ChatInput
                chatId={chatId}
                chatMeta={chatMeta}
                onMessageSent={handleMessagesUpdate}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
