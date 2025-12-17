import React from 'react';

export const TypingIndicator: React.FC = () => {
  return (
    <div className="flex gap-1.5 p-4">
      <div className="typing-dot"></div>
      <div className="typing-dot" style={{ animationDelay: '0.2s' }}></div>
      <div className="typing-dot" style={{ animationDelay: '0.4s' }}></div>
    </div>
  );
};
