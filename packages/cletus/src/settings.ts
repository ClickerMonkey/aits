import * as clack from '@clack/prompts';
import { ConfigFile } from './config.js';
import type { Providers } from './schemas.js';
import fs from 'fs/promises';
import { getChatPath, getDataPath } from './file-manager.js';
import { launchModelSelector } from './components/model-selector-launcher.js';
import { createCletusAI } from './ai.js';

/**
 * Display settings menu
 */
export async function settingsMenu(config: ConfigFile): Promise<void> {
  while (true) {
    const choice = await clack.select({
      message: 'Settings:',
      options: [
        { value: 'name', label: '✏️  Change name' },
        { value: 'pronouns', label: '✏️  Change pronouns' },
        { value: 'memory-view', label: '💭 View memories' },
        { value: 'memory-add', label: '➕ Add a memory' },
        { value: 'memory-delete', label: '🗑️  Delete a memory' },
        { value: 'assistant-delete', label: '🗑️  Delete an assistant' },
        { value: 'chat-delete', label: '🗑️  Delete a chat' },
        { value: 'type-delete', label: '🗑️  Delete a data type' },
        { value: 'provider-manage', label: '🔌 Manage providers' },
        { value: 'model-select', label: '🤖 Select default model' },
        { value: '__back__', label: '← Back to main menu' },
      ],
    });

    if (clack.isCancel(choice)) {
      return;
    }

    if (choice === '__back__') {
      return;
    }

    switch (choice) {
      case 'name':
        await changeName(config);
        break;
      case 'pronouns':
        await changePronouns(config);
        break;
      case 'memory-view':
        await viewMemories(config);
        break;
      case 'memory-add':
        await addMemory(config);
        break;
      case 'memory-delete':
        await deleteMemory(config);
        break;
      case 'assistant-delete':
        await deleteAssistant(config);
        break;
      case 'chat-delete':
        await deleteChat(config);
        break;
      case 'type-delete':
        await deleteType(config);
        break;
      case 'provider-manage':
        await manageProviders(config);
        break;
      case 'model-select':
        await selectDefaultModel(config);
        break;
    }
  }
}

/**
 * Change user name
 */
async function changeName(config: ConfigFile): Promise<void> {
  const currentName = config.getData().user.name;

  const newName = await clack.text({
    message: 'Enter your new name:',
    placeholder: currentName,
    initialValue: currentName,
    validate: (value) => {
      if (!value) return 'Name is required';
    },
  });

  if (clack.isCancel(newName)) {
    return;
  }

  await config.save((data) => {
    data.user.name = newName as string;
  });

  clack.log.success(`Name updated to: ${newName}`);
}

/**
 * Change user pronouns
 */
async function changePronouns(config: ConfigFile): Promise<void> {
  const currentPronouns = config.getData().user.pronouns || '';

  const newPronouns = await clack.text({
    message: 'Enter your pronouns:',
    placeholder: 'e.g., he/him, she/her, they/them',
    initialValue: currentPronouns,
  });

  if (clack.isCancel(newPronouns)) {
    return;
  }

  await config.save((data) => {
    data.user.pronouns = newPronouns as string;
  });

  clack.log.success(`Pronouns updated to: ${newPronouns || '(none)'}`);
}

/**
 * View all memories
 */
async function viewMemories(config: ConfigFile): Promise<void> {
  const memories = config.getData().user.memory;

  if (memories.length === 0) {
    clack.log.info('No memories saved yet.');
    return;
  }

  clack.log.info(`You have ${memories.length} ${memories.length === 1 ? 'memory' : 'memories'}:\n`);

  memories.forEach((memory, index) => {
    const date = new Date(memory.created).toLocaleDateString();
    clack.log.message(`${index + 1}. ${memory.text}\n   (Added: ${date})`);
  });

  const result = await clack.text({
    message: 'Press Enter to continue...',
  });

  if (clack.isCancel(result)) {
    return;
  }
}

/**
 * Add a new memory
 */
async function addMemory(config: ConfigFile): Promise<void> {
  const memory = await clack.text({
    message: 'What should I remember?',
    placeholder: 'e.g., I prefer concise responses',
    validate: (value) => {
      if (!value) return 'Memory text is required';
    },
  });

  if (clack.isCancel(memory)) {
    return;
  }

  await config.addMemory(memory as string);

  clack.log.success('Memory added!');
}

/**
 * Delete a memory
 */
