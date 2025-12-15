import React from 'react';
import { User, Bot, Info } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { OperationDisplay } from '../operations';
import { cn } from '../lib/utils';
import type { Message } from '../../schemas';

interface MessageItemProps {
  message: Message;
  operationDecisions?: Map<number, 'approve' | 'reject'>;
  onToggleOperationDecision?: (idx: number, decision: 'approve' | 'reject') => void;
  onApproveOperation?: (message: Message, idx: number) => void;
  onRejectOperation?: (message: Message, idx: number) => void;
  hasMultiplePendingOps?: boolean;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  operationDecisions,
  onToggleOperationDecision,
  onApproveOperation,
  onRejectOperation,
  hasMultiplePendingOps = false,
}) => {
  const { role, name, content, operations = [] } = message;

  const isUser = role === 'user';
  const isAssistant = role === 'assistant';
  const isSystem = role === 'system';

  // Map content items to their operations
  const mappedContent = content.map((c) => ({
    ...c,
    operation: c.operationIndex !== undefined ? operations[c.operationIndex] : undefined,
  }));

  // Filter content: show text without operationIndex, and operations
  const visibleContent = mappedContent.filter(
    (c) => (c.operationIndex === undefined && c.content.trim().length > 0 && c.type === 'text') || c.operation
  );

  return (
    <div
      className={cn(
        'flex gap-4 mb-6 group',
        isUser && 'flex-row-reverse'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
          isUser && 'bg-neon-purple/20 border-2 border-neon-purple',
          isAssistant && 'bg-neon-cyan/20 border-2 border-neon-cyan',
          isSystem && 'bg-muted border-2 border-border'
        )}
      >
        {isUser && <User className="w-5 h-5 text-neon-purple" />}
        {isAssistant && <Bot className="w-5 h-5 text-neon-cyan" />}
        {isSystem && <Info className="w-5 h-5 text-muted-foreground" />}
      </div>

      {/* Content */}
      <div className={cn('flex-1 space-y-2', isUser && 'flex flex-col items-end')}>
        {/* Header */}
        <div
          className={cn(
            'text-xs font-semibold opacity-70',
            isUser && 'text-neon-purple',
            isAssistant && 'text-neon-cyan',
            isSystem && 'text-muted-foreground'
          )}
        >
          {isUser ? (name || 'You') : isAssistant ? (name || 'Assistant') : 'System'}
        </div>

        {/* Content and Operations in order */}
        <div className={cn('flex-1 space-y-2', isUser && 'flex flex-col items-end')}>
          {visibleContent.map((item, index) => {
            // Render operation if this content item has an operation
            if (item.operation && item.operationIndex !== undefined) {
              const opIdx = item.operationIndex;
              const needsApproval = item.operation.status === 'analyzed';

              return (
                <OperationDisplay
                  key={index}
                  operation={item.operation}
                  operationIndex={opIdx}
                  approvalDecision={operationDecisions?.get(opIdx)}
                  onToggleDecision={needsApproval && hasMultiplePendingOps ? onToggleOperationDecision : undefined}
                  onApprove={needsApproval && !hasMultiplePendingOps && onApproveOperation ? (idx) => onApproveOperation(message, idx) : undefined}
                  onReject={needsApproval && !hasMultiplePendingOps && onRejectOperation ? (idx) => onRejectOperation(message, idx) : undefined}
                  hasMultipleOperations={hasMultiplePendingOps}
                />
              );
            }

            // Render text content
            return (
              <div
                key={index}
                className={cn(
                  'rounded-lg p-4 max-w-3xl',
                  'prose prose-invert prose-sm max-w-none',
                  'prose-p:text-foreground prose-headings:text-foreground',
                  'prose-strong:text-foreground prose-code:text-foreground',
                  'prose-pre:bg-muted prose-pre:text-foreground',
                  'prose-a:text-neon-cyan prose-a:no-underline hover:prose-a:underline',
                  'prose-li:text-foreground prose-ul:text-foreground prose-ol:text-foreground',
                  'text-foreground',
                  isUser && 'bg-neon-purple/10 border border-neon-purple/30',
                  isAssistant && 'bg-card',
                  isSystem && 'bg-muted/50 border border-muted italic'
                )}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => <p className="text-foreground mb-2">{children}</p>,
                    ul: ({ children }) => <ul className="text-foreground list-disc ml-6 mb-2 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="text-foreground list-decimal ml-6 mb-2 space-y-1">{children}</ol>,
                    li: ({ children }) => <li className="text-foreground ml-2">{children}</li>,
                    code: ({ inline, children, ...props }: any) => {
                      return inline ? (
                        <code className="text-foreground bg-muted px-1 py-0.5 rounded" {...props}>
                          {children}
                        </code>
                      ) : (
                        <code className="text-foreground" {...props}>
                          {children}
                        </code>
                      );
                    },
                    pre: ({ children }) => <pre className="text-foreground bg-muted p-3 rounded mb-2 overflow-x-auto">{children}</pre>,
                    a: ({ href, children }) => (
                      <a href={href} className="text-neon-cyan hover:underline" target="_blank" rel="noopener noreferrer">
                        {children}
                      </a>
                    ),
                  }}
                >
                  {item.content}
                </ReactMarkdown>
              </div>
            );
          })}
        </div>

        {/* Timestamp */}
        <div className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
          {new Date(message.created).toLocaleString()}
        </div>
      </div>
    </div>
  );
};
