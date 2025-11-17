import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import React, { useState, useEffect } from 'react';
import type { ConfigFile } from '../config';
import { ChatFile } from '../chat';
import type { ChatMeta } from '../schemas';
import { InkSettingsMenu } from './InkSettingsMenu';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import { COLORS } from '../constants';

type MainMenuView = 'menu' | 'settings' | 'create-chat-assistant' | 'create-chat-prompt' | 'create-chat-mode';

interface InkMainMenuProps {
  config: ConfigFile;
  onChatSelect: (chatId: string) => void;
  onExit: () => void;
}

export const InkMainMenu: React.FC<InkMainMenuProps> = ({ config, onChatSelect, onExit }) => {
  const [view, setView] = useState<MainMenuView>('menu');
  const [selectedAssistant, setSelectedAssistant] = useState<string | undefined>();
  const [customPrompt, setCustomPrompt] = useState('');

  // Set terminal title
  useEffect(() => {
    process.stdout.write('\x1b]0;Cletus: Main Menu\x07');
    return () => {
      process.stdout.write('\x1b]0;Cletus\x07');
    };
  }, []);

  // Reset prompt when entering create flow
  React.useEffect(() => {
    if (view === 'create-chat-prompt') {
      setCustomPrompt('');
    }
  }, [view]);

  // Handle Ctrl+C to cancel/go back
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      if (view === 'settings') {
        // Let settings menu handle it
        return;
      } else if (view === 'menu') {
        // On main menu, exit
        onExit();
      } else {
        // On any sub-view, go back to main menu
        setView('menu');
      }
    }
  });

  // Settings View
  if (view === 'settings') {
    return (
      <InkSettingsMenu
        config={config}
        onExit={() => setView('menu')}
      />
    );
  }

  // Create Chat - Select Assistant
  if (view === 'create-chat-assistant') {
    const assistants = config.getData().assistants;
    const items = [
      { label: 'No assistant (default)', value: '__none__' },
      ...assistants.map((a) => ({
        label: a.name,
        value: a.name,
      })),
      { label: '← Cancel', value: '__cancel__' },
    ];

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Would you like to use an assistant persona?
          </Text>
        </Box>
        <SelectInput
          items={items}
          onSelect={(item) => {
            if (item.value === '__cancel__') {
              setView('menu');
              return;
            }
            setSelectedAssistant(item.value === '__none__' ? undefined : item.value);
            setView('create-chat-prompt');
          }}
        />
      </Box>
    );
  }

  // Create Chat - Custom Prompt
  if (view === 'create-chat-prompt') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Custom system prompt? (optional)
          </Text>
        </Box>
        <Box>
          <Text color="cyan">▶ </Text>
          <TextInput
            value={customPrompt}
            onChange={setCustomPrompt}
            placeholder="Leave empty for default behavior"
            onSubmit={() => {
              setView('create-chat-mode');
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter to continue, ESC to go back</Text>
        </Box>
      </Box>
    );
  }

  // Create Chat - Select Mode
  if (view === 'create-chat-mode') {
    const items = [
      { label: 'None - All AI operations require approval', value: 'none' },
      { label: 'Read - Auto-approve read operations', value: 'read' },
      { label: 'Create - Auto-approve read & create operations', value: 'create' },
      { label: 'Update - Auto-approve read, create & update', value: 'update' },
      { label: 'Delete - Auto-approve all operations', value: 'delete' },
      { label: '← Cancel', value: '__cancel__' },
    ];

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Select chat mode:
          </Text>
        </Box>
        <SelectInput
          items={items}
          onSelect={async (item) => {
            if (item.value === '__cancel__') {
              setView('menu');
              return;
            }

            const now = Date.now();
            const date = new Date(now);

            // Generate chat ID as yyyyMMdd-HHmmss
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            const chatId = `${year}${month}${day}-${hours}${minutes}${seconds}`;

            const title = selectedAssistant
              ? `Chat with ${selectedAssistant} on ${new Date().toLocaleDateString()}`
              : `New Chat on ${new Date().toLocaleDateString()}`;

            const newChat: ChatMeta = {
              id: chatId,
              title,
              assistant: selectedAssistant,
              prompt: customPrompt.trim() || undefined,
              mode: item.value as 'none' | 'read' | 'create' | 'update' | 'delete',
              agentMode: 'default',
              created: now,
              updated: now,
              todos: [],
            };

            await config.addChat(newChat);

            // Create the chat messages file
            const chatFile = new ChatFile(chatId);
            await chatFile.save(() => {
              // Initialize empty chat
            });

            // Navigate to chat
            onChatSelect(chatId);
          }}
        />
      </Box>
    );
  }

  // Main Menu
  const chats = config.getChats();

  const menuItems = [
    { label: '✨ Start a new chat', value: '__new__' },
    ...(chats.length > 0 ? [{ label: '', value: '__separator_chats__' }] : []),
    ...(chats.length > 0 ? [{ label: '💬 Recent Chats:', value: '__header_chats__' }] : []),
    ...chats.map((chat) => ({
      label: `  ${chat.title}`,
      value: chat.id,
    })),
    ...(chats.length > 0 ? [{ label: '', value: '__separator_bottom__' }] : []),
    { label: '⚙️ Settings', value: '__settings__' },
    { label: '👋 Exit', value: '__exit__' },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Gradient colors={COLORS.MENU_GRADIENT}>
        <BigText text="cletus"/>
      </Gradient>
      
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">
          Cletus - Select a chat or start a new one
        </Text>
      </Box>

      <SelectInput
        items={menuItems}
        onSelect={(item) => {
          // Ignore separators and headers
          if (item.value.startsWith('__separator_') || item.value.startsWith('__header_')) {
            return;
          }
          if (item.value === '__exit__') {
            onExit();
            return;
          }
          if (item.value === '__settings__') {
            setView('settings');
            return;
          }
          if (item.value === '__new__') {
            setView('create-chat-assistant');
            return;
          }
          onChatSelect(item.value);
        }}
      />

      <Box marginTop={1}>
        <Text dimColor>↑↓ to navigate, Enter to select</Text>
      </Box>
    </Box>
  );
};
