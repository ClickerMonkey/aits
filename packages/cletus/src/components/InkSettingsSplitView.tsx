import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import React, { useState, useEffect, useCallback } from 'react';
import type { ConfigFile } from '../config';
import { ModelSelector } from './ModelSelector';
import { createCletusAI } from '../ai';
import type { Providers } from '../schemas';
import fs from 'fs/promises';
import { getChatPath, getDataPath } from '../file-manager';
import { ModelCapability } from '@aeye/ai';
import { logger } from '../logger';
import { abbreviate } from '../common';
import { AUTONOMOUS, DEFAULT_PROMPT_FILES } from '../constants';
import { AWSBedrockProvider } from '@aeye/aws';

type SettingsCategory =
  | 'user-profile'
  | 'prompt-files'
  | 'memories'
  | 'deletions'
  | 'providers'
  | 'tavily'
  | 'models'
  | 'autonomous'
  | 'debug';

type SubView =
  | 'default'
  | 'change-name'
  | 'change-pronouns'
  | 'change-global-prompt'
  | 'add-prompt-file'
  | 'reorder-prompt-files'
  | 'remove-prompt-file'
  | 'add-memory'
  | 'delete-memory'
  | 'delete-assistant'
  | 'delete-chat'
  | 'delete-chat-options'
  | 'delete-type'
  | 'provider-action'
  | 'provider-input'
  | 'openrouter-settings'
  | 'aws-settings'
  | 'aws-model-prefix'
  | 'tavily-input'
  | 'select-model'
  | 'change-max-iterations'
  | 'change-timeout'
  | 'confirm';

type ModelType = 'chat' | 'imageGenerate' | 'imageEdit' | 'imageAnalyze' | 'imageEmbed' | 'transcription' | 'speech' | 'embedding' | 'summary' | 'describe' | 'transcribe' | 'edit';

interface InkSettingsSplitViewProps {
  config: ConfigFile;
  onExit: () => void;
}

