import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { configExists } from '../file-manager';
import { ConfigFile } from '../config';
import { ChatFile } from '../chat';
import type { Message, ChatMeta, MessageContent } from '../schemas';
import type { ClientMessage, ServerMessage } from './websocket-types';

const __serverFilename = fileURLToPath(import.meta.url);
const __serverDirname = path.dirname(__serverFilename);

// Chat file cache with automatic cleanup
interface ChatCacheEntry {
  chatFile: ChatFile;
  lastAccessed: number;
}

const chatCache = new Map<string, ChatCacheEntry>();
const CACHE_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

async function getChat(chatId: string): Promise<ChatFile> {
  const now = Date.now();

  // Check cache
  const cached = chatCache.get(chatId);
  if (cached) {
    cached.lastAccessed = now;
    return cached.chatFile;
  }

  // Create and load new chat file
  const chatFile = new ChatFile(chatId);
  await chatFile.load();

  chatCache.set(chatId, {
    chatFile,
    lastAccessed: now,
  });

  return chatFile;
}

function cleanupExpiredChats(): void {
  const now = Date.now();
  for (const [chatId, entry] of chatCache.entries()) {
    if (now - entry.lastAccessed > CACHE_EXPIRY_MS) {
      chatCache.delete(chatId);
    }
  }
}

function removeChat(chatId: string): void {
  chatCache.delete(chatId);
}

// Run cleanup every 15 minutes
setInterval(cleanupExpiredChats, 15 * 60 * 1000);

export async function startBrowserServer(port: number = 3000): Promise<void> {
  const server = http.createServer(async (req, res) => {
    const url = req.url || '/';

    try {
      // Serve static files only
      await serveStaticFile(url, res);
    } catch (error) {
      console.error('Server error:', error);
      res.writeHead(500);
      res.end('Internal server error');
    }
  });

  // WebSocket server for all communication
  const wss = new WebSocketServer({ server });
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => {
      clients.delete(ws);
    });
    handleWebSocketConnection(ws);
  });

  server.listen(port, '127.0.0.1', () => {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   Cletus Browser Mode                  ║');
    console.log('╚════════════════════════════════════════╝\n');
    console.log(`  🌐 Server: http://localhost:${port}`);
    console.log('  ⌨️  Press Ctrl+C to exit\n');
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\nShutting down...');

    // Force close all WebSocket connections
    clients.forEach((ws) => {
      ws.close();
    });

    wss.close();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });

    // Force exit after 1 second if server hasn't closed
    setTimeout(() => {
      console.log('Forcing shutdown...');
      process.exit(0);
    }, 1000);
  });
}

