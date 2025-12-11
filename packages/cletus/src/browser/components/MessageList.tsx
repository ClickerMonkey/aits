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
    <div className="flex-1 overflow-auto">
      {messages.length === 0 ? (
        <div className="text-center text-muted-foreground mt-8">
          <p>No messages yet. Start a conversation!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {messages.map((message, index) => (
            <MessageItem
              key={index}
              message={message}
              showInput={showInput}
              showOutput={showOutput}
            />
          ))}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
};
