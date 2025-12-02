import { ModelCapability } from '@aeye/ai';
import { AWSBedrockProvider } from '@aeye/aws';
import fs from 'fs/promises';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import React, { useCallback, useEffect, useState } from 'react';
import { createCletusAI } from '../ai';
import { abbreviate } from '../common';
import type { ConfigFile } from '../config';
import { AUTONOMOUS, DEFAULT_PROMPT_FILES } from '../constants';
import { getDataPath } from '../file-manager';
import { logger } from '../logger';
import type { Providers } from '../schemas';
import { ModelSelector } from './ModelSelector';

type Tab = 'user' | 'prompts' | 'memory' | 'deletions' | 'providers' | 'tavily' | 'models' | 'autonomous' | 'debug';
type ModelType = 'chat' | 'imageGenerate' | 'imageEdit' | 'imageAnalyze' | 'imageEmbed' | 'transcription' | 'speech' | 'summary' | 'describe' | 'transcribe' | 'edit';

interface InkSettingsTabViewProps {
  config: ConfigFile;
  onExit: () => void;
}

export const InkSettingsTabView: React.FC<InkSettingsTabViewProps> = ({ config, onExit }) => {
  const [activeTab, setActiveTab] = useState<Tab>('user');
  const [editing, setEditing] = useState(false);
  const [editField, setEditField] = useState<string>('');
  const [editValue, setEditValue] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState<'tabs' | 'content'>('content');

  // Submenu states
  const [subView, setSubView] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [selectedId, setSelectedId] = useState<string>('');
  const [selectedModelType, setSelectedModelType] = useState<ModelType | null>(null);
  const [providerKey, setProviderKey] = useState<keyof Providers | null>(null);
  const [confirmAction, setConfirmAction] = useState<(() => Promise<void>) | null>(null);
  const [confirmMessage, setConfirmMessage] = useState<string>('');

  // AWS test state
  const [awsTestStatus, setAwsTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [awsTestMessage, setAwsTestMessage] = useState<string>('');

  useEffect(() => {
    process.stdout.write('\x1b]0;Cletus: Settings (Tab View)\x07');
    return () => {
      process.stdout.write('\x1b]0;Cletus\x07');
    };
  }, []);

  // Test AWS credentials
  const testAWSCredentials = useCallback(async (): Promise<boolean> => {
    setAwsTestStatus('testing');
    setAwsTestMessage('Testing AWS credentials...');

    try {
      const awsProvider = new AWSBedrockProvider({
        region: process.env.AWS_REGION || 'us-east-1',
      });

      const isHealthy = await awsProvider.checkHealth();

      if (isHealthy) {
        setAwsTestStatus('success');
        setAwsTestMessage('✓ AWS credentials detected and working!');
        return true;
      } else {
        setAwsTestStatus('error');
        setAwsTestMessage('⚠️ AWS credentials test failed.');
        return false;
      }
    } catch (error: any) {
      setAwsTestStatus('error');
      if (error.name === 'CredentialsProviderError' || error.name === 'UnrecognizedClientException') {
        setAwsTestMessage('⚠️ No AWS credentials found. Please configure manually.');
      } else if (error.name === 'AccessDeniedException') {
        setAwsTestMessage('✓ AWS credentials found but no Bedrock access. Check IAM permissions.');
      } else {
        setAwsTestMessage(`⚠️ AWS test failed: ${error.message || 'Unknown error'}`);
      }
      return false;
    }
  }, []);

  useInput((input, key) => {
    if (key.tab && !editing && !subView) {
      setFocusMode((prev) => (prev === 'tabs' ? 'content' : 'tabs'));
      return;
    }

    if (focusMode === 'tabs' && !editing && !subView) {
      const tabs: Tab[] = ['user', 'prompts', 'memory', 'deletions', 'providers', 'tavily', 'models', 'autonomous', 'debug'];
      const currentIndex = tabs.indexOf(activeTab);

      if (key.leftArrow && currentIndex > 0) {
        setActiveTab(tabs[currentIndex - 1]);
        setMessage(null);
        return;
      }
      if (key.rightArrow && currentIndex < tabs.length - 1) {
        setActiveTab(tabs[currentIndex + 1]);
        setMessage(null);
        return;
      }
    }

    if (key.ctrl && input === 'c') {
      if (editing) {
        setEditing(false);
        setEditField('');
        setEditValue('');
      } else if (subView === 'confirm') {
        setSubView(null);
        setConfirmAction(null);
        setConfirmMessage('');
      } else if (subView) {
        setSubView(null);
        setProviderKey(null);
        setSelectedModelType(null);
        setMessage(null);
      } else {
        onExit();
      }
    }
  });

  const startEdit = (field: string, currentValue: string) => {
    setEditField(field);
    setEditValue(currentValue);
    setEditing(true);
  };

  const showConfirm = (msg: string, action: () => Promise<void>) => {
    setConfirmMessage(msg);
    setConfirmAction(() => action);
    setSubView('confirm');
  };

  const saveEdit = async () => {
    if (editField === 'name') {
      if (editValue.trim()) {
        await config.save((data) => {
          data.user.name = editValue;
        });
        setMessage(`✓ Name updated to: ${editValue}`);
      }
    } else if (editField === 'pronouns') {
      await config.save((data) => {
        data.user.pronouns = editValue;
      });
      setMessage(`✓ Pronouns updated to: ${editValue || '(none)'}`);
    } else if (editField === 'globalPrompt') {
      await config.save((data) => {
        data.user.globalPrompt = editValue;
      });
      setMessage(`✓ Global prompt updated`);
    } else if (editField === 'maxIterations') {
      const value = parseInt(editValue);
      if (!isNaN(value) && value >= AUTONOMOUS.MIN_ITERATIONS) {
        await config.save((data) => {
          data.user.autonomous = data.user.autonomous || { maxIterations: AUTONOMOUS.DEFAULT_MAX_ITERATIONS, timeout: AUTONOMOUS.DEFAULT_TIMEOUT_MS };
          data.user.autonomous.maxIterations = value;
        });
        setMessage(`✓ Max iterations updated to: ${value}`);
      } else {
        setMessage(`⚠ Please enter a number >= ${AUTONOMOUS.MIN_ITERATIONS}`);
      }
    } else if (editField === 'timeout') {
      const minutes = parseInt(editValue);
      const minMinutes = Math.ceil(AUTONOMOUS.MIN_TIMEOUT_MS / AUTONOMOUS.MS_PER_MINUTE);
      if (!isNaN(minutes) && minutes >= minMinutes) {
        const timeoutMs = minutes * AUTONOMOUS.MS_PER_MINUTE;
        await config.save((data) => {
          data.user.autonomous = data.user.autonomous || { maxIterations: AUTONOMOUS.DEFAULT_MAX_ITERATIONS, timeout: AUTONOMOUS.DEFAULT_TIMEOUT_MS };
          data.user.autonomous.timeout = timeoutMs;
        });
        setMessage(`✓ Timeout updated to: ${minutes} minute${minutes !== 1 ? 's' : ''}`);
      } else {
        setMessage(`⚠ Please enter a number >= ${minMinutes}`);
      }
    } else if (editField === 'addPromptFile') {
      if (editValue.trim()) {
        const fileName = editValue.trim();
        await config.save((data) => {
          if (!data.user.promptFiles) {
            data.user.promptFiles = [];
          }
          if (!data.user.promptFiles.includes(fileName)) {
            data.user.promptFiles.push(fileName);
            setMessage(`✓ Added "${fileName}" to prompt files`);
          } else {
            setMessage(`⚠ "${fileName}" already exists`);
          }
        });
        setSubView(null);
      }
    } else if (editField === 'addMemory') {
      if (editValue.trim()) {
        await config.addMemory(editValue);
        setMessage('✓ Memory added!');
        setSubView(null);
      }
    } else if (editField === 'addApiKey') {
      if (editValue.trim() && providerKey) {
        await config.save((data) => {
          data.providers[providerKey!] = { apiKey: editValue };
        });
        setMessage(`✓ ${providerKey} configured!`);
        setSubView(null);
        setProviderKey(null);
      }
    } else if (editField === 'addTavilyKey') {
      if (editValue.trim()) {
        await config.save((data) => {
          data.tavily = { apiKey: editValue };
        });
        setMessage('✓ Tavily configured!');
        setSubView(null);
      }
    } else if (editField === 'awsModelPrefix') {
      await config.save((data) => {
        if (data.providers.aws) {
          const trimmedValue = editValue.trim();
          if (trimmedValue) {
            data.providers.aws.modelPrefix = trimmedValue;
          } else {
            delete data.providers.aws.modelPrefix;
          }
        }
      });
      const displayValue = editValue.trim() || '(none)';
      setMessage(`✓ Model prefix set to: ${displayValue}`);
      setSubView(null);
    }
    setEditing(false);
    setEditField('');
    setEditValue('');
  };

  // Confirm dialog
  if (subView === 'confirm') {
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
            setSubView(null);
            setConfirmAction(null);
            setConfirmMessage('');
          }}
        />
        <Box marginTop={1}>
          <Text dimColor>Ctrl+C to cancel</Text>
        </Box>
      </Box>
    );
  }

  // Model Selector
  if (subView === 'select-model' && selectedModelType) {
    const ai = createCletusAI(config);
    const currentModels = config.getData().user.models || {};
    const currentModelId = currentModels[selectedModelType];

    const requiredCapabilities: Record<ModelType, ModelCapability[]> = {
      chat: ['chat', 'tools'],
      imageGenerate: ['image'],
      imageEdit: ['image', 'vision'],
      imageAnalyze: ['vision'],
      imageEmbed: ['vision', 'embedding'],
      transcription: ['hearing'],
      speech: ['audio'],
      summary: ['chat'],
      describe: ['vision', 'chat'],
      transcribe: ['vision', 'chat'],
      edit: ['chat'],
    };

    const modelTypeLabels: Record<ModelType, string> = {
      chat: 'Chat',
      imageGenerate: 'Image Generation',
      imageEdit: 'Image Editing',
      imageAnalyze: 'Image Analysis',
      imageEmbed: 'Image Embedding',
      transcription: 'Transcription',
      speech: 'Text-to-Speech',
      summary: 'Summarize Text',
      describe: 'Describe Image',
      transcribe: 'Transcribe Image',
      edit: 'File Edit',
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
          setSubView(null);
        }}
        onCancel={() => {
          setSelectedModelType(null);
          setSubView(null);
        }}
      />
    );
  }

  const renderTabBar = () => {
    const tabs: Array<{ key: Tab; label: string }> = [
      { key: 'user', label: '👤 User' },
      { key: 'prompts', label: '📄 Prompts' },
      { key: 'memory', label: '💭 Memory' },
      { key: 'deletions', label: '❌ Delete' },
      { key: 'providers', label: '🔌 Providers' },
      { key: 'tavily', label: '🌐 Tavily' },
      { key: 'models', label: '🤖 Models' },
      { key: 'autonomous', label: '🔄 Auto' },
      { key: 'debug', label: '🐛 Debug' },
    ];

    return (
      <Box flexDirection="row" flexWrap="wrap" marginBottom={1}>
        {tabs.map((tab) => (
          <Box
            key={tab.key}
            borderStyle="round"
            borderColor={activeTab === tab.key && focusMode === 'tabs' ? 'cyan' : 'gray'}
            paddingX={1}
            marginRight={1}
            marginBottom={1}
          >
            <Text
              bold={activeTab === tab.key}
              color={activeTab === tab.key && focusMode === 'tabs' ? 'cyan' : undefined}
              dimColor={activeTab !== tab.key || focusMode !== 'tabs'}
            >
              {tab.label}
            </Text>
          </Box>
        ))}
      </Box>
    );
  };

  const renderContent = () => {
    if (editing) {
      const placeholders: Record<string, string> = {
        name: '',
        pronouns: 'e.g., he/him, she/her, they/them',
        globalPrompt: 'e.g., Always be concise and professional',
        addPromptFile: 'e.g., custom.md',
        addMemory: 'e.g., I prefer concise responses',
        addApiKey: 'sk-...',
        addTavilyKey: 'tvly-...',
        awsModelPrefix: 'e.g., us. or eu.',
      };

      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="cyan">Editing {editField.replace(/([A-Z])/g, ' $1').toLowerCase()}:</Text>
          </Box>
          <Box>
            <Text color="cyan">▶ </Text>
            <TextInput
              value={editValue}
              onChange={setEditValue}
              onSubmit={saveEdit}
              placeholder={placeholders[editField]}
            />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Enter to save, Ctrl+C to cancel</Text>
          </Box>
        </Box>
      );
    }

    // USER TAB
    if (activeTab === 'user') {
      const userData = config.getData().user;
      const items = [
        { label: `Change name (${userData.name})`, value: 'name' },
        { label: `Change pronouns (${userData.pronouns || '(none)'})`, value: 'pronouns' },
        { label: 'Change global prompt', value: 'globalPrompt' },
      ];

      return (
        <Box flexDirection="column">
          {message && (
            <Box marginBottom={1}>
              <Text color="green">{message}</Text>
            </Box>
          )}
          <SelectInput
            items={items}
            isFocused={focusMode === 'content'}
            onSelect={(item) => {
              if (item.value === 'name') {
                startEdit('name', userData.name);
              } else if (item.value === 'pronouns') {
                startEdit('pronouns', userData.pronouns || '');
              } else if (item.value === 'globalPrompt') {
                startEdit('globalPrompt', userData.globalPrompt || '');
              }
            }}
          />
        </Box>
      );
    }

    // PROMPTS TAB
    if (activeTab === 'prompts') {
      if (subView === 'reorder-prompt-files') {
        const promptFiles = config.getData().user.promptFiles || [];

        if (promptFiles.length === 0) {
          setMessage('⚠ No prompt files to reorder');
          setSubView(null);
          return null;
        }

        const items = promptFiles.map((file, index) => ({
          label: `${index + 1}. ${file}`,
          value: index.toString(),
        }));
        items.push({ label: '← Cancel', value: '__cancel__' });

        return (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text bold color="cyan">Reorder Prompt Files</Text>
            </Box>
            <Box marginBottom={1}>
              <Text dimColor>Select a file to move up in priority</Text>
            </Box>
            <SelectInput
              items={items}
              isFocused={focusMode === 'content'}
              onSelect={async (item) => {
                if (item.value === '__cancel__') {
                  setSubView(null);
                  return;
                }

                const index = parseInt(item.value);
                if (index > 0) {
                  await config.save((data) => {
                    const files = data.user.promptFiles || [];
                    [files[index - 1], files[index]] = [files[index], files[index - 1]];
                  });
                  setMessage(`✓ Moved "${promptFiles[index]}" up`);
                } else {
                  setMessage(`⚠ "${promptFiles[index]}" is already first`);
                }
                setSubView(null);
              }}
            />
          </Box>
        );
      }

      if (subView === 'remove-prompt-file') {
        const promptFiles = config.getData().user.promptFiles || [];

        if (promptFiles.length === 0) {
          setMessage('⚠ No prompt files to remove');
          setSubView(null);
          return null;
        }

        const items = promptFiles.map((file, index) => ({
          label: file,
          value: index.toString(),
        }));
        items.push({ label: '← Cancel', value: '__cancel__' });

        return (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text bold color="cyan">Remove a prompt file</Text>
            </Box>
            <SelectInput
              items={items}
              isFocused={focusMode === 'content'}
              onSelect={async (item) => {
                if (item.value === '__cancel__') {
                  setSubView(null);
                  return;
                }

                const index = parseInt(item.value);
                const fileName = promptFiles[index];

                await config.save((data) => {
                  data.user.promptFiles = data.user.promptFiles?.filter((_, i) => i !== index) || [];
                });
                setMessage(`✓ Removed "${fileName}"`);
                setSubView(null);
              }}
            />
          </Box>
        );
      }

      const promptFiles = config.getData().user.promptFiles || [...DEFAULT_PROMPT_FILES];
      const items = [
        { label: `Current: ${promptFiles.join(', ')}`, value: '__info__' },
        { label: '', value: '__separator__' },
        { label: 'Add a file', value: 'add' },
        { label: 'Reorder files', value: 'reorder' },
        { label: 'Remove a file', value: 'remove' },
      ];

      return (
        <Box flexDirection="column">
          {message && (
            <Box marginBottom={1}>
              <Text color="green">{message}</Text>
            </Box>
          )}
          <Box marginBottom={1}>
            <Text dimColor>First file found in cwd will be used (case-insensitive)</Text>
          </Box>
          <SelectInput
            items={items}
            isFocused={focusMode === 'content'}
            onSelect={(item) => {
              if (item.value === '__info__' || item.value === '__separator__') {
                return;
              }
              if (item.value === 'add') {
                startEdit('addPromptFile', '');
              } else if (item.value === 'reorder') {
                setSubView('reorder-prompt-files');
              } else if (item.value === 'remove') {
                setSubView('remove-prompt-file');
              }
            }}
          />
        </Box>
      );
    }

    // MEMORY TAB
    if (activeTab === 'memory') {
      if (subView === 'delete-memory') {
        const memories = config.getData().user.memory;

        if (memories.length === 0) {
          setMessage('⚠ No memories to delete');
          setSubView(null);
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
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text bold color="cyan">Select a memory to delete:</Text>
            </Box>
            <SelectInput
              items={items}
              isFocused={focusMode === 'content'}
              onSelect={(item) => {
                if (item.value === '__cancel__') {
                  setSubView(null);
                  return;
                }
                const index = parseInt(item.value);
                showConfirm('Are you sure you want to delete this memory?', async () => {
                  await config.save((data) => {
                    data.user.memory.splice(index, 1);
                  });
                  setMessage('✓ Memory deleted');
                  setSubView(null);
                });
              }}
            />
          </Box>
        );
      }

      const memories = config.getData().user.memory;
      const items = [
        { label: `Total memories: ${memories.length}`, value: '__info__' },
        { label: '', value: '__separator__' },
        { label: 'Add a memory', value: 'add' },
        { label: 'Delete a memory', value: 'delete' },
      ];

      return (
        <Box flexDirection="column">
          {message && (
            <Box marginBottom={1}>
              <Text color="green">{message}</Text>
            </Box>
          )}
          {memories.length === 0 ? (
            <Box marginBottom={1}>
              <Text dimColor>No memories saved yet.</Text>
            </Box>
          ) : (
            <Box flexDirection="column" marginBottom={1}>
              {memories.slice(0, 5).map((memory, index) => (
                <Text key={index}>{index + 1}. {memory.text.substring(0, 70)}...</Text>
              ))}
              {memories.length > 5 && (
                <Text dimColor>... and {memories.length - 5} more</Text>
              )}
            </Box>
          )}
          <SelectInput
            items={items}
            isFocused={focusMode === 'content'}
            onSelect={(item) => {
              if (item.value === '__info__' || item.value === '__separator__') {
                return;
              }
              if (item.value === 'add') {
                startEdit('addMemory', '');
              } else if (item.value === 'delete') {
                setSubView('delete-memory');
              }
            }}
          />
        </Box>
      );
    }

    // DELETIONS TAB
    if (activeTab === 'deletions') {
      if (subView === 'delete-assistant') {
        const assistants = config.getData().assistants;

        if (assistants.length === 0) {
          setMessage('⚠ No assistants to delete');
          setSubView(null);
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
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text bold color="cyan">Select an assistant to delete:</Text>
            </Box>
            <SelectInput
              items={items}
              isFocused={focusMode === 'content'}
              onSelect={(item) => {
                if (item.value === '__cancel__') {
                  setSubView(null);
                  return;
                }
                const index = parseInt(item.value);
                const name = assistants[index].name;
                showConfirm(`Delete "${name}"?`, async () => {
                  await config.save((data) => {
                    data.assistants.splice(index, 1);
                  });
                  setMessage(`✓ Assistant "${name}" deleted`);
                  setSubView(null);
                });
              }}
            />
          </Box>
        );
      }

      if (subView === 'delete-chat-options') {
        const chats = config.getChats();
        const chat = chats.find((c) => c.id === selectedId);

        if (!chat) {
          setSubView(null);
          return null;
        }

        const chatIndex = chats.findIndex((c) => c.id === selectedId);
        const hasOlderChats = chatIndex < chats.length - 1;
        const olderCount = chats.length - chatIndex - 1;

        const items = [
          { label: `Delete this chat only`, value: 'single' },
          ...(hasOlderChats ? [{ label: `Delete this chat and ${olderCount} older chat${olderCount !== 1 ? 's' : ''}`, value: 'and_older' }] : []),
          { label: '← Cancel', value: '__cancel__' },
        ];

        return (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text bold color="cyan">Delete: {abbreviate(chat.title, 50)}</Text>
            </Box>
            <SelectInput
              items={items}
              isFocused={focusMode === 'content'}
              onSelect={(item) => {
                if (item.value === '__cancel__') {
                  setSubView('delete-chat');
                  return;
                }

                const deleteChats = item.value === 'and_older'
                  ? chats.slice(chatIndex)
                  : [chat];

                const confirmMsg = item.value === 'and_older'
                  ? `Delete "${abbreviate(chat.title, 40)}" and ${deleteChats.length - 1} older chat${deleteChats.length - 1 !== 1 ? 's' : ''}?`
                  : `Delete "${abbreviate(chat.title, 50)}" and all its messages?`;

                showConfirm(confirmMsg, async () => {
                  for (const chatToDelete of deleteChats) {
                    await config.deleteChat(chatToDelete.id);
                  }
                  const deletedCount = deleteChats.length;
                  setMessage(`✓ ${deletedCount} chat${deletedCount !== 1 ? 's' : ''} deleted`);

                  const remainingChats = config.getChats();
                  if (remainingChats.length === 0) {
                    setSubView(null);
                  } else {
                    setSubView('delete-chat');
                  }
                });
              }}
            />
          </Box>
        );
      }

      if (subView === 'delete-chat') {
        const chats = config.getChats();

        if (chats.length === 0) {
          setMessage('⚠ No chats to delete');
          setSubView(null);
          return null;
        }

        const items = [
          { label: '❌ Delete all chats', value: '__delete_all__' },
          { label: '', value: '__separator__' },
          ...chats.map((chat) => ({
            label: chat.title,
            value: chat.id,
          })),
          { label: '← Cancel', value: '__cancel__' },
        ];

        return (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text bold color="cyan">Select a chat to delete:</Text>
            </Box>
            <SelectInput
              items={items}
              isFocused={focusMode === 'content'}
              onSelect={(item) => {
                if (item.value === '__cancel__') {
                  setSubView(null);
                  return;
                }
                if (item.value === '__separator__') {
                  return;
                }
                if (item.value === '__delete_all__') {
                  showConfirm(`Delete ALL ${chats.length} chat${chats.length !== 1 ? 's' : ''} and their messages?`, async () => {
                    for (const chat of chats) {
                      await config.deleteChat(chat.id);
                    }
                    setMessage(`✓ All chats deleted`);
                    setSubView(null);
                  });
                  return;
                }

                setSelectedId(item.value);
                setSubView('delete-chat-options');
              }}
            />
          </Box>
        );
      }

      if (subView === 'delete-type') {
        const types = config.getData().types;

        if (types.length === 0) {
          setMessage('⚠ No data types to delete');
          setSubView(null);
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
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text bold color="cyan">Select a data type to delete:</Text>
            </Box>
            <SelectInput
              items={items}
              isFocused={focusMode === 'content'}
              onSelect={(item) => {
                if (item.value === '__cancel__') {
                  setSubView(null);
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
                  setSubView(null);
                });
              }}
            />
          </Box>
        );
      }

      const chats = config.getChats();
      const assistants = config.getData().assistants;
      const types = config.getData().types;

      const items = [
        { label: `${chats.length} chat(s)`, value: '__info1__' },
        { label: `${assistants.length} assistant(s)`, value: '__info2__' },
        { label: `${types.length} data type(s)`, value: '__info3__' },
        { label: '', value: '__separator__' },
        { label: 'Delete an assistant', value: 'delete-assistant' },
        { label: 'Delete a chat', value: 'delete-chat' },
        { label: 'Delete a data type', value: 'delete-type' },
      ];

      return (
        <Box flexDirection="column">
          {message && (
            <Box marginBottom={1}>
              <Text color="green">{message}</Text>
            </Box>
          )}
          <SelectInput
            items={items}
            isFocused={focusMode === 'content'}
            onSelect={(item) => {
              if (item.value.startsWith('__info') || item.value === '__separator__') {
                return;
              }
              setSubView(item.value);
            }}
          />
        </Box>
      );
    }

    // PROVIDERS TAB
    if (activeTab === 'providers') {
      if (subView === 'manage-openrouter-settings') {
        const openrouter = config.getData().providers.openrouter;
        const zdrEnabled = openrouter?.defaultParams?.providers?.dataCollection === 'deny';

        const items = [
          { label: `Zero Data Retention (ZDR) ${zdrEnabled ? '✅' : '❌'}`, value: 'toggle-zdr' },
          { label: '← Back', value: '__back__' },
        ];

        return (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text bold color="cyan">OpenRouter Settings</Text>
            </Box>
            <Box marginBottom={1}>
              <Text dimColor>Zero Data Retention ensures your data is not stored by OpenRouter</Text>
            </Box>
            <SelectInput
              items={items}
              isFocused={focusMode === 'content'}
              onSelect={async (item) => {
                if (item.value === '__back__') {
                  setSubView(null);
                  setProviderKey(null);
                  return;
                }
                if (item.value === 'toggle-zdr') {
                  const newZdrValue = !zdrEnabled;
                  await config.save((data) => {
                    if (data.providers.openrouter) {
                      if (!data.providers.openrouter.defaultParams) {
                        data.providers.openrouter.defaultParams = {};
                      }
                      if (!data.providers.openrouter.defaultParams.providers) {
                        data.providers.openrouter.defaultParams.providers = {};
                      }
                      data.providers.openrouter.defaultParams.providers.dataCollection = newZdrValue ? 'deny' : 'allow';
                    }
                  });
                  setMessage(`✓ ZDR ${newZdrValue ? 'enabled' : 'disabled'} - Your data ${newZdrValue ? 'will not be stored' : 'may be stored'} by OpenRouter`);
                  setSubView(null);
                  setProviderKey(null);
                }
              }}
            />
          </Box>
        );
      }

      if (subView === 'manage-aws-settings') {
        const aws = config.getData().providers.aws;
        const modelPrefix = aws?.modelPrefix || '(none)';

        const items = [
          { label: `Model Prefix: ${modelPrefix}`, value: 'model-prefix' },
          { label: '← Back', value: '__back__' },
        ];

        return (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text bold color="cyan">AWS Bedrock Settings</Text>
            </Box>
            <Box marginBottom={1}>
              <Text dimColor>Model prefix is used for cross-region inference (e.g., 'us.', 'eu.')</Text>
            </Box>
            <SelectInput
              items={items}
              isFocused={focusMode === 'content'}
              onSelect={async (item) => {
                if (item.value === '__back__') {
                  setSubView(null);
                  setProviderKey(null);
                  return;
                }
                if (item.value === 'model-prefix') {
                  const current = config.getData().providers.aws?.modelPrefix || '';
                  startEdit('awsModelPrefix', current);
                }
              }}
            />
          </Box>
        );
      }

      if (subView === 'configure-aws' && providerKey === 'aws') {
        // Initialize AWS test on first render
        React.useEffect(() => {
          if (awsTestStatus === 'idle') {
            testAWSCredentials();
          }
        }, []);

        return (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text bold color="cyan">AWS Bedrock Configuration</Text>
            </Box>
            <Box marginBottom={1} flexDirection='column'>
              <Text dimColor>AWS Bedrock can use credentials from multiple sources:</Text>
              <Text dimColor>  - Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)</Text>
              <Text dimColor>  - Shared credentials file (~/.aws/credentials)</Text>
              <Text dimColor>  - IAM roles (when running on EC2, ECS, Lambda)</Text>
            </Box>
            <Box marginTop={1} marginBottom={1}>
              <Text>Currently configured: {config.getData().providers.aws ? 'Yes' : 'No'}</Text>
            </Box>
            {awsTestStatus === 'testing' && (
              <Box marginBottom={1}>
                <Text color="yellow">{awsTestMessage}</Text>
              </Box>
            )}
            {awsTestStatus === 'success' && (
              <Box marginBottom={1}>
                <Text color="green">{awsTestMessage}</Text>
              </Box>
            )}
            {awsTestStatus === 'error' && (
              <Box marginBottom={1}>
                <Text color="yellow">{awsTestMessage}</Text>
              </Box>
            )}
            {awsTestStatus !== 'testing' && (
              <Box marginTop={1}>
                <SelectInput
                  items={[
                    ...(awsTestStatus === 'success' || awsTestStatus === 'error'
                      ? [{ label: 'Enable with auto-detected credentials', value: 'auto' }]
                      : []
                    ),
                    { label: 'Configure with explicit environment variables', value: 'env' },
                    { label: 'Test credentials again', value: 'test' },
                    { label: '← Back', value: '__back__' },
                  ]}
                  isFocused={focusMode === 'content'}
                  onSelect={async (item) => {
                    if (item.value === '__back__') {
                      setSubView(null);
                      setProviderKey(null);
                      setAwsTestStatus('idle');
                      setAwsTestMessage('');
                      return;
                    }
                    if (item.value === 'test') {
                      await testAWSCredentials();
                      return;
                    }
                    if (item.value === 'auto') {
                      await config.save((data) => {
                        data.providers.aws = {
                          region: process.env.AWS_REGION,
                        };
                      });
                      setMessage('✓ AWS configured with auto-detected credentials!');
                      setSubView(null);
                      setProviderKey(null);
                      setAwsTestStatus('idle');
                      setAwsTestMessage('');
                      return;
                    }
                    if (item.value === 'env') {
                      const awsRegion = process.env.AWS_REGION;
                      const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
                      const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

                      if (awsAccessKeyId && awsSecretAccessKey) {
                        await config.save((data) => {
                          data.providers.aws = {
                            region: awsRegion,
                            credentials: {
                              accessKeyId: awsAccessKeyId,
                              secretAccessKey: awsSecretAccessKey,
                            },
                          };
                        });
                        setMessage('✓ AWS configured with explicit environment credentials!');
                      } else {
                        setMessage('⚠️ AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY not found in environment');
                      }
                      setSubView(null);
                      setProviderKey(null);
                      setAwsTestStatus('idle');
                      setAwsTestMessage('');
                    }
                  }}
                />
              </Box>
            )}
          </Box>
        );
      }

      if (subView === 'provider-action' && providerKey) {
        const providers = config.getData().providers;
        const isConfigured = providers[providerKey] !== null;

        const items = isConfigured
          ? [
              { label: 'Update API key', value: 'update' },
              ...(providerKey === 'openrouter' ? [{ label: '⚙️ Configure settings', value: 'configure' }] : []),
              ...(providerKey === 'aws' ? [{ label: '⚙️ Configure settings', value: 'configure' }] : []),
              { label: 'Remove provider', value: 'remove' },
              { label: '← Back', value: '__back__' },
            ]
          : [
              { label: 'Add API key', value: 'update' },
              { label: '← Back', value: '__back__' },
            ];

        return (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text bold color="cyan">
                {providerKey} - {isConfigured ? 'Configured' : 'Not configured'}
              </Text>
            </Box>
            <SelectInput
              items={items}
              isFocused={focusMode === 'content'}
              onSelect={(item) => {
                if (item.value === '__back__') {
                  setSubView(null);
                  setProviderKey(null);
                  return;
                }
                if (item.value === 'remove') {
                  showConfirm(`Remove ${providerKey}?`, async () => {
                    await config.save((data) => {
                      data.providers[providerKey!] = null;
                    });
                    setMessage(`✓ ${providerKey} removed`);
                    setSubView(null);
                    setProviderKey(null);
                  });
                  return;
                }
                if (item.value === 'configure') {
                  if (providerKey === 'openrouter') {
                    setSubView('manage-openrouter-settings');
                  } else if (providerKey === 'aws') {
                    setSubView('manage-aws-settings');
                  }
                  return;
                }
                if (item.value === 'update') {
                  if (providerKey === 'aws') {
                    setAwsTestStatus('idle');
                    setAwsTestMessage('');
                    setSubView('configure-aws');
                  } else {
                    startEdit('addApiKey', '');
                  }
                }
              }}
            />
          </Box>
        );
      }

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
        {
          label: `AWS Bedrock ${providers.aws ? '✅' : '❌'}`,
          value: 'aws',
        },
      ];

      return (
        <Box flexDirection="column">
          {message && (
            <Box marginBottom={1}>
              <Text color="green">{message}</Text>
            </Box>
          )}
          <Box marginBottom={1}>
            <Text dimColor>Configure API providers</Text>
          </Box>
          <SelectInput
            items={items}
            isFocused={focusMode === 'content'}
            onSelect={(item) => {
              setProviderKey(item.value as keyof Providers);
              setSubView('provider-action');
            }}
          />
        </Box>
      );
    }

    // TAVILY TAB
    if (activeTab === 'tavily') {
      const tavily = config.getData().tavily;
      const isConfigured = tavily !== null;

      const items = isConfigured
        ? [
            { label: 'Update API key', value: 'update' },
            { label: 'Remove Tavily', value: 'remove' },
          ]
        : [
            { label: 'Add API key', value: 'add' },
          ];

      return (
        <Box flexDirection="column">
          {message && (
            <Box marginBottom={1}>
              <Text color="green">{message}</Text>
            </Box>
          )}
          <Box marginBottom={1}>
            <Text>Status: {isConfigured ? '✅ Configured' : '❌ Not configured'}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor>Get your key from: https://tavily.com</Text>
          </Box>
          <SelectInput
            items={items}
            isFocused={focusMode === 'content'}
            onSelect={(item) => {
              if (item.value === 'remove') {
                showConfirm('Remove Tavily API key?', async () => {
                  await config.save((data) => {
                    data.tavily = null;
                  });
                  setMessage('✓ Tavily removed');
                });
                return;
              }
              startEdit('addTavilyKey', '');
            }}
          />
        </Box>
      );
    }

    // MODELS TAB
    if (activeTab === 'models') {
      const currentModels = config.getData().user.models || {};

      const items = [
        { label: `Chat: ${currentModels.chat || '(none)'}`, value: 'chat' },
        { label: `Image Generation: ${currentModels.imageGenerate || '(none)'}`, value: 'imageGenerate' },
        { label: `Image Editing: ${currentModels.imageEdit || '(none)'}`, value: 'imageEdit' },
        { label: `Image Analysis: ${currentModels.imageAnalyze || '(none)'}`, value: 'imageAnalyze' },
        { label: `Image Embed: ${currentModels.imageEmbed || '(none)'}`, value: 'imageEmbed' },
        { label: `Transcription: ${currentModels.transcription || '(none)'}`, value: 'transcription' },
        { label: `Text-to-Speech: ${currentModels.speech || '(none)'}`, value: 'speech' },
        { label: `Summary: ${currentModels.summary || '(none)'}`, value: 'summary' },
        { label: `Describe: ${currentModels.describe || '(none)'}`, value: 'describe' },
        { label: `Transcribe: ${currentModels.transcribe || '(none)'}`, value: 'transcribe' },
        { label: `Edit: ${currentModels.edit || '(none)'}`, value: 'edit' },
      ];

      return (
        <Box flexDirection="column">
          {message && (
            <Box marginBottom={1}>
              <Text color="green">{message}</Text>
            </Box>
          )}
          <Box marginBottom={1}>
            <Text dimColor>Select a model type to configure</Text>
          </Box>
          <SelectInput
            items={items}
            isFocused={focusMode === 'content'}
            onSelect={(item) => {
              setSelectedModelType(item.value as ModelType);
              setSubView('select-model');
            }}
          />
        </Box>
      );
    }

    // AUTONOMOUS TAB
    if (activeTab === 'autonomous') {
      const maxIterations = config.getData().user.autonomous?.maxIterations ?? AUTONOMOUS.DEFAULT_MAX_ITERATIONS;
      const timeoutMinutes = Math.round((config.getData().user.autonomous?.timeout ?? AUTONOMOUS.DEFAULT_TIMEOUT_MS) / AUTONOMOUS.MS_PER_MINUTE);

      const items = [
        { label: `Max iterations: ${maxIterations}`, value: 'maxIterations' },
        { label: `Timeout: ${timeoutMinutes}m`, value: 'timeout' },
      ];

      return (
        <Box flexDirection="column">
          {message && (
            <Box marginBottom={1}>
              <Text color="green">{message}</Text>
            </Box>
          )}
          <SelectInput
            items={items}
            isFocused={focusMode === 'content'}
            onSelect={(item) => {
              if (item.value === 'maxIterations') {
                startEdit('maxIterations', maxIterations.toString());
              } else if (item.value === 'timeout') {
                startEdit('timeout', timeoutMinutes.toString());
              }
            }}
          />
        </Box>
      );
    }

    // DEBUG TAB
    if (activeTab === 'debug') {
      const debugEnabled = config.getData().user.debug;

      return (
        <Box flexDirection="column">
          {message && (
            <Box marginBottom={1}>
              <Text color="green">{message}</Text>
            </Box>
          )}
          <Box marginBottom={1}>
            <Text>Debug logging: {debugEnabled ? '✅ Enabled' : '❌ Disabled'}</Text>
          </Box>
          <SelectInput
            items={[
              { label: debugEnabled ? 'Disable debug logging' : 'Enable debug logging', value: 'toggle' },
            ]}
            isFocused={focusMode === 'content'}
            onSelect={async () => {
              await config.save((cfg) => {
                cfg.user.debug = !cfg.user.debug;
              });
              const enabled = config.getData().user.debug;
              logger.setDebug(enabled);
              setMessage(`✓ Debug logging ${enabled ? 'enabled' : 'disabled'}`);
            }}
          />
        </Box>
      );
    }

    return <Text>Unknown tab</Text>;
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">
          Settings (Tab View)
        </Text>
      </Box>

      {renderTabBar()}

      <Box marginBottom={1}>
        <Text dimColor>
          {activeTab === 'user' ? 'User Profile' :
           activeTab === 'prompts' ? 'Prompt Files' :
           activeTab === 'memory' ? 'Memories' :
           activeTab === 'deletions' ? 'Deletions' :
           activeTab === 'providers' ? 'Providers' :
           activeTab === 'tavily' ? 'Tavily Web Search' :
           activeTab === 'models' ? 'Models' :
           activeTab === 'autonomous' ? 'Autonomous Settings' :
           'Debug Settings'}
        </Text>
      </Box>

      <Box borderStyle="round" borderColor={focusMode === 'content' ? 'cyan' : 'gray'} padding={1}>
        {renderContent()}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          {subView || editing ? 'Enter to select • Ctrl+C to cancel' : 'Tab to switch focus • ←→ to navigate tabs • ↑↓ for items • Ctrl+C to exit'}
        </Text>
      </Box>
    </Box>
  );
};
