import type { Message } from '../schemas';

/**
 * Represents the state of an operation for a specific chat.
 */
export interface ChatOperationState {
  chatId: string;
  abortController: AbortController;
  status: 'idle' | 'processing' | 'waiting_approval';
  startTime: number;
  lastActivity: number;
  pendingMessage: Message | null;
}

/**
 * Manages per-chat operation state independently of WebSocket connections.
 *
 * This allows operations to persist even when clients disconnect, and enables
 * multiple clients to watch the same chat's operations in real-time.
 */
export class ChatOperationManager {
  private operations: Map<string, ChatOperationState> = new Map();
  private readonly CLEANUP_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Start a new operation for a chat. Throws if an operation is already in progress.
   */
  startOperation(chatId: string): AbortController {
    const existing = this.operations.get(chatId);
    if (existing && existing.status === 'processing') {
      throw new Error(`Chat ${chatId} already has an operation in progress`);
    }

    const abortController = new AbortController();
    const state: ChatOperationState = {
      chatId,
      abortController,
      status: 'processing',
      startTime: Date.now(),
      lastActivity: Date.now(),
      pendingMessage: null,
    };

    this.operations.set(chatId, state);
    return abortController;
  }

  /**
   * Cancel an ongoing operation for a chat. Idempotent - safe to call multiple times.
   */
  cancelOperation(chatId: string): void {
    const state = this.operations.get(chatId);
    if (!state) return;

    state.abortController.abort();
    state.status = 'idle';
    state.lastActivity = Date.now();
  }

  /**
   * Mark an operation as complete. Should be called when operation finishes successfully or with error.
   */
  completeOperation(chatId: string): void {
    const state = this.operations.get(chatId);
    if (!state) return;

    state.status = 'idle';
    state.lastActivity = Date.now();
  }

  /**
   * Update the status of an operation (e.g., to 'waiting_approval').
   */
  updateStatus(chatId: string, status: ChatOperationState['status']): void {
    const state = this.operations.get(chatId);
    if (!state) return;

    state.status = status;
    state.lastActivity = Date.now();
  }

  /**
   * Update the pending message for an operation.
   */
  updatePendingMessage(chatId: string, message: Message | null): void {
    const state = this.operations.get(chatId);
    if (!state) return;

    state.pendingMessage = message;
    state.lastActivity = Date.now();
  }

  /**
   * Get the current operation state for a chat. Returns null if no operation exists.
   */
  getOperationState(chatId: string): ChatOperationState | null {
    return this.operations.get(chatId) || null;
  }

  /**
   * Get all active chat IDs (any status).
   */
  getActiveChatIds(): string[] {
    return Array.from(this.operations.keys());
  }

  /**
   * Clean up old completed operations to prevent memory leaks.
   * Removes operations that have been idle for longer than CLEANUP_TIMEOUT_MS.
   */
  cleanup(): void {
    const now = Date.now();

    for (const [chatId, state] of this.operations.entries()) {
      // Only clean up idle operations that have been inactive for a while
      if (state.status === 'idle' && now - state.lastActivity > this.CLEANUP_TIMEOUT_MS) {
        this.operations.delete(chatId);
      }
    }
  }

  /**
   * Abort all active operations. Used for graceful shutdown.
   */
  abortAll(): void {
    for (const [chatId, state] of this.operations.entries()) {
      if (state.status !== 'idle') {
        state.abortController.abort();
        state.status = 'idle';
      }
    }
  }
}
