import React from 'react';
import { Collapsible } from './Collapsible';

interface Operation {
  type: string;
  status: string;
  input: any;
  output?: any;
}

interface OperationDisplayProps {
  operation: Operation;
  showInput: boolean;
  showOutput: boolean;
}

export const OperationDisplay: React.FC<OperationDisplayProps> = ({
  operation,
  showInput,
  showOutput,
}) => {
  const { type, status, input, output } = operation;
  
  // Status color
  const statusColor = 
    status === 'done' ? 'var(--success)' :
    status === 'doneError' ? 'var(--error)' :
    status === 'rejected' ? 'var(--error)' :
    status === 'analyzedBlocked' ? 'var(--warning)' :
    'var(--text-secondary)';

  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <div style={{
        padding: '0.75rem',
        background: 'var(--surface)',
        borderRadius: '6px',
        borderLeft: `3px solid ${statusColor}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.9rem' }}>
            {type}
          </span>
          <span style={{ fontSize: '0.85rem', color: statusColor }}>
            {status}
          </span>
        </div>

        {showInput && input && (
          <Collapsible title="Input" defaultOpen={false}>
            <pre style={{
              fontSize: '0.85rem',
              overflow: 'auto',
              background: 'var(--bg)',
              padding: '0.5rem',
              borderRadius: '4px',
            }}>
              {JSON.stringify(input, null, 2)}
            </pre>
          </Collapsible>
        )}

        {showOutput && output && (
          <Collapsible title="Output" defaultOpen={false}>
            <pre style={{
              fontSize: '0.85rem',
              overflow: 'auto',
              background: 'var(--bg)',
              padding: '0.5rem',
              borderRadius: '4px',
            }}>
              {JSON.stringify(output, null, 2)}
            </pre>
          </Collapsible>
        )}
      </div>
    </div>
  );
};