function handleWebSocketConnection(ws: WebSocket): void {
  let config: ConfigFile | null = null;
  let abortController: AbortController | null = null;

  // Type-safe message sender
  const sendMessage = (message: ServerMessage) => {
    ws.send(JSON.stringify(message));
  };

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString()) as ClientMessage;

      switch (message.type) {
        case 'get_config':
          try {
            const exists = await configExists();
            if (!exists) {
              sendMessage({
                type: 'config_not_found',
                data: {},
              });
              return;
            }

            const configFile = new ConfigFile();
            await configFile.load();
            const configData = configFile.getData();

            sendMessage({
              type: 'config',
              data: configData,
            });
          } catch (error) {
            sendMessage({
              type: 'error',
              data: { message: 'Failed to load config' },
            });
          }
          break;

        case 'create_chat':
          try {
            const { name } = message.data;
            const configFile = new ConfigFile();
            await configFile.load();

            // Generate chat ID and create new chat
            const now = Date.now();
            const chatId = new Date(now).toISOString().replace(/[-:]/g, '').slice(0, 15);
            const newChat: ChatMeta = {
              id: chatId,
              title: name,
              assistant: undefined,
              prompt: undefined,
              mode: 'none',
              agentMode: 'default',
              created: now,
              updated: now,
              todos: [],
              questions: [],
              toolset: undefined,
              model: undefined,
            };

            await configFile.addChat(newChat);

            // Create the chat messages file
            const chatFile = new ChatFile(chatId);
            await chatFile.save(() => {
              // Initialize empty chat
            });

            sendMessage({
              type: 'chat_created',
              data: { chatId },
            });
          } catch (error) {
            sendMessage({
              type: 'error',
              data: { message: 'Failed to create chat' },
            });
          }
          break;

        case 'init_chat':
          try {
            const { chatId } = message.data;
            config = new ConfigFile();
            await config.load();
            const chatFile = await getChat(chatId);

            sendMessage({
              type: 'chat_initialized',
              data: {
                messages: chatFile.getMessages(),
                chat: config.getChats().find(c => c.id === chatId),
              },
            });
          } catch (error) {
            sendMessage({
              type: 'error',
              data: { message: 'Failed to initialize chat' },
            });
          }
          break;

        case 'get_messages':
          try {
            const { chatId } = message.data;
            const chatFile = await getChat(chatId);
            const messages = chatFile.getMessages();

            sendMessage({
              type: 'messages',
              data: { messages },
            });
          } catch (error) {
            sendMessage({
              type: 'error',
              data: { message: 'Failed to load messages' },
            });
          }
          break;

        case 'send_message':
          if (!config) {
            sendMessage({
              type: 'error',
              data: { message: 'Config not loaded' },
            });
            return;
          }

          try {
            const { chatId, content } = message.data;
            const chatFile = await getChat(chatId);

            // Validate content is an array of MessageContent
            if (!Array.isArray(content)) {
              sendMessage({
                type: 'error',
                data: { message: 'Invalid message content: must be an array' },
              });
              return;
            }

            const chat = config.getChats().find(c => c.id === chatFile!.id);
            if (!chat) {
              sendMessage({
                type: 'error',
                data: { message: 'Chat not found' },
              });
              return;
            }

            // Add user message with proper typing
            const userMessage: Omit<Message, 'created'> = {
              role: 'user',
              content: content as MessageContent[],
            };
            await chatFile.addMessage(userMessage);

            sendMessage({
              type: 'message_added',
              data: { message: { ...userMessage, created: Date.now() } as Message },
            });

            // Process AI response
            abortController = new AbortController();

            // Lazy-load AI components
            const { createCletusAI } = await import('../ai');
            const { createChatAgent } = await import('../agents/chat-agent');
            const { runChatOrchestrator } = await import('../agents/chat-orchestrator');

            const ai = createCletusAI(config);
            const chatAgent = createChatAgent(ai);

            const chatStatus = (status: string) => {
              sendMessage({
                type: 'status_update',
                data: { status },
              });
            };

            const onRefreshChat = () => {
              sendMessage({
                type: 'messages_updated',
                data: { messages: chatFile!.getMessages() },
              });
            };

            const clearUsage = () => {
              const defaultContext = ai.config.defaultContext;
              if (defaultContext && defaultContext.usage) {
                defaultContext.usage.accumulated = {};
                defaultContext.usage.accumulatedCost = 0;
              }
            };

            const getUsage = () => {
              const defaultContext = ai.config.defaultContext;
              if (defaultContext && defaultContext.usage) {
                return {
                  accumulated: defaultContext.usage.accumulated,
                  accumulatedCost: defaultContext.usage.accumulatedCost,
                };
              }
              return { accumulated: {}, accumulatedCost: 0 };
            };

            await runChatOrchestrator({
              chatAgent,
              messages: chatFile.getMessages(),
              chatMeta: chat,
              config,
              chatData: chatFile,
              signal: abortController.signal,
              clearUsage,
              getUsage,
              events: {
                onRefreshChat,
                onRefreshPending: onRefreshChat,
              },
            }, (event) => {
              // Handle orchestrator events
              switch (event.type) {
                case 'pendingUpdate':
                  sendMessage({
                    type: 'pending_update',
                    data: { pending: event.pending },
                  });
                  break;
                case 'update':
                  sendMessage({
                    type: 'message_updated',
                    data: { message: event.message },
                  });
                  break;
                case 'status':
                  chatStatus(event.status);
                  break;
                case 'usage':
                  sendMessage({
                    type: 'usage_update',
                    data: {
                      accumulated: event.accumulated,
                      accumulatedCost: event.accumulatedCost,
                      current: event.current,
                    },
                  });
                  break;
                case 'elapsed':
                  sendMessage({
                    type: 'elapsed_update',
                    data: { ms: event.ms },
                  });
                  break;
                case 'complete':
                  // Add the complete message to chat file (like CLI does)
                  if (event.message.content.length > 0 && chatFile) {
                    chatFile.addMessage(event.message).catch((err) => {
                      console.error('Failed to save complete message:', err);
                    });
                  }
                  // Send the complete message
                  sendMessage({
                    type: 'response_complete',
                    data: { message: event.message },
                  });
                  break;
                case 'error':
                  sendMessage({
                    type: 'error',
                    data: { message: event.error },
                  });
                  break;
              }
            });
          } catch (error) {
            if (error instanceof Error && error.name !== 'AbortError') {
              sendMessage({
                type: 'error',
                data: { message: error.message },
              });
            }
          }
          break;

        case 'cancel':
          if (abortController) {
            abortController.abort();
            abortController = null;
          }
          break;

        case 'get_models':
          try {
            const { baseMetadata } = message.data || {};
            // Lazy-load AI registry
            const { createCletusAI } = await import('../ai');
            const configFile = new ConfigFile();
            await configFile.load();
            const ai = createCletusAI(configFile);
            const models = ai.registry.searchModels(baseMetadata || {});

            sendMessage({
              type: 'models',
              data: { models },
            });
          } catch (error) {
            sendMessage({
              type: 'error',
              data: { message: 'Failed to fetch models' },
            });
          }
          break;

        case 'update_chat_meta':
          try {
            const { chatId, updates } = message.data;
            const configFile = new ConfigFile();
            await configFile.load();
            await configFile.updateChat(chatId, updates);
            const updatedChat = configFile.getChats().find(c => c.id === chatId);

            sendMessage({
              type: 'chat_updated',
              data: { chat: updatedChat },
            });
          } catch (error) {
            sendMessage({
              type: 'error',
              data: { message: 'Failed to update chat metadata' },
            });
          }
          break;

        case 'add_todo':
          try {
            const { chatId, todo } = message.data;
            const configFile = new ConfigFile();
            await configFile.load();
            const chat = configFile.getChats().find(c => c.id === chatId);
            if (chat) {
              chat.todos.push({ id: Math.random().toString(36).substring(7), name: todo, done: false });
              await configFile.updateChat(chatId, { todos: chat.todos });
              const updatedChat = configFile.getChats().find(c => c.id === chatId);
              sendMessage({
                type: 'chat_updated',
                data: { chat: updatedChat },
              });
            }
          } catch (error) {
            sendMessage({
              type: 'error',
              data: { message: 'Failed to add todo' },
            });
          }
          break;

        case 'toggle_todo':
          try {
            const { chatId, index } = message.data;
            const configFile = new ConfigFile();
            await configFile.load();
            const chat = configFile.getChats().find(c => c.id === chatId);
            if (chat && chat.todos[index]) {
              chat.todos[index].done = !chat.todos[index].done;
              await configFile.updateChat(chatId, { todos: chat.todos });
              const updatedChat = configFile.getChats().find(c => c.id === chatId);
              sendMessage({
                type: 'chat_updated',
                data: { chat: updatedChat },
              });
            }
          } catch (error) {
            sendMessage({
              type: 'error',
              data: { message: 'Failed to toggle todo' },
            });
          }
          break;

        case 'remove_todo':
          try {
            const { chatId, index } = message.data;
            const configFile = new ConfigFile();
            await configFile.load();
            const chat = configFile.getChats().find(c => c.id === chatId);
            if (chat && chat.todos[index] !== undefined) {
              chat.todos.splice(index, 1);
              await configFile.updateChat(chatId, { todos: chat.todos });
              const updatedChat = configFile.getChats().find(c => c.id === chatId);
              sendMessage({
                type: 'chat_updated',
                data: { chat: updatedChat },
              });
            }
          } catch (error) {
            sendMessage({
              type: 'error',
              data: { message: 'Failed to remove todo' },
            });
          }
          break;

        case 'clear_todos':
          try {
            const { chatId } = message.data;
            const configFile = new ConfigFile();
            await configFile.load();
            await configFile.updateChat(chatId, { todos: [] });
            const updatedChat = configFile.getChats().find(c => c.id === chatId);
            sendMessage({
              type: 'chat_updated',
              data: { chat: updatedChat },
            });
          } catch (error) {
            sendMessage({
              type: 'error',
              data: { message: 'Failed to clear todos' },
            });
          }
          break;

        case 'clear_messages':
          try {
            const { chatId } = message.data;
            const chatFile = await getChat(chatId);
            await chatFile.save((data) => {
              data.messages = [];
            });
            sendMessage({
              type: 'messages_updated',
              data: { messages: [] },
            });
          } catch (error) {
            sendMessage({
              type: 'error',
              data: { message: 'Failed to clear messages' },
            });
          }
          break;

        case 'delete_chat':
          try {
            const { chatId } = message.data;
            const configFile = new ConfigFile();
            await configFile.load();
            await configFile.deleteChat(chatId);
            removeChat(chatId); // Remove from cache
            sendMessage({
              type: 'chat_deleted',
              data: { chatId },
            });
          } catch (error) {
            sendMessage({
              type: 'error',
              data: { message: 'Failed to delete chat' },
            });
          }
          break;

        default:
          sendMessage({
            type: 'error',
            data: { message: `Unknown message type: ${(message as any).type}` },
          });
      }
    } catch (error) {
      console.error('WebSocket error:', error);
      sendMessage({
        type: 'error',
        data: { message: error instanceof Error ? error.message : 'Unknown error' },
      });
    }
  });

  ws.on('close', () => {
    if (abortController) {
      abortController.abort();
    }
  });
}

async function serveStaticFile(url: string, res: http.ServerResponse): Promise<void> {
  // Default to index.html
  if (url === '/' || !url.includes('.')) {
    url = '/index.html';
  }

  // Security: prevent directory traversal
  const distDir = path.resolve(__serverDirname, '../dist-browser');
  const filePath = path.resolve(distDir, url.slice(1));

  // Ensure file is within dist directory
  if (!filePath.startsWith(distDir + path.sep) && filePath !== distDir) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const content = await fs.readFile(filePath);

    // Set content type
    const ext = path.extname(filePath);
    const contentTypes: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
    };
    const contentType = contentTypes[ext] || 'text/plain';

    res.setHeader('Content-Type', contentType);
    res.writeHead(200);
    res.end(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not found');
    } else {
      throw error;
    }
  }
}
