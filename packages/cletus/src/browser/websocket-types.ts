/**
 * Type-safe WebSocket message protocol for browser-server communication
 */

import type { Message, ChatMeta, ChatMode, AgentMode, Config } from '../schemas';

// Client -> Server Messages
export type ClientMessage =
  | { type: 'get_config'; data?: never }
  | { type: 'create_chat'; data: { name: string } }
  | { type: 'get_messages'; data: { chatId: string } }
  | { type: 'init_chat'; data: { chatId: string } }
  | { type: 'send_message'; data: { chatId: string; content: Message['content'] } }
  | { type: 'cancel'; data?: never }
  | { type: 'update_chat_meta'; data: { chatId: string; updates: Partial<ChatMeta> } }
  | { type: 'add_todo'; data: { chatId: string; todo: string } }
  | { type: 'toggle_todo'; data: { chatId: string; index: number } }
  | { type: 'remove_todo'; data: { chatId: string; index: number } }
  | { type: 'clear_todos'; data: { chatId: string } }
  | { type: 'clear_messages'; data: { chatId: string } }
  | { type: 'delete_chat'; data: { chatId: string } }
  | { type: 'get_models'; data?: { baseMetadata?: any } }
  | { type: 'handle_operations'; data: { chatId: string; messageCreated: number; approved: number[]; rejected: number[] } };

// Server -> Client Messages
export type ServerMessage =
  | { type: 'config'; data: Config }
  | { type: 'config_not_found'; data: Record<string, never> }
  | { type: 'chat_created'; data: { chatId: string } }
  | { type: 'chat_initialized'; data: { messages: Message[]; chat?: ChatMeta } }
  | { type: 'messages'; data: { messages: Message[] } }
  | { type: 'message_added'; data: { message: Message } }
  | { type: 'message_updated'; data: { message: Message } }
  | { type: 'pending_update'; data: { pending: Message } }
  | { type: 'messages_updated'; data: { messages: Message[] } }
  | { type: 'response_complete'; data: { message: Message } }
  | { type: 'chat_updated'; data: { chat?: ChatMeta } }
  | { type: 'models'; data: { models: any[] } }
  | { type: 'status_update'; data: { status: string } }
  | { type: 'usage_update'; data: { accumulated: any; accumulatedCost: number; current: any } }
  | { type: 'elapsed_update'; data: { ms: number } }
  | { type: 'chat_deleted'; data: { chatId: string } }
  | { type: 'error'; data: { message: string } };

/**
 * Type-safe WebSocket client interface
 */
export interface TypedWebSocket {
  send(message: ClientMessage): void;
  onMessage(handler: (message: ServerMessage) => void): void;
  close(): void;
}

/**
 * Helper to create a typed WebSocket wrapper
 */
export function createTypedWebSocket(url: string): TypedWebSocket {
  const ws = new WebSocket(url);
  const messageHandlers: Array<(message: ServerMessage) => void> = [];

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data) as ServerMessage;
      messageHandlers.forEach(handler => handler(message));
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  };

  return {
    send(message: ClientMessage) {
      ws.send(JSON.stringify(message));
    },
    onMessage(handler: (message: ServerMessage) => void) {
      messageHandlers.push(handler);
    },
    close() {
      ws.close();
    },
  };
}

/**
 * Type-safe helper to send a message via WebSocket
 */
export function sendClientMessage(ws: WebSocket | null, message: ClientMessage): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}
