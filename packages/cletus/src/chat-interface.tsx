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
      content: textContent,
    }];
  });

  // Add mock messages if empty (for demonstration)
  if (messages.length === 0) {
    messages.push(
      { role: 'user', content: 'Hello! Can you help me understand how AITS works?' },
      { role: 'assistant', content: 'Of course! AITS is a TypeScript library for working with AI models. It provides a unified interface for multiple providers like OpenAI, Anthropic, and others.' },
      { role: 'user', content: 'What are the main benefits of using it?' },
      { role: 'assistant', content: 'The main benefits are: 1) Provider abstraction - switch providers easily, 2) Type safety with TypeScript, 3) Streaming support, 4) Tool/function calling, and 5) Unified error handling.' },
      { role: 'user', content: 'Can you show me a simple example?' },
      { role: 'assistant', content: 'Sure! Here\'s a basic example:\n\nconst provider = new OpenAIProvider({ apiKey });\nconst ai = new AI({ provider });\nconst response = await ai.chat("Hello!");' },
      { role: 'user', content: 'That looks straightforward. What about streaming?' },
      { role: 'assistant', content: 'Streaming is just as easy:\n\nfor await (const chunk of ai.chatStream("Tell me a story")) {\n  process.stdout.write(chunk.content);\n}' },
      { role: 'user', content: 'Nice! What providers are supported?' },
      { role: 'assistant', content: 'Currently supported providers include OpenAI (GPT-4, GPT-3.5), Anthropic (Claude), OpenRouter, Replicate, and more coming soon!' },
      { role: 'user', content: 'How do I switch providers?' },
      { role: 'assistant', content: 'Simply create a different provider instance and pass it to AI:\n\nconst anthropic = new AnthropicProvider({ apiKey });\nconst ai = new AI({ provider: anthropic });' },
      { role: 'user', content: 'What about function calling?' },
      { role: 'assistant', content: 'AITS supports function calling with full TypeScript types. You define tools with Zod schemas and the AI can call them intelligently.' },
      { role: 'user', content: 'Can you give me an example of tool usage?' },
      { role: 'assistant', content: 'Here\'s an example:\n\nconst tools = [{\n  name: "get_weather",\n  description: "Get weather for a location",\n  parameters: z.object({ city: z.string() })\n}];\n\nconst response = await ai.chat("What\'s the weather in Paris?", { tools });' },
      { role: 'user', content: 'Does it handle errors well?' },
      { role: 'assistant', content: 'Yes! AITS has built-in error handling with specific error types for rate limits, context window exceeded, authentication failures, and more.' },
      { role: 'user', content: 'What about retries?' },
      { role: 'assistant', content: 'AITS includes automatic retry logic with exponential backoff for transient failures. You can configure retry behavior per request or globally.' },
      { role: 'user', content: 'Can I use multiple models at once?' },
      { role: 'assistant', content: 'Yes! You can create multiple AI instances with different providers and models, or specify the model per request.' },
      { role: 'user', content: 'This is really helpful, thank you!' },
      { role: 'assistant', content: 'You\'re welcome! Feel free to ask if you have more questions about AITS.' }
    );
  }

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
