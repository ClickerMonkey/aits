import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { ChatUI } from '../chat-ui';
import { ChatFile } from '../chat';
import type { ConfigFile } from '../config';
import type { ChatMeta, Message } from '../schemas';

interface InkChatViewProps {
  chatId: string;
  config: ConfigFile;
  onExit: () => void;
}

export const InkChatView: React.FC<InkChatViewProps> = ({ chatId, config, onExit }) => {
  const [chatFile] = useState(() => new ChatFile(chatId));
  const [messages, setMessages] = useState<Message[]>([]);

  const chatMeta = config.getChats().find((c) => c.id === chatId);

  useEffect(() => {
    chatFile.load().catch(() => {
      // Chat file doesn't exist yet, that's ok
    }).then(() => {
      setMessages(chatFile.getMessages());
    });
  }, [chatId]);

  if (!chatMeta) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Chat not found: {chatId}</Text>
        <Text dimColor>Press any key to return to menu</Text>
      </Box>
    );
  }

  return (
    <ChatUI
      chat={chatMeta}
      config={config}
      messages={messages}
      onExit={onExit}
      onChatUpdate={async (updates) => {
        await config.updateChat(chatId, updates);
        await config.load();
      }}
    />
  );
};
