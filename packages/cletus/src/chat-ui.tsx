import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import React, { useRef, useState } from 'react';
import type { ChatMeta } from './schemas.js';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatUIProps {
  chat: ChatMeta;
  messages: Message[];
  onExit: () => void;
  onChatUpdate: (updates: Partial<ChatMeta>) => Promise<void>;
}

type CommandType =
  | '/quit'
  | '/exit'
  | '/assistant'
  | '/mode'
  | '/model'
  | '/prompt'
  | '/title'
  | '/todos'
  | '/reset'
  | '/done'
  | '/do';


interface Command {
  name: CommandType;
  description: string;
  takesInput: boolean;
  placeholder?: string;
}

const COMMANDS: Command[] = [
  { name: '/quit', description: 'Exit chat', takesInput: false },
  { name: '/exit', description: 'Exit chat', takesInput: false },
  { name: '/assistant', description: 'Change assistant', takesInput: true, placeholder: 'assistant name' },
  { name: '/mode', description: 'Change mode', takesInput: true, placeholder: 'none|read|create|update|delete' },
  { name: '/model', description: 'Select model', takesInput: false },
  { name: '/prompt', description: 'Set custom prompt', takesInput: true, placeholder: 'your prompt' },
  { name: '/title', description: 'Change chat title', takesInput: true, placeholder: 'new title' },
  { name: '/todos', description: 'View todos', takesInput: false },
  { name: '/do', description: 'Add a todo', takesInput: true, placeholder: 'todo description' },
  { name: '/done', description: 'Mark a todo as done', takesInput: true, placeholder: 'todo number' },
  { name: '/reset', description: 'Clear all todos', takesInput: false },
];

