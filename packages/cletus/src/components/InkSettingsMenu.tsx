import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import React, { useState, useEffect } from 'react';
import type { ConfigFile } from '../config.js';
import { ModelSelector } from './ModelSelector.js';
import { createCletusAI } from '../ai.js';
import type { Providers } from '../schemas.js';
import fs from 'fs/promises';
import { getChatPath, getDataPath } from '../file-manager.js';
import { ModelCapability } from '@aits/ai';
import { logger } from '../logger.js';
import { abbreviate } from '../common.js';

type SettingsView =
  | 'menu'
  | 'change-name'
  | 'change-pronouns'
  | 'change-global-prompt'
  | 'manage-prompt-files'
  | 'view-memories'
  | 'add-memory'
  | 'delete-memory'
  | 'delete-assistant'
  | 'delete-chat'
  | 'delete-type'
  | 'manage-providers'
  | 'manage-provider-action'
  | 'manage-provider-input'
  | 'manage-models'
  | 'select-model'
  | 'confirm';

type ModelType = 'chat' | 'imageGenerate' | 'imageEdit' | 'imageAnalyze' | 'imageEmbed' | 'transcription' | 'speech' | 'embedding' | 'summary' | 'describe' | 'transcribe';

interface InkSettingsMenuProps {
  config: ConfigFile;
  onExit: () => void;
}

