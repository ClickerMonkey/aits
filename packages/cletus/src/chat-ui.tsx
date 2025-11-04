import fs from 'fs';
import { Box, Text, useApp, useInput, Static } from 'ink';
import TextInput from 'ink-text-input';
import React, { useRef, useState, useEffect } from 'react';
import type { ChatMeta, Message } from './schemas.js';
import { ConfigFile } from './config.js';
import { ChatFile } from './chat.js';
import { ModelSelector } from './components/ModelSelector.js';
import { createCletusAI } from './ai.js';
import { Message as AIMessage, MessageContent } from '@aits/core';
// @ts-ignore
import mic from 'mic';
import { Writer } from 'wav';
import { createChatAgent } from './chat-agent.js';


interface ChatUIProps {
  chat: ChatMeta;
  config: ConfigFile;
  messages: Message[];
  onExit: () => void;
  onChatUpdate: (updates: Partial<ChatMeta>) => Promise<void>;
}

type CommandType =
  | '/quit'
  | '/help'
  | '/assistant'
  | '/mode'
  | '/model'
  | '/prompt'
  | '/title'
  | '/todos'
  | '/reset'
  | '/done'
  | '/do'
  | '/transcribe';


interface Command {
  name: CommandType;
  description: string;
  takesInput: boolean;
  placeholder?: string;
}

const COMMANDS: Command[] = [
  { name: '/help', description: 'Show help information', takesInput: false },
  { name: '/quit', description: 'Exit chat', takesInput: false },
  { name: '/assistant', description: 'Change assistant', takesInput: true, placeholder: 'assistant name' },
  { name: '/mode', description: 'Change mode', takesInput: true, placeholder: 'none|read|create|update|delete' },
  { name: '/model', description: 'Select chat model', takesInput: false },
  { name: '/prompt', description: 'Set custom prompt', takesInput: true, placeholder: 'your prompt' },
  { name: '/title', description: 'Change chat title', takesInput: true, placeholder: 'new title' },
  { name: '/todos', description: 'View todos', takesInput: false },
  { name: '/do', description: 'Add a todo', takesInput: true, placeholder: 'todo description' },
  { name: '/done', description: 'Mark a todo as done', takesInput: true, placeholder: 'todo number' },
  { name: '/reset', description: 'Clear all todos', takesInput: false },
  { name: '/transcribe', description: 'Voice input - requires SoX (ESC or silence to stop)', takesInput: false },
];

