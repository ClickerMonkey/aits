import * as clack from '@clack/prompts';
import { v4 as uuidv4 } from 'uuid';
import { ConfigFile } from './config.js';
import { ChatFile } from './chat.js';
import { settingsMenu } from './settings.js';
import { launchChatInterface } from './chat-interface.js';
import type { ChatMeta } from './schemas.js';

/**
 * Display main menu and let user select a chat or create a new one
 */
export async function mainMenu(config: ConfigFile): Promise<string | null> {
  const chats = config.getChats();

  const options: Array<{ value: string; label: string; hint?: string }> = [
    { value: '__new__', label: '✨ Start a new chat', hint: 'Create a fresh conversation' },
  ];

  if (chats.length > 0) {
    options.push(
      ...chats.map((chat) => ({
        value: chat.id,
        label: chat.title,
        hint: chat.assistant
          ? `with ${chat.assistant}`
          : new Date(chat.updated).toLocaleDateString(),
      }))
    );
  }

  options.push(
    { value: '__settings__', label: '⚙️  Settings', hint: 'Manage your configuration' },
    { value: '__exit__', label: '👋 Exit', hint: 'Quit Cletus' }
  );

  const selection = await clack.select({
    message: 'Select a chat or start a new one:',
    options,
  });

  if (clack.isCancel(selection)) {
    clack.cancel('Goodbye!');
    process.exit(0);
  }

  if (selection === '__exit__') {
    clack.outro('Goodbye!');
    return null;
  }

  if (selection === '__settings__') {
    await settingsMenu(config);
    // After settings, return to main menu
    return mainMenu(config);
  }

  if (selection === '__new__') {
    const chatId = await createNewChat(config);
    // If cancelled, return to main menu
    if (chatId === null) {
      return mainMenu(config);
    }
    return chatId;
  }

  return selection as string;
}

/**
 * Create a new chat
 */
async function createNewChat(config: ConfigFile): Promise<string | null> {
  // Ask if they want to use an assistant
  const assistants = config.getData().assistants;
  const assistantOptions = [
    { value: '__none__', label: 'No assistant (default)', hint: 'Just a standard AI chat' },
    ...assistants.map((a) => ({
      value: a.name,
      label: a.name,
      hint: a.prompt.slice(0, 60) + '...',
    })),
    { value: '__cancel__', label: '← Cancel', hint: 'Go back to main menu' },
  ];

  const assistantChoice = await clack.select({
    message: 'Would you like to use an assistant persona?',
    options: assistantOptions,
  });

  if (clack.isCancel(assistantChoice) || assistantChoice === '__cancel__') {
    return null;
  }

  const assistant = assistantChoice === '__none__' ? undefined : (assistantChoice as string);

  // Ask for custom prompt (optional)
  const customPrompt = await clack.text({
    message: 'Custom system prompt? (optional)',
    placeholder: 'Leave empty for default behavior',
  });

  if (clack.isCancel(customPrompt)) {
    return null;
  }

  // Ask for chat mode
  const mode = await clack.select({
    message: 'Select chat mode:',
    options: [
      { value: 'none', label: 'None', hint: 'All operations require approval' },
      { value: 'read', label: 'Read', hint: 'Auto-approve read operations' },
      { value: 'create', label: 'Create', hint: 'Auto-approve read & create operations' },
      { value: 'update', label: 'Update', hint: 'Auto-approve read, create & update operations' },
      { value: 'delete', label: 'Delete', hint: 'Auto-approve all operations including delete' },
      { value: '__cancel__', label: '← Cancel', hint: 'Go back to main menu' },
    ],
  });

  if (clack.isCancel(mode) || mode === '__cancel__') {
    return null;
  }

  const chatId = uuidv4();
  const now = Date.now();

  const newChat: ChatMeta = {
    id: chatId,
    title: 'New Chat',
    assistant,
    prompt: customPrompt && typeof customPrompt === 'string' ? customPrompt : undefined,
    mode: mode as 'none' | 'read' | 'create' | 'update' | 'delete',
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

  clack.note(`Chat created: ${chatId}`, 'Success');

  return chatId;
}

/**
 * Start chat interaction with Ink UI
 */
export async function startChatInteraction(chatId: string, config: ConfigFile): Promise<void> {
  try {
    await launchChatInterface(chatId, config);
    // Successfully exited, clear screen before returning to menu
    console.clear();
  } catch (error: any) {
    console.clear();
    clack.log.error(`Failed to launch chat: ${error.message}`);
  }
}
