import React, { useState } from 'react';

interface ChatMeta {
  id: string;
  name: string;
  mode: string;
  created: number;
  updated: number;
}

interface ConfigData {
  chats: ChatMeta[];
}

interface ChatListProps {
  config: ConfigData;
  onChatSelect: (chatId: string) => void;
  onConfigChange: () => Promise<void>;
}

export const ChatList: React.FC<ChatListProps> = ({ config, onChatSelect, onConfigChange }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newChatName, setNewChatName] = useState('');

  const chats = config.chats;
  const sortedChats = [...chats].sort((a, b) => b.updated - a.updated);

  const handleCreateChat = async () => {
    if (!newChatName.trim()) return;

    try {
      const response = await fetch('/api/chat/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newChatName.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        await onConfigChange();
        setIsCreating(false);
        setNewChatName('');
        onChatSelect(data.data.chatId);
      }
    } catch (error) {
      console.error('Failed to create chat:', error);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Your Chats</h2>
        {!isCreating && (
          <button className="btn btn-primary btn-small" onClick={() => setIsCreating(true)}>
            + New Chat
          </button>
        )}
      </div>

      {isCreating && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>Create New Chat</h3>
          <input
            type="text"
            className="input"
            placeholder="Chat name..."
            value={newChatName}
            onChange={(e) => setNewChatName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleCreateChat()}
            autoFocus
            style={{ marginBottom: '0.5rem' }}
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary btn-small" onClick={handleCreateChat}>
              Create
            </button>
            <button 
              className="btn btn-small" 
              onClick={() => {
                setIsCreating(false);
                setNewChatName('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {sortedChats.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--text-secondary)' }}>No chats yet. Create one to get started!</p>
        </div>
      ) : (
        <div>
          {sortedChats.map((chat) => (
            <div
              key={chat.id}
              className="card card-hover"
              onClick={() => onChatSelect(chat.id)}
            >
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{chat.name}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Mode: {chat.mode} • Updated: {new Date(chat.updated).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
