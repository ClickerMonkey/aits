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

interface ApiResponse {
  success: boolean;
  data?: any;
  error?: string;
}

interface WSMessage {
  type: string;
  data?: any;
}

export async function startBrowserServer(port: number = 3000): Promise<void> {
  const server = http.createServer(async (req, res) => {
    const url = req.url || '/';

    // Enable CORS for local development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      // API routes
      if (url.startsWith('/api/')) {
        await handleApiRequest(req, res, url);
        return;
      }

      // Serve static files
      await serveStaticFile(url, res);
    } catch (error) {
      console.error('Server error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Internal server error' }));
    }
  });

  // WebSocket server for real-time chat
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => handleWebSocketConnection(ws));

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
    wss.close();
    server.close(() => {
      process.exit(0);
    });
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
        case 'init_chat':
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
          break;

        case 'send_message':
          if (!config || !chatFile) {
            ws.send(JSON.stringify({
              type: 'error',
              data: { message: 'Chat not initialized' },
            }));
            return;
          }

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

          try {
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

async function handleApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string
): Promise<void> {
  res.setHeader('Content-Type', 'application/json');

  // Check if config exists
  if (url === '/api/config/exists') {
    const exists = await configExists();
    sendJson(res, 200, { success: true, data: { exists } });
    return;
  }

  // Get config
  if (url === '/api/config' && req.method === 'GET') {
    const exists = await configExists();
    if (!exists) {
      sendJson(res, 404, { success: false, error: 'Config not found' });
      return;
    }

    const config = new ConfigFile();
    await config.load();
    const data = config.getData();

    sendJson(res, 200, {
      success: true,
      data: {
        user: data.user,
        assistants: data.assistants,
        chats: data.chats,
        types: data.types,
      },
    });
    return;
  }

  // Get chat messages
  const chatMatch = url.match(/^\/api\/chat\/([^/]+)\/messages$/);
  if (chatMatch && req.method === 'GET') {
    const chatId = chatMatch[1];
    const chatFile = new ChatFile(chatId);
    
    try {
      await chatFile.load();
      const messages = chatFile.getMessages();
      sendJson(res, 200, { success: true, data: { messages } });
    } catch (error) {
      sendJson(res, 404, { success: false, error: 'Chat not found' });
    }
    return;
  }

  // Create chat
  if (url === '/api/chat/create' && req.method === 'POST') {
    const body = await readBody(req);
    const { name } = JSON.parse(body);

    const config = new ConfigFile();
    await config.load();
    const chatId = await config.createChat(name);
    await config.load(); // Reload to get updated data

    sendJson(res, 200, { success: true, data: { chatId } });
    return;
  }

  // Update chat
  const updateChatMatch = url.match(/^\/api\/chat\/([^/]+)$/);
  if (updateChatMatch && req.method === 'PUT') {
    const chatId = updateChatMatch[1];
    const body = await readBody(req);
    const updates = JSON.parse(body);

    const config = new ConfigFile();
    await config.load();
    await config.updateChat(chatId, updates);
    await config.load();

    sendJson(res, 200, { success: true, data: {} });
    return;
  }

  // Add message to chat
  const addMessageMatch = url.match(/^\/api\/chat\/([^/]+)\/message$/);
  if (addMessageMatch && req.method === 'POST') {
    const chatId = addMessageMatch[1];
    const body = await readBody(req);
    const message = JSON.parse(body);

    const chatFile = new ChatFile(chatId);
    await chatFile.load();
    await chatFile.addMessage(message);

    sendJson(res, 200, { success: true, data: {} });
    return;
  }

  // 404
  sendJson(res, 404, { success: false, error: 'Not found' });
}

async function serveStaticFile(url: string, res: http.ServerResponse): Promise<void> {
  // Default to index.html
  if (url === '/' || !url.includes('.')) {
    url = '/index.html';
  }

  // Security: prevent directory traversal
  const safePath = path.normalize(url).replace(/^(\.\.[\/\\])+/, '');
  // When bundled, this code is in dist/index.js, so dist-browser is ../dist-browser
  const distDir = path.join(__serverDirname, '../dist-browser');
  const filePath = path.join(distDir, safePath);

  // Ensure file is within dist directory
  if (!filePath.startsWith(distDir)) {
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

function sendJson(res: http.ServerResponse, status: number, data: ApiResponse): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
