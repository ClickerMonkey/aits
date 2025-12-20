import type { WebSocket } from 'ws';
import type { ServerMessage } from './websocket-types';
import type { OrchestratorEvent } from '../agents/chat-orchestrator';
import { ConnectionRegistry } from './connection-registry';
import { ChatOperationManager } from './chat-operation-manager';

/**
 * Centralized message broadcasting with chat-scoped routing.
 *
 * Handles sending messages to specific clients or broadcasting to all clients
 * watching a particular chat.
 */
export class BroadcastManager {
  constructor(
    private registry: ConnectionRegistry,
    private operationManager: ChatOperationManager
  ) {}

  /**
   * Broadcast a message to all clients currently subscribed to a specific chat.
   */
  broadcastToChat(chatId: string, message: ServerMessage): void {
    const clients = this.registry.getClientsForChat(chatId);
    const messageStr = JSON.stringify(message);

    for (const ws of clients) {
      if (ws.readyState === 1) { // WebSocket.OPEN = 1
        ws.send(messageStr);
      }
    }
  }

  /**
   * Send a message to a specific connection.
   */
  sendToConnection(connectionId: string, message: ServerMessage): void {
    const connection = this.registry.getConnection(connectionId);
    if (!connection) return;

    if (connection.ws.readyState === 1) { // WebSocket.OPEN = 1
      connection.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Convert an orchestrator event to a server message and broadcast to all
   * clients watching the chat.
   */
  broadcastOperationEvent(chatId: string, event: OrchestratorEvent): void {
    switch (event.type) {
      case 'pendingUpdate':
        // Update operation manager state
        this.operationManager.updatePendingMessage(chatId, event.pending);

        this.broadcastToChat(chatId, {
          type: 'pending_update',
          data: { chatId, pending: event.pending },
        });
        break;

      case 'update':
        this.broadcastToChat(chatId, {
          type: 'message_updated',
          data: { chatId, message: event.message },
        });
        break;

      case 'status':
        this.broadcastToChat(chatId, {
          type: 'status_update',
          data: { chatId, status: event.status },
        });
        break;

      case 'usage':
        this.broadcastToChat(chatId, {
          type: 'usage_update',
          data: {
            chatId,
            accumulated: event.accumulated,
            accumulatedCost: event.accumulatedCost,
            current: event.current,
          },
        });
        break;

      case 'complete':
        this.broadcastToChat(chatId, {
          type: 'response_complete',
          data: { chatId, message: event.message },
        });
        break;

      case 'error':
        this.broadcastToChat(chatId, {
          type: 'error',
          data: { chatId, message: event.error },
        });
        break;
    }
  }

  /**
   * Send the current operation state for a chat to a specific connection.
   * Used when a client subscribes to a chat.
   */
  sendOperationState(connectionId: string, chatId: string): void {
    const state = this.operationManager.getOperationState(chatId);

    this.sendToConnection(connectionId, {
      type: 'operation_state',
      data: {
        chatId,
        status: state?.status || 'idle',
        pendingMessage: state?.pendingMessage || null,
        startTime: state?.startTime || null,
      },
    });
  }
}
