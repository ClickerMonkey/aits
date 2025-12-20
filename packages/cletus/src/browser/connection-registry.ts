import type { WebSocket } from 'ws';
import { randomBytes } from 'crypto';

/**
 * Represents a client WebSocket connection with its associated metadata.
 */
export interface ClientConnection {
  ws: WebSocket;
  connectionId: string;
  activeChatId: string | null;
  connectedAt: number;
}

/**
 * Tracks which clients are subscribed to which chats for broadcasting.
 *
 * This enables multi-client real-time synchronization where multiple browser
 * windows can view the same chat and receive updates simultaneously.
 */
export class ConnectionRegistry {
  private connections: Map<string, ClientConnection> = new Map();

  /**
   * Register a new WebSocket connection and return its unique ID.
   */
  registerConnection(ws: WebSocket): string {
    const connectionId = this.generateConnectionId();
    const connection: ClientConnection = {
      ws,
      connectionId,
      activeChatId: null,
      connectedAt: Date.now(),
    };

    this.connections.set(connectionId, connection);
    return connectionId;
  }

  /**
   * Unregister a connection when client disconnects.
   */
  unregisterConnection(connectionId: string): void {
    this.connections.delete(connectionId);
  }

  /**
   * Set the active chat for a connection (used for subscribe_chat).
   */
  setActiveChat(connectionId: string, chatId: string | null): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.activeChatId = chatId;
  }

  /**
   * Get the active chat ID for a connection.
   */
  getActiveChat(connectionId: string): string | null {
    const connection = this.connections.get(connectionId);
    return connection?.activeChatId || null;
  }

  /**
   * Get all WebSocket clients currently subscribed to a specific chat.
   */
  getClientsForChat(chatId: string): WebSocket[] {
    const clients: WebSocket[] = [];

    for (const connection of this.connections.values()) {
      if (connection.activeChatId === chatId) {
        clients.push(connection.ws);
      }
    }

    return clients;
  }

  /**
   * Get a specific connection by ID.
   */
  getConnection(connectionId: string): ClientConnection | null {
    return this.connections.get(connectionId) || null;
  }

  /**
   * Get all registered connections.
   */
  getAllConnections(): ClientConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get count of active connections.
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get count of clients watching a specific chat.
   */
  getChatClientCount(chatId: string): number {
    let count = 0;
    for (const connection of this.connections.values()) {
      if (connection.activeChatId === chatId) {
        count++;
      }
    }
    return count;
  }

  /**
   * Generate a unique connection ID.
   */
  private generateConnectionId(): string {
    return randomBytes(16).toString('hex');
  }
}