export const InkSettingsMenu: React.FC<InkSettingsMenuProps> = ({ config, onExit }) => {
  const [view, setView] = useState<SettingsView>('menu');
  const [message, setMessage] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<(() => Promise<void>) | null>(null);
  const [confirmMessage, setConfirmMessage] = useState<string>('');
  const [providerKey, setProviderKey] = useState<keyof Providers | null>(null);
  const [providerAction, setProviderAction] = useState<'update' | 'remove' | null>(null);
  const [selectedDeleteIndex, setSelectedDeleteIndex] = useState<number>(-1);
  const [selectedDeleteId, setSelectedDeleteId] = useState<string>('');
  const [selectedModelType, setSelectedModelType] = useState<ModelType | null>(null);

  // State for all input fields
  const [nameInput, setNameInput] = useState('');
  const [pronounsInput, setPronounsInput] = useState('');
  const [globalPromptInput, setGlobalPromptInput] = useState('');
  const [memoryInput, setMemoryInput] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  // Set terminal title
  useEffect(() => {
    process.stdout.write('\x1b]0;Cletus: Settings\x07');
    return () => {
      process.stdout.write('\x1b]0;Cletus\x07');
    };
  }, []);

  // Initialize inputs when view changes
  React.useEffect(() => {
    if (view === 'change-name') {
      setNameInput(config.getData().user.name);
      setInputError(null);
    } else if (view === 'change-pronouns') {
      setPronounsInput(config.getData().user.pronouns || '');
      setInputError(null);
    } else if (view === 'change-global-prompt') {
      setGlobalPromptInput(config.getData().user.globalPrompt || '');
      setInputError(null);
    } else if (view === 'add-memory') {
      setMemoryInput('');
      setInputError(null);
    } else if (view === 'manage-provider-input') {
      setApiKeyInput('');
      setInputError(null);
    }
  }, [view]);

  // Handle ESC key for add-memory view
  useInput((input, key) => {
    if (key.escape && view === 'add-memory') {
      handleBack();
    }
  });

  const handleBack = () => {
    setMessage(null);
    setView('menu');
  };

  const showConfirm = (msg: string, action: () => Promise<void>) => {
    setConfirmMessage(msg);
    setConfirmAction(() => action);
    setView('confirm');
  };

  // Confirm dialog
  if (view === 'confirm') {
    const items = [
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' },
    ];

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="yellow">
            {confirmMessage}
          </Text>
        </Box>
        <SelectInput
          items={items}
          onSelect={async (item) => {
            if (item.value === 'yes' && confirmAction) {
              await confirmAction();
            }
            handleBack();
          }}
        />
      </Box>
    );
  }

  // Change Name
  if (view === 'change-name') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Enter your new name:
          </Text>
        </Box>
        <Box>
          <Text color="cyan">▶ </Text>
          <TextInput
            value={nameInput}
            onChange={setNameInput}
            onSubmit={async () => {
              if (nameInput.trim()) {
                await config.save((data) => {
                  data.user.name = nameInput;
                });
                setMessage(`✓ Name updated to: ${nameInput}`);
                handleBack();
              }
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter to submit, ESC to go back</Text>
        </Box>
      </Box>
    );
  }

  // Change Pronouns
  if (view === 'change-pronouns') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Enter your pronouns:
          </Text>
        </Box>
        <Box>
          <Text color="cyan">▶ </Text>
          <TextInput
            value={pronounsInput}
            onChange={setPronounsInput}
            placeholder="e.g., he/him, she/her, they/them"
            onSubmit={async () => {
              await config.save((data) => {
                data.user.pronouns = pronounsInput;
              });
              setMessage(`✓ Pronouns updated to: ${pronounsInput || '(none)'}`);
              handleBack();
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter to submit, ESC to go back</Text>
        </Box>
      </Box>
    );
  }

  // Change Global Prompt
  if (view === 'change-global-prompt') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Enter your global prompt:
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>This prompt will be included in every chat session</Text>
        </Box>
        <Box>
          <Text color="cyan">▶ </Text>
          <TextInput
            value={globalPromptInput}
            onChange={setGlobalPromptInput}
            placeholder="e.g., Always be concise and professional"
            onSubmit={async () => {
              await config.save((data) => {
                data.user.globalPrompt = globalPromptInput;
              });
              setMessage(`✓ Global prompt updated`);
              handleBack();
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter to submit, ESC to go back</Text>
        </Box>
      </Box>
    );
  }

  // Manage Prompt Files
  if (view === 'manage-prompt-files') {
    const promptFiles = config.getData().user.promptFiles || ['cletus.md', 'agents.md', 'claude.md'];
    
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Prompt Files Configuration
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>Files searched in current working directory (case-insensitive):</Text>
        </Box>
        {promptFiles.map((file, index) => (
          <Box key={index} marginBottom={1}>
            <Text>{index + 1}. {file}</Text>
          </Box>
        ))}
        <Box marginTop={1} marginBottom={1}>
          <Text dimColor>Current order: {promptFiles.join(', ')}</Text>
        </Box>
        <Box marginTop={1}>
          <SelectInput
            items={[{ label: '← Back', value: 'back' }]}
            onSelect={handleBack}
          />
        </Box>
      </Box>
    );
  }

  // View Memories
  if (view === 'view-memories') {
    const memories = config.getData().user.memory;

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Your Memories ({memories.length})
          </Text>
        </Box>
        {memories.length === 0 ? (
          <Box marginBottom={1}>
            <Text dimColor>No memories saved yet.</Text>
          </Box>
        ) : (
          memories.map((memory, index) => (
            <Box key={index} marginBottom={1} flexDirection="column">
              <Text>
                {index + 1}. {memory.text}
              </Text>
              <Text dimColor>   Added: {new Date(memory.created).toLocaleDateString()}</Text>
            </Box>
          ))
        )}
        <Box marginTop={1}>
          <SelectInput
            items={[{ label: '← Back', value: 'back' }]}
            onSelect={handleBack}
          />
        </Box>
      </Box>
    );
  }

  // Add Memory
  if (view === 'add-memory') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            What should I remember?
          </Text>
        </Box>
        <Box>
          <Text color="cyan">▶ </Text>
          <TextInput
            value={memoryInput}
            onChange={setMemoryInput}
            placeholder="e.g., I prefer concise responses"
            onSubmit={async () => {
              if (memoryInput.trim()) {
                await config.addMemory(memoryInput);
                setMessage('✓ Memory added!');
                handleBack();
              }
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter to submit, ESC to go back</Text>
        </Box>
      </Box>
    );
  }

  // Delete Memory
  if (view === 'delete-memory') {
    const memories = config.getData().user.memory;

    if (memories.length === 0) {
      setMessage('⚠ No memories to delete');
      handleBack();
      return null;
    }

    const items = [
      ...memories.map((memory, index) => ({
        label: abbreviate(memory.text, 60),
        value: index.toString(),
      })),
      { label: '← Cancel', value: '__cancel__' },
    ];

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Select a memory to delete:
          </Text>
        </Box>
        <SelectInput
          items={items}
          onSelect={(item) => {
            if (item.value === '__cancel__') {
              handleBack();
              return;
            }
            const index = parseInt(item.value);
            showConfirm('Are you sure you want to delete this memory?', async () => {
              await config.save((data) => {
                data.user.memory.splice(index, 1);
              });
              setMessage('✓ Memory deleted');
            });
          }}
        />
      </Box>
    );
  }

  // Delete Assistant
  if (view === 'delete-assistant') {
    const assistants = config.getData().assistants;

    if (assistants.length === 0) {
      setMessage('⚠ No assistants to delete');
      handleBack();
      return null;
    }

    const items = [
      ...assistants.map((assistant, index) => ({
        label: assistant.name,
        value: index.toString(),
      })),
      { label: '← Cancel', value: '__cancel__' },
    ];

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Select an assistant to delete:
          </Text>
        </Box>
        <SelectInput
          items={items}
          onSelect={(item) => {
            if (item.value === '__cancel__') {
              handleBack();
              return;
            }
            const index = parseInt(item.value);
            const name = assistants[index].name;
            showConfirm(`Delete "${name}"?`, async () => {
              await config.save((data) => {
                data.assistants.splice(index, 1);
              });
              setMessage(`✓ Assistant "${name}" deleted`);
            });
          }}
        />
      </Box>
    );
  }

  // Delete Chat
  if (view === 'delete-chat') {
    const chats = config.getChats();

    if (chats.length === 0) {
      setMessage('⚠ No chats to delete');
      handleBack();
      return null;
    }

    const items = [
      ...chats.map((chat) => ({
        label: chat.title,
        value: chat.id,
      })),
      { label: '← Cancel', value: '__cancel__' },
    ];

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Select a chat to delete:
          </Text>
        </Box>
        <SelectInput
          items={items}
          onSelect={(item) => {
            if (item.value === '__cancel__') {
              handleBack();
              return;
            }
            const chat = chats.find((c) => c.id === item.value);
            if (!chat) return;

            showConfirm(`Delete "${chat.title}" and all its messages?`, async () => {
              try {
                await fs.unlink(getChatPath(chat.id));
              } catch (error: any) {
                if (error.code !== 'ENOENT') {
                  console.error('Failed to delete chat messages:', error.message);
                }
              }
              await config.deleteChat(chat.id);
              setMessage(`✓ Chat "${chat.title}" deleted`);
            });
          }}
        />
      </Box>
    );
  }

  // Delete Type
  if (view === 'delete-type') {
    const types = config.getData().types;

    if (types.length === 0) {
      setMessage('⚠ No data types to delete');
      handleBack();
      return null;
    }

    const items = [
      ...types.map((type, index) => ({
        label: type.friendlyName,
        value: index.toString(),
      })),
      { label: '← Cancel', value: '__cancel__' },
    ];

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Select a data type to delete:
          </Text>
        </Box>
        <SelectInput
          items={items}
          onSelect={(item) => {
            if (item.value === '__cancel__') {
              handleBack();
              return;
            }
            const index = parseInt(item.value);
            const type = types[index];
            showConfirm(`Delete "${type.friendlyName}" and all its data?`, async () => {
              try {
                await fs.unlink(getDataPath(type.name));
              } catch (error: any) {
                if (error.code !== 'ENOENT') {
                  console.error('Failed to delete data file:', error.message);
                }
              }
              await config.save((data) => {
                data.types.splice(index, 1);
              });
              setMessage(`✓ Data type "${type.friendlyName}" deleted`);
            });
          }}
        />
      </Box>
    );
  }

  // Manage Providers
  if (view === 'manage-providers') {
    const providers = config.getData().providers;

    const items = [
      {
        label: `OpenAI ${providers.openai ? '✅' : '❌'}`,
        value: 'openai',
      },
      {
        label: `OpenRouter ${providers.openrouter ? '✅' : '❌'}`,
        value: 'openrouter',
      },
      {
        label: `Replicate ${providers.replicate ? '✅' : '❌'}`,
        value: 'replicate',
      },
      { label: '← Back', value: '__back__' },
    ];

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Manage Providers:
          </Text>
        </Box>
        <SelectInput
          items={items}
          onSelect={(item) => {
            if (item.value === '__back__') {
              handleBack();
              return;
            }
            setProviderKey(item.value as keyof Providers);
            setView('manage-provider-action');
          }}
        />
      </Box>
    );
  }

  // Manage Provider Action
  if (view === 'manage-provider-action' && providerKey) {
    const providers = config.getData().providers;
    const isConfigured = providers[providerKey] !== null;

    const items = isConfigured
      ? [
          { label: 'Update API key', value: 'update' },
          { label: 'Remove provider', value: 'remove' },
          { label: '← Back', value: '__back__' },
        ]
      : [
          { label: 'Add API key', value: 'update' },
          { label: '← Back', value: '__back__' },
        ];

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            {providerKey} - {isConfigured ? 'Configured' : 'Not configured'}
          </Text>
        </Box>
        <SelectInput
          items={items}
          onSelect={(item) => {
            if (item.value === '__back__') {
              setView('manage-providers');
              return;
            }
            if (item.value === 'remove') {
              showConfirm(`Remove ${providerKey}?`, async () => {
                await config.save((data) => {
                  data.providers[providerKey!] = null;
                });
                setMessage(`✓ ${providerKey} removed`);
                setView('manage-providers');
              });
              return;
            }
            setProviderAction(item.value as 'update');
            setView('manage-provider-input');
          }}
        />
      </Box>
    );
  }

  // Manage Provider Input
  if (view === 'manage-provider-input' && providerKey) {
    const links: Record<string, string> = {
      openai: 'https://platform.openai.com/api-keys',
      openrouter: 'https://openrouter.ai/settings/keys',
      replicate: 'https://replicate.com/account/api-tokens',
    };

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            {providerAction === 'update' ? 'Enter' : 'Add'} API key for {providerKey}:
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>Get your key from: {links[providerKey]}</Text>
        </Box>
        <Box>
          <Text color="cyan">▶ </Text>
          <TextInput
            value={apiKeyInput}
            onChange={setApiKeyInput}
            placeholder="sk-..."
            onSubmit={async () => {
              if (apiKeyInput.trim()) {
                await config.save((data) => {
                  data.providers[providerKey!] = { apiKey: apiKeyInput };
                });
                setMessage(`✓ ${providerKey} configured!`);
                setView('manage-providers');
              }
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter to submit, ESC to go back</Text>
        </Box>
      </Box>
    );
  }

  // Model Selector
  // Manage Models - Select Model Type
  if (view === 'manage-models') {
    const currentModels = config.getData().user.models || {};

    const items = [
      { label: `💬 Chat: ${currentModels.chat || '(none)'}`, value: 'chat' },
      { label: `🎨 Image Generation: ${currentModels.imageGenerate || '(none)'}`, value: 'imageGenerate' },
      { label: `✏️ Image Editing: ${currentModels.imageEdit || '(none)'}`, value: 'imageEdit' },
      { label: `👁️ Image Analysis: ${currentModels.imageAnalyze || '(none)'}`, value: 'imageAnalyze' },
      { label: `👁️ Image Embed: ${currentModels.imageEmbed || '(none)'}`, value: 'imageEmbed' },
      { label: `🎙️ Transcription: ${currentModels.transcription || '(none)'}`, value: 'transcription' },
      { label: `🔊 Text-to-Speech: ${currentModels.speech || '(none)'}`, value: 'speech' },
      { label: `🔢 Embeddings: ${currentModels.embedding || '(none)'}`, value: 'embedding' },
      { label: `📃 Summary: ${currentModels.summary || '(none)'}`, value: 'summary' },
      { label: `👁️ Describe: ${currentModels.describe || '(none)'}`, value: 'describe' },
      { label: `📑 Transcribe: ${currentModels.transcribe || '(none)'}`, value: 'transcribe' },
      { label: '← Back', value: '__back__' },
    ];

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Manage Models - Select Type
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>Select a model type to configure:</Text>
        </Box>
        <SelectInput
          items={items}
          onSelect={(item) => {
            if (item.value === '__back__') {
              handleBack();
              return;
            }
            setSelectedModelType(item.value as ModelType);
            setView('select-model');
          }}
        />
      </Box>
    );
  }

  // Select Model for Specific Type
  if (view === 'select-model' && selectedModelType) {
    const ai = createCletusAI(config);
    const currentModels = config.getData().user.models || {};
    const currentModelId = currentModels[selectedModelType];

    // Define required capabilities for each model type
    const requiredCapabilities: Record<ModelType, ModelCapability[]> = {
      chat: ['chat', 'tools'],
      imageGenerate: ['image'],
      imageEdit: ['image', 'vision'],
      imageAnalyze: ['vision'],
      imageEmbed: ['vision', 'embedding'],
      transcription: ['hearing'],
      speech: ['audio'],
      embedding: ['embedding'],
      summary: ['chat'],
      describe: ['vision', 'chat'],
      transcribe: ['vision', 'chat'],
    };

    const modelTypeLabels: Record<ModelType, string> = {
      chat: 'Chat',
      imageGenerate: 'Image Generation',
      imageEdit: 'Image Editing',
      imageAnalyze: 'Image Analysis',
      imageEmbed: 'Image Embedding',
      transcription: 'Transcription',
      speech: 'Text-to-Speech',
      embedding: 'Embeddings',
      summary: 'Summarize Text',
      describe: 'Describe Image',
      transcribe: 'Transcribe Image',
    };

    return (
      <ModelSelector
        ai={ai}
        baseMetadata={{ required: requiredCapabilities[selectedModelType] }}
        current={currentModelId}
        onSelect={async (model) => {
          if (model) {
            await config.save((data) => {
              data.user.models = data.user.models || {};
              data.user.models[selectedModelType] = model.id;
            });
            setMessage(`✓ ${modelTypeLabels[selectedModelType]} model set to: ${model.name} (${model.id})`);
          }
          setSelectedModelType(null);
          setView('manage-models');
        }}
        onCancel={() => {
          setSelectedModelType(null);
          setView('manage-models');
        }}
      />
    );
  }

  // Main Menu
  const debugEnabled = config.getData().user.debug;
  const menuItems = [
    { label: '✏️ Change name', value: 'change-name' },
    { label: '✏️ Change pronouns', value: 'change-pronouns' },
    { label: '📝 Change global prompt', value: 'change-global-prompt' },
    { label: '📄 View prompt files', value: 'manage-prompt-files' },
    { label: '💭 View memories', value: 'view-memories' },
    { label: '➕ Add a memory', value: 'add-memory' },
    { label: '🗑️ Delete a memory', value: 'delete-memory' },
    { label: '🗑️ Delete an assistant', value: 'delete-assistant' },
    { label: '🗑️ Delete a chat', value: 'delete-chat' },
    { label: '🗑️ Delete a data type', value: 'delete-type' },
    { label: '🔌 Manage providers', value: 'manage-providers' },
    { label: '🤖 Manage models', value: 'manage-models' },
    { label: `🐛 Debug logging ${debugEnabled ? '✅' : '❌'}`, value: 'toggle-debug' },
    { label: '← Back to main menu', value: '__back__' },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">
          Settings
        </Text>
      </Box>

      {message && (
        <Box marginBottom={1}>
          <Text color="green">{message}</Text>
        </Box>
      )}

      <SelectInput
        items={menuItems}
        onSelect={async (item) => {
          if (item.value === '__back__') {
            onExit();
            return;
          }
          if (item.value === 'toggle-debug') {
            await config.save((cfg) => {
              cfg.user.debug = !cfg.user.debug;
            });
            const enabled = config.getData().user.debug;
            logger.setDebug(enabled);
            setMessage(`✓ Debug logging ${enabled ? 'enabled' : 'disabled'}`);
            return;
          }
          setView(item.value as SettingsView);
        }}
      />

      <Box marginTop={1}>
        <Text dimColor>↑↓ to navigate, Enter to select</Text>
      </Box>
    </Box>
  );
};
