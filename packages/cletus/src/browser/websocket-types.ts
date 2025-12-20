/**
 * Type-safe WebSocket message protocol for browser-server communication
 */

import type { Message, ChatMeta, ChatMode, AgentMode, Config } from '../schemas';

// Client -> Server Messages
export type ClientMessage =
  | { type: 'get_config'; data?: never }
  | { type: 'create_chat'; data: { name: string } }
  | { type: 'get_messages'; data: { chatId: string } }
  | { type: 'send_message'; data: { chatId: string; content: Message['content'] } }
  | { type: 'cancel'; data: { chatId: string } }
  | { type: 'subscribe_chat'; data: { chatId: string } }
  | { type: 'unsubscribe_chat'; data: { chatId: string } }
  | { type: 'update_chat_meta'; data: { chatId: string; updates: Partial<ChatMeta>; cwd?: string } }
  | { type: 'update_user'; data: { updates: Partial<Config['user']> } }
  | { type: 'add_todo'; data: { chatId: string; todo: string } }
  | { type: 'toggle_todo'; data: { chatId: string; index: number } }
  | { type: 'remove_todo'; data: { chatId: string; index: number } }
  | { type: 'clear_todos'; data: { chatId: string } }
  | { type: 'clear_messages'; data: { chatId: string } }
  | { type: 'delete_chat'; data: { chatId: string } }
  | { type: 'get_models'; data?: { baseMetadata?: any } }
  | { type: 'handle_operations'; data: { chatId: string; messageCreated: number; approved: number[]; rejected: number[] } }
  | { type: 'submit_question_answers'; data: { chatId: string; questionAnswers: Record<number, number[]>; questionCustomAnswers: Record<number, string> } };

// Server -> Client Messages
export type ServerMessage =
  | { type: 'config'; data: Config }
  | { type: 'config_not_found'; data: Record<string, never> }
  | { type: 'chat_created'; data: { chatId: string } }
  | { type: 'chat_subscribed'; data: { chatId: string } }
  | { type: 'messages'; data: { chatId: string; messages: Message[] } }
  | { type: 'message_added'; data: { chatId: string; message: Message } }
  | { type: 'message_updated'; data: { chatId: string; message: Message } }
  | { type: 'pending_update'; data: { chatId: string; pending: Message } }
  | { type: 'messages_updated'; data: { chatId: string; messages: Message[] } }
  | { type: 'response_complete'; data: { chatId: string; message: Message } }
  | { type: 'chat_updated'; data: { chatId: string; chat?: ChatMeta; cwd?: string } }
  | { type: 'models'; data: { models: any[] } }
  | { type: 'status_update'; data: { chatId: string; status: string } }
  | { type: 'usage_update'; data: { chatId: string; accumulated: any; accumulatedCost: number; current: any } }
  | { type: 'operation_state'; data: { chatId: string; status: 'idle' | 'processing' | 'waiting_approval'; pendingMessage: Message | null; startTime: number | null } }
  | { type: 'chat_deleted'; data: { chatId: string } }
  | { type: 'error'; data: { chatId?: string; message: string } }
  | { type: 'processing'; data: { chatId: string; isProcessing: boolean } };

/**
 * Type-safe WebSocket client interface
 */
export interface TypedWebSocket {
  send(message: ClientMessage): void;
  onMessage(handler: (message: ServerMessage) => void): () => void;
  close(): void;
  isOpen(): boolean;
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
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      } else {
        console.error('WebSocket is not open. ReadyState:', ws.readyState);
      }
    },
    onMessage(handler: (message: ServerMessage) => void): () => void {
      messageHandlers.push(handler);
      // Return unsubscribe function
      return () => {
        const index = messageHandlers.indexOf(handler);
        if (index > -1) {
          messageHandlers.splice(index, 1);
        }
      };
    },
    close() {
      ws.close();
    },
    isOpen() {
      return ws.readyState === WebSocket.OPEN;
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
