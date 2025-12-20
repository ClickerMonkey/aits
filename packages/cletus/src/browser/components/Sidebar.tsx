import React from 'react';

interface SidebarProps {
  currentView: 'chats' | 'settings';
  onViewChange: (view: 'chats' | 'settings') => void;
  userName: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange, userName }) => {
  return (
    <div className="sidebar">
      <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Cletus</h2>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
          Browser Mode
        </div>
      </div>
      
      <nav style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <button
          className={`btn ${currentView === 'chats' ? 'btn-primary' : ''}`}
          onClick={() => onViewChange('chats')}
          style={{ width: '100%', textAlign: 'left' }}
        >
          💬 Chats
        </button>
        
        <button
          className={`btn ${currentView === 'settings' ? 'btn-primary' : ''}`}
          onClick={() => onViewChange('settings')}
          style={{ width: '100%', textAlign: 'left' }}
        >
          ⚙️ Settings
        </button>
      </nav>

      <div style={{ 
        padding: '1rem', 
        borderTop: '1px solid var(--border)',
        fontSize: '0.85rem',
        color: 'var(--text-secondary)'
      }}>
        <div>{userName}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
          v0.3.1
        </div>
      </div>
    </div>
  );
};