async function deleteMemory(config: ConfigFile): Promise<void> {
  const memories = config.getData().user.memory;

  if (memories.length === 0) {
    clack.log.warn('No memories to delete.');
    return;
  }

  const options = [
    ...memories.map((memory, index) => ({
      value: index,
      label: memory.text.slice(0, 60) + (memory.text.length > 60 ? '...' : ''),
      hint: new Date(memory.created).toLocaleDateString(),
    })),
    { value: '__cancel__', label: '← Cancel' },
  ];

  const selection = await clack.select({
    message: 'Select a memory to delete:',
    options,
  });

  if (clack.isCancel(selection) || selection === '__cancel__') {
    return;
  }

  const confirm = await clack.confirm({
    message: 'Are you sure you want to delete this memory?',
  });

  if (clack.isCancel(confirm) || !confirm) {
    return;
  }

  await config.save((data) => {
    data.user.memory.splice(selection as number, 1);
  });

  clack.log.success('Memory deleted.');
}

/**
 * Delete an assistant
 */
async function deleteAssistant(config: ConfigFile): Promise<void> {
  const assistants = config.getData().assistants;

  if (assistants.length === 0) {
    clack.log.warn('No assistants to delete.');
    return;
  }

  const options = [
    ...assistants.map((assistant, index) => ({
      value: index,
      label: assistant.name,
      hint: assistant.prompt.slice(0, 50) + '...',
    })),
    { value: '__cancel__', label: '← Cancel' },
  ];

  const selection = await clack.select({
    message: 'Select an assistant to delete:',
    options,
  });

  if (clack.isCancel(selection) || selection === '__cancel__') {
    return;
  }

  const assistantName = assistants[selection as number].name;

  const confirm = await clack.confirm({
    message: `Delete "${assistantName}"?`,
  });

  if (clack.isCancel(confirm) || !confirm) {
    return;
  }

  await config.save((data) => {
    data.assistants.splice(selection as number, 1);
  });

  clack.log.success(`Assistant "${assistantName}" deleted.`);
}

/**
 * Delete a chat
 */
async function deleteChat(config: ConfigFile): Promise<void> {
  const chats = config.getChats();

  if (chats.length === 0) {
    clack.log.warn('No chats to delete.');
    return;
  }

  const options = [
    ...chats.map((chat) => ({
      value: chat.id,
      label: chat.title,
      hint: chat.assistant || new Date(chat.updated).toLocaleDateString(),
    })),
    { value: '__cancel__', label: '← Cancel' },
  ];

  const selection = await clack.select({
    message: 'Select a chat to delete:',
    options,
  });

  if (clack.isCancel(selection) || selection === '__cancel__') {
    return;
  }

  const chat = chats.find((c) => c.id === selection);
  if (!chat) return;

  const confirm = await clack.confirm({
    message: `Delete "${chat.title}" and all its messages?`,
  });

  if (clack.isCancel(confirm) || !confirm) {
    return;
  }

  // Delete the chat messages file
  try {
    await fs.unlink(getChatPath(chat.id));
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      clack.log.error(`Failed to delete chat messages: ${error.message}`);
    }
  }

  // Remove from config
  await config.deleteChat(chat.id);

  clack.log.success(`Chat "${chat.title}" deleted.`);
}

/**
 * Delete a data type
 */
async function deleteType(config: ConfigFile): Promise<void> {
  const types = config.getData().types;

  if (types.length === 0) {
    clack.log.warn('No data types to delete.');
    return;
  }

  const options = [
    ...types.map((type, index) => ({
      value: index,
      label: type.friendlyName,
      hint: type.description || type.name,
    })),
    { value: '__cancel__', label: '← Cancel' },
  ];

  const selection = await clack.select({
    message: 'Select a data type to delete:',
    options,
  });

  if (clack.isCancel(selection) || selection === '__cancel__') {
    return;
  }

  const type = types[selection as number];

  const confirm = await clack.confirm({
    message: `Delete "${type.friendlyName}" and all its data?`,
  });

  if (clack.isCancel(confirm) || !confirm) {
    return;
  }

  // Delete the data file
  try {
    await fs.unlink(getDataPath(type.name));
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      clack.log.error(`Failed to delete data file: ${error.message}`);
    }
  }

  // Remove from config
  await config.save((data) => {
    data.types.splice(selection as number, 1);
  });

  clack.log.success(`Data type "${type.friendlyName}" deleted.`);
}

/**
 * Manage providers (add, update, or remove)
 */
