import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, X, CheckCircle2, XCircle, StopCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import type { ChatMeta, MessageContent, Config } from '../../schemas';
import type { ClientMessage, ServerMessage } from '../websocket-types';
import { sendClientMessage } from '../websocket-types';

interface ChatInputProps {
  chatId: string;
  chatMeta: ChatMeta;
  config: Config;
  messageCount: number;
  totalCost: number;
  status: string;
  isProcessing: boolean;
  onSendMessage: (content: MessageContent[]) => void;
  onCancel: () => void;
  onModelClick?: () => void;
  hasMultiplePendingOperations?: boolean;
  allOperationsDecided?: boolean;
  hasOperationsProcessing?: boolean;
  onApproveAll?: () => void;
  onRejectAll?: () => void;
  onSubmitDecisions?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  chatId,
  chatMeta,
  config,
  messageCount,
  totalCost,
  status,
  isProcessing,
  onSendMessage,
  onCancel,
  onModelClick,
  hasMultiplePendingOperations = false,
  allOperationsDecided = false,
  hasOperationsProcessing = false,
  onApproveAll,
  onRejectAll,
  onSubmitDecisions,
}) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea as content changes
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, window.innerHeight * 0.5)}px`;
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || isProcessing) {
      return;
    }

    // Send message with proper MessageContent[] format
    const content: MessageContent[] = [{
      type: 'text',
      content: input.trim(),
    }];

    onSendMessage(content);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="p-4">
      {status && (
        <div className="mb-3 flex items-center gap-2 text-sm text-neon-cyan animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{status}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isProcessing
              ? 'Processing...'
              : 'Type your message... (Enter to send, Shift+Enter for new line)'
          }
          disabled={isProcessing}
          className="min-h-[100px] max-h-[50vh] resize-none overflow-y-auto"
          style={{ height: 'auto' }}
        />
        <div className="flex items-center justify-between">
          <div className="text-xs flex items-center gap-2 flex-wrap flex-1">
            <span
              className="text-foreground cursor-pointer hover:text-neon-cyan transition-colors"
              onClick={onModelClick}
              title="Click to change model"
            >
              {chatMeta.model || config.user.models?.chat || 'no model'}
            </span>
            <span className="text-muted-foreground">│</span>
            <span className="text-muted-foreground">{chatMeta.toolset ? `${chatMeta.toolset} toolset` : 'adaptive tools'}</span>
            <span className="text-muted-foreground">│</span>
            <span className="text-muted-foreground">{messageCount} message{messageCount !== 1 ? 's' : ''}</span>
            <span className="text-muted-foreground">│</span>
            <span className="text-muted-foreground">{chatMeta.todos.length ? `${chatMeta.todos.length} todo${chatMeta.todos.length !== 1 ? 's' : ''}` : 'no todos'}</span>
            {totalCost > 0 && (
              <>
                <span className="text-muted-foreground">│</span>
                <span className="text-yellow-400">${totalCost.toFixed(4)}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 ml-2">
            {/* Operation Approval Buttons */}
            {hasMultiplePendingOperations && onApproveAll && onRejectAll && onSubmitDecisions && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onApproveAll}
                  disabled={hasOperationsProcessing}
                  className="text-green-400 border-green-400/30 hover:bg-green-400/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {hasOperationsProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      Approve All
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onRejectAll}
                  disabled={hasOperationsProcessing}
                  className="text-red-400 border-red-400/30 hover:bg-red-400/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  Reject All
                </Button>
                <Button
                  type="button"
                  variant="neon"
                  size="sm"
                  onClick={onSubmitDecisions}
                  disabled={!allOperationsDecided || hasOperationsProcessing}
                  className="disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {hasOperationsProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Submit'
                  )}
                </Button>
              </>
            )}

            {isProcessing && (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                onClick={onCancel}
                title="Stop"
              >
                <StopCircle className="w-5 h-5" />
              </Button>
            )}
            <Button
              type="submit"
              variant="neon"
              disabled={!input.trim() || isProcessing}
              className="gap-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};
