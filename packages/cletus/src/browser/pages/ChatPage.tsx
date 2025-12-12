import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Settings, CheckSquare, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { ScrollArea } from '../components/ui/scroll-area';
import { MessageList } from '../components/MessageList';
import { ChatInput } from '../components/ChatInput';
import { ModeSelector } from '../components/ModeSelector';
import { AgentModeSelector } from '../components/AgentModeSelector';
import { AssistantSelector } from '../components/AssistantSelector';
import { ModelSelector } from '../components/ModelSelector';
import { CommandsPanel } from '../components/CommandsPanel';
import { ChatSettingsDialog } from '../components/ChatSettingsDialog';
import { TodosModal } from '../components/TodosModal';
import type { Message, Config, ChatMeta } from '../../schemas';
import { sendClientMessage } from '../websocket-types';

interface ChatPageProps {
  chatId: string;
  config: Config;
  onBack: () => void;
  onConfigChange: () => Promise<void>;
}

export const ChatPage: React.FC<ChatPageProps> = ({ chatId, config, onBack, onConfigChange }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingMessage, setPendingMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showCommandsPanel, setShowCommandsPanel] = useState(false);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [showTodos, setShowTodos] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const [chatMetaState, setChatMetaState] = useState<ChatMeta | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const chatMeta = chatMetaState || config.chats.find((c) => c.id === chatId);

  useEffect(() => {
    // Connect to WebSocket and get messages
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'get_messages',
        data: { chatId },
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'messages':
          setMessages(message.data.messages || []);
          setLoading(false);
          ws.close();
          break;
        case 'chat_updated':
          // Update local chat meta when server sends updates
          if (message.data.chat) {
            setChatMetaState(message.data.chat);
            onConfigChange(); // Refresh parent config
          }
          break;
        case 'usage_update':
          if (message.data.accumulatedCost !== undefined) {
            setTotalCost(message.data.accumulatedCost);
          }
          break;
        case 'error':
          console.error('Error loading messages:', message.data.message);
          setLoading(false);
          ws.close();
          break;
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setLoading(false);
    };

    wsRef.current = ws;

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [chatId]);

  const handleWebSocketMessage = (message: any) => {
    switch (message.type) {
      case 'message_added':
        // User message was added - reload to get it
        handleMessagesUpdate();
        break;

      case 'pending_update':
        // Show pending assistant message
        setPendingMessage(message.data.pending);
        break;

      case 'message_updated':
        // Update existing message (usually user message with usage info)
        setMessages(prev => prev.map(msg =>
          msg.created === message.data.message.created ? message.data.message : msg
        ));
        break;

      case 'messages_updated':
        // Server sent updated messages list
        if (message.data.messages) {
          setMessages(message.data.messages);
        }
        break;

      case 'response_complete':
        // Assistant response is complete - add the final message
        setPendingMessage(null);
        if (message.data.message) {
          setMessages(prev => [...prev, message.data.message]);
        }
        break;

      case 'usage_update':
        if (message.data.accumulatedCost !== undefined) {
          setTotalCost(message.data.accumulatedCost);
        }
        break;

      case 'chat_updated':
        if (message.data.chat) {
          setChatMetaState(message.data.chat);
          onConfigChange();
        }
        break;
    }
  };

  const handleMessagesUpdate = async () => {
    // Reload messages from server
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'get_messages',
        data: { chatId },
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'messages') {
        setMessages(message.data.messages || []);
        ws.close();
      } else if (message.type === 'error') {
        console.error('Error refreshing messages:', message.data.message);
        ws.close();
      }
    };
  };

  const sendWebSocketMessage = (type: string, data: any) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type, data }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'chat_updated' && message.data.chat) {
        setChatMetaState(message.data.chat);
        onConfigChange();
      }
      ws.close();
    };
  };

  const handleModeChange = (mode: string) => {
    sendWebSocketMessage('update_chat_meta', { chatId, updates: { mode } });
  };

  const handleAgentModeChange = (agentMode: string) => {
    sendWebSocketMessage('update_chat_meta', { chatId, updates: { agentMode } });
  };

  const handleAssistantChange = (assistant: string) => {
    const assistantValue = assistant === 'none' ? undefined : assistant;
    sendWebSocketMessage('update_chat_meta', { chatId, updates: { assistant: assistantValue } });
  };

  const handleModelChange = (model: string) => {
    sendWebSocketMessage('update_chat_meta', { chatId, updates: { model } });
  };

  const handleFetchModels = async (): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}`);

      ws.onopen = () => {
        sendClientMessage(ws, { type: 'get_models' });
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'models') {
          resolve(message.data.models || []);
          ws.close();
        } else if (message.type === 'error') {
          reject(new Error(message.data.message));
          ws.close();
        }
      };

      ws.onerror = () => {
        reject(new Error('Failed to fetch models'));
      };
    });
  };

  const handleChatSettingsSave = (updates: { title?: string; prompt?: string; cwd?: string }) => {
    sendWebSocketMessage('update_chat_meta', { chatId, updates });
  };

  const handleAddTodo = (todo: string) => {
    sendWebSocketMessage('add_todo', { chatId, todo });
  };

  const handleToggleTodo = (index: number) => {
    sendWebSocketMessage('toggle_todo', { chatId, index });
  };

  const handleRemoveTodo = (index: number) => {
    sendWebSocketMessage('remove_todo', { chatId, index });
  };

  const handleClearTodos = () => {
    if (confirm('Are you sure you want to clear all todos?')) {
      sendWebSocketMessage('clear_todos', { chatId });
    }
  };

  const handleClearMessages = () => {
    if (showClearConfirm) {
      sendWebSocketMessage('clear_messages', { chatId });
      setMessages([]);
      setShowClearConfirm(false);
    } else {
      setShowClearConfirm(true);
    }
  };

  const handleDeleteChat = () => {
    if (confirm(`Are you sure you want to delete "${chatMeta?.title}"? This cannot be undone.`)) {
      sendWebSocketMessage('delete_chat', { chatId });
      // Navigate back after deletion
      setTimeout(() => onBack(), 500);
    }
  };

  if (!chatMeta) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold neon-text-cyan">Chat not found</h2>
          <Button variant="neon" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header with Controls */}
        <div className="relative z-10 border-b border-border bg-card/30 backdrop-blur-sm p-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1 flex items-center gap-2">
              <h2 className="text-xl font-bold neon-text-cyan">{chatMeta.title}</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDeleteChat}
                title="Delete chat"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <AssistantSelector
                assistants={config.assistants}
                currentAssistant={chatMeta.assistant}
                onChange={handleAssistantChange}
              />
              <ModeSelector mode={chatMeta.mode} onChange={handleModeChange} />
              <AgentModeSelector
                agentMode={chatMeta.agentMode || 'default'}
                onChange={handleAgentModeChange}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowTodos(true)}
                title="Todos"
              >
                <CheckSquare className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowChatSettings(true)}
                title="Chat Settings"
              >
                <Settings className="w-5 h-5" />
              </Button>
              <Button
                variant={showClearConfirm ? 'destructive' : 'ghost'}
                size="icon"
                onClick={handleClearMessages}
                title={showClearConfirm ? 'Click again to confirm' : 'Clear messages'}
              >
                <Trash2 className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="spinner mx-auto"></div>
              <p className="text-muted-foreground">Loading messages...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Messages Area */}
            <ScrollArea className="flex-1 p-6">
              <MessageList
                messages={pendingMessage ? [...messages, pendingMessage] : messages}
                showInput={config.user.showInput ?? false}
                showOutput={config.user.showOutput ?? false}
                onMessagesUpdate={setMessages}
              />
            </ScrollArea>

            {/* Input Area */}
            <div className="border-t border-border bg-card/30 backdrop-blur-sm">
              <ChatInput
                chatId={chatId}
                chatMeta={chatMeta}
                config={config}
                messageCount={messages.length}
                totalCost={totalCost}
                onMessageSent={handleMessagesUpdate}
                onWebSocketMessage={handleWebSocketMessage}
              />
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {showModelSelector && (
        <ModelSelector
          currentModel={chatMeta.model || config.user.models?.chat || ''}
          onSelect={handleModelChange}
          onClose={() => setShowModelSelector(false)}
          onFetchModels={handleFetchModels}
        />
      )}

      {showCommandsPanel && (
        <CommandsPanel onClose={() => setShowCommandsPanel(false)} />
      )}

      {showChatSettings && (
        <ChatSettingsDialog
          title={chatMeta.title}
          prompt={chatMeta.prompt}
          cwd={chatMeta.cwd}
          onSave={handleChatSettingsSave}
          onClose={() => setShowChatSettings(false)}
        />
      )}

      {showTodos && (
        <TodosModal
          todos={chatMeta.todos}
          onAddTodo={handleAddTodo}
          onToggleTodo={handleToggleTodo}
          onRemoveTodo={handleRemoveTodo}
          onClearTodos={handleClearTodos}
          onClose={() => setShowTodos(false)}
        />
      )}
    </div>
  );
};