async function manageProviders(config: ConfigFile): Promise<void> {
  const providers = config.getData().providers;

  const choice = await clack.select({
    message: 'Manage providers:',
    options: [
      {
        value: 'openai',
        label: `OpenAI ${providers.openai ? '✅' : '❌'}`,
        hint: providers.openai ? 'Configured' : 'Not configured',
      },
      {
        value: 'openrouter',
        label: `OpenRouter ${providers.openrouter ? '✅' : '❌'}`,
        hint: providers.openrouter ? 'Configured' : 'Not configured',
      },
      {
        value: 'replicate',
        label: `Replicate ${providers.replicate ? '✅' : '❌'}`,
        hint: providers.replicate ? 'Configured' : 'Not configured',
      },
      { value: '__back__', label: '← Back' },
    ],
  });

  if (clack.isCancel(choice) || choice === '__back__') {
    return;
  }

  const providerName = choice as keyof Providers;
  const isConfigured = providers[providerName] !== null;

  if (isConfigured) {
    const action = await clack.select({
      message: `${providerName} is configured. What would you like to do?`,
      options: [
        { value: 'update', label: 'Update API key' },
        { value: 'remove', label: 'Remove provider' },
        { value: '__back__', label: '← Back' },
      ],
    });

    if (clack.isCancel(action) || action === '__back__') {
      return;
    }

    if (action === 'remove') {
      const confirm = await clack.confirm({
        message: `Remove ${providerName}?`,
      });

      if (clack.isCancel(confirm) || !confirm) {
        return;
      }

      await config.save((data) => {
        data.providers[providerName] = null;
      });

      clack.log.success(`${providerName} removed.`);
    } else if (action === 'update') {
      // Show API key link
      const links: Record<string, string> = {
        openai: 'https://platform.openai.com/api-keys',
        openrouter: 'https://openrouter.ai/settings/keys',
        replicate: 'https://replicate.com/account/api-tokens',
      };

      clack.note(
        `Get your API key from: \x1b]8;;${links[providerName]}\x1b\\${links[providerName]}\x1b]8;;\x1b\\ \n\nNote: You'll need an account with credits to use ${providerName}.`,
        `${providerName.charAt(0).toUpperCase() + providerName.slice(1)} Setup`
      );

      const apiKey = await clack.text({
        message: `Enter new API key for ${providerName}:`,
        placeholder: 'sk-...',
        validate: (value) => {
          if (!value) return 'API key is required';
        },
      });

      if (clack.isCancel(apiKey)) {
        return;
      }

      await config.save((data) => {
        data.providers[providerName] = { apiKey: apiKey as string };
      });

      clack.log.success(`${providerName} API key updated.`);
    }
  } else {
    // Show API key link
    const links: Record<string, string> = {
      openai: 'https://platform.openai.com/api-keys',
      openrouter: 'https://openrouter.ai/settings/keys',
      replicate: 'https://replicate.com/account/api-tokens',
    };

    clack.note(
      `Get your API key from: \x1b]8;;${links[providerName]}\x1b\\${links[providerName]}\x1b]8;;\x1b\\\n\nNote: You'll need an account with credits to use ${providerName}.`,
      `${providerName.charAt(0).toUpperCase() + providerName.slice(1)} Setup`
    );

    const apiKey = await clack.text({
      message: `Enter API key for ${providerName}:`,
      placeholder: 'sk-...',
      validate: (value) => {
        if (!value) return 'API key is required';
      },
    });

    if (clack.isCancel(apiKey)) {
      return;
    }

    await config.save((data) => {
      data.providers[providerName] = { apiKey: apiKey as string };
    });

    clack.log.success(`${providerName} configured!`);
  }
}

/**
 * Select default model
 */
async function selectDefaultModel(config: ConfigFile): Promise<void> {
  const currentModel = config.getData().defaultModel;

  if (currentModel) {
    clack.log.info(`Current default model: ${currentModel}`);
  } else {
    clack.log.info('No default model set (auto-selection will be used)');
  }

  const ai = createCletusAI(config);

  // Clear screen before launching Ink
  console.clear();

  const selectedModel = await launchModelSelector(ai, {
    required: ['chat', 'tools'],
  });

  // Clear screen after Ink exits
  console.clear();
  // Give stdin time to settle after Ink exits
  await new Promise((resolve) => setTimeout(resolve, 100));

  if (selectedModel) {
    await config.save((data) => {
      data.defaultModel = selectedModel.id;
    });
    clack.log.success(`Default model set to: ${selectedModel.name} (${selectedModel.id})`);
  } else {
    clack.log.info('Model selection cancelled');
  }
}
