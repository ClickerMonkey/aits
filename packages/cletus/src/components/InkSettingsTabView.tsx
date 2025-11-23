import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import React, { useState, useEffect } from 'react';
import type { ConfigFile } from '../config';
import { logger } from '../logger';
import { AUTONOMOUS } from '../constants';

type Tab = 'user' | 'prompts' | 'memory' | 'deletions' | 'providers' | 'tavily' | 'models' | 'autonomous' | 'debug';

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

  useEffect(() => {
    process.stdout.write('\x1b]0;Cletus: Settings (Tab View)\x07');
    return () => {
      process.stdout.write('\x1b]0;Cletus\x07');
    };
  }, []);

  useInput((input, key) => {
    if (key.tab && !editing) {
      setFocusMode((prev) => (prev === 'tabs' ? 'content' : 'tabs'));
      return;
    }

    if (focusMode === 'tabs' && !editing) {
      const tabs: Tab[] = ['user', 'prompts', 'memory', 'deletions', 'providers', 'tavily', 'models', 'autonomous', 'debug'];
      const currentIndex = tabs.indexOf(activeTab);
      
      if (key.leftArrow && currentIndex > 0) {
        setActiveTab(tabs[currentIndex - 1]);
        return;
      }
      if (key.rightArrow && currentIndex < tabs.length - 1) {
        setActiveTab(tabs[currentIndex + 1]);
        return;
      }
    }

    if (key.ctrl && input === 'c') {
      if (editing) {
        setEditing(false);
        setEditField('');
        setEditValue('');
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

  const saveEdit = async () => {
    if (editField === 'name') {
      await config.save((data) => {
        data.user.name = editValue;
      });
      setMessage(`✓ Name updated to: ${editValue}`);
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
    }
    setEditing(false);
    setEditField('');
    setEditValue('');
  };

  const renderTabBar = () => {
    const tabs: Array<{ key: Tab; label: string }> = [
      { key: 'user', label: '👤 User' },
      { key: 'prompts', label: '📄 Prompts' },
      { key: 'memory', label: '💭 Memory' },
      { key: 'deletions', label: '🗑️ Delete' },
      { key: 'providers', label: '🔌 Providers' },
      { key: 'tavily', label: '🌐 Tavily' },
      { key: 'models', label: '🤖 Models' },
      { key: 'autonomous', label: '🔄 Auto' },
      { key: 'debug', label: '🐛 Debug' },
    ];

    return (
      <Box flexDirection="row" marginBottom={1}>
        {tabs.map((tab, index) => (
          <React.Fragment key={tab.key}>
            <Box
              borderStyle="round"
              borderColor={activeTab === tab.key ? 'cyan' : 'gray'}
              paddingX={1}
              marginRight={index < tabs.length - 1 ? 1 : 0}
            >
              <Text
                bold={activeTab === tab.key}
                color={activeTab === tab.key ? 'cyan' : undefined}
                dimColor={activeTab !== tab.key}
              >
                {tab.label}
              </Text>
            </Box>
          </React.Fragment>
        ))}
      </Box>
    );
  };

  const renderContent = () => {
    if (editing) {
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="cyan">Editing {editField}:</Text>
          </Box>
          <Box>
            <Text color="cyan">▶ </Text>
            <TextInput
              value={editValue}
              onChange={setEditValue}
              onSubmit={saveEdit}
            />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Enter to save, Ctrl+C to cancel</Text>
          </Box>
        </Box>
      );
    }

    if (activeTab === 'user') {
      const userData = config.getData().user;
      const items = [
        { label: `✏️ Change name (${userData.name})`, value: 'name' },
        { label: `✏️ Change pronouns (${userData.pronouns || '(none)'})`, value: 'pronouns' },
        { label: '📝 Change global prompt', value: 'globalPrompt' },
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

    if (activeTab === 'prompts') {
      const promptFiles = config.getData().user.promptFiles || ['cletus.md', 'agents.md', 'claude.md'];
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text>Current prompt files:</Text>
          </Box>
          {promptFiles.map((file, index) => (
            <Text key={index}>  {index + 1}. {file}</Text>
          ))}
          <Box marginTop={1}>
            <Text dimColor>First file found in cwd will be used</Text>
          </Box>
        </Box>
      );
    }

    if (activeTab === 'memory') {
      const memories = config.getData().user.memory;
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text>Total memories: {memories.length}</Text>
          </Box>
          {memories.length === 0 ? (
            <Text dimColor>No memories saved yet.</Text>
          ) : (
            memories.slice(0, 5).map((memory, index) => (
              <Box key={index} marginBottom={1}>
                <Text>{index + 1}. {memory.text.substring(0, 70)}...</Text>
              </Box>
            ))
          )}
          {memories.length > 5 && (
            <Text dimColor>... and {memories.length - 5} more</Text>
          )}
        </Box>
      );
    }

    if (activeTab === 'deletions') {
      const chats = config.getChats();
      const assistants = config.getData().assistants;
      const types = config.getData().types;
      return (
        <Box flexDirection="column">
          <Text>• {chats.length} chat(s)</Text>
          <Text>• {assistants.length} assistant(s)</Text>
          <Text>• {types.length} data type(s)</Text>
          <Box marginTop={1}>
            <Text dimColor>Deletion operations available in other menu views</Text>
          </Box>
        </Box>
      );
    }

    if (activeTab === 'providers') {
      const providers = config.getData().providers;
      return (
        <Box flexDirection="column">
          <Text>OpenAI: {providers.openai ? '✅' : '❌'}</Text>
          <Text>OpenRouter: {providers.openrouter ? '✅' : '❌'}</Text>
          <Text>Replicate: {providers.replicate ? '✅' : '❌'}</Text>
          <Text>AWS Bedrock: {providers.aws ? '✅' : '❌'}</Text>
          <Box marginTop={1}>
            <Text dimColor>Provider configuration available in other menu views</Text>
          </Box>
        </Box>
      );
    }

    if (activeTab === 'tavily') {
      const tavily = config.getData().tavily;
      return (
        <Box flexDirection="column">
          <Text>Status: {tavily ? '✅ Configured' : '❌ Not configured'}</Text>
          <Box marginTop={1}>
            <Text dimColor>Tavily configuration available in other menu views</Text>
          </Box>
        </Box>
      );
    }

    if (activeTab === 'models') {
      const currentModels = config.getData().user.models || {};
      return (
        <Box flexDirection="column">
          <Text>Chat model: {currentModels.chat || '(none)'}</Text>
          <Text>Image generation: {currentModels.imageGenerate || '(none)'}</Text>
          <Text>Image analysis: {currentModels.imageAnalyze || '(none)'}</Text>
          <Box marginTop={1}>
            <Text dimColor>Model configuration available in other menu views</Text>
          </Box>
        </Box>
      );
    }

    if (activeTab === 'autonomous') {
      const maxIterations = config.getData().user.autonomous?.maxIterations ?? AUTONOMOUS.DEFAULT_MAX_ITERATIONS;
      const timeoutMinutes = Math.round((config.getData().user.autonomous?.timeout ?? AUTONOMOUS.DEFAULT_TIMEOUT_MS) / AUTONOMOUS.MS_PER_MINUTE);

      const items = [
        { label: `🔄 Max iterations: ${maxIterations}`, value: 'maxIterations' },
        { label: `⏱️ Timeout: ${timeoutMinutes}m`, value: 'timeout' },
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

      <Box borderStyle="round" borderColor="cyan" padding={1}>
        {renderContent()}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Tab to switch focus • ←→ to navigate tabs • ↑↓ for items • Ctrl+C to exit
        </Text>
      </Box>
    </Box>
  );
};
