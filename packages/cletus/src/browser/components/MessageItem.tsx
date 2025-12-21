import { Bot, Info, User, Download } from 'lucide-react';
import React, { useState } from 'react';
import type { Message } from '../../schemas';
import { cn } from '../lib/utils';
import { OperationDisplay } from '../operations';
import { MarkdownContent, CustomLink } from './Markdown';
import { ClickableImage } from './ImageViewer';
import { TypingIndicator } from './TypingIndicator';
import { ExpandableText } from './ExpandableText';

interface MessageItemProps {
  message: Message;
  operationDecisions?: Map<number, 'approve' | 'reject'>;
  onToggleOperationDecision?: (idx: number, decision: 'approve' | 'reject') => void;
  onApproveOperation: (message: Message, idx: number) => void;
  onRejectOperation: (message: Message, idx: number) => void;
  hasMultiplePendingOps?: boolean;
  isProcessing?: boolean;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  operationDecisions,
  onToggleOperationDecision,
  onApproveOperation,
  onRejectOperation,
  hasMultiplePendingOps = false,
  isProcessing = false,
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

  // Filter content: show all non-empty content without operationIndex, and operations
  const visibleContent = mappedContent.filter(
    (c) => (c.operationIndex === undefined && c.content.trim().length > 0) || c.operation
  );

  const isUrl = (str: string): boolean => {
    return str.startsWith('http://') || str.startsWith('https://') || str.startsWith('file://');
  };

  const downloadDataFile = (dataUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

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
      <div className={cn('flex-1 space-y-2 min-w-0', isUser && 'flex flex-col items-end')}>
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
          {visibleContent.length === 0 && isAssistant && isProcessing ? (
            <div className="rounded-lg bg-card p-2">
              <TypingIndicator />
            </div>
          ) : visibleContent.length === 0 && isAssistant ? null : (
            visibleContent.map((item, index) => {
            // Render operation if this content item has an operation
            if (item.operation && item.operationIndex !== undefined) {
              const opIdx = item.operationIndex;

              return (
                <OperationDisplay
                  key={index}
                  operation={item.operation}
                  operationIndex={opIdx}
                  approvalDecision={operationDecisions?.get(opIdx)}
                  onToggleDecision={onToggleOperationDecision}
                  onApprove={() => onApproveOperation(message, opIdx)}
                  onReject={() => onRejectOperation(message, opIdx)}
                  hasMultipleOperations={hasMultiplePendingOps}
                />
              );
            }

            // Render content based on type
            if (item.type === 'image') {
              const hasProtocol = item.content.startsWith('data:') || isUrl(item.content);
              if (hasProtocol) {
                return (
                  <div key={index} className="max-w-3xl">
                    <ClickableImage
                      src={item.content}
                      alt="Image"
                      className="max-w-full rounded-lg"
                    />
                  </div>
                );
              }
            }

            if (item.type === 'audio') {
              const hasProtocol = item.content.startsWith('data:') || isUrl(item.content);
              if (hasProtocol) {
                return (
                  <div
                    key={index}
                    className={cn(
                      'rounded-lg p-4 max-w-3xl',
                      isUser && 'bg-neon-purple/10 border border-neon-purple/30',
                      isAssistant && 'bg-card',
                      isSystem && 'bg-muted/50 border border-muted'
                    )}
                  >
                    <audio controls className="w-full">
                      <source src={item.content} />
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                );
              }
            }

            if (item.type === 'file') {
              if (item.content.startsWith('data:')) {
                // Extract filename from data URL or use default
                const match = item.content.match(/data:([^;]+);/);
                const mimeType = match ? match[1] : 'application/octet-stream';
                const extension = mimeType.split('/')[1] || 'bin';
                const filename = `file.${extension}`;

                return (
                  <div
                    key={index}
                    className={cn(
                      'rounded-lg p-4 max-w-3xl',
                      isUser && 'bg-neon-purple/10 border border-neon-purple/30',
                      isAssistant && 'bg-card',
                      isSystem && 'bg-muted/50 border border-muted'
                    )}
                  >
                    <button
                      onClick={() => downloadDataFile(item.content, filename)}
                      className="flex items-center gap-2 text-neon-cyan hover:underline cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      Download File
                    </button>
                  </div>
                );
              } else if (isUrl(item.content)) {
                return (
                  <div
                    key={index}
                    className={cn(
                      'rounded-lg p-4 max-w-3xl',
                      isUser && 'bg-neon-purple/10 border border-neon-purple/30',
                      isAssistant && 'bg-card',
                      isSystem && 'bg-muted/50 border border-muted'
                    )}
                  >
                    <CustomLink href={item.content}>
                      {item.content}
                    </CustomLink>
                  </div>
                );
              }
            }

            // Render text content with expandable feature for user messages
            return (
              <ExpandableText
                key={index}
                content={item.content}
                isUser={isUser}
                isAssistant={isAssistant}
                isSystem={isSystem}
              />
            );
            })
          )}
        </div>

        {/* Timestamp */}
        <div className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
          {new Date(message.created).toLocaleString()}
        </div>
      </div>
    </div>
  );
};
