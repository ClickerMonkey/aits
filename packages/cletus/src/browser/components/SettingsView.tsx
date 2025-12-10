import React from 'react';
import type { ConfigFile } from '../../config';

interface SettingsViewProps {
  config: ConfigFile;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ config }) => {
  const data = config.getData();

  return (
    <div style={{ maxWidth: '800px' }}>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>User Information</h2>
        <div className="flex flex-col gap-2">
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              Name
            </div>
            <div style={{ fontWeight: 500 }}>{data.user.name}</div>
          </div>
          {data.user.pronouns && (
            <div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Pronouns
              </div>
              <div style={{ fontWeight: 500 }}>{data.user.pronouns}</div>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Assistants</h2>
        {data.assistants.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No assistants configured</p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.assistants.map((assistant, index) => (
              <div key={index} style={{ padding: '0.75rem', background: 'var(--bg)', borderRadius: '6px' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{assistant.name}</div>
                {assistant.description && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {assistant.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Data Types</h2>
        {data.types.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No data types defined</p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.types.map((type, index) => (
              <div key={index} style={{ padding: '0.75rem', background: 'var(--bg)', borderRadius: '6px' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                  {type.friendlyName} ({type.name})
                </div>
                {type.description && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {type.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Note</h2>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Settings can only be modified through the CLI version of Cletus. 
          Run <code style={{ background: 'var(--surface)', padding: '0.125rem 0.5rem', borderRadius: '4px' }}>cletus</code> to access the settings menu.
        </p>
      </div>
    </div>
  );
};