export const InkSettingsSplitView: React.FC<InkSettingsSplitViewProps> = ({ config, onExit }) => {
  const [selectedCategory, setSelectedCategory] = useState<SettingsCategory>('user-profile');
  const [subView, setSubView] = useState<SubView>('default');
  const [message, setMessage] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<(() => Promise<void>) | null>(null);
  const [confirmMessage, setConfirmMessage] = useState<string>('');
  const [providerKey, setProviderKey] = useState<keyof Providers | null>(null);
  const [providerAction, setProviderAction] = useState<'update' | 'remove' | null>(null);
  const [selectedDeleteId, setSelectedDeleteId] = useState<string>('');
  const [selectedModelType, setSelectedModelType] = useState<ModelType | null>(null);
  
  // Focus management: 0 = left pane, 1 = middle pane, 2 = right pane
  const [focusedPane, setFocusedPane] = useState<0 | 1 | 2>(0);

  // State for all input fields
  const [nameInput, setNameInput] = useState('');
  const [pronounsInput, setPronounsInput] = useState('');
  const [globalPromptInput, setGlobalPromptInput] = useState('');
  const [promptFileInput, setPromptFileInput] = useState('');
  const [memoryInput, setMemoryInput] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [maxIterationsInput, setMaxIterationsInput] = useState('');
  const [timeoutInput, setTimeoutInput] = useState('');
  const [modelPrefixInput, setModelPrefixInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  // AWS credential test state
  const [awsTestStatus, setAwsTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [awsTestMessage, setAwsTestMessage] = useState<string>('');

  // Function to test AWS credentials
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

  // Set terminal title
  useEffect(() => {
    process.stdout.write('\x1b]0;Cletus: Settings (Split View)\x07');
    return () => {
      process.stdout.write('\x1b]0;Cletus\x07');
    };
  }, []);

  // Initialize inputs when subView changes
  React.useEffect(() => {
    if (subView === 'change-name') {
      setNameInput(config.getData().user.name);
      setInputError(null);
    } else if (subView === 'change-pronouns') {
      setPronounsInput(config.getData().user.pronouns || '');
      setInputError(null);
    } else if (subView === 'change-global-prompt') {
      setGlobalPromptInput(config.getData().user.globalPrompt || '');
      setInputError(null);
    } else if (subView === 'add-prompt-file') {
      setPromptFileInput('');
      setInputError(null);
    } else if (subView === 'add-memory') {
      setMemoryInput('');
      setInputError(null);
    } else if (subView === 'provider-input') {
      setApiKeyInput('');
      setInputError(null);
      if (providerKey === 'aws') {
        setAwsTestStatus('idle');
        setAwsTestMessage('');
        testAWSCredentials();
      }
    } else if (subView === 'change-max-iterations') {
      const current = config.getData().user.autonomous?.maxIterations ?? AUTONOMOUS.DEFAULT_MAX_ITERATIONS;
      setMaxIterationsInput(current.toString());
      setInputError(null);
    } else if (subView === 'change-timeout') {
      const current = config.getData().user.autonomous?.timeout ?? AUTONOMOUS.DEFAULT_TIMEOUT_MS;
      setTimeoutInput(Math.round(current / AUTONOMOUS.MS_PER_MINUTE).toString());
      setInputError(null);
    } else if (subView === 'aws-model-prefix') {
      const current = config.getData().providers.aws?.modelPrefix || '';
      setModelPrefixInput(current);
      setInputError(null);
    } else if (subView === 'tavily-input') {
      setApiKeyInput('');
      setInputError(null);
    }
  }, [subView, providerKey, testAWSCredentials]);

  // Handle ESC, Ctrl+C, and Tab keys for pane navigation
  useInput((input, key) => {
    // Tab key to switch between panes
    if (key.tab) {
      // Only allow tab navigation on default view (not during text input)
      if (subView === 'default') {
        setFocusedPane((prev) => {
          // Cycle through panes: 0 -> 1 -> 0 (or 0 -> 1 -> 2 -> 0 when third pane is visible)
          if (prev === 0) return 1;
          if (prev === 1) {
            // Check if there's content in the third pane that can be focused
            const hasThirdPane = shouldShowThirdPane();
            return hasThirdPane ? 2 : 0;
          }
          return 0;
        });
      }
      return;
    }
    
    // Left/Right arrow keys for pane navigation (alternative to Tab)
    if (key.leftArrow && subView === 'default') {
      setFocusedPane((prev) => {
        if (prev === 2) return 1;
        if (prev === 1) return 0;
        return prev;
      });
      return;
    }
    if (key.rightArrow && subView === 'default') {
      setFocusedPane((prev) => {
        if (prev === 0) return 1;
        if (prev === 1) {
          const hasThirdPane = shouldShowThirdPane();
          return hasThirdPane ? 2 : 1;
        }
        return prev;
      });
      return;
    }
    
    if (key.escape && subView === 'add-memory') {
      handleBackToCategory();
    }
    if (key.ctrl && input === 'c') {
      if (subView === 'default') {
        // On main view, exit
        onExit();
      } else if (subView === 'confirm') {
        // On confirm dialog, cancel
        handleBackToCategory();
      } else {
        // On any other view, go back to category default
        handleBackToCategory();
      }
    }
  });
  
  // Helper function to determine if third pane should be shown
  const shouldShowThirdPane = (): boolean => {
    // Third pane is shown for specific sub-views that need deeper navigation
    return subView === 'provider-action' || 
           subView === 'openrouter-settings' || 
           subView === 'aws-settings' ||
           subView === 'delete-chat-options';
  };

  const handleBackToCategory = () => {
    setMessage(null);
    setSubView('default');
    // Reset focus to middle pane when going back to category default
    setFocusedPane(1);
  };

  const showConfirm = (msg: string, action: () => Promise<void>) => {
    setConfirmMessage(msg);
    setConfirmAction(() => action);
    setSubView('confirm');
  };

  // Category menu items
  const categoryItems = [
    { label: '👤 User Profile', value: 'user-profile' as SettingsCategory },
    { label: '📄 Prompt Files', value: 'prompt-files' as SettingsCategory },
    { label: '💭 Memories', value: 'memories' as SettingsCategory },
    { label: '🗑️ Deletions', value: 'deletions' as SettingsCategory },
    { label: '🔌 Providers', value: 'providers' as SettingsCategory },
    { label: '🌐 Tavily (Web Search)', value: 'tavily' as SettingsCategory },
    { label: '🤖 Models', value: 'models' as SettingsCategory },
    { label: '🔄 Autonomous', value: 'autonomous' as SettingsCategory },
    { label: '🐛 Debug', value: 'debug' as SettingsCategory },
  ];

  // Render the middle panel based on selected category and subView
  const renderMiddlePanel = () => {
    // Confirm dialog takes over middle panel
    if (subView === 'confirm') {
      const items = [
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
      ];

      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="yellow">
              {confirmMessage}
            </Text>
          </Box>
          <SelectInput
            items={items}
            isFocused={focusedPane === 1}
            onSelect={async (item) => {
              if (item.value === 'yes' && confirmAction) {
                await confirmAction();
              }
              handleBackToCategory();
            }}
          />
        </Box>
      );
    }

    // User Profile
    if (selectedCategory === 'user-profile') {
      if (subView === 'change-name') {
        return (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text bold color="cyan">Enter your new name:</Text>
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
                    handleBackToCategory();
                  }
                }}
              />
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Enter to submit, ESC to go back</Text>
            </Box>
          </Box>
        );
      } else if (subView === 'change-pronouns') {
        return (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text bold color="cyan">Enter your pronouns:</Text>
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
                  handleBackToCategory();
                }}
              />
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Enter to submit, ESC to go back</Text>
            </Box>
          </Box>
        );
      } else if (subView === 'change-global-prompt') {
        return (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text bold color="cyan">Enter your global prompt:</Text>
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
                  handleBackToCategory();
                }}
              />
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Enter to submit, ESC to go back</Text>
            </Box>
          </Box>
        );
      }

      // Default user profile view
      const userData = config.getData().user;
      const items = [
        { label: `✏️ Change name (${userData.name})`, value: 'change-name' },
        { label: `✏️ Change pronouns (${userData.pronouns || '(none)'})`, value: 'change-pronouns' },
        { label: '📝 Change global prompt', value: 'change-global-prompt' },
      ];

      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="cyan">User Profile Settings</Text>
          </Box>
          {message && (
            <Box marginBottom={1}>
              <Text color="green">{message}</Text>
            </Box>
          )}
          <SelectInput
            items={items}
            isFocused={focusedPane === 1}
            onSelect={(item) => {
              setSubView(item.value as SubView);
              setFocusedPane(1);
            }}
          />
        </Box>
      );
    }

    // Prompt Files
    if (selectedCategory === 'prompt-files') {
      if (subView === 'add-prompt-file') {
        return (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text bold color="cyan">Add a prompt file</Text>
            </Box>
            <Box marginBottom={1}>
              <Text dimColor>Enter filename (e.g., cletus.md, custom.md)</Text>
            </Box>
            <Box>
              <Text color="cyan">▶ </Text>
              <TextInput
                value={promptFileInput}
                onChange={setPromptFileInput}
                placeholder="e.g., custom.md"
                onSubmit={async () => {
                  if (promptFileInput.trim()) {
                    const fileName = promptFileInput.trim();
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
                    handleBackToCategory();
                  }
                }}
              />
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Enter to submit, ESC to go back</Text>
            </Box>
          </Box>
        );
      } else if (subView === 'reorder-prompt-files') {
        const promptFiles = config.getData().user.promptFiles || [];
        
        if (promptFiles.length === 0) {
          setMessage('⚠ No prompt files to reorder');
          handleBackToCategory();
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
              isFocused={focusedPane === 1}
              onSelect={async (item) => {
                if (item.value === '__cancel__') {
                  handleBackToCategory();
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
                handleBackToCategory();
              }}
            />
          </Box>
        );
      } else if (subView === 'remove-prompt-file') {
        const promptFiles = config.getData().user.promptFiles || [];
        
        if (promptFiles.length === 0) {
          setMessage('⚠ No prompt files to remove');
          handleBackToCategory();
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
              isFocused={focusedPane === 1}
              onSelect={async (item) => {
                if (item.value === '__cancel__') {
                  handleBackToCategory();
                  return;
                }
                
                const index = parseInt(item.value);
                const fileName = promptFiles[index];
                
                await config.save((data) => {
                  data.user.promptFiles = data.user.promptFiles?.filter((_, i) => i !== index) || [];
                });
                setMessage(`✓ Removed "${fileName}"`);
                handleBackToCategory();
              }}
            />
          </Box>
        );
      }

      // Default prompt files view
      const promptFiles = config.getData().user.promptFiles || [...DEFAULT_PROMPT_FILES];
      
      const items = [
        { label: `Current: ${promptFiles.join(', ')}`, value: '__info__' },
        { label: '', value: '__separator__' },
        { label: '➕ Add a file', value: 'add' },
        { label: '🔄 Reorder files', value: 'reorder' },
        { label: '🗑️ Remove a file', value: 'remove' },
      ];
      
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="cyan">Prompt Files Configuration</Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor>First file found in cwd will be used (case-insensitive)</Text>
          </Box>
          {message && (
            <Box marginBottom={1}>
              <Text color="green">{message}</Text>
            </Box>
          )}
          <SelectInput
            items={items}
            isFocused={focusedPane === 1}
            onSelect={(item) => {
              if (item.value === '__info__' || item.value === '__separator__') {
                return;
              }
              if (item.value === 'add') {
                setSubView('add-prompt-file');
              } else if (item.value === 'reorder') {
                setSubView('reorder-prompt-files');
              } else if (item.value === 'remove') {
                setSubView('remove-prompt-file');
              }
              setFocusedPane(1);
            }}
          />
        </Box>
      );
    }

    // Memories
    if (selectedCategory === 'memories') {
      if (subView === 'add-memory') {
        return (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text bold color="cyan">What should I remember?</Text>
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
                    handleBackToCategory();
                  }
                }}
              />
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Enter to submit, ESC to go back</Text>
            </Box>
          </Box>
        );
      } else if (subView === 'delete-memory') {
        const memories = config.getData().user.memory;

        if (memories.length === 0) {
          setMessage('⚠ No memories to delete');
          handleBackToCategory();
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
              isFocused={focusedPane === 1}
              onSelect={(item) => {
                if (item.value === '__cancel__') {
                  handleBackToCategory();
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

      // Default memories view
      const memories = config.getData().user.memory;
      const items = [
        { label: '➕ Add a memory', value: 'add' },
        { label: '🗑️ Delete a memory', value: 'delete' },
      ];

      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="cyan">Your Memories ({memories.length})</Text>
          </Box>
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
              {memories.map((memory, index) => (
                <Box key={index} marginBottom={1} flexDirection="column">
                  <Text>
                    {index + 1}. {memory.text}
                  </Text>
                  <Text dimColor>   Added: {new Date(memory.created).toLocaleDateString()}</Text>
                </Box>
              ))}
            </Box>
          )}
          <SelectInput
            items={items}
            isFocused={focusedPane === 1}
            onSelect={(item) => {
              if (item.value === 'add') {
                setSubView('add-memory');
              } else if (item.value === 'delete') {
                setSubView('delete-memory');
              }
            }}
          />
        </Box>
      );
    }

    // Deletions
    if (selectedCategory === 'deletions') {
      if (subView === 'delete-assistant') {
        const assistants = config.getData().assistants;

        if (assistants.length === 0) {
          setMessage('⚠ No assistants to delete');
          handleBackToCategory();
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
              isFocused={focusedPane === 1}
              onSelect={(item) => {
                if (item.value === '__cancel__') {
                  handleBackToCategory();
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
      } else if (subView === 'delete-chat') {
        const chats = config.getChats();

        if (chats.length === 0) {
          setMessage('⚠ No chats to delete');
          handleBackToCategory();
          return null;
        }

        const items = [
          { label: '🗑️ Delete all chats', value: '__delete_all__' },
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
              isFocused={focusedPane === 1}
              onSelect={(item) => {
                if (item.value === '__cancel__') {
                  handleBackToCategory();
                  return;
                }
                if (item.value === '__separator__') {
                  return;
                }
                if (item.value === '__delete_all__') {
                  showConfirm(`Delete ALL ${chats.length} chat${chats.length !== 1 ? 's' : ''} and their messages?`, async () => {
                    for (const chat of chats) {
                      try {
                        await fs.unlink(getChatPath(chat.id));
                      } catch (error: any) {
                        if (error.code !== 'ENOENT') {
                          console.error('Failed to delete chat messages:', error.message);
                        }
                      }
                      await config.deleteChat(chat.id);
                    }
                    setMessage(`✓ All chats deleted`);
                  });
                  return;
                }

                setSelectedDeleteId(item.value);
                setSubView('delete-chat-options');
                setFocusedPane(2);
              }}
            />
          </Box>
        );
      } else if (subView === 'delete-type') {
        const types = config.getData().types;

        if (types.length === 0) {
          setMessage('⚠ No data types to delete');
          handleBackToCategory();
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
              isFocused={focusedPane === 1}
              onSelect={(item) => {
                if (item.value === '__cancel__') {
                  handleBackToCategory();
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

      // Default deletions view
      const items = [
        { label: '🗑️ Delete an assistant', value: 'delete-assistant' },
        { label: '🗑️ Delete a chat', value: 'delete-chat' },
        { label: '🗑️ Delete a data type', value: 'delete-type' },
      ];

      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="cyan">Deletion Options</Text>
          </Box>
          {message && (
            <Box marginBottom={1}>
              <Text color="green">{message}</Text>
            </Box>
          )}
          <SelectInput
            items={items}
            isFocused={focusedPane === 1}
            onSelect={(item) => {
              setSubView(item.value as SubView);
            }}
          />
        </Box>
      );
    }

    // Providers
    if (selectedCategory === 'providers') {
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
              isFocused={focusedPane === 1}
              onSelect={(item) => {
                if (item.value === '__back__') {
                  handleBackToCategory();
                  return;
                }
                if (item.value === 'remove') {
                  showConfirm(`Remove ${providerKey}?`, async () => {
                    await config.save((data) => {
                      data.providers[providerKey!] = null;
                    });
                    setMessage(`✓ ${providerKey} removed`);
                    handleBackToCategory();
                  });
                  return;
                }
                if (item.value === 'configure') {
                  if (providerKey === 'openrouter') {
                    setSubView('openrouter-settings');
                    setFocusedPane(2);
                  } else if (providerKey === 'aws') {
                    setSubView('aws-settings');
                    setFocusedPane(2);
                  }
                  return;
                }
                setProviderAction(item.value as 'update');
                setSubView('provider-input');
              }}
            />
          </Box>
        );
      } else if (subView === 'provider-input' && providerKey) {
        if (providerKey === 'aws') {
          return (
            <Box flexDirection="column">
              <Box marginBottom={1}>
                <Text bold color="cyan">AWS Bedrock Configuration</Text>
              </Box>
              <Box marginBottom={1} flexDirection="column">
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
                    isFocused={focusedPane === 1}
                    onSelect={async (item) => {
                      if (item.value === '__back__') {
                        setSubView('provider-action');
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
                        handleBackToCategory();
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
                        handleBackToCategory();
                      }
                    }}
                  />
                </Box>
              )}
            </Box>
          );
        }

        const links: Record<string, string> = {
          openai: 'https://platform.openai.com/api-keys',
          openrouter: 'https://openrouter.ai/settings/keys',
          replicate: 'https://replicate.com/account/api-tokens',
        };

        return (
          <Box flexDirection="column">
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
                    handleBackToCategory();
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

      // Default providers view
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
          <Box marginBottom={1}>
            <Text bold color="cyan">Manage Providers</Text>
          </Box>
          {message && (
            <Box marginBottom={1}>
              <Text color="green">{message}</Text>
            </Box>
          )}
          <SelectInput
            items={items}
            isFocused={focusedPane === 1}
            onSelect={(item) => {
              setProviderKey(item.value as keyof Providers);
              setSubView('provider-action');
            }}
          />
        </Box>
      );
    }

    // Tavily
    if (selectedCategory === 'tavily') {
      if (subView === 'tavily-input') {
        return (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text bold color="cyan">Enter Tavily API key:</Text>
            </Box>
            <Box marginBottom={1}>
              <Text dimColor>Get your key from: https://tavily.com</Text>
            </Box>
            <Box>
              <Text color="cyan">▶ </Text>
              <TextInput
                value={apiKeyInput}
                onChange={setApiKeyInput}
                placeholder="tvly-..."
                onSubmit={async () => {
                  if (apiKeyInput.trim()) {
                    await config.save((data) => {
                      data.tavily = { apiKey: apiKeyInput };
                    });
                    setMessage('✓ Tavily configured!');
                    handleBackToCategory();
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

      // Default tavily view
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
          <Box marginBottom={1}>
            <Text bold color="cyan">
              Tavily (Web Search) - {isConfigured ? 'Configured ✅' : 'Not configured ❌'}
            </Text>
          </Box>
          {message && (
            <Box marginBottom={1}>
              <Text color="green">{message}</Text>
            </Box>
          )}
          <SelectInput
            items={items}
            isFocused={focusedPane === 1}
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
              setSubView('tavily-input');
            }}
          />
        </Box>
      );
    }

    // Models
    if (selectedCategory === 'models') {
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
          embedding: ['embedding'],
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
          embedding: 'Embeddings',
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
              handleBackToCategory();
            }}
            onCancel={() => {
              setSelectedModelType(null);
              handleBackToCategory();
            }}
          />
        );
      }

      // Default models view
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
        { label: `✍️ Edit: ${currentModels.edit || '(none)'}`, value: 'edit' },
      ];

      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="cyan">Manage Models</Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor>Select a model type to configure:</Text>
          </Box>
          {message && (
            <Box marginBottom={1}>
              <Text color="green">{message}</Text>
            </Box>
          )}
          <SelectInput
            items={items}
            isFocused={focusedPane === 1}
            onSelect={(item) => {
              setSelectedModelType(item.value as ModelType);
              setSubView('select-model');
            }}
          />
        </Box>
      );
    }

    // Autonomous
    if (selectedCategory === 'autonomous') {
      if (subView === 'change-max-iterations') {
        return (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text bold color="cyan">Max autonomous iterations:</Text>
            </Box>
            <Box marginBottom={1}>
              <Text dimColor>How many times can I loop autonomously without approval? (min: 1)</Text>
            </Box>
            <Box>
              <Text color="cyan">▶ </Text>
              <TextInput
                value={maxIterationsInput}
                onChange={setMaxIterationsInput}
                placeholder={AUTONOMOUS.DEFAULT_MAX_ITERATIONS.toString()}
                onSubmit={async () => {
                  const value = parseInt(maxIterationsInput);
                  if (!isNaN(value) && value >= AUTONOMOUS.MIN_ITERATIONS) {
                    await config.save((data) => {
                      data.user.autonomous = data.user.autonomous || { maxIterations: AUTONOMOUS.DEFAULT_MAX_ITERATIONS, timeout: AUTONOMOUS.DEFAULT_TIMEOUT_MS };
                      data.user.autonomous.maxIterations = value;
                    });
                    setMessage(`✓ Max iterations updated to: ${value}`);
                    handleBackToCategory();
                  } else {
                    setInputError(`Please enter a number >= ${AUTONOMOUS.MIN_ITERATIONS}`);
                  }
                }}
              />
            </Box>
            {inputError && (
              <Box marginTop={1}>
                <Text color="red">{inputError}</Text>
              </Box>
            )}
            <Box marginTop={1}>
              <Text dimColor>Enter to submit, ESC to go back</Text>
            </Box>
          </Box>
        );
      } else if (subView === 'change-timeout') {
        return (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text bold color="cyan">Autonomous timeout (minutes):</Text>
            </Box>
            <Box marginBottom={1}>
              <Text dimColor>How many minutes can I run autonomously before timing out? (min: 1)</Text>
            </Box>
            <Box>
              <Text color="cyan">▶ </Text>
              <TextInput
                value={timeoutInput}
                onChange={setTimeoutInput}
                placeholder={Math.round(AUTONOMOUS.DEFAULT_TIMEOUT_MS / AUTONOMOUS.MS_PER_MINUTE).toString()}
                onSubmit={async () => {
                  const minutes = parseInt(timeoutInput);
                  const minMinutes = Math.ceil(AUTONOMOUS.MIN_TIMEOUT_MS / AUTONOMOUS.MS_PER_MINUTE);
                  if (!isNaN(minutes) && minutes >= minMinutes) {
                    const timeoutMs = minutes * AUTONOMOUS.MS_PER_MINUTE;
                    await config.save((data) => {
                      data.user.autonomous = data.user.autonomous || { maxIterations: AUTONOMOUS.DEFAULT_MAX_ITERATIONS, timeout: AUTONOMOUS.DEFAULT_TIMEOUT_MS };
                      data.user.autonomous.timeout = timeoutMs;
                    });
                    setMessage(`✓ Timeout updated to: ${minutes} minute${minutes !== 1 ? 's' : ''}`);
                    handleBackToCategory();
                  } else {
                    setInputError(`Please enter a number >= ${minMinutes}`);
                  }
                }}
              />
            </Box>
            {inputError && (
              <Box marginTop={1}>
                <Text color="red">{inputError}</Text>
              </Box>
            )}
            <Box marginTop={1}>
              <Text dimColor>Enter to submit, ESC to go back</Text>
            </Box>
          </Box>
        );
      }

      // Default autonomous view
      const maxIterations = config.getData().user.autonomous?.maxIterations ?? AUTONOMOUS.DEFAULT_MAX_ITERATIONS;
      const timeoutMinutes = Math.round((config.getData().user.autonomous?.timeout ?? AUTONOMOUS.DEFAULT_TIMEOUT_MS) / AUTONOMOUS.MS_PER_MINUTE);

      const items = [
        { label: `🔄 Max autonomous iterations: ${maxIterations}`, value: 'change-max-iterations' },
        { label: `⏱️ Autonomous timeout: ${timeoutMinutes}m`, value: 'change-timeout' },
      ];

      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="cyan">Autonomous Settings</Text>
          </Box>
          {message && (
            <Box marginBottom={1}>
              <Text color="green">{message}</Text>
            </Box>
          )}
          <SelectInput
            items={items}
            isFocused={focusedPane === 1}
            onSelect={(item) => {
              setSubView(item.value as SubView);
            }}
          />
        </Box>
      );
    }

    // Debug
    if (selectedCategory === 'debug') {
      const debugEnabled = config.getData().user.debug;

      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="cyan">Debug Settings</Text>
          </Box>
          {message && (
            <Box marginBottom={1}>
              <Text color="green">{message}</Text>
            </Box>
          )}
          <Box marginBottom={1}>
            <Text>Debug logging is currently: {debugEnabled ? '✅ Enabled' : '❌ Disabled'}</Text>
          </Box>
          <SelectInput
            items={[
              { label: debugEnabled ? 'Disable debug logging' : 'Enable debug logging', value: 'toggle' },
            ]}
            isFocused={focusedPane === 1}
            onSelect={async (item) => {
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

    return <Text>Unknown category</Text>;
  };

  // Render the right (third) panel for deeper navigation
  const renderRightPanel = () => {
    // OpenRouter Settings (third pane)
    if (subView === 'openrouter-settings') {
      const openrouter = config.getData().providers.openrouter;
      const zdrEnabled = openrouter?.defaultParams?.providers?.dataCollection === 'deny';

      const items = [
        { label: `🔒 Zero Data Retention (ZDR) ${zdrEnabled ? '✅' : '❌'}`, value: 'toggle-zdr' },
        { label: '← Back', value: '__back__' },
      ];

      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="magenta">OpenRouter Settings</Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor>Configure OpenRouter-specific options</Text>
          </Box>
          <SelectInput
            items={items}
            isFocused={focusedPane === 2}
            onSelect={async (item) => {
              if (item.value === '__back__') {
                setSubView('provider-action');
                setFocusedPane(1);
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
                setSubView('provider-action');
                setFocusedPane(1);
              }
            }}
          />
          <Box marginTop={1}>
            <Text dimColor>Zero Data Retention ensures your data is not stored by OpenRouter</Text>
          </Box>
        </Box>
      );
    }

    // AWS Settings (third pane)
    if (subView === 'aws-settings') {
      const aws = config.getData().providers.aws;
      const modelPrefix = aws?.modelPrefix || '(none)';

      const items = [
        { label: `🏷️ Model Prefix: ${modelPrefix}`, value: 'model-prefix' },
        { label: '← Back', value: '__back__' },
      ];

      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="magenta">AWS Bedrock Settings</Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor>Configure AWS Bedrock-specific options</Text>
          </Box>
          <SelectInput
            items={items}
            isFocused={focusedPane === 2}
            onSelect={async (item) => {
              if (item.value === '__back__') {
                setSubView('provider-action');
                setFocusedPane(1);
                return;
              }
              if (item.value === 'model-prefix') {
                setSubView('aws-model-prefix');
                return;
              }
            }}
          />
          <Box marginTop={1}>
            <Text dimColor>Model prefix is used for cross-region inference (e.g., 'us.', 'eu.')</Text>
          </Box>
        </Box>
      );
    }

    // AWS Model Prefix Input (third pane)
    if (subView === 'aws-model-prefix') {
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="magenta">AWS Model Prefix</Text>
          </Box>
          <Box marginBottom={1} flexDirection="column">
            <Text dimColor>Set a prefix for cross-region inference</Text>
            <Text dimColor>Common prefixes: 'us.', 'eu.', or leave empty for none</Text>
          </Box>
          <Box>
            <Text color="cyan">▶ </Text>
            <TextInput
              value={modelPrefixInput}
              onChange={setModelPrefixInput}
              placeholder="e.g., us. or eu."
              onSubmit={async () => {
                await config.save((data) => {
                  if (data.providers.aws) {
                    const trimmedValue = modelPrefixInput.trim();
                    if (trimmedValue) {
                      data.providers.aws.modelPrefix = trimmedValue;
                    } else {
                      delete data.providers.aws.modelPrefix;
                    }
                  }
                });
                const displayValue = modelPrefixInput.trim() || '(none)';
                setMessage(`✓ Model prefix set to: ${displayValue}`);
                setSubView('aws-settings');
              }}
            />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Enter to submit, ESC to go back</Text>
          </Box>
        </Box>
      );
    }

    // Delete Chat Options (third pane)
    if (subView === 'delete-chat-options') {
      const chats = config.getChats();
      const chat = chats.find((c) => c.id === selectedDeleteId);
      
      if (!chat) {
        setSubView('delete-chat');
        return null;
      }

      const chatIndex = chats.findIndex((c) => c.id === selectedDeleteId);
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
            <Text bold color="magenta">Delete: {abbreviate(chat.title, 50)}</Text>
          </Box>
          <SelectInput
            items={items}
            isFocused={focusedPane === 2}
            onSelect={(item) => {
              if (item.value === '__cancel__') {
                setSubView('delete-chat');
                setFocusedPane(1);
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
                  try {
                    await fs.unlink(getChatPath(chatToDelete.id));
                  } catch (error: any) {
                    if (error.code !== 'ENOENT') {
                      console.error('Failed to delete chat messages:', error.message);
                    }
                  }
                  await config.deleteChat(chatToDelete.id);
                }
                const deletedCount = deleteChats.length;
                setMessage(`✓ ${deletedCount} chat${deletedCount !== 1 ? 's' : ''} deleted`);
                
                const remainingChats = config.getChats();
                if (remainingChats.length === 0) {
                  handleBackToCategory();
                } else {
                  setSubView('delete-chat');
                  setFocusedPane(1);
                }
              });
            }}
          />
        </Box>
      );
    }

    return null;
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">
          Settings (Split View)
        </Text>
      </Box>

      <Box flexDirection="row">
        {/* Left panel: Categories */}
        <Box flexDirection="column" width="25%" borderStyle="round" borderColor={focusedPane === 0 ? "cyan" : "gray"} paddingX={1} marginRight={1}>
          <Box marginBottom={1}>
            <Text bold dimColor>Categories</Text>
          </Box>
          <SelectInput
            items={categoryItems}
            isFocused={focusedPane === 0}
            onSelect={(item) => {
              setSelectedCategory(item.value);
              setSubView('default');
              setMessage(null);
              setFocusedPane(1);
            }}
          />
          <Box marginTop={1}>
            <Text dimColor>Tab/Arrows to navigate</Text>
          </Box>
          <Box>
            <Text dimColor>Ctrl+C to exit</Text>
          </Box>
        </Box>

        {/* Middle panel: Options */}
        <Box flexDirection="column" width={shouldShowThirdPane() ? "35%" : "75%"} borderStyle="round" borderColor={focusedPane === 1 ? "cyan" : "gray"} paddingX={1} marginRight={1}>
          {renderMiddlePanel()}
        </Box>

        {/* Right panel: Sub-options (shown when needed) */}
        {shouldShowThirdPane() && (
          <Box flexDirection="column" width="40%" borderStyle="round" borderColor={focusedPane === 2 ? "cyan" : "gray"} paddingX={1}>
            {renderRightPanel()}
          </Box>
        )}
      </Box>
    </Box>
  );
};
