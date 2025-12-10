import React, { useState, useEffect } from 'react';
import type { ConfigFile } from '../../config';
import type { ChatMeta, Message } from '../../schemas';
import { ChatFile } from '../../chat';
import { ChatHeader } from '../components/ChatHeader';
import { MessageList } from '../components/MessageList';
import { ChatInput } from '../components/ChatInput';

interface ChatPageProps {
  chatId: string;
  config: ConfigFile;
  onBack: () => void;
}

export const ChatPage: React.FC<ChatPageProps> = ({ chatId, config, onBack }) => {
  const [chatFile] = useState(() => new ChatFile(chatId));
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const chatMeta = config.getChats().find((c) => c.id === chatId);

  useEffect(() => {
    const loadMessages = async () => {
      try {
        await chatFile.load();
        setMessages(chatFile.getMessages());
      } catch (error) {
        console.error('Error loading chat:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
  }, [chatId]);

  const handleMessagesUpdate = () => {
    setMessages([...chatFile.getMessages()]);
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
            <MessageList messages={messages} config={config} />
            <ChatInput 
              chatId={chatId} 
              chatMeta={chatMeta}
              config={config}
              onMessageSent={handleMessagesUpdate}
            />
          </>
        )}
      </div>
    </div>
  );
};
