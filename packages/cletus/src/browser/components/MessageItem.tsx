import React from 'react';
import { OperationDisplay } from './OperationDisplay';

interface Operation {
  type: string;
  status: string;
  input: any;
  output?: any;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content?: string;
  created: number;
  operations?: Operation[];
}

interface MessageItemProps {
  message: Message;
  showInput: boolean;
  showOutput: boolean;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message, showInput, showOutput }) => {
  const { role, content, operations } = message;

  return (
    <div className={`message message-${role}`}>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', opacity: 0.7 }}>
        {role === 'user' ? 'You' : role === 'assistant' ? 'Assistant' : 'System'}
      </div>
      
      {content && (
        <div style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
          {content}
        </div>
      )}

      {operations && operations.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          {operations.map((operation, index) => (
            <OperationDisplay
              key={index}
              operation={operation}
              showInput={showInput}
              showOutput={showOutput}
            />
          ))}
        </div>
      )}

      <div style={{ fontSize: '0.7rem', marginTop: '0.5rem', opacity: 0.5 }}>
        {new Date(message.created).toLocaleString()}
      </div>
    </div>
  );
};
