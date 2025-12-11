import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import type { ChatMeta } from '../../schemas';

interface ChatInputProps {
  chatId: string;
  chatMeta: ChatMeta;
  onMessageSent: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ chatId, chatMeta, onMessageSent }) => {
  const [input, setInput] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
      setIsConnecting(false);
      // Initialize chat
      ws.send(JSON.stringify({
        type: 'init_chat',
        data: { chatId },
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'chat_initialized':
          console.log('Chat initialized');
          break;

        case 'message_added':
          onMessageSent();
          break;

        case 'status_update':
          setStatus(message.data.status);
          break;

        case 'messages_updated':
        case 'response_complete':
          setIsProcessing(false);
          setStatus('');
          onMessageSent();
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

    wsRef.current.send(JSON.stringify({
      type: 'send_message',
      data: { content: input.trim() },
    }));

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
          className="min-h-[100px] resize-none"
        />
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="px-2 py-1 rounded bg-muted text-muted-foreground">
              {chatMeta.mode}
            </span>
            {chatMeta.assistant && (
              <span className="text-neon-purple">{chatMeta.assistant}</span>
            )}
          </div>
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
      </form>
    </div>
  );
};