export const ChatUI: React.FC<ChatUIProps> = ({ chat, messages, onExit, onChatUpdate }) => {
  const [inputValue, setInputValue] = useState('');
  const [chatMessages, setChatMessages] = useState<Message[]>(messages);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [chatMeta, setChatMeta] = useState<ChatMeta>(chat);
  const [cursorOffset, setCursorOffset] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [tokenCount, setTokenCount] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestStartTimeRef = useRef<number>(0);
  const { exit } = useApp();

  // Handle keyboard shortcuts
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      onExit();
    }

    // ESC to interrupt AI
    if (key.escape && isWaitingForResponse && abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsWaitingForResponse(false);
      setChatMessages((prev) => [
        ...prev,
        { role: 'system', content: '⚠️  Response interrupted' },
      ]);
    }

    // Arrow keys to navigate command menu
    if (showCommandMenu && !isWaitingForResponse) {
      const filteredCommands = inputValue.startsWith('/')
        ? COMMANDS.filter((cmd) => cmd.name.startsWith(inputValue.split(' ')[0]))
        : COMMANDS;

      if (key.upArrow) {
        setSelectedCommandIndex((prev) =>
          prev > 0 ? prev - 1 : filteredCommands.length - 1
        );
      } else if (key.downArrow) {
        setSelectedCommandIndex((prev) =>
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        );
      } else if (key.tab && filteredCommands.length > 0) {
        // Tab to autocomplete the selected command
        const selectedCmd = filteredCommands[selectedCommandIndex];
        const newValue = selectedCmd.takesInput ? selectedCmd.name + ' ' : selectedCmd.name;
        setInputValue(newValue);
        setCursorOffset(newValue.length);
        setShowCommandMenu(false);
        setSelectedCommandIndex(0);
      }
    }
  });

  const handleCommand = async (command: string) => {
    const parts = command.split(' ');
    const cmd = parts[0] as CommandType;
    const args = parts.slice(1).join(' ');

    switch (cmd) {
      case '/quit':
      case '/exit':
        onExit();
        break;

      case '/assistant':
        if (args) {
          await onChatUpdate({ assistant: args });
          setChatMeta({ ...chatMeta, assistant: args });
          setChatMessages((prev) => [
            ...prev,
            { role: 'system', content: `✓ Assistant changed to: ${args}` },
          ]);
        } else {
          setChatMessages((prev) => [
            ...prev,
            { role: 'system', content: `Current assistant: ${chatMeta.assistant || '(none)'}` },
          ]);
        }
        break;

      case '/mode':
        if (args && ['none', 'read', 'create', 'update', 'delete'].includes(args)) {
          await onChatUpdate({ mode: args as 'none' | 'read' | 'create' | 'update' | 'delete' });
          setChatMeta({ ...chatMeta, mode: args as 'none' | 'read' | 'create' | 'update' | 'delete' });
          setChatMessages((prev) => [
            ...prev,
            { role: 'system', content: `✓ Mode changed to: ${args}` },
          ]);
        } else {
          setChatMessages((prev) => [
            ...prev,
            {
              role: 'system',
              content: `Current mode: ${chatMeta.mode}. Valid modes: none, read, create, update, delete`,
            },
          ]);
        }
        break;

      case '/model':
        setChatMessages((prev) => [
          ...prev,
          {
            role: 'system',
            content: chatMeta.model
              ? `Current chat model: ${chatMeta.model}\n\nTo change the default model, exit to Settings > Select default model`
              : `No chat-specific model set (using default model)\n\nTo set a default model, exit to Settings > Select default model`,
          },
        ]);
        break;

      case '/prompt':
        if (args) {
          await onChatUpdate({ prompt: args });
          setChatMeta({ ...chatMeta, prompt: args });
          setChatMessages((prev) => [
            ...prev,
            { role: 'system', content: `✓ Custom prompt updated` },
          ]);
        } else {
          setChatMessages((prev) => [
            ...prev,
            {
              role: 'system',
              content: `Current prompt: ${chatMeta.prompt || '(none)'}`,
            },
          ]);
        }
        break;

      case '/title':
        if (args) {
          await onChatUpdate({ title: args });
          setChatMeta({ ...chatMeta, title: args });
          setChatMessages((prev) => [
            ...prev,
            { role: 'system', content: `✓ Title changed to: ${args}` },
          ]);
        } else {
          setChatMessages((prev) => [
            ...prev,
            { role: 'system', content: `Current title: ${chatMeta.title}` },
          ]);
        }
        break;

      case '/todos':
        if (chatMeta.todos.length === 0) {
          setChatMessages((prev) => [
            ...prev,
            { role: 'system', content: 'No todos yet' },
          ]);
        } else {
          const todoList = chatMeta.todos
            .map((todo, i) => `${i + 1}. [${todo.done ? '✓' : ' '}] ${todo.name}`)
            .join('\n');
          setChatMessages((prev) => [
            ...prev,
            { role: 'system', content: `Todos:\n${todoList}` },
          ]);
        }
        break;

      case '/do':
        if (args) {
          const newTodo = {
            id: Math.random().toString(36).substring(7),
            name: args,
            done: false,
          };
          const updatedTodos = [...chatMeta.todos, newTodo];
          await onChatUpdate({ todos: updatedTodos });
          setChatMeta({ ...chatMeta, todos: updatedTodos });
          setChatMessages((prev) => [
            ...prev,
            { role: 'system', content: `✓ Added todo: ${args}` },
          ]);
        } else {
          setChatMessages((prev) => [
            ...prev,
            { role: 'system', content: 'Usage: /do <todo description>' },
          ]);
        }
        break;

      case '/reset':
        await onChatUpdate({ todos: [] });
        setChatMeta({ ...chatMeta, todos: [] });
        setChatMessages((prev) => [
          ...prev,
          { role: 'system', content: '✓ All todos cleared' },
        ]);
        break;

      case '/done':
        const todoIndex = parseInt(args) - 1;
        if (isNaN(todoIndex) || todoIndex < 0 || todoIndex >= chatMeta.todos.length) {
          setChatMessages((prev) => [
            ...prev,
            {
              role: 'system',
              content: `Usage: /done <number>. You have ${chatMeta.todos.length} todos.`,
            },
          ]);
        } else {
          const updatedTodos = [...chatMeta.todos];
          updatedTodos[todoIndex].done = true;
          await onChatUpdate({ todos: updatedTodos });
          setChatMeta({ ...chatMeta, todos: updatedTodos });
          setChatMessages((prev) => [
            ...prev,
            {
              role: 'system',
              content: `✓ Marked todo as done: ${updatedTodos[todoIndex].name}`,
            },
          ]);
        }
        break;

      default:
        setChatMessages((prev) => [
          ...prev,
          { role: 'system', content: `Unknown command: ${cmd}` },
        ]);
    }
  };

  const handleSubmit = async () => {
    if (!inputValue.trim() || isWaitingForResponse) return;

    // Check if it's a command
    if (inputValue.startsWith('/')) {
      const parts = inputValue.split(' ');
      const cmdName = parts[0];
      const matchingCmd = COMMANDS.find((cmd) => cmd.name === cmdName);

      // If command not found or incomplete, don't execute
      if (!matchingCmd) {
        setChatMessages((prev) => [
          ...prev,
          { role: 'system', content: `Unknown command: ${cmdName}. Type / to see available commands.` },
        ]);
        setInputValue('');
        setShowCommandMenu(false);
        return;
      }

      // If command requires input but none provided, don't execute
      if (matchingCmd.takesInput && parts.length < 2) {
        setChatMessages((prev) => [
          ...prev,
          { role: 'system', content: `${cmdName} requires input: ${matchingCmd.placeholder || 'value'}` },
        ]);
        return; // Don't clear input, let them continue typing
      }

      // Execute the command
      await handleCommand(inputValue);
      setInputValue('');
      setShowCommandMenu(false);
      return;
    }

    const userMessage: Message = {
      role: 'user',
      content: inputValue,
    };

    setChatMessages([...chatMessages, userMessage]);
    setInputValue('');
    setIsWaitingForResponse(true);
    setElapsedTime(0);
    setTokenCount(0);
    requestStartTimeRef.current = Date.now();

    // Create abort controller for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Start elapsed time counter
    const timerInterval = setInterval(() => {
      if (!controller.signal.aborted) {
        const elapsed = Date.now() - requestStartTimeRef.current;
        setElapsedTime(elapsed);
      }
    }, 100);

    // Simulate token streaming
    const tokenInterval = setInterval(() => {
      if (!controller.signal.aborted) {
        setTokenCount((prev) => prev + Math.floor(Math.random() * 15) + 5);
      }
    }, 100);

    try {
      // Simulate AI response with 5s delay that can be interrupted
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          if (!controller.signal.aborted) {
            resolve();
          }
        }, 5000);

        controller.signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          clearInterval(timerInterval);
          clearInterval(tokenInterval);
          reject(new Error('Aborted'));
        });
      });

      clearInterval(timerInterval);
      clearInterval(tokenInterval);

      if (!controller.signal.aborted) {
        const assistantMessage: Message = {
          role: 'assistant',
          content:
            'This is a simulated response (5 second delay). The actual chat implementation will use the AITS library to generate real responses. Press ESC to interrupt!',
        };
        setChatMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (error: any) {
      clearInterval(timerInterval);
      clearInterval(tokenInterval);
      if (error.message !== 'Aborted') {
        setChatMessages((prev) => [
          ...prev,
          { role: 'system', content: `Error: ${error.message}` },
        ]);
      }
    } finally {
      setIsWaitingForResponse(false);
      abortControllerRef.current = null;
    }
  };

  // Handle input changes and command menu
  const handleInputChange = (value: string) => {
    setInputValue(value);
    setCursorOffset(value.length);

    // Show command menu when typing /
    if (value === '/' || (value.startsWith('/') && !value.includes(' ', 1))) {
      setShowCommandMenu(true);
      setSelectedCommandIndex(0);
    } else if (!value.startsWith('/')) {
      setShowCommandMenu(false);
      setSelectedCommandIndex(0);
    }
  };

  // Calculate visible area (show last N messages to fit screen)
  const maxVisibleMessages = showCommandMenu ? 10 : 15;
  const visibleMessages = chatMessages.slice(-maxVisibleMessages);

  // Filter commands based on input
  const filteredCommands = inputValue.startsWith('/')
    ? COMMANDS.filter((cmd) => cmd.name.startsWith(inputValue))
    : COMMANDS;

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Box flexDirection="column" width="100%">
          <Text bold color="cyan">
            {chatMeta.title}
          </Text>
          <Box>
            {chatMeta.assistant && (
              <Text dimColor>
                Assistant: {chatMeta.assistant} │{' '}
              </Text>
            )}
            <Text dimColor>Mode: {chatMeta.mode}</Text>
            <Text dimColor> │ Ctrl+C: exit │ ESC: interrupt AI</Text>
          </Box>
        </Box>
      </Box>

      {/* Messages Area */}
      <Box flexDirection="column" flexGrow={1} marginBottom={1}>
        {visibleMessages.length === 0 ? (
          <Box justifyContent="center" alignItems="center" flexGrow={1}>
            <Text dimColor>No messages yet. Type / for commands or start chatting!</Text>
          </Box>
        ) : (
          <>
            {visibleMessages.map((msg, index) => {
              const color =
                msg.role === 'user' ? 'green' : msg.role === 'system' ? 'yellow' : 'blue';
              const prefix =
                msg.role === 'user'
                  ? '👤 You'
                  : msg.role === 'system'
                  ? '⚙️  System'
                  : '🤖 Assistant';

              return (
                <Box key={index} flexDirection="column" marginBottom={1}>
                  <Text bold color={color}>
                    {prefix}:
                  </Text>
                  <Box paddingLeft={3}>
                    <Text>{msg.content}</Text>
                  </Box>
                </Box>
              );
            })}
            {isWaitingForResponse && (
              <Box flexDirection="column" marginBottom={1}>
                <Text bold color="blue">
                  🤖 Assistant:
                </Text>
                <Box paddingLeft={3}>
                  <Text dimColor>Thinking... (Press ESC to interrupt)</Text>
                </Box>
              </Box>
            )}
          </>
        )}
      </Box>

      {/* Command Menu */}
      {showCommandMenu && filteredCommands.length > 0 && (
        <Box
          borderStyle="round"
          borderColor="magenta"
          paddingX={1}
          marginBottom={1}
          flexDirection="column"
        >
          <Text bold color="magenta">
            Commands (↑↓ to navigate, Tab to autocomplete):
          </Text>
          {filteredCommands.slice(0, 8).map((cmd, index) => (
            <Box key={cmd.name}>
              <Text color={index === selectedCommandIndex ? 'cyan' : 'magenta'}>
                {index === selectedCommandIndex ? '▶ ' : '  '}
                {cmd.name}
                {cmd.placeholder && <Text dimColor> &lt;{cmd.placeholder}&gt;</Text>}
              </Text>
              <Text dimColor> - {cmd.description}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Input Area */}
      <Box
        borderStyle="round"
        borderColor={isWaitingForResponse ? 'gray' : 'green'}
        paddingX={1}
      >
        <Box width="100%">
          <Text color="green">{'> '}</Text>
          <TextInput
            value={inputValue}
            onChange={handleInputChange}
            onSubmit={handleSubmit}
            placeholder={
              isWaitingForResponse
                ? 'Press ESC to interrupt...'
                : 'Type / for commands or your message...'
            }
            showCursor={!isWaitingForResponse}
          />
        </Box>
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>
          {chatMessages.length} message{chatMessages.length !== 1 ? 's' : ''} │{' '}
          {chatMeta.todos.length} todo{chatMeta.todos.length !== 1 ? 's' : ''}
          {isWaitingForResponse && (
            <>
              {' │ '}
              <Text color="cyan">
                {(elapsedTime / 1000).toFixed(1)}s
              </Text>
              {' │ '}
              <Text color="green">
                ~{tokenCount} tokens
              </Text>
            </>
          )}
        </Text>
      </Box>
    </Box>
  );
};
