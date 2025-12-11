import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { configExists } from '../file-manager';
import { ConfigFile } from '../config';
import { ChatFile } from '../chat';
import type { Message, ChatMeta } from '../schemas';

const __serverFilename = fileURLToPath(import.meta.url);
const __serverDirname = path.dirname(__serverFilename);

interface WSMessage {
  type: string;
  data?: any;
}

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
  let chatFile: ChatFile | null = null;
  let abortController: AbortController | null = null;

  ws.on('message', async (data) => {
    try {
      const message: WSMessage = JSON.parse(data.toString());

      switch (message.type) {
        case 'get_config':
          try {
            const exists = await configExists();
            if (!exists) {
              ws.send(JSON.stringify({
                type: 'config_not_found',
                data: {},
              }));
              return;
            }

            const configFile = new ConfigFile();
            await configFile.load();
            const configData = configFile.getData();

            ws.send(JSON.stringify({
              type: 'config',
              data: {
                user: configData.user,
                assistants: configData.assistants,
                chats: configData.chats,
                types: configData.types,
              },
            }));
          } catch (error) {
            ws.send(JSON.stringify({
              type: 'error',
              data: { message: 'Failed to load config' },
            }));
          }
          break;

        case 'create_chat':
          try {
            const { name } = message.data;
            const configFile = new ConfigFile();
            await configFile.load();
            const chatId = await configFile.createChat(name);
            await configFile.load();

            ws.send(JSON.stringify({
              type: 'chat_created',
              data: { chatId },
            }));
          } catch (error) {
            ws.send(JSON.stringify({
              type: 'error',
              data: { message: 'Failed to create chat' },
            }));
          }
          break;

        case 'init_chat':
          try {
            const { chatId } = message.data;
            config = new ConfigFile();
            await config.load();
            chatFile = new ChatFile(chatId);
            await chatFile.load();

            ws.send(JSON.stringify({
              type: 'chat_initialized',
              data: {
                messages: chatFile.getMessages(),
                chat: config.getChats().find(c => c.id === chatId),
              },
            }));
          } catch (error) {
            ws.send(JSON.stringify({
              type: 'error',
              data: { message: 'Failed to initialize chat' },
            }));
          }
          break;

        case 'get_messages':
          try {
            const { chatId } = message.data;
            const chatFileTemp = new ChatFile(chatId);
            await chatFileTemp.load();
            const messages = chatFileTemp.getMessages();

            ws.send(JSON.stringify({
              type: 'messages',
              data: { messages },
            }));
          } catch (error) {
            ws.send(JSON.stringify({
              type: 'error',
              data: { message: 'Failed to load messages' },
            }));
          }
          break;

        case 'send_message':
          if (!config || !chatFile) {
            ws.send(JSON.stringify({
              type: 'error',
              data: { message: 'Chat not initialized' },
            }));
            return;
          }

          try {
            const { content } = message.data;
            const chat = config.getChats().find(c => c.id === chatFile!.id);
            if (!chat) {
              ws.send(JSON.stringify({
                type: 'error',
                data: { message: 'Chat not found' },
              }));
              return;
            }

            // Add user message
            const userMessage: Omit<Message, 'created'> = {
              role: 'user',
              content,
            };
            await chatFile.addMessage(userMessage);

            ws.send(JSON.stringify({
              type: 'message_added',
              data: { message: { ...userMessage, created: Date.now() } },
            }));

            // Process AI response
            abortController = new AbortController();

            // Lazy-load AI components
            const { createCletusAI } = await import('../ai');
            const { createChatAgent } = await import('../agents/chat-agent');
            const { runChatOrchestrator } = await import('../agents/chat-orchestrator');

            const ai = createCletusAI(config);
            const chatAgent = createChatAgent(ai);

            const chatStatus = (status: string) => {
              ws.send(JSON.stringify({
                type: 'status_update',
                data: { status },
              }));
            };

            const onRefreshChat = () => {
              ws.send(JSON.stringify({
                type: 'messages_updated',
                data: { messages: chatFile!.getMessages() },
              }));
            };

            await runChatOrchestrator({
              config,
              chat,
              chatData: chatFile,
              chatAgent,
              ai,
              signal: abortController.signal,
              chatStatus,
              events: {
                onRefreshChat,
                onRefreshPending: onRefreshChat,
              },
            });

            ws.send(JSON.stringify({
              type: 'response_complete',
              data: { messages: chatFile.getMessages() },
            }));
          } catch (error) {
            if (error instanceof Error && error.name !== 'AbortError') {
              ws.send(JSON.stringify({
                type: 'error',
                data: { message: error.message },
              }));
            }
          }
          break;

        case 'cancel':
          if (abortController) {
            abortController.abort();
            abortController = null;
          }
          break;

        default:
          ws.send(JSON.stringify({
            type: 'error',
            data: { message: `Unknown message type: ${message.type}` },
          }));
      }
    } catch (error) {
      console.error('WebSocket error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: error instanceof Error ? error.message : 'Unknown error' },
      }));
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
