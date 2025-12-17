import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckSquare, Settings, Trash2, MessageSquare, Sparkles } from 'lucide-react';
import type { ChatMeta, ChatMode, Config, Message, MessageContent } from '../../schemas';
import { AgentModeSelector } from '../components/AgentModeSelector';
import { AssistantSelector } from '../components/AssistantSelector';
import { ChatInput } from '../components/ChatInput';
import { ChatSettingsDialog } from '../components/ChatSettingsDialog';
import { ChatSidebar } from '../components/ChatSidebar';
import { MessageList } from '../components/MessageList';
import { ModelSelector } from '../components/ModelSelector';
import { ModeSelector } from '../components/ModeSelector';
import { ProfileModal } from '../components/ProfileModal';
import { QuestionsModal } from '../components/QuestionsModal';
import { TodosModal } from '../components/TodosModal';
import { ToolsetSelector } from '../components/ToolsetSelector';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ScrollArea } from '../components/ui/scroll-area';
import type { ServerMessage } from '../websocket-types';
import { sendClientMessage } from '../websocket-types';

interface UnifiedLayoutProps {
  config: Config;
  onConfigChange: () => Promise<void>;
}

export const UnifiedLayout: React.FC<UnifiedLayoutProps> = ({ config, onConfigChange }) => {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingMessage, setPendingMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [showTodos, setShowTodos] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [totalCost, setTotalCost] = useState(0);
  const [operationDecisions, setOperationDecisions] = useState<Map<number, 'approve' | 'reject'>>(new Map());
  const [chatMetaState, setChatMetaState] = useState<ChatMeta | null>(null);
  const [cwd, setCwd] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const modelsResolverRef = useRef<{
    resolve: (models: any[]) => void;
    reject: (error: Error) => void;
  } | null>(null);

  const chatMeta = chatMetaState || config.chats.find((c) => c.id === selectedChatId);

  // Auto-select last chat on mount
  useEffect(() => {
    if (!selectedChatId && config.chats.length > 0) {
      const lastChat = [...config.chats].sort((a, b) => b.updated - a.updated)[0];
      if (lastChat) {
        setSelectedChatId(lastChat.id);
        window.history.replaceState({}, '', `/chat/${lastChat.id}`);
      }
    }
  }, [config.chats, selectedChatId]);

  // WebSocket connection
  useEffect(() => {
    if (!selectedChatId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
      console.log('WebSocket connected');
      sendClientMessage(ws, { type: 'get_messages', data: { chatId: selectedChatId } });
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      handleServerMessage(message);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setLoading(false);
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
    };

    wsRef.current = ws;

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [selectedChatId]);

  const handleServerMessage = (message: ServerMessage) => {
    switch (message.type) {
      case 'messages':
        setMessages(message.data.messages || []);
        setLoading(false);
        break;

      case 'message_added':
        if (wsRef.current && selectedChatId) {
          sendClientMessage(wsRef.current, { type: 'get_messages', data: { chatId: selectedChatId } });
        }
        break;

      case 'pending_update':
        setPendingMessage(message.data.pending);
        break;

      case 'message_updated':
        setMessages(prev => prev.map(msg =>
          msg.created === message.data.message.created ? message.data.message : msg
        ));
        break;

      case 'messages_updated':
        if (message.data.messages) {
          setMessages(message.data.messages);
        }
        break;

      case 'response_complete':
        setPendingMessage(null);
        setIsProcessing(false);
        setStatus('');
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
        if (message.data.cwd !== undefined) {
          setCwd(message.data.cwd);
        }
        break;

      case 'status_update':
        setStatus(message.data.status);
        break;

      case 'elapsed_update':
        break;

      case 'models':
        if (modelsResolverRef.current) {
          modelsResolverRef.current.resolve(message.data.models || []);
          modelsResolverRef.current = null;
        }
        break;

      case 'chat_deleted':
        break;

      case 'error':
        console.error('Server error:', message.data.message);
        setIsProcessing(false);
        setStatus('Error: ' + message.data.message);
        if (modelsResolverRef.current) {
          modelsResolverRef.current.reject(new Error(message.data.message));
          modelsResolverRef.current = null;
        }
        setLoading(false);
        break;

      default:
        console.warn('Unhandled message type:', (message as any).type);
    }
  };

  const send = (message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      sendClientMessage(wsRef.current, message);
    } else {
      console.error('WebSocket not connected');
    }
  };

  const handleChatSelect = (chatId: string) => {
    setSelectedChatId(chatId);
    setMessages([]);
    setPendingMessage(null);
    setLoading(true);
    window.history.pushState({}, '', `/chat/${chatId}`);
  };

  const handleSendMessage = (content: MessageContent[]) => {
    if (!selectedChatId) return;
    send({
      type: 'send_message',
      data: { chatId: selectedChatId, content },
    });
    setIsProcessing(true);
    setStatus('Processing...');
  };

  const handleCancel = () => {
    send({ type: 'cancel' });
    setIsProcessing(false);
    setStatus('');
  };

  const handleQuestionsSubmit = (questionAnswers: Record<number, Set<number>>, questionCustomAnswers: Record<number, string>) => {
    if (!selectedChatId) return;
    const answersArray: Record<number, number[]> = {};
    for (const [key, value] of Object.entries(questionAnswers)) {
      answersArray[Number(key)] = Array.from(value);
    }

    send({
      type: 'submit_question_answers',
      data: { chatId: selectedChatId, questionAnswers: answersArray, questionCustomAnswers },
    });
    setIsProcessing(true);
    setStatus('Processing answers...');
  };

  const handleQuestionsCancel = () => {
    if (!selectedChatId) return;
    send({
      type: 'update_chat_meta',
      data: { chatId: selectedChatId, updates: { questions: [] } },
    });
  };

  const handleModeChange = (mode: ChatMode) => {
    if (!selectedChatId) return;
    send({ type: 'update_chat_meta', data: { chatId: selectedChatId, updates: { mode } } });
  };

  const handleAgentModeChange = (agentMode: 'plan' | 'default' | undefined) => {
    if (!selectedChatId) return;
    send({ type: 'update_chat_meta', data: { chatId: selectedChatId, updates: { agentMode } } });
  };

  const handleToolsetChange = (toolset: string | null) => {
    if (!selectedChatId) return;
    send({ type: 'update_chat_meta', data: { chatId: selectedChatId, updates: { toolset: toolset } } });
  };

  const handleAssistantChange = (assistant: string) => {
    if (!selectedChatId) return;
    const assistantValue = assistant === 'none' ? undefined : assistant;
    send({ type: 'update_chat_meta', data: { chatId: selectedChatId, updates: { assistant: assistantValue } } });
  };

  const handleModelChange = (model: string) => {
    if (!selectedChatId) return;
    send({ type: 'update_chat_meta', data: { chatId: selectedChatId, updates: { model } } });
  };

  const handleFetchModels = async (): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      modelsResolverRef.current = { resolve, reject };

      const timeout = setTimeout(() => {
        if (modelsResolverRef.current) {
          modelsResolverRef.current.reject(new Error('Timeout fetching models'));
          modelsResolverRef.current = null;
        }
      }, 10000);

      sendClientMessage(wsRef.current, { type: 'get_models' });
    });
  };

  const handleChatSettingsSave = (updates: { title?: string; prompt?: string; cwd?: string }) => {
    if (!selectedChatId) return;
    const { cwd: newCwd, ...metaUpdates } = updates;
    send({
      type: 'update_chat_meta',
      data: { chatId: selectedChatId, updates: metaUpdates, cwd: newCwd },
    });
  };

  const handleAddTodo = (todo: string) => {
    if (!selectedChatId) return;
    send({ type: 'add_todo', data: { chatId: selectedChatId, todo } });
  };

  const handleToggleTodo = (index: number) => {
    if (!selectedChatId) return;
    send({ type: 'toggle_todo', data: { chatId: selectedChatId, index } });
  };

  const handleRemoveTodo = (index: number) => {
    if (!selectedChatId) return;
    send({ type: 'remove_todo', data: { chatId: selectedChatId, index } });
  };

  const handleClearTodos = () => {
    if (!selectedChatId) return;
    if (confirm('Are you sure you want to clear all todos?')) {
      send({ type: 'clear_todos', data: { chatId: selectedChatId } });
    }
  };

  const handleClearMessages = () => {
    setShowClearConfirm(true);
  };

  const handleConfirmClear = () => {
    if (!selectedChatId) return;
    if (clearConfirmText === 'CLEAR') {
      send({ type: 'clear_messages', data: { chatId: selectedChatId } });
      setMessages([]);
      setShowClearConfirm(false);
      setClearConfirmText('');
    }
  };

  const handleStartEditTitle = () => {
    setEditedTitle(chatMeta?.title || '');
    setIsEditingTitle(true);
  };

  const handleSaveTitle = () => {
    if (!selectedChatId || !editedTitle.trim() || editedTitle === chatMeta?.title) {
      setIsEditingTitle(false);
      return;
    }
    send({ type: 'update_chat_meta', data: { chatId: selectedChatId, updates: { title: editedTitle.trim() } } });
    setIsEditingTitle(false);
  };

  const handleCancelEditTitle = () => {
    setIsEditingTitle(false);
    setEditedTitle('');
  };

  const handleDeleteChat = () => {
    if (!selectedChatId || !chatMeta) return;
    if (confirm(`Are you sure you want to delete "${chatMeta.title}"? This cannot be undone.`)) {
      send({ type: 'delete_chat', data: { chatId: selectedChatId } });
      setSelectedChatId(null);
      setMessages([]);
      setTimeout(() => onConfigChange(), 500);
    }
  };

  const handleOperationApproval = (message: Message, approved: number[], rejected: number[]) => {
    if (!selectedChatId) return;
    send({
      type: 'handle_operations',
      data: {
        chatId: selectedChatId,
        messageCreated: message.created,
        approved,
        rejected,
      },
    });
    setOperationDecisions(new Map());
  };

  const handleToggleOperationDecision = (idx: number, decision: 'approve' | 'reject') => {
    const newDecisions = new Map(operationDecisions);
    newDecisions.set(idx, decision);
    setOperationDecisions(newDecisions);
  };

  const handleApproveAllOperations = () => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'assistant') return;

    const approvableOps = (lastMessage.operations || [])
      .map((op, idx) => ({ op, idx }))
      .filter(({ op }) => op.status === 'analyzed');

    const approved = approvableOps.map(({ idx }) => idx);
    handleOperationApproval(lastMessage, approved, []);
  };

  const handleRejectAllOperations = () => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'assistant') return;

    const approvableOps = (lastMessage.operations || [])
      .map((op, idx) => ({ op, idx }))
      .filter(({ op }) => op.status === 'analyzed');

    const rejected = approvableOps.map(({ idx }) => idx);
    handleOperationApproval(lastMessage, [], rejected);
  };

  const handleSubmitOperationDecisions = () => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'assistant') return;

    const approvableOps = (lastMessage.operations || [])
      .map((op, idx) => ({ op, idx }))
      .filter(({ op }) => op.status === 'analyzed');

    const approved: number[] = [];
    const rejected: number[] = [];

    approvableOps.forEach(({ idx }) => {
      const decision = operationDecisions.get(idx);
      if (decision === 'approve') {
        approved.push(idx);
      } else if (decision === 'reject') {
        rejected.push(idx);
      }
    });

    handleOperationApproval(lastMessage, approved, rejected);
  };

  const handleProfileSave = (updates: Partial<Config['user']>) => {
    send({ type: 'update_user', data: { updates } });
  };

  // Get the actual last message being rendered (including pending)
  const allMessages = pendingMessage ? [...messages, pendingMessage] : messages;
  const lastMessage = allMessages.length > 0 ? allMessages[allMessages.length - 1] : null;
  const lastMessagePendingOps = lastMessage?.role === 'assistant'
    ? (lastMessage.operations || []).filter(op => op.status === 'analyzed')
    : [];
  const hasMultiplePendingOps = lastMessagePendingOps.length > 1;
  const allOperationsDecided = lastMessagePendingOps.every((_op, idx) =>
    operationDecisions.has(idx)
  );

  // Empty state when no chat is selected
  if (!selectedChatId || !chatMeta) {
    return (
      <div className="flex h-screen bg-background">
        <ChatSidebar
          config={config}
          currentChatId={null}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          onChatSelect={handleChatSelect}
          onConfigChange={onConfigChange}
          onProfileClick={() => setShowProfile(true)}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-6">
            <Sparkles className="w-24 h-24 mx-auto text-neon-cyan opacity-50" />
            <div>
              <h2 className="text-3xl font-bold neon-text-cyan mb-2">Welcome to Cletus</h2>
              <p className="text-muted-foreground">
                {config.chats.length === 0
                  ? 'Create a new chat to get started'
                  : 'Select a chat from the sidebar'}
              </p>
            </div>
          </div>
        </div>

        {showProfile && (
          <ProfileModal
            user={config.user}
            onSave={handleProfileSave}
            onClose={() => setShowProfile(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <ChatSidebar
        config={config}
        currentChatId={selectedChatId}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onChatSelect={handleChatSelect}
        onConfigChange={onConfigChange}
        onProfileClick={() => setShowProfile(true)}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <div className="relative z-10 border-b border-border bg-card/30 backdrop-blur-sm p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 flex items-center gap-2">
              {isEditingTitle ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveTitle();
                      } else if (e.key === 'Escape') {
                        handleCancelEditTitle();
                      }
                    }}
                    className="flex-1 max-w-md"
                    autoFocus
                  />
                  <Button variant="ghost" size="sm" onClick={handleSaveTitle}>
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleCancelEditTitle}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <h2
                    className="text-xl font-bold neon-text-cyan cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={handleStartEditTitle}
                    title="Click to edit title"
                  >
                    {chatMeta.title}
                  </h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDeleteChat}
                    title="Delete chat"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              )}
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
              <ToolsetSelector
                toolset={chatMeta.toolset}
                onChange={handleToolsetChange}
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
                variant="ghost"
                size="icon"
                onClick={handleClearMessages}
                title="Clear messages"
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
                operationDecisions={operationDecisions}
                onToggleOperationDecision={handleToggleOperationDecision}
                onApproveOperation={(msg, idx) => handleOperationApproval(msg, [idx], [])}
                onRejectOperation={(msg, idx) => handleOperationApproval(msg, [], [idx])}
              />
            </ScrollArea>

            {/* Input Area */}
            <div className="border-t border-border bg-card/30 backdrop-blur-sm">
              <ChatInput
                chatId={selectedChatId}
                chatMeta={chatMeta}
                config={config}
                messageCount={messages.length}
                totalCost={totalCost}
                status={status}
                isProcessing={isProcessing}
                onSendMessage={handleSendMessage}
                onCancel={handleCancel}
                onModelClick={() => setShowModelSelector(true)}
                hasMultiplePendingOperations={hasMultiplePendingOps}
                allOperationsDecided={allOperationsDecided}
                onApproveAll={handleApproveAllOperations}
                onRejectAll={handleRejectAllOperations}
                onSubmitDecisions={handleSubmitOperationDecisions}
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

      {showChatSettings && (
        <ChatSettingsDialog
          title={chatMeta.title}
          prompt={chatMeta.prompt}
          cwd={cwd}
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

      {chatMeta.questions && chatMeta.questions.length > 0 && !isProcessing && (
        <QuestionsModal
          questions={chatMeta.questions}
          onSubmit={handleQuestionsSubmit}
          onCancel={handleQuestionsCancel}
        />
      )}

      {showProfile && (
        <ProfileModal
          user={config.user}
          onSave={handleProfileSave}
          onClose={() => setShowProfile(false)}
        />
      )}

      {showClearConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => {
            setShowClearConfirm(false);
            setClearConfirmText('');
          }}
        >
          <div
            className="relative w-full max-w-md bg-card rounded-lg border border-border shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-destructive mb-4">Clear All Messages</h2>
            <p className="text-foreground mb-4">
              This will permanently delete all messages in this chat. This action cannot be undone.
            </p>
            <p className="text-muted-foreground mb-4">
              Type <span className="font-mono font-bold text-foreground">CLEAR</span> to confirm:
            </p>
            <Input
              type="text"
              value={clearConfirmText}
              onChange={(e) => setClearConfirmText(e.target.value)}
              placeholder="Type CLEAR"
              className="mb-4 font-mono"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleConfirmClear();
                } else if (e.key === 'Escape') {
                  setShowClearConfirm(false);
                  setClearConfirmText('');
                }
              }}
            />
            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowClearConfirm(false);
                  setClearConfirmText('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmClear}
                disabled={clearConfirmText !== 'CLEAR'}
              >
                Clear Messages
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
