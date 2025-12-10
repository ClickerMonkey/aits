import React, { useEffect, useRef } from 'react';
import type { ConfigFile } from '../../config';
import type { Message } from '../../schemas';
import { MessageItem } from './MessageItem';

interface MessageListProps {
  messages: Message[];
  config: ConfigFile;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, config }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const showInput = config.getData().user.showInput ?? false;
  const showOutput = config.getData().user.showOutput ?? false;

  useEffect(() => {
    // Scroll to bottom when messages change
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
      {messages.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '2rem' }}>
          <p>No messages yet. Start a conversation!</p>
        </div>
      ) : (
        messages.map((message, index) => (
          <MessageItem
            key={index}
            message={message}
            config={config}
            showInput={showInput}
            showOutput={showOutput}
          />
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
};
