import React, { useEffect, useRef } from 'react';
import { MessageItem } from './MessageItem';
import type { Message } from '../../schemas';

interface MessageListProps {
  messages: Message[];
  operationDecisions?: Map<number, 'approve' | 'reject'>;
  onToggleOperationDecision?: (idx: number, decision: 'approve' | 'reject') => void;
  onApproveOperation?: (message: Message, idx: number) => void;
  onRejectOperation?: (message: Message, idx: number) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  operationDecisions,
  onToggleOperationDecision,
  onApproveOperation,
  onRejectOperation,
}) => {
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
          {messages.map((message, index) => {
            // Check if this is the last message with pending operations
            const isLastMessage = index === messages.length - 1;
            const hasPendingOps = message.operations?.some(op => op.status === 'analyzed');
            const pendingOpCount = message.operations?.filter(op => op.status === 'analyzed').length || 0;

            return (
              <MessageItem
                key={index}
                message={message}
                operationDecisions={operationDecisions}
                onToggleOperationDecision={onToggleOperationDecision}
                onApproveOperation={onApproveOperation}
                onRejectOperation={onRejectOperation}
                hasMultiplePendingOps={pendingOpCount > 1}
              />
            );
          })}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
};
