import { JsonFile, getChatPath } from './file-manager.js';
import { ChatMessagesSchema, type ChatMessages, type Message } from './schemas.js';

/**
 * Chat messages file manager
 */
export class ChatFile extends JsonFile<ChatMessages> {
  constructor(private chatId: string) {
    const initialData: ChatMessages = {
      updated: Date.now(),
      messages: [],
    };

    super(getChatPath(chatId), initialData);
  }

  protected validate(parsed: any): ChatMessages {
    return ChatMessagesSchema.parse(parsed);
  }

  protected getUpdatedTimestamp(data: any): number {
    return data.updated;
  }

  protected setUpdatedTimestamp(data: ChatMessages, timestamp: number): void {
    data.updated = timestamp;
  }

  /**
   * Add a message to the chat
   */
  async addMessage(message: Omit<Message, 'created'>): Promise<void> {
    await this.save((chat) => {
      chat.messages.push({
        ...message,
        created: Date.now(),
      });
    });
  }

  /**
   * Get all messages
   */
  getMessages(): Message[] {
    return this.data.messages;
  }

  /**
   * Get messages with a specific role
   */
  getMessagesByRole(role: 'user' | 'assistant' | 'system'): Message[] {
    return this.data.messages.filter((m) => m.role === role);
  }

  /**
   * Calculate total tokens used in chat
   */
  getTotalTokens(): number {
    return this.data.messages.reduce((sum, msg) => sum + (msg.tokens || 0), 0);
  }

  /**
   * Get the last N messages
   */
  getLastMessages(n: number): Message[] {
    return this.data.messages.slice(-n);
  }
}
