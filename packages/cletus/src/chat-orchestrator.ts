import type { CletusAI } from './ai.js';
import type { ChatMeta, Operation, Message, MessageContent } from './schemas.js';
import { createChatAgent } from './chat-agent.js';
import { executeOperation, shouldAutoExecute } from './operations.js';
import { registerAllOperationHandlers } from './handlers/operation-handlers.js';
import { ConfigFile } from './config.js';
import { ChatFile } from './chat.js';

/**
 * Chat orchestrator handles the operation approval flow
 */
export class ChatOrchestrator {
  private chatPrompt;
  private config: ConfigFile;
  private chatFile: ChatFile;
  private abortController?: AbortController;

  constructor(
    private ai: CletusAI,
    private chatId: string
  ) {
    this.chatPrompt = createChatAgent(ai);
    this.config = new ConfigFile();
    this.chatFile = new ChatFile(chatId);

    // Register all operation handlers
    registerAllOperationHandlers(chatId);
  }

  /**
   * Process a user message and handle operations
   */
  async processMessage(userMessage: string, onEvent: (event: ChatEvent) => void): Promise<void> {
    // Load current state
    await this.config.load();
    await this.chatFile.load();

    const chat = this.config.getChats().find((c) => c.id === this.chatId);
    if (!chat) {
      throw new Error(`Chat not found: ${this.chatId}`);
    }

    // Add user message
    const userMsg: Message = {
      role: 'user',
      content: [{ type: 'text', content: userMessage }],
      created: Date.now(),
    };
    await this.chatFile.addMessage(userMsg);

    // Create abort controller for this request
    this.abortController = new AbortController();

    try {
      // Stream the prompt
      const stream = this.chatPrompt.get(
        {
          assistant: chat.assistant,
          mode: chat.mode,
          currentTodo: chat.todos.find((t) => !t.done),
          todos: chat.todos,
        },
        'stream',
        {
          config: this.config.getData(),
          chatId: this.chatId,
          cwd: process.cwd(),
          signal: this.abortController.signal,
        }
      );

      let assistantContent = '';
      const operations: Operation[] = [];

      for await (const event of stream) {
        if (this.abortController.signal.aborted) {
          break;
        }

        switch (event.type) {
          case 'textPartial':
            assistantContent += event.content;
            onEvent({ type: 'textChunk', content: event.content });
            break;

          case 'textComplete':
            onEvent({ type: 'textComplete', content: event.content });
            break;

          case 'toolOutput':
            // Tool returned an operation
            const operation = event.result as Operation;
            operations.push(operation);

            onEvent({
              type: 'operation',
              operation,
              autoExecute: shouldAutoExecute(chat.mode, operation.kind),
            });
            break;

          case 'toolError':
            onEvent({ type: 'error', message: event.error });
            break;

          case 'usage':
            onEvent({ type: 'usage', usage: event.usage });
            break;
        }
      }

      // Save assistant message with operations
      if (operations.length > 0) {
        // Save message for each operation
        for (const operation of operations) {
          const opMsg: Message = {
            role: 'assistant',
            content: [{ type: 'text', content: JSON.stringify(operation, null, 2) }],
            created: Date.now(),
            operation,
          };
          await this.chatFile.addMessage(opMsg);

          // Check if we should auto-execute
          if (shouldAutoExecute(chat.mode, operation.kind)) {
            await this.executeOperationAndSaveResult(operation, onEvent);
          } else {
            // Wait for user approval
            onEvent({ type: 'awaitingApproval', operation });
          }
        }
      } else if (assistantContent) {
        // Save regular assistant message
        const assistantMsg: Message = {
          role: 'assistant',
          content: [{ type: 'text', content: assistantContent }],
          created: Date.now(),
        };
        await this.chatFile.addMessage(assistantMsg);
      }

      onEvent({ type: 'complete' });
    } catch (error: any) {
      if (error.message !== 'Aborted') {
        onEvent({ type: 'error', message: error.message });
      }
    }
  }

  /**
   * Execute an operation and save the result
   */
  async executeOperationAndSaveResult(operation: Operation, onEvent: (event: ChatEvent) => void) {
    onEvent({ type: 'executingOperation', operation });

    try {
      const result = await executeOperation(operation, this.abortController?.signal);

      onEvent({ type: 'operationComplete', operation, result });

      // Save result message
      const resultMsg: Message = {
        role: 'system',
        content: [{ type: 'text', content: JSON.stringify(result, null, 2) }],
        created: Date.now(),
      };
      await this.chatFile.addMessage(resultMsg);
    } catch (error: any) {
      onEvent({ type: 'operationError', operation, error: error.message });

      // Save error message
      const errorMsg: Message = {
        role: 'system',
        content: [{ type: 'text', content: `Error: ${error.message}` }],
        created: Date.now(),
      };
      await this.chatFile.addMessage(errorMsg);
    }
  }

  /**
   * Approve and execute a pending operation
   */
  async approveOperation(operation: Operation, onEvent: (event: ChatEvent) => void) {
    await this.executeOperationAndSaveResult(operation, onEvent);
  }

  /**
   * Deny a pending operation
   */
  async denyOperation(operation: Operation, onEvent: (event: ChatEvent) => void) {
    onEvent({ type: 'operationDenied', operation });

    // Save denial message
    const denialMsg: Message = {
      role: 'system',
      content: [{ type: 'text', content: 'Operation denied by user' }],
      created: Date.now(),
    };
    await this.chatFile.addMessage(denialMsg);
  }

  /**
   * Interrupt the current request
   */
  interrupt() {
    this.abortController?.abort();
  }
}

/**
 * Events emitted by the chat orchestrator
 */
export type ChatEvent =
  | { type: 'textChunk'; content: string }
  | { type: 'textComplete'; content: string }
  | { type: 'operation'; operation: Operation; autoExecute: boolean }
  | { type: 'awaitingApproval'; operation: Operation }
  | { type: 'executingOperation'; operation: Operation }
  | { type: 'operationComplete'; operation: Operation; result: any }
  | { type: 'operationError'; operation: Operation; error: string }
  | { type: 'operationDenied'; operation: Operation }
  | { type: 'usage'; usage: any }
  | { type: 'error'; message: string }
  | { type: 'complete' };
