import React, { useState, useEffect } from 'react';
import { ChatHeader } from '../components/ChatHeader';
import { MessageList } from '../components/MessageList';
import { ChatInput } from '../components/ChatInput';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content?: string;
  created: number;
  operations?: Array<{
    type: string;
    status: string;
    input: any;
    output?: any;
  }>;
}

interface ChatMeta {
  id: string;
  name: string;
  mode: string;
  assistant?: string;
  created: number;
  updated: number;
}

interface ConfigData {
  user: {
    name: string;
    showInput?: boolean;
    showOutput?: boolean;
  };
  chats: Array<ChatMeta>;
}

interface ChatPageProps {
  chatId: string;
  config: ConfigData;
  onBack: () => void;
  onConfigChange: () => Promise<void>;
}

export const ChatPage: React.FC<ChatPageProps> = ({ chatId, config, onBack, onConfigChange }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const chatMeta = config.chats.find((c) => c.id === chatId);

  useEffect(() => {
    const loadMessages = async () => {
      try {
        const response = await fetch(`/api/chat/${chatId}/messages`);
        if (response.ok) {
          const data = await response.json();
          setMessages(data.data.messages || []);
        }
      } catch (error) {
        console.error('Error loading messages:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
  }, [chatId]);

  const handleMessagesUpdate = () => {
    // Messages are updated via WebSocket in ChatInput
    // This is just a callback for when we need to refresh
  };

  if (!chatMeta) {
    return (
      <div className="app-container">
        <div className="main-content" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <h2>Chat not found</h2>
            <button className="btn btn-primary" onClick={onBack} style={{ marginTop: '1rem' }}>
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="main-content">
        <ChatHeader chat={chatMeta} onBack={onBack} />
        {loading ? (
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div className="spinner"></div>
          </div>
        ) : (
          <>
            <MessageList 
              messages={messages}
              showInput={config.user.showInput ?? false}
              showOutput={config.user.showOutput ?? false}
              onMessagesUpdate={setMessages}
            />
            <ChatInput 
              chatId={chatId} 
              chatMeta={chatMeta}
              onMessageSent={handleMessagesUpdate}
            />
          </>
        )}
      </div>
    </div>
  );
};
