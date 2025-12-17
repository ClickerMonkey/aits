import { ArrowLeft, CheckSquare, Settings, Trash2, User } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import type { ChatMeta, ChatMode, Config, Message, MessageContent } from '../../schemas';
import { AgentModeSelector } from '../components/AgentModeSelector';
import { AssistantSelector } from '../components/AssistantSelector';
import { ChatInput } from '../components/ChatInput';
import { ChatSettingsDialog } from '../components/ChatSettingsDialog';
import { CommandsPanel } from '../components/CommandsPanel';
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
import type { ClientMessage, ServerMessage } from '../websocket-types';
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
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [totalCost, setTotalCost] = useState(0);
  const [operationDecisions, setOperationDecisions] = useState<Map<number, 'approve' | 'reject'>>(new Map());
  const [chatMetaState, setChatMetaState] = useState<ChatMeta | null>(null);
  const [cwd, setCwd] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const modelsResolverRef = useRef<{
    resolve: (models: any[]) => void;
    reject: (error: Error) => void;
  } | null>(null);

  const chatMeta = chatMetaState || config.chats.find((c) => c.id === chatId);

  // Single WebSocket connection for the entire component
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
      console.log('WebSocket connected');
      // Load initial messages
      sendClientMessage(ws, { type: 'get_messages', data: { chatId } });
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
  }, [chatId]);

  const handleServerMessage = (message: ServerMessage) => {
    switch (message.type) {
      case 'messages':
        setMessages(message.data.messages || []);
        setLoading(false);
        break;

      case 'message_added':
        // User message was added - reload messages
        if (wsRef.current) {
          sendClientMessage(wsRef.current, { type: 'get_messages', data: { chatId } });
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
        // Elapsed time updates can be handled here if needed
        break;

      case 'models':
        // Resolve the pending models promise if one exists
        if (modelsResolverRef.current) {
          modelsResolverRef.current.resolve(message.data.models || []);
          modelsResolverRef.current = null;
        }
        break;

      case 'chat_deleted':
        // Chat was deleted
        break;

      case 'error':
        console.error('Server error:', message.data.message);
        setIsProcessing(false);
        setStatus('Error: ' + message.data.message);
        // Reject the pending models promise if one exists
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

  const send = (message: ClientMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      sendClientMessage(wsRef.current, message);
    } else {
      console.error('WebSocket not connected');
    }
  };

  const handleSendMessage = (content: MessageContent[]) => {
    send({
      type: 'send_message',
      data: { chatId, content },
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
    // Convert Sets to arrays for JSON serialization
    const answersArray: Record<number, number[]> = {};
    for (const [key, value] of Object.entries(questionAnswers)) {
      answersArray[Number(key)] = Array.from(value);
    }

    // Send to server to format, add messages, and run orchestrator
    send({
      type: 'submit_question_answers',
      data: { chatId, questionAnswers: answersArray, questionCustomAnswers },
    });
    setIsProcessing(true);
    setStatus('Processing answers...');
  };

  const handleQuestionsCancel = () => {
    // Clear questions from chat meta without adding messages
    send({
      type: 'update_chat_meta',
      data: { chatId, updates: { questions: [] } },
    });
  };

  const handleModeChange = (mode: ChatMode) => {
    send({ type: 'update_chat_meta', data: { chatId, updates: { mode } } });
  };

  const handleAgentModeChange = (agentMode: 'plan' | 'default' | undefined) => {
    send({ type: 'update_chat_meta', data: { chatId, updates: { agentMode } } });
  };

  const handleToolsetChange = (toolset: string | null) => {
    send({ type: 'update_chat_meta', data: { chatId, updates: { toolset: toolset } } });
  };

  const handleAssistantChange = (assistant: string) => {
    const assistantValue = assistant === 'none' ? undefined : assistant;
    send({ type: 'update_chat_meta', data: { chatId, updates: { assistant: assistantValue } } });
  };

  const handleModelChange = (model: string) => {
    send({ type: 'update_chat_meta', data: { chatId, updates: { model } } });
  };

  const handleFetchModels = async (): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      // Store the promise resolver for handleServerMessage to use
      modelsResolverRef.current = { resolve, reject };

      // Set up timeout
      const timeout = setTimeout(() => {
        if (modelsResolverRef.current) {
          modelsResolverRef.current.reject(new Error('Timeout fetching models'));
          modelsResolverRef.current = null;
        }
      }, 10000);

      // Send the request
      sendClientMessage(wsRef.current, { type: 'get_models' });
    });
  };

  const handleChatSettingsSave = (updates: { title?: string; prompt?: string; cwd?: string }) => {
    const { cwd: newCwd, ...metaUpdates } = updates;
    send({
      type: 'update_chat_meta',
      data: { chatId, updates: metaUpdates, cwd: newCwd },
    });
  };

  const handleAddTodo = (todo: string) => {
    send({ type: 'add_todo', data: { chatId, todo } });
  };

  const handleToggleTodo = (index: number) => {
    send({ type: 'toggle_todo', data: { chatId, index } });
  };

  const handleRemoveTodo = (index: number) => {
    send({ type: 'remove_todo', data: { chatId, index } });
  };

  const handleClearTodos = () => {
    if (confirm('Are you sure you want to clear all todos?')) {
      send({ type: 'clear_todos', data: { chatId } });
    }
  };

  const handleClearMessages = () => {
    setShowClearConfirm(true);
  };

  const handleConfirmClear = () => {
    if (clearConfirmText === 'CLEAR') {
      send({ type: 'clear_messages', data: { chatId } });
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
    if (editedTitle.trim() && editedTitle !== chatMeta?.title) {
      send({ type: 'update_chat_meta', data: { chatId, updates: { title: editedTitle.trim() } } });
    }
    setIsEditingTitle(false);
  };

  const handleCancelEditTitle = () => {
    setIsEditingTitle(false);
    setEditedTitle('');
  };

  const handleDeleteChat = () => {
    if (confirm(`Are you sure you want to delete "${chatMeta?.title}"? This cannot be undone.`)) {
      send({ type: 'delete_chat', data: { chatId } });
      // Navigate back after deletion
      setTimeout(() => onBack(), 500);
    }
  };

  const handleMessagesUpdate = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      sendClientMessage(wsRef.current, { type: 'get_messages', data: { chatId } });
    }
  };

  const handleOperationApproval = (message: Message, approved: number[], rejected: number[]) => {
    send({
      type: 'handle_operations',
      data: {
        chatId,
        messageCreated: message.created,
        approved,
        rejected,
      },
    });
    setOperationDecisions(new Map()); // Clear decisions after submission
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

  // Check if there are any messages with operations needing approval
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const lastMessagePendingOps = lastMessage?.role === 'assistant'
    ? (lastMessage.operations || []).filter(op => op.status === 'analyzed')
    : [];
  const hasMultiplePendingOps = lastMessagePendingOps.length > 1;
  const allOperationsDecided = lastMessagePendingOps.every((_op, idx) =>
    operationDecisions.has(idx)
  );

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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowProfile(true)}
                title="Profile Settings"
              >
                <User className="w-5 h-5" />
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
                chatId={chatId}
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

      {showCommandsPanel && (
        <CommandsPanel onClose={() => setShowCommandsPanel(false)} />
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

      {/* Questions Modal */}
      {chatMeta.questions && chatMeta.questions.length > 0 && !isProcessing && (
        <QuestionsModal
          questions={chatMeta.questions}
          onSubmit={handleQuestionsSubmit}
          onCancel={handleQuestionsCancel}
        />
      )}

      {/* Profile Modal */}
      {showProfile && (
        <ProfileModal
          user={config.user}
          onSave={handleProfileSave}
          onClose={() => setShowProfile(false)}
        />
      )}

      {/* Clear Messages Confirmation Dialog */}
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
