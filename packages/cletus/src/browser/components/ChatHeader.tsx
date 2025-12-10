import React from 'react';
import type { ChatMeta } from '../../schemas';

interface ChatHeaderProps {
  chat: ChatMeta;
  onBack: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ chat, onBack }) => {
  return (
    <div className="header">
      <div className="flex" style={{ alignItems: 'center', gap: '1rem' }}>
        <button className="btn btn-small" onClick={onBack}>
          ← Back
        </button>
        <div>
          <h1>{chat.name}</h1>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Mode: {chat.mode}
            {chat.assistant && ` • Assistant: ${chat.assistant}`}
          </div>
        </div>
      </div>
    </div>
  );
};
