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
import { useWebSocket } from '../WebSocketContext';
import { MessageContentType } from '@aeye/core';

interface MainPageProps {
  config: Config;
}

export const MainPage: React.FC<MainPageProps> = ({ config }) => {
  const { ws, isConnected } = useWebSocket();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingMessage, setPendingMessage] = useState<Message | null>(null);
  const [temporaryUserMessage, setTemporaryUserMessage] = useState<Message | null>(null);
  const [temporaryAssistantMessage, setTemporaryAssistantMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [showTodos, setShowTodos] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [totalCost, setTotalCost] = useState(0);
  const [operationDecisions, setOperationDecisions] = useState<Map<number, 'approve' | 'reject'>>(new Map());
  const [chatMetaState, setChatMetaState] = useState<ChatMeta | null>(null);
  const [cwd, setCwd] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; size: number; type: MessageContentType; content: string }>>([]);
  const [isDragging, setIsDragging] = useState(false);
  const modelsResolverRef = useRef<{
    resolve: (models: any[]) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const pendingChatSelectRef = useRef<string | null>(null);

  const chatMeta = chatMetaState || config.chats.find((c) => c.id === selectedChatId);

  // Auto-select last chat on mount
  useEffect(() => {
    if (!selectedChatId && config.chats.length > 0) {
      const lastChat = [...config.chats].sort((a, b) => b.updated - a.updated)[0];
      if (lastChat) {
        setSelectedChatId(lastChat.id);
        setLoading(true);
        window.history.replaceState({}, '', `/chat/${lastChat.id}`);
      }
    }
  }, [config.chats, selectedChatId]);

  // Handle pending chat selection after config updates
  useEffect(() => {
    if (pendingChatSelectRef.current) {
      const chatToSelect = pendingChatSelectRef.current;

      // Check if chat exists in config
      const chatExists = config.chats.find(c => c.id === chatToSelect);
      if (chatExists) {
        // Chat is in config, select it now
        pendingChatSelectRef.current = null;
        handleChatSelect(chatToSelect);
        // Clear creating state when chat is selected
        setIsCreatingChat(false);
      }
    }
  }, [config.chats]);

  // Subscribe to chat when selected or when reconnecting
  useEffect(() => {
    if (!selectedChatId || !isConnected || !ws) return;

    // Subscribe to the chat (will receive operation_state and messages)
    ws.send({ type: 'subscribe_chat', data: { chatId: selectedChatId } });
    ws.send({ type: 'get_messages', data: { chatId: selectedChatId } });

    // Cleanup: unsubscribe when effect re-runs or component unmounts
    return () => {
      if (ws && ws.isOpen()) {
        ws.send({ type: 'unsubscribe_chat', data: { chatId: selectedChatId } });
      }
    };
  }, [selectedChatId, isConnected, ws]);

  // Listen for WebSocket messages
  useEffect(() => {
    if (!ws) return;

    const unsubscribe = ws.onMessage((message) => {
      handleServerMessage(message);
    });

    return unsubscribe;
  }, [ws]);

  // State that changes and the handler function needs
  const getHandlerState = () => ({
    selectedChatId,
    isCreatingChat,
  });
  const handleState = useRef(getHandlerState())
  useEffect(() => {
    handleState.current = getHandlerState();
  });

  // Handle incoming server messages
  const handleServerMessage = (message: ServerMessage) => {
    const { isCreatingChat, selectedChatId } = handleState.current;

    const isChatCreation = isCreatingChat && message.type === 'chat_created';
    const isAnotherChat = 'chatId' in message.data && message.data.chatId !== selectedChatId;

    if (!isChatCreation && isAnotherChat) {
      console.log('[MainPage] Ignoring message for different chat:', { selectedChatId, message, isCreatingChat });

      // This event is for a different chat, ignore it
      return;
    }

    switch (message.type) {
      case 'messages':
        setMessages(message.data.messages || []);
        setLoading(false);
        break;

      case 'message_added':
        // Clear temporary user message when real user message is added
        if (message.data.message.role === 'user') {
          setTemporaryUserMessage(null);
        }
        // Add the message to the messages array
        setMessages(prev => [...prev, message.data.message]);
        break;

      case 'pending_update':
        // Clear temporary assistant message when real pending message arrives
        setTemporaryAssistantMessage(null);
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
        setTemporaryAssistantMessage(null);
        setIsProcessing(false);
        setStatus('');
        if (message.data.message) {
          setMessages(prev => {
            if (!prev.find(m => m.created === message.data.message.created)) {
              return [...prev, message.data.message];
            }
            return prev;
          });
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
          send({ type: 'get_config' });
        }
        if (message.data.cwd !== undefined) {
          setCwd(message.data.cwd);
        }
        break;

      case 'status_update':
        setStatus(message.data.status);
        break;

      case 'processing':
        setIsProcessing(message.data.isProcessing);
        if (!message.data.isProcessing) {
          setStatus('');
        }
        break;

      case 'operation_state':
        // Sync operation state when subscribing to a chat
        setIsProcessing(message.data.status === 'processing');
        if (message.data.pendingMessage) {
          setPendingMessage(message.data.pendingMessage);
        }
        break;

      case 'chat_subscribed':
        // Chat subscription confirmed
        break;

      case 'models':
        if (modelsResolverRef.current) {
          modelsResolverRef.current.resolve(message.data.models || []);
          modelsResolverRef.current = null;
        }
        break;

      case 'config':
        // Config received
        break;

      case 'chat_created':
        // Store the chat to select after config updates
        if (message.data.chatId) {
          pendingChatSelectRef.current = message.data.chatId;
        }

        // Refresh config - the effect will handle selection
        send({ type: 'get_config' });
        break;

      case 'chat_deleted':
        // Clear selection if deleted chat was selected
        if (message.data.chatId === selectedChatId) {
          setSelectedChatId(null);
          setMessages([]);
          setPendingMessage(null);
          setTemporaryUserMessage(null);
          setTemporaryAssistantMessage(null);
        }
        // Refresh config - auto-select effect will handle selecting another chat
        send({ type: 'get_config' });
        break;

      case 'error':
        console.error('Server error:', message.data.message);
        setIsProcessing(false);
        setIsCreatingChat(false); // Clear creating state on error
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
    if (ws && ws.isOpen()) {
      ws.send(message);
    } else {
      console.error('WebSocket not connected');
    }
  };

  const handleChatSelect = (chatId: string) => {
    // Unsubscribe from previous chat
    if (selectedChatId && ws) {
      send({ type: 'unsubscribe_chat', data: { chatId: selectedChatId } });
    }

    setSelectedChatId(chatId);
    setMessages([]);
    setPendingMessage(null);
    setTemporaryUserMessage(null);
    setTemporaryAssistantMessage(null);
    setChatMetaState(null); // Clear cached chat metadata when switching chats
    setStatus(''); // Clear any previous error or status messages
    setLoading(true);
    window.history.pushState({}, '', `/chat/${chatId}`);

    // Subscribe to new chat (will receive operation_state)
    if (ws) {
      send({ type: 'subscribe_chat', data: { chatId } });
    }
  };

  const handleSendMessage = (content: MessageContent[]) => {
    if (!selectedChatId) return;

    const now = Date.now();

    // Create temporary user message for immediate display
    const tempUserMsg: Message = {
      role: 'user',
      content,
      created: now-2,
    };
    setTemporaryUserMessage(tempUserMsg);

    // Create temporary assistant message placeholder
    const tempAssistantMsg: Message = {
      role: 'assistant',
      content: [],
      created: now-1,
    };
    setTemporaryAssistantMessage(tempAssistantMsg);

    send({
      type: 'send_message',
      data: { chatId: selectedChatId, content },
    });
    // Server will send 'processing' message to update isProcessing state

    // Clear attached files after sending
    setAttachedFiles([]);
  };

  const handleCancel = () => {
    if (!selectedChatId) return;
    send({ type: 'cancel', data: { chatId: selectedChatId } });
    // Server will send 'processing' message to update isProcessing state
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
    // Server will send 'processing' message to update isProcessing state
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
      if (!ws || !ws.isOpen()) {
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

      ws.send({ type: 'get_models' });
    });
  };

  const handleChatSettingsSave = (updates: Partial<ChatMeta> & { cwd?: string }) => {
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
    handleCancelEditTitle();
  };

  const handleCancelEditTitle = () => {
    setIsEditingTitle(false);
    setEditedTitle('');
  };

  const handleDeleteChat = () => {
    if (!selectedChatId || !chatMeta) return;
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    if (!selectedChatId || deleteConfirmText !== 'DELETE') return;
    send({ type: 'delete_chat', data: { chatId: selectedChatId } });
    setSelectedChatId(null);
    setMessages([]);
    setShowDeleteConfirm(false);
    setDeleteConfirmText('');
    setTimeout(() => send({ type: 'get_config' }), 500);
  };

  const handleOperationApproval = (message: Message, approved: number[], rejected: number[]) => {
    if (!selectedChatId) return;

    // Helper function to update operations in a message
    const updateMessageOperations = (msg: Message) => {
      if (msg.created === message.created) {
        const updatedOperations = (msg.operations || []).map((op, idx) => {
          if (approved.includes(idx)) {
            return { ...op, status: 'doing' as const };
          } else if (rejected.includes(idx)) {
            return { ...op, status: 'rejected' as const };
          }
          return op;
        });
        return { ...msg, operations: updatedOperations };
      }
      return msg;
    };

    // Update local state immediately to show visual feedback
    setMessages(prev => prev.map(updateMessageOperations));

    // Also update pending message if it matches
    setPendingMessage(prev => prev ? updateMessageOperations(prev) : null);

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
    // Server will send 'processing' message to update isProcessing state
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

  const handleCreateChat = () => {
    // Set loading state immediately
    setIsCreatingChat(true);

    // Generate timestamp-based name
    const now = new Date();
    const day = now.getDate();
    const month = now.getMonth() + 1; // 0-indexed
    const year = now.getFullYear();
    const name = `New Chat on ${day}/${month}/${year}`;

    send({
      type: 'create_chat',
      data: { name },
    });
  };

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) {
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    const processedFiles = await Promise.all(
      files.map(async (file) => {
        const isText = file.type.startsWith('text/') || file.type === 'application/json' || file.type === 'application/xml';
        if (isText) {
          const content = await fileToText(file);
          return {
            name: file.name,
            size: file.size,
            type: 'text' as const,
            content,
          };
        } else {
          const content = await fileToBase64(file);
          const isImage = file.type.startsWith('image/');
          const isAudio = file.type.startsWith('audio/');
          return {
            name: file.name,
            size: file.size,
            type: (isImage ? 'image' : isAudio ? 'audio' : 'file') as MessageContentType,
            content,
          };
        }
      })
    );

    setAttachedFiles((prev) => [...prev, ...processedFiles]);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const fileToText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleRemoveFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Get the actual last message being rendered (including pending and temporary)
  let allMessages = [...messages];

  // Add temporary user message if it exists
  if (temporaryUserMessage) {
    allMessages.push(temporaryUserMessage);
  }

  // Add temporary assistant message if it exists (and no real pending message yet)
  if (temporaryAssistantMessage && !pendingMessage) {
    allMessages.push(temporaryAssistantMessage);
  }

  // Add pending message if it exists (replaces temporary assistant message)
  // Only add if it's not already in the messages array (check by created timestamp)
  if (pendingMessage) {
    const lastMessage = messages[messages.length - 1];
    const isDuplicate = lastMessage && lastMessage.created === pendingMessage.created;
    if (!isDuplicate) {
      allMessages.push(pendingMessage);
    }
  }

  const lastMessage = allMessages.length > 0 ? allMessages[allMessages.length - 1] : null;
  const lastMessagePendingOps = lastMessage?.role === 'assistant'
    ? (lastMessage.operations || []).filter(op => op.status === 'analyzed')
    : [];
  const hasMultiplePendingOps = lastMessagePendingOps.length > 1;
  const allOperationsDecided = lastMessagePendingOps.every((_op, idx) =>
    operationDecisions.has(idx)
  );
  const hasOperationsProcessing = lastMessage?.role === 'assistant'
    ? (lastMessage.operations || []).some(op => op.status === 'doing')
    : false;

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
          onProfileClick={() => setShowProfile(true)}
          onCreateChat={handleCreateChat}
          isCreatingChat={isCreatingChat}
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
        onProfileClick={() => setShowProfile(true)}
        onCreateChat={handleCreateChat}
        isCreatingChat={isCreatingChat}
      />

      {/* Main Chat Area */}
      <div 
        className="flex-1 flex flex-col min-w-0"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleFileDrop}
      >

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

        <>
          {/* Messages Area */}
          <ScrollArea className="h-full p-6">
            <MessageList
              messages={allMessages}
              loading={loading}
              isProcessing={isProcessing}
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
              attachedFiles={attachedFiles}
              onRemoveFile={handleRemoveFile}
              onSendMessage={handleSendMessage}
              onCancel={handleCancel}
              onModelClick={() => setShowModelSelector(true)}
              hasMultiplePendingOperations={hasMultiplePendingOps}
              allOperationsDecided={allOperationsDecided}
              hasOperationsProcessing={hasOperationsProcessing}
              onApproveAll={handleApproveAllOperations}
              onRejectAll={handleRejectAllOperations}
              onSubmitDecisions={handleSubmitOperationDecisions}
            />
          </div>
        </>

        {/* Drag-and-Drop Overlay */}
        {isDragging && (
          <div className="absolute inset-0 bg-neon-cyan/10 border-2 border-neon-cyan border-dashed rounded-lg flex items-center justify-center pointer-events-none">
            <div className="text-neon-cyan text-xl font-bold">Drop files to attach</div>
          </div>
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
          reasoning={chatMeta.reasoning}
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

      {showDeleteConfirm && chatMeta && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => {
            setShowDeleteConfirm(false);
            setDeleteConfirmText('');
          }}
        >
          <div
            className="relative w-full max-w-md bg-card rounded-lg border border-border shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-destructive mb-4">Delete Chat</h2>
            <p className="text-foreground mb-4">
              Are you sure you want to delete <span className="font-semibold">"{chatMeta.title}"</span>? This will permanently delete all messages in this chat. This action cannot be undone.
            </p>
            <p className="text-muted-foreground mb-4">
              Type <span className="font-mono font-bold text-foreground">DELETE</span> to confirm:
            </p>
            <Input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="mb-4 font-mono"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleConfirmDelete();
                } else if (e.key === 'Escape') {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText('');
                }
              }}
            />
            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDelete}
                disabled={deleteConfirmText !== 'DELETE'}
              >
                Delete Chat
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
