import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, X } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import type { ChatMeta, MessageContent, Config } from '../../schemas';
import type { ClientMessage, ServerMessage } from '../websocket-types';
import { sendClientMessage } from '../websocket-types';

const MODETEXT: Record<string, string> = {
  none: 'local allowed',
  read: 'read allowed',
  create: 'create allowed',
  update: 'update allowed',
  delete: 'delete allowed',
};

const AGENTMODETEXT: Record<string, string> = {
  default: 'run mode',
  plan: 'plan mode',
};

interface ChatInputProps {
  chatId: string;
  chatMeta: ChatMeta;
  config: Config;
  messageCount: number;
  totalCost: number;
  onMessageSent: () => void;
  onWebSocketMessage?: (message: ServerMessage) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ chatId, chatMeta, config, messageCount, totalCost, onMessageSent, onWebSocketMessage }) => {
  const [input, setInput] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea as content changes
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, window.innerHeight * 0.5)}px`;
    }
  }, [input]);

  useEffect(() => {
    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
      setIsConnecting(false);
      // Initialize chat
      sendClientMessage(ws, {
        type: 'init_chat',
        data: { chatId },
      });
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage;

      // Forward all messages to parent for handling
      if (onWebSocketMessage) {
        onWebSocketMessage(message);
      }

      switch (message.type) {
        case 'chat_initialized':
          console.log('Chat initialized');
          break;

        case 'status_update':
          setStatus(message.data.status);
          break;

        case 'response_complete':
          setIsProcessing(false);
          setStatus('');
          break;

        case 'error':
          console.error('WebSocket error:', message.data.message);
          setIsProcessing(false);
          setStatus('Error: ' + message.data.message);
          break;
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnecting(false);
      setIsProcessing(false);
    };

    ws.onclose = () => {
      setIsConnecting(false);
      setIsProcessing(false);
    };

    wsRef.current = ws;
    setIsConnecting(true);

    return () => {
      ws.close();
    };
  }, [chatId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || isProcessing || !wsRef.current) {
      return;
    }

    // Send message with proper MessageContent[] format
    const content: MessageContent[] = [{
      type: 'text',
      content: input.trim(),
    }];

    sendClientMessage(wsRef.current, {
      type: 'send_message',
      data: { chatId, content },
    });

    setInput('');
    setIsProcessing(true);
    setStatus('Processing...');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleCancel = () => {
    if (wsRef.current && isProcessing) {
      sendClientMessage(wsRef.current, {
        type: 'cancel',
      });
      setIsProcessing(false);
      setStatus('');
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
            isConnecting
              ? 'Connecting...'
              : isProcessing
              ? 'Processing...'
              : 'Type your message... (Enter to send, Shift+Enter for new line)'
          }
          disabled={isConnecting || isProcessing}
          className="min-h-[100px] max-h-[50vh] resize-none overflow-y-auto"
          style={{ height: 'auto' }}
        />
        <div className="flex items-center justify-between">
          <div className="text-xs flex items-center gap-2 flex-wrap flex-1">
            <span className="px-2 py-1 rounded bg-muted text-muted-foreground">
              {chatMeta.mode}
            </span>
            <span className="text-muted-foreground">│</span>
            <span className="text-foreground">{chatMeta.model || config.user.models?.chat || 'no model'}</span>
            {chatMeta.assistant && (
              <>
                <span className="text-muted-foreground">│</span>
                <span className="text-muted-foreground">{chatMeta.assistant}</span>
              </>
            )}
            <span className="text-muted-foreground">│</span>
            <span className="text-muted-foreground">{MODETEXT[chatMeta.mode] || chatMeta.mode}</span>
            <span className="text-muted-foreground">│</span>
            <span className="text-muted-foreground">{AGENTMODETEXT[chatMeta.agentMode || 'default']}</span>
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
            {isProcessing && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleCancel}
                className="gap-2"
              >
                <X className="w-4 h-4" />
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              variant="neon"
              disabled={!input.trim() || isProcessing || isConnecting}
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
