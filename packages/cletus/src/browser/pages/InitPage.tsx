import React from 'react';

interface InitPageProps {
  onComplete: () => void;
}

export const InitPage: React.FC<InitPageProps> = ({ onComplete }) => {
  return (
    <div className="app-container">
      <div className="main-content" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ maxWidth: '600px', padding: '2rem', textAlign: 'center' }}>
          <h1 style={{ marginBottom: '1.5rem', fontSize: '2rem' }}>Welcome to Cletus</h1>
          <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
            Cletus needs to be initialized before you can use the browser mode.
          </p>
          <p style={{ marginBottom: '1rem' }}>
            Please run Cletus in CLI mode first to complete the setup:
          </p>
          <pre style={{
            background: 'var(--surface)',
            padding: '1rem',
            borderRadius: '6px',
            marginBottom: '1.5rem',
            fontSize: '1.1rem',
          }}>
            <code>cletus</code>
          </pre>
          <p style={{ marginBottom: '1.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            After completing the setup wizard, click the button below to continue.
          </p>
          <button className="btn btn-primary" onClick={onComplete}>
            I've completed setup - Refresh
          </button>
        </div>
      </div>
    </div>
  );
};
