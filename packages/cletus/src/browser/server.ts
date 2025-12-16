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
import { OperationManager } from '../operations/manager';
import { CletusAI, createCletusAI } from '../ai';
import { CletusChatAgent, createChatAgent } from '../agents/chat-agent';
import { OrchestratorEvent, runChatOrchestrator } from '../agents/chat-orchestrator';

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
    handleWebSocketConnection(ws).catch(error => {
      console.error('WebSocket connection error:', error);
      ws.close();
    });
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

async function handleWebSocketConnection(ws: WebSocket): Promise<void> {
  let config: ConfigFile | null = null;
  let configPromise: Promise<boolean> | null = null;
  let ai: CletusAI | null = null;
  let chatAgent: CletusChatAgent | null = null;
  let abortController: AbortController | null = null;
  let configUpdateQueue: Promise<void> = Promise.resolve();

  // Type-safe message sender
  const sendMessage = (message: ServerMessage) => {
    ws.send(JSON.stringify(message));
  };

  // Helper to send errors
  const sendError = (e: any, message: string = typeof e === 'string' ? e : e.message) => {
    sendMessage({
      type: 'error',
      data: { message },
    });

    console.error(e);
  };

  // Load config once at connection time
  const ensureConfig = async () => {
    if (!configPromise) {
      configPromise = (async () => {
        const exists = await configExists();
        if (!exists) {
          return false;
        }
        config = new ConfigFile();
        await config.load();
        return true;
      })();
    }
    return await configPromise;
  };

  // Lazy-load AI and chat agent once
  const ensureAI = async () => {
    if (!ai || !chatAgent) {
      await ensureConfig();
      if (!config) {
        throw new Error('Config not available');
      }
      ai = createCletusAI(config);
      chatAgent = createChatAgent(ai);
    }
    return { ai, chatAgent };
  };

  const withConfig = async <T>(fn: (config: ConfigFile) => T) => {
    try {
      if (!await ensureConfig()) {
        sendMessage({
          type: 'config_not_found',
          data: {},
        });
        return;
      }
    } catch (e: any) {
      sendError(e);
      return;
    }

    // Ensure config is loaded
    if (config) {
      try {
        return await fn(config);
      } catch (e: any) {
        sendError(e);
      }
    } else {
      sendMessage({
        type: 'config_not_found',
        data: {},
      });
    }
  };

  // Helper to serialize config update operations
  const withConfigUpdate = async <T>(fn: (config: ConfigFile) => Promise<T>) => {
    // Queue this update to run after previous updates complete
    const previousQueue = configUpdateQueue;

    let resolveUpdate: () => void;
    configUpdateQueue = new Promise<void>(resolve => {
      resolveUpdate = resolve;
    });

    try {
      // Wait for previous updates to complete
      await previousQueue;

      // Reload config to get latest state
      if (config) {
        await config.load();
      }

      // Run the update
      return await withConfig(fn);
    } finally {
      // Mark this update as complete
      resolveUpdate!();
    }
  };

  const withChatFile = async <T>(chatId: string, fn: (chatFile: ChatFile, chat: ChatMeta, config: ConfigFile) => T) => {
    return await withConfig(async (config) => {
      let chatFile: ChatFile;
      try {
        chatFile = await getChat(chatId);
      } catch (e: any) {
        sendError(e, 'Failed to load chat file');
        return;
      }

      const chat = config.getChats().find(c => c.id === chatId);
      if (!chat) {
        sendError('Chat not found');

        return;
      }

      try {
        return await fn(chatFile, chat, config);
      } catch (e: any) {
        sendError(e, 'Failed to process chat file');
      }
    });
  };

  const handleOrchestratorEvent = (event: OrchestratorEvent, chatFile: ChatFile) => {
    // Handle orchestrator events
    switch (event.type) {
      case 'pendingUpdate':
        sendMessage({
          type: 'pending_update',
          data: { pending: event.pending },
        });
        break;
      case 'update':
        fireAndForget(chatFile.updateMessage(event.message));
        sendMessage({
          type: 'message_updated',
          data: { message: event.message },
        });
        break;
      case 'status':
        sendMessage({
          type: 'status_update',
          data: { status: event.status },
        });
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
        if (event.message.content.length > 0) {
          fireAndForget(chatFile.addMessage(event.message))
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
  };

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString()) as ClientMessage;

      switch (message.type) {
        case 'get_config':
          withConfig((config) => {
            const configData = config.getData();

            sendMessage({
              type: 'config',
              data: configData,
            });
          });
          break;

        case 'create_chat': {
          const { name } = message.data;
          await withConfigUpdate(async (config) => {

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

            await config.addChat(newChat);

            // Create the chat messages file
            const chatFile = new ChatFile(chatId);
            await chatFile.save(() => {
              // Initialize empty chat
            });

            sendMessage({
              type: 'chat_created',
              data: { chatId },
            });
          });
          break;
        }
        case 'init_chat': {
          const { chatId } = message.data;
          await withChatFile(chatId, async (chatFile, _, config) => {
            // Initialize AI to get default cwd
            await ensureAI();

            sendMessage({
              type: 'chat_initialized',
              data: {
                messages: chatFile.getMessages(),
                chat: config.getChats().find(c => c.id === chatId),
              },
            });

            // Send current cwd
            sendMessage({
              type: 'chat_updated',
              data: {
                cwd: ai?.config.defaultContext?.cwd
              },
            });
          });
          break;
        }
        case 'get_messages': {
          const { chatId } = message.data;
          await withChatFile(chatId, async (chatFile) => {
            const messages = chatFile.getMessages();

            sendMessage({
              type: 'messages',
              data: { messages },
            });
          });
          break;
        }
        case 'send_message': {
          const { chatId, content } = message.data;
          await withChatFile(chatId, async (chatFile, chat, config) => {
              
            // Validate content is an array of MessageContent
            if (!Array.isArray(content)) {
              sendMessage({
                type: 'error',
                data: { message: 'Invalid message content: must be an array' },
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

            // Ensure AI and chat agent are loaded
            const { ai: aiInstance, chatAgent: chatAgentInstance } = await ensureAI();

            const clearUsage = () => {
              const defaultContext = aiInstance.config.defaultContext;
              if (defaultContext && defaultContext.usage) {
                defaultContext.usage.accumulated = {};
                defaultContext.usage.accumulatedCost = 0;
              }
            };

            const getUsage = () => {
              const defaultContext = aiInstance.config.defaultContext;
              if (defaultContext && defaultContext.usage) {
                return {
                  accumulated: defaultContext.usage.accumulated,
                  accumulatedCost: defaultContext.usage.accumulatedCost,
                };
              }
              return { accumulated: {}, accumulatedCost: 0 };
            };

            await runChatOrchestrator({
              chatAgent: chatAgentInstance,
              messages: chatFile.getMessages(),
              chatMeta: chat,
              config,
              chatData: chatFile,
              signal: abortController.signal,
              clearUsage,
              getUsage,
            }, (event) => {
              handleOrchestratorEvent(event, chatFile);
            }).then(() => {
              // Clear abort controller
              abortController = null;
            });
          });
          break;
        }
        case 'cancel':
          if (abortController) {
            abortController.abort();
            abortController = null;
          }
          break;

        case 'get_models':
          try {
            const { baseMetadata } = message.data || {};
            const { ai: aiInstance } = await ensureAI();
            const models = aiInstance.registry.searchModels(baseMetadata || {});

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

        case 'update_chat_meta': {
          const { chatId, updates, cwd } = message.data;
          withConfigUpdate(async (config) => {

            await config.updateChat(chatId, updates);
            const updatedChat = config.getChats().find(c => c.id === chatId);

            // Update AI cwd if provided
            if (cwd !== undefined && ai) {
              if (!ai.config.defaultContext) {
                ai.config.defaultContext = {};
              }
              ai.config.defaultContext.cwd = cwd;
            }

            sendMessage({
              type: 'chat_updated',
              data: {
                chat: updatedChat,
                cwd: ai?.config.defaultContext?.cwd
              },
            });
          });
          break;
        }
        case 'add_todo': {
          const { chatId, todo } = message.data;
          withConfigUpdate(async (config) => {
            const chat = config.getChats().find(c => c.id === chatId);
            if (chat) {
              chat.todos.push({ id: Math.random().toString(36).substring(7), name: todo, done: false });
              await config.updateChat(chatId, { todos: chat.todos });
              const updatedChat = config.getChats().find(c => c.id === chatId);
              sendMessage({
                type: 'chat_updated',
                data: { chat: updatedChat },
              });
            }
          });
          break;
        }
        case 'toggle_todo': {
          const { chatId, index } = message.data;
          withConfigUpdate(async (config) => {
            const chat = config.getChats().find(c => c.id === chatId);
            if (chat && chat.todos[index]) {
              chat.todos[index].done = !chat.todos[index].done;
              await config.updateChat(chatId, { todos: chat.todos });
              const updatedChat = config.getChats().find(c => c.id === chatId);
              sendMessage({
                type: 'chat_updated',
                data: { chat: updatedChat },
              });
            }
          });
          break;
        }
        case 'remove_todo': {
          const { chatId, index } = message.data;
          withConfigUpdate(async (config) => {
            const chat = config.getChats().find(c => c.id === chatId);
            if (chat && chat.todos[index] !== undefined) {
              chat.todos.splice(index, 1);
              await config.updateChat(chatId, { todos: chat.todos });
              const updatedChat = config.getChats().find(c => c.id === chatId);
              sendMessage({
                type: 'chat_updated',
                data: { chat: updatedChat },
              });
            }
          });
          break;
        }
        case 'clear_todos': {
          const { chatId } = message.data;
          withConfigUpdate(async (config) => {
            await config.updateChat(chatId, { todos: [] });
            const updatedChat = config.getChats().find(c => c.id === chatId);
            sendMessage({
              type: 'chat_updated',
              data: { chat: updatedChat },
            });
          });
          break;
        }
        case 'clear_messages': {
          const { chatId } = message.data;
          withChatFile(chatId, async (chatFile) => {
            await chatFile.save((data) => {
              data.messages = [];
            });
            sendMessage({
              type: 'messages_updated',
              data: { messages: [] },
            });
          });
          break;
        }
        case 'delete_chat': {
          const { chatId } = message.data;
          withConfigUpdate(async (config) => {
            await config.deleteChat(chatId);
            removeChat(chatId); // Remove from cache
            sendMessage({
              type: 'chat_deleted',
              data: { chatId },
            });
          });
          break;
        }
        case 'handle_operations': {
          const { chatId, messageCreated, approved, rejected } = message.data;
          withChatFile(chatId, async (chatFile, chatMeta, config) => {
            const messages = chatFile.getMessages();
            const targetMessage = messages.find(m => m.created === messageCreated);

            if (!targetMessage || !targetMessage.operations) {
              sendMessage({
                type: 'error',
                data: { message: 'Message or operations not found' },
              });
              return;
            }

            const operations = targetMessage.operations;
            const manager = new OperationManager('none', operations);

            // Mark rejected operations
            for (const idx of rejected) {
              if (operations[idx]) {
                operations[idx].status = 'rejected';
                manager.updateMessage(operations[idx]);
              }
            }

            // Ensure AI and chat agent are loaded
            const { ai: aiInstance, chatAgent: chatAgentInstance } = await ensureAI();

            // Execute approved operations
            let hasExecutedOperations = false;
            if (approved.length > 0) {
              const ctx = await aiInstance.buildContext({
                chat: chatMeta,
                chatData: chatFile,
                chatMessage: targetMessage,
              });

              for (const idx of approved) {
                if (operations[idx]) {
                  await manager.execute(operations[idx], true, ctx);
                  hasExecutedOperations = true;
                }
              }
            }

            // Save updated message
            await chatFile.save(d => {
              d.messages = messages.map(m => m.created === messageCreated ? targetMessage : m);
            });

            // Send updated message back to client
            sendMessage({
              type: 'message_updated',
              data: { message: targetMessage },
            });

            // If operations were executed, continue with the orchestrator
            if (hasExecutedOperations) {
              // Process AI response
              abortController = new AbortController();

              // Clear usage before running orchestrator
              const clearUsage = () => {
                const defaultContext = aiInstance.config.defaultContext;
                if (defaultContext && defaultContext.usage) {
                  defaultContext.usage.accumulated = {};
                  defaultContext.usage.accumulatedCost = 0;
                }
              };

              // Get current usage
              const getUsage = () => {
                const defaultContext = aiInstance.config.defaultContext;
                if (defaultContext && defaultContext.usage) {
                  return {
                    accumulated: defaultContext.usage.accumulated,
                    accumulatedCost: defaultContext.usage.accumulatedCost,
                  };
                }
                return { accumulated: {}, accumulatedCost: 0 };
              };

              // Run orchestrator with updated chat file
              await runChatOrchestrator({
                chatAgent: chatAgentInstance,
                messages: chatFile.getMessages(),
                chatMeta: chatMeta,
                config,
                chatData: chatFile,
                signal: abortController?.signal,
                clearUsage,
                getUsage,
              }, (event) => {
                handleOrchestratorEvent(event, chatFile);
              }).then(() => {
                // Clear abort controller
                abortController = null;
              });
            }
          });
          break;
        }
        case 'submit_question_answers': {
          const { chatId, questionAnswers, questionCustomAnswers } = message.data;
          withChatFile(chatId, async (chatFile, chatMeta, config) => {
            if (!chatMeta.questions || chatMeta.questions.length === 0) {
              sendMessage({
                type: 'error',
                data: { message: 'No questions to answer' },
              });
              return;
            }

            // Format answers as markdown (matching CLI behavior)
            let questionText = '## Questions\n';
            let answerText = '## Answers\n';

            for (let i = 0; i < chatMeta.questions.length; i++) {
              const question = chatMeta.questions[i];
              const selections = new Set(questionAnswers[i] || []);
              const customAnswer = questionCustomAnswers[i];

              answerText += `**${question.name}:**\n`;
              questionText += `**${question.name}:** ${question.min === question.max ? `(choose ${question.min})` : `(choose ${question.min}-${question.max})`}\n`;

              for (const option of question.options) {
                questionText += `- ${option.label}?\n`;
              }

              if (selections.size > 0) {
                Array.from(selections).forEach((optionIndex) => {
                  if (optionIndex < question.options.length) {
                    answerText += `- ${question.options[optionIndex].label}\n`;
                  }
                });
              }

              if (customAnswer) {
                answerText += `- ${customAnswer}\n`;
              }

              if (selections.size === 0 && !customAnswer) {
                answerText += `- (no answer provided)\n`;
              }

              if (question.custom) {
                questionText += `- *${question.customLabel || 'Other'}?*\n`;
              }

              answerText += '\n';
              questionText += '\n';
            }

            // Clear questions from chat meta
            await withConfigUpdate(async (config) => {
              const chats = config.getChats();
              const chatIndex = chats.findIndex(c => c.id === chatId);
              if (chatIndex !== -1) {
                chats[chatIndex].questions = [];
                await config.updateChat(chatId, { questions: [] });
              }
            });

            // Add the formatted questions as an assistant message
            const questionMessage: Message = {
              role: 'assistant',
              name: chatMeta.assistant,
              content: [{ type: 'text', content: questionText.trim() }],
              created: Date.now(),
              operations: [],
            };

            await chatFile.addMessage(questionMessage);
            sendMessage({
              type: 'message_added',
              data: { message: questionMessage },
            });

            // Add the formatted answer as a user message
            const answerMessage: Message = {
              role: 'user',
              name: config.getData().user.name,
              content: [{ type: 'text', content: answerText.trim() }],
              created: Date.now(),
            };

            await chatFile.addMessage(answerMessage);
            sendMessage({
              type: 'message_added',
              data: { message: answerMessage },
            });

            // Send updated chat meta
            sendMessage({
              type: 'chat_updated',
              data: { chat: { ...chatMeta, questions: [] } },
            });

            // Ensure AI and chat agent are loaded
            const { ai: aiInstance, chatAgent: chatAgentInstance } = await ensureAI();

            // Run orchestrator
            abortController = new AbortController();

            // Clear usage before running orchestrator
            const clearUsage = () => {
              const defaultContext = aiInstance.config.defaultContext;
              if (defaultContext && defaultContext.usage) {
                defaultContext.usage.accumulated = {};
                defaultContext.usage.accumulatedCost = 0;
              }
            };

            // Get current usage
            const getUsage = () => {
              const defaultContext = aiInstance.config.defaultContext;
              if (defaultContext && defaultContext.usage) {
                return {
                  accumulated: defaultContext.usage.accumulated,
                  accumulatedCost: defaultContext.usage.accumulatedCost,
                };
              }
              return { accumulated: {}, accumulatedCost: 0 };
            };

            // Run orchestrator with updated chat file
            await runChatOrchestrator({
              chatAgent: chatAgentInstance,
              messages: chatFile.getMessages(),
              chatMeta: { ...chatMeta, questions: [] },
              config,
              chatData: chatFile,
              signal: abortController?.signal,
              clearUsage,
              getUsage,
            }, (event) => {
              handleOrchestratorEvent(event, chatFile);
            }).then(() => {
              // Clear abort controller
              abortController = null;
            });
          });
          break;
        }
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

function fireAndForget<T>(promise: Promise<T>): void {
  promise.catch((error) => {
    console.error('Uncaught error:', error);
  });
}