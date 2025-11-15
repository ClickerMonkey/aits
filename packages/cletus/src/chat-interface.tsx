import React from 'react';
import { render } from 'ink';
import { ChatUI } from './chat-ui';
import { ConfigFile } from './config';
import { ChatFile } from './chat';
import type { ChatMeta } from './schemas';

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

  return new Promise<void>((resolve) => {
    const handleChatUpdate = async (updates: Partial<ChatMeta>) => {
      await config.updateChat(chatId, updates);
    };

    let hasExited = false;

    // Disable default Ctrl+C handling so Ink can handle it
    process.removeAllListeners('SIGINT');

    const { waitUntilExit, unmount } = render(
      <ChatUI
        chat={chat}
        config={config}
        messages={chatMessages}
        onExit={() => {
          if (!hasExited) {
            hasExited = true;
            unmount();
            resolve();
          }
        }}
        onChatUpdate={handleChatUpdate}
      />,
      {
        // Prevent Ink from exiting on Ctrl+C
        exitOnCtrlC: false,
      }
    );

    waitUntilExit().then(() => {
      if (!hasExited) {
        hasExited = true;
        resolve();
      }
    });
  });
}
