import React, { useState, useRef, useEffect } from 'react';
import type { ConfigFile } from '../../config';
import type { ChatMeta } from '../../schemas';

interface ChatInputProps {
  chatId: string;
  chatMeta: ChatMeta;
  config: ConfigFile;
  onMessageSent: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ chatId, chatMeta, config, onMessageSent }) => {
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
    <div style={{ borderTop: '1px solid var(--border)', padding: '1rem' }}>
      {status && (
        <div style={{
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          marginBottom: '0.5rem',
          fontStyle: 'italic',
        }}>
          {status}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          className="input textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isConnecting ? 'Connecting...' : isProcessing ? 'Processing...' : 'Type your message... (Enter to send, Shift+Enter for new line)'}
          disabled={isConnecting || isProcessing}
          style={{ minHeight: '80px', marginBottom: '0.5rem' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Mode: {chatMeta.mode}
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!input.trim() || isProcessing || isConnecting}
          >
            {isProcessing ? 'Processing...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
};
