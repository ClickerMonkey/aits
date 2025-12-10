import React, { useEffect, useRef } from 'react';
import { MessageItem } from './MessageItem';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content?: string;
  created: number;
  operations?: Array<{
    type: string;
    status: string;
    input: any;
    output?: any;
  }>;
}

interface MessageListProps {
  messages: Message[];
  showInput: boolean;
  showOutput: boolean;
  onMessagesUpdate: (messages: Message[]) => void;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, showInput, showOutput, onMessagesUpdate }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

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
            showInput={showInput}
            showOutput={showOutput}
          />
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
};