export const ChatUI: React.FC<ChatUIProps> = ({ chat, config, messages, onExit, onChatUpdate }) => {
  const [inputValue, setInputValue] = useState('');
  const [chatMessages, setChatMessages] = useState<Message[]>(messages);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<Message | null>(null);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [chatMeta, setChatMeta] = useState<ChatMeta>(chat);
  const [cursorOffset, setCursorOffset] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [tokenCount, setTokenCount] = useState(0);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestStartTimeRef = useRef<number>(0);
  const chatFileRef = useRef<ChatFile>(new ChatFile(chat.id));
  const transcriptionAbortRef = useRef<AbortController | null>(null);
  const [ai, _] = useState(() => createCletusAI(config));
  const [chatAgent, __] = useState(() => createChatAgent(ai));

  // Convenience function to add message
  const addMessage = (message: Message) => {
    setChatMessages((prev) => [...prev, message]);
  };

  // Convenience function to add system message
  const addSystemMessage = (content: string) => {
    addMessage({ role: 'system', content: [{ type: 'text', content }], created: Date.now() });
  };

  // Load messages from file on mount
  useEffect(() => {
    const loadMessages = async () => {
      const chatFile = chatFileRef.current;
      try {
        await chatFile.load();
        setChatMessages(chatFile.getMessages());
      } catch (error) {
        // File doesn't exist yet or is empty, that's ok
        log('No existing messages to load');
      }
    };

    loadMessages();
  }, []); // Only run on mount

  // Set terminal title
  useEffect(() => {
    process.stdout.write(`\x1b]0;${chatMeta.title}\x07`);
    return () => {
      // Reset title on unmount
      process.stdout.write('\x1b]0;Cletus\x07');
    };
  }, [chatMeta.title]);

  // Save messages to chat file when they change (debounced)
  useEffect(() => {
    const saveTimeout = setTimeout(() => {
      const saveMessages = async () => {
        const chatFile = chatFileRef.current;
        try {
          // Reload the file first to get the latest timestamp
          await chatFile.load();
          await chatFile.save((data) => {
            data.messages = chatMessages;
          });
        } catch (error) {
          console.error('Failed to save messages:', error);
        }
      };

      // Only save if we have messages
      if (chatMessages.length > 0) {
        saveMessages();
      }
    }, 500); // Debounce for 500ms

    return () => clearTimeout(saveTimeout);
  }, [chatMessages]);

  // Handle keyboard shortcuts
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      onExit();
    }

    // Shift+Enter to add newline
    if (key.shift && key.return) {
      setInputValue(inputValue + '\n');
      return;
    }

    // Alt+T to start/stop transcription
    if (key.meta && input === 't') {
      if (isTranscribing && transcriptionAbortRef.current) {
        // Stop transcription
        transcriptionAbortRef.current.abort();
        setIsTranscribing(false);
      } else if (!isWaitingForResponse && !isTranscribing) {
        // Start transcription
        startTranscription();
      }
      if (inputValue === '') {
        setInputValue('');
      }
      return;
    }

    // ESC to interrupt AI or transcription
    if (key.escape) {
      if (isWaitingForResponse && abortControllerRef.current) {
        abortControllerRef.current.abort();
        setIsWaitingForResponse(false);
        addSystemMessage('⚠️ Response interrupted by user');
      } else if (isTranscribing && transcriptionAbortRef.current) {
        transcriptionAbortRef.current.abort();
        setIsTranscribing(false);
        addSystemMessage('⚠️ Transcription aborted');
      }
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

        if (selectedCmd.takesInput) {
          // Command takes input - autocomplete with space
          const newValue = selectedCmd.name + ' ';
          setInputValue(newValue);
          setCursorOffset(newValue.length);
          setShowCommandMenu(false);
          setSelectedCommandIndex(0);
        } else {
          // Command doesn't take input - run it immediately
          handleCommand(selectedCmd.name);
          setInputValue('');
          setShowCommandMenu(false);
          setSelectedCommandIndex(0);
        }
      }
    }
  });

  const handleCommand = async (command: string) => {
    const parts = command.split(' ');
    const cmd = parts[0] as CommandType;
    const args = parts.slice(1).join(' ');

    switch (cmd) {
      case '/quit':
        onExit();
        break;

      case '/help':
        addSystemMessage(`🤖 Cletus Chat Help

CHATTING WITH AI:
Simply type your message and press Enter to chat with the AI. The AI can help you with:
• Perform file operations and analysis
• Create and manage custom data types
• Semantically search through data and indexed files
• Generate, edit, and analyze images
• Plan and execute requested work with todos
• Work with assistants & memory

The AI has access to tools and can perform operations based on the chat mode.

CHAT MODES:
• none   - All AI operations require approval (safest)
• read   - Auto-approve read operations
• create - Auto-approve read & create operations
• update - Auto-approve read, create & update operations
• delete - Auto-approve all operations (least safe)

AVAILABLE COMMANDS:
/help       - Show this help message
/quit       - Exit the chat
/assistant  - View or change the assistant persona
/mode       - View or change the chat mode
/model      - Select a different AI model for this chat
/prompt     - View or set a custom system prompt
/title      - Change the chat title
/transcribe - Voice input (press ESC or wait for silence to stop)
/todos      - View all todos
/do         - Add a new todo
/done       - Mark a todo as complete
/reset      - Clear all todos

KEYBOARD SHORTCUTS:
• Enter       - Send message
• Ctrl+C      - Exit chat
• ESC         - Interrupt AI response or stop transcription
• Alt+T       - Start/stop voice transcription
• Tab         - Autocomplete command (when / menu is open)
• ↑↓          - Navigate command menu (when / menu is open)

TIP: Type '/' to see all available commands with descriptions!`,
        );
        break;

      case '/assistant':
        if (args) {
          const assistant = config.getData().assistants.find((a) => a.name === args);
          if (!assistant) {
            addSystemMessage(`❌ Assistant not found: ${args}`);
            return;
          }
          await onChatUpdate({ assistant: args });
          setChatMeta({ ...chatMeta, assistant: args });
          addSystemMessage(`✓ Assistant changed to: ${args}`);
        } else {
          addSystemMessage(`Current assistant: ${chatMeta.assistant || '(none)'}`);
        }
        break;

      case '/mode':
        if (args && ['none', 'read', 'create', 'update', 'delete'].includes(args)) {
          await onChatUpdate({ mode: args as 'none' | 'read' | 'create' | 'update' | 'delete' });
          setChatMeta({ ...chatMeta, mode: args as 'none' | 'read' | 'create' | 'update' | 'delete' });
          addSystemMessage(`✓ Mode changed to: ${args}`);
        } else {
          addSystemMessage(`Current mode: ${chatMeta.mode}. Valid modes: none, read, create, update, delete`);
        }
        break;

      case '/model':
        setShowModelSelector(true);
        break;

      case '/prompt':
        if (args) {
          await onChatUpdate({ prompt: args });
          setChatMeta({ ...chatMeta, prompt: args });
          addSystemMessage('✓ Custom prompt updated');
        } else {
          addSystemMessage(`Current prompt: ${chatMeta.prompt || '(none)'}`);
        }
        break;

      case '/title':
        if (args) {
          await onChatUpdate({ title: args });
          setChatMeta({ ...chatMeta, title: args });
          addSystemMessage(`✓ Title changed to: ${args}`);
        } else {
          addSystemMessage(`Current title: ${chatMeta.title}`);
        }
        break;

      case '/todos':
        if (chatMeta.todos.length === 0) {
          addSystemMessage('No todos yet');
        } else {
          const todoList = chatMeta.todos
            .map((todo, i) => `${i + 1}. [${todo.done ? '✓' : ' '}] ${todo.name}`)
            .join('\n');
          addSystemMessage(`Todos:\n${todoList}`);
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
          addSystemMessage(`✓ Added todo: ${args}`);
        } else {
          addSystemMessage('❌ Missing todo description. Usage: /do <todo description>');
        }
        break;

      case '/reset':
        await onChatUpdate({ todos: [] });
        setChatMeta({ ...chatMeta, todos: [] });
        addSystemMessage('✓ All todos cleared');
        break;

      case '/done':
        const todoIndex = parseInt(args) - 1;
        if (isNaN(todoIndex) || todoIndex < 0 || todoIndex >= chatMeta.todos.length) {
          addSystemMessage(`Usage: /done <number>. You have ${chatMeta.todos.length} todos.`);
        } else {
          const updatedTodos = [...chatMeta.todos];
          updatedTodos[todoIndex].done = true;
          await onChatUpdate({ todos: updatedTodos });
          setChatMeta({ ...chatMeta, todos: updatedTodos });
          addSystemMessage(`✓ Marked todo as done: ${updatedTodos[todoIndex].name}`);
        }
        break;

      case '/transcribe':
        await startTranscription();
        break;

      default:
        addSystemMessage(`❌ Unknown command: ${cmd}`);
    }
  };

  const startTranscription = async () => {
    if (isTranscribing) {
      addSystemMessage(`⚠️ Already transcribing. Press ESC or Alt+T to stop.`);
      return;
    }

    setInputValue('');

    // Check if SoX is installed
    try {
      const { execSync } = await import('child_process');
      execSync('sox --version', { stdio: 'pipe' });
    } catch (error) {
      addSystemMessage(`❌ SoX is required for audio transcription but is not installed.

Please install SoX to use voice input:
• Windows: Download from https://sourceforge.net/projects/sox/files/sox/
• Mac: brew install sox
• Linux: sudo apt-get install sox alsa-utils

After installation and the SoX executable is in the path, restart Cletus and try /transcribe again.`
      );
      return;
    }

    try {
      setIsTranscribing(true);
      
      // Create abort controller for this transcription
      const controller = new AbortController();
      transcriptionAbortRef.current = controller;

      addSystemMessage('🎤 Recording... Press ESC to stop or wait for silence.');

      // Get microphone audio stream
      // @ts-ignore
      const micInstance = mic({
        rate: '16000',
        channels: '1',
        bitwidth: '16',
        exitOnSilence: 10, // Stop after 3 seconds of silence
        fileType: 'wav',
      });

      const micInputStream = micInstance.getAudioStream();

      // Collect audio data in memory
      const audioChunks: Buffer[] = [];

      micInputStream.on('data', function(data: Buffer) {
        if (!controller.signal.aborted) {
          audioChunks.push(data);
          log(`Received audio chunk: ${data.length} bytes`);
        }
      });

      micInputStream.on('error', function(err: any) {
        log(`Microphone error: ${err}`);
      });

      micInputStream.on('silence', function() {
        log('Silence detected - stopping recording');
        micInstance.stop();
      });

      // Wait for recording to complete (either ESC or silence)
      const recordingComplete = new Promise<void>((resolve) => {
        micInputStream.on('stopComplete', function() {
          log('Recording stopped');
          resolve();
        });

        controller.signal.addEventListener('abort', () => {
          log('Recording aborted by user');
          micInstance.stop();
        });
      });

      // Start the microphone
      micInstance.start();

      // Wait for recording to finish
      await recordingComplete;

      // if (controller.signal.aborted) {
      //   addSystemMessage('⚠️  Recording cancelled');
      //   return;
      // }

      if (audioChunks.length === 0) {
        addSystemMessage('❌ No audio recorded');
        return;
      }

      // Combine all audio chunks
      const audioBuffer = Buffer.concat(audioChunks);
      log(`Total audio data: ${audioBuffer.length} bytes`);

      // Create WAV file in memory
      const wavWriter = new Writer({
        sampleRate: 16000,
        channels: 1,
        bitDepth: 16
      });

      const wavChunks: Buffer[] = [];
      wavWriter.on('data', (chunk: Buffer) => {
        wavChunks.push(chunk);
      });

      const wavComplete = new Promise<Buffer>((resolve) => {
        wavWriter.on('end', () => {
          resolve(Buffer.concat(wavChunks));
        });
      });

      // Write audio data to WAV encoder
      const wavWriterPromise = new Promise((resolve, reject) => {
        wavWriter.on('error', (e) => e ? reject(e) : resolve(null));
      });
      wavWriter.end();
      await wavWriterPromise;

      const wavBuffer = await wavComplete;
      log(`WAV buffer size: ${wavBuffer.length} bytes`);

      addSystemMessage('🔄 Transcribing audio...');

      // Stream transcription from buffer
      const stream = ai.transcribe.stream({
        audio: new File([wavBuffer], 'audio.wav', { type: 'audio/wav' }),
      });

      let transcribedText = '';

      for await (const chunk of stream) {
        log(chunk);

        if (chunk.text) {
          transcribedText += chunk.text;
          setInputValue(transcribedText);
        }
      }

      addSystemMessage('✓ Transcription complete');
      log(`Final transcription: ${transcribedText}`);

    } catch (error: any) {
      addSystemMessage(`❌ Transcription error: ${error.message}`);
      log(`Transcription error: ${error.message} ${error.stack}`);
    } finally {
      setIsTranscribing(false);
      transcriptionAbortRef.current = null;
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
        addSystemMessage(`❌ Unknown command: ${cmdName}. Type / to see available commands.`);
        setInputValue('');
        setShowCommandMenu(false);
        return;
      }

      // If command requires input but none provided, don't execute
      if (matchingCmd.takesInput && parts.length < 2) {
        addSystemMessage(`❌ ${cmdName} requires input: ${matchingCmd.placeholder || 'value'}`);
        return; // Don't clear input, let them continue typing
      }

      // Execute the command
      await handleCommand(inputValue);
      setInputValue('');
      setShowCommandMenu(false);
      return;
    }

    const pending: Message = {
      role: 'assistant',
      name: chatMeta.assistant,
      content: [{ type: 'text', content: '' }],
      created: Date.now(),
    };

    addMessage({
      role: 'user',
      name: config.getData().user.name,
      content: [{ type: 'text', content: inputValue }],
      created: Date.now(),
    });
    setInputValue('');
    setPendingMessage(pending);
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

    const convertContent = (content: MessageContent): MessageContent => {
      return {
        type: content.type,
        content: typeof content.content === 'string' && /^(file|https?):\/\//.test(content.content)
          ? new URL(content.content)
          : content.content,
      };
    };

    const messages: AIMessage[] = chatMessages
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({
        ...msg,
        content: msg.content.map(convertContent),
      }));

    try {
      log('request starting');

      const chatResponse = chatAgent.run({}, {
        chat: chatMeta,
        chatData: chatFileRef.current,
        config: config,
        signal: controller.signal,
        messages,
        metadata: {
          model: chatMeta.model ?? config.getData().user.models?.chat,
        },
      });

      log('request streaming');

      for await (const chunk of chatResponse) {
        if (controller.signal.aborted) {
          break;
        }
        switch (chunk.type) {
          case 'textPartial':
            pending.content[0].content += chunk.content;
            setPendingMessage({ ...pending });
            break;;
          case 'textComplete':
            pending.content[0].content = chunk.content;
            setPendingMessage({ ...pending });
            break;
          case 'textReset':
            pending.content[0].content = '';
            setPendingMessage({ ...pending });
            break;
        }
        log(chunk);
      }

      log('response complete');

    } catch (error: any) { 
      clearInterval(timerInterval);
      if (error.message !== 'Aborted') {
        addSystemMessage(`❌ Error: ${error.message}`);
      }

      console.error('Chat request error:', error);

      log(`error: ${error.message} ${error.stack}`);
    } finally {
      clearInterval(timerInterval);
      setIsWaitingForResponse(false);
      abortControllerRef.current = null;
      addMessage(pending);
      setPendingMessage(null);
    }
    
    /*

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
        addMessage({
          role: 'assistant',
          name: chat.assistant,
          content: [{ type: 'text', content: 'This is a simulated response (5 second delay). The actual chat implementation will use the AITS library to generate real responses. Press ESC to interrupt!' }],
          created: Date.now(),
        });
      }
    } catch (error: any) {
      clearInterval(timerInterval);
      clearInterval(tokenInterval);
      if (error.message !== 'Aborted') {
        addSystemMessage(`❌ Error: ${error.message}`);
      }
    } finally {
      setIsWaitingForResponse(false);
      abortControllerRef.current = null;
    }
    */
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

  // Show model selector if requested
  if (showModelSelector) {
    const ai = createCletusAI(config);
    const currentModelId = chatMeta.model || config.getData().user.models?.chat;

    return (
      <ModelSelector
        ai={ai}
        baseMetadata={{ required: ['chat', 'tools'] }}
        current={currentModelId}
        onSelect={async (model) => {
          if (model) {
            await onChatUpdate({ model: model.id });
            setChatMeta({ ...chatMeta, model: model.id });
            addSystemMessage(`✓ Chat model set to: ${model.name} (${model.id})`);
          }
          setShowModelSelector(false);
        }}
        onCancel={() => {
          setShowModelSelector(false);
        }}
      />
    );
  }

  return (
    <Box flexDirection="column" height="100%">
      
      {/* Messages Area */}
      <Box flexDirection="column" flexGrow={1} marginBottom={1}>
        {visibleMessages.length === 0 && !pendingMessage ? (
          <Box justifyContent="center" alignItems="center" flexGrow={1}>
            <Text dimColor>No messages yet. Type / for commands or start chatting!</Text>
          </Box>
        ) : (
          <>
            <Static items={visibleMessages}>
              {(msg, index) => {
                const color =
                  msg.role === 'user' ? 'green' : msg.role === 'system' ? 'yellow' : 'blue';
                const prefix =
                  msg.role === 'user'
                    ? '👤 You'
                    : msg.role === 'system'
                    ? '⚙️ System'
                    : `🤖 ${chat.assistant ?? 'Assistant'}`;

                return (
                  <Box key={index} flexDirection="column" marginBottom={1}>
                    <Text bold color={color}>
                      {prefix}:
                    </Text>
                    <Box paddingLeft={3}>
                      {msg.content.map((part, i) => (
                        <Text key={i}>{part.content}</Text>
                      ))}
                    </Box>
                  </Box>
                );
              }}
            </Static>
            {pendingMessage && (
              <Box flexDirection="column" marginBottom={1}>
                <Text bold color="blue">
                  {`🤖 ${chat.assistant ?? 'Assistant'}`}:
                </Text>
                <Box paddingLeft={3}>
                  {pendingMessage.content.map((part, i) => (
                    <Text key={i}>{part.content || <Text dimColor>Thinking...</Text>}</Text>
                  ))}
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
        borderColor={isTranscribing ? 'blue' : isWaitingForResponse ? 'gray' : 'green'}
        paddingX={1}
      >
        <Box width="100%">
          {isTranscribing ? (
            <Text color="blue">🎤 </Text>
          ) : isWaitingForResponse ? (
            <Text color="gray">{'> '}</Text>
          ) : (
            <Text color="green">{'> '}</Text>
          )}
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
          {chatMeta.assistant ? `${chatMeta.assistant} │ ` : ''}
          Mode: {chatMeta.mode} │ {chatMessages.length} message{chatMessages.length !== 1 ? 's' : ''} │{' '}
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
          {' | Ctrl+C: exit │ ESC: interrupt │ Alt+T: transcribe'}
        </Text>
      </Box>
    </Box>
  );
};

let lastLogTime = 0;
const logFile = './cletus.log';
let logStream: fs.WriteStream | null = null;
let logLastPromise: Promise<void> = Promise.resolve();

async function prepareLog() {
  if (logStream) {
    return;
  }
  logStream = fs.createWriteStream(logFile, { flags: 'a' });
  logStream.setMaxListeners(100);
}

async function log(msg: any) {
  const now = performance.now();
  const elapsed = now - (lastLogTime || now);
  lastLogTime = now;
  
  const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
  const fullText = `(+${elapsed.toFixed(2).padStart(7, ' ')}ms) ${text}\n`;

  logQueue(fullText);
}

async function logQueue(text: string) {
  await prepareLog();
  await logLastPromise;
  logLastPromise = new Promise<void>((resolve) => {
      if (!logStream?.write(text)) {
          logStream?.once('drain', resolve);
      } else {
          resolve();
      }
  });
}