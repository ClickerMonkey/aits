import React from 'react';
import { render } from 'ink';
import { ChatUI } from './chat-ui.js';
import { ConfigFile } from './config.js';
import { ChatFile } from './chat.js';
import type { ChatMeta } from './schemas.js';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Launch the Ink chat interface
 */
export async function launchChatInterface(
  chatId: string,
  config: ConfigFile
): Promise<void> {
  const chats = config.getData().chats;
  const chat = chats.find((c) => c.id === chatId);

  if (!chat) {
    throw new Error(`Chat ${chatId} not found`);
  }

  // Load chat messages
  const chatFile = new ChatFile(chatId);
  await chatFile.load();
  const chatMessages = chatFile.getMessages();

  // Convert to display format
  const messages: Message[] = chatMessages.flatMap((msg) => {
    // Only handle text content for now
    const textContent = msg.content
      .filter((c) => c.type === 'text')
      .map((c) => c.content)
      .join('\n');

    if (!textContent) return [];

    return [{
      role: msg.role as 'user' | 'assistant',
      name: msg.name,
      content: textContent,
    }];
  });

  return new Promise<void>((resolve) => {
    const handleChatUpdate = async (updates: Partial<ChatMeta>) => {
      await config.updateChat(chatId, updates);
    };

    let hasExited = false;

    const { waitUntilExit, unmount } = render(
      <ChatUI
        chat={chat}
        messages={messages}
        onExit={() => {
          if (!hasExited) {
            hasExited = true;
            unmount();
            resolve();
          }
        }}
        onChatUpdate={handleChatUpdate}
      />
    );

    waitUntilExit().then(() => {
      if (!hasExited) {
        hasExited = true;
        resolve();
      }
    });
  });
}
