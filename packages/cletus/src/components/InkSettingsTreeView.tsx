import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import React, { useState, useEffect } from 'react';
import type { ConfigFile } from '../config';
import { logger } from '../logger';
import { AUTONOMOUS } from '../constants';

interface TreeNode {
  id: string;
  label: string;
  level: number;
  isExpanded: boolean;
  hasChildren: boolean;
  action?: string;
  parent?: string;
}

interface InkSettingsTreeViewProps {
  config: ConfigFile;
  onExit: () => void;
}

export const InkSettingsTreeView: React.FC<InkSettingsTreeViewProps> = ({ config, onExit }) => {
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [focusPane, setFocusPane] = useState<'tree' | 'details'>('tree');

  // Initialize tree structure
  useEffect(() => {
    buildTree();
  }, []);

  useEffect(() => {
    process.stdout.write('\x1b]0;Cletus: Settings (Tree View)\x07');
    return () => {
      process.stdout.write('\x1b]0;Cletus\x07');
    };
  }, []);

  const buildTree = () => {
    const nodes: TreeNode[] = [
      { id: 'user', label: '👤 User Profile', level: 0, isExpanded: true, hasChildren: true },
      { id: 'user-name', label: 'Name', level: 1, isExpanded: false, hasChildren: false, action: 'edit-name', parent: 'user' },
      { id: 'user-pronouns', label: 'Pronouns', level: 1, isExpanded: false, hasChildren: false, action: 'edit-pronouns', parent: 'user' },
      { id: 'user-prompt', label: 'Global Prompt', level: 1, isExpanded: false, hasChildren: false, action: 'edit-prompt', parent: 'user' },
      
      { id: 'prompts', label: '📄 Prompt Files', level: 0, isExpanded: false, hasChildren: true },
      { id: 'prompts-list', label: 'View Files', level: 1, isExpanded: false, hasChildren: false, action: 'view-prompts', parent: 'prompts' },
      
      { id: 'memory', label: '💭 Memories', level: 0, isExpanded: false, hasChildren: true },
      { id: 'memory-view', label: 'View Memories', level: 1, isExpanded: false, hasChildren: false, action: 'view-memories', parent: 'memory' },
      
      { id: 'deletions', label: '🗑️ Deletions', level: 0, isExpanded: false, hasChildren: true },
      { id: 'deletions-chats', label: 'Chats', level: 1, isExpanded: false, hasChildren: false, action: 'view-chats', parent: 'deletions' },
      { id: 'deletions-assistants', label: 'Assistants', level: 1, isExpanded: false, hasChildren: false, action: 'view-assistants', parent: 'deletions' },
      { id: 'deletions-types', label: 'Data Types', level: 1, isExpanded: false, hasChildren: false, action: 'view-types', parent: 'deletions' },
      
      { id: 'providers', label: '🔌 Providers', level: 0, isExpanded: false, hasChildren: true },
      { id: 'providers-openai', label: 'OpenAI', level: 1, isExpanded: false, hasChildren: false, action: 'view-openai', parent: 'providers' },
      { id: 'providers-openrouter', label: 'OpenRouter', level: 1, isExpanded: false, hasChildren: false, action: 'view-openrouter', parent: 'providers' },
      { id: 'providers-replicate', label: 'Replicate', level: 1, isExpanded: false, hasChildren: false, action: 'view-replicate', parent: 'providers' },
      { id: 'providers-aws', label: 'AWS Bedrock', level: 1, isExpanded: false, hasChildren: false, action: 'view-aws', parent: 'providers' },
      
      { id: 'tavily', label: '🌐 Tavily', level: 0, isExpanded: false, hasChildren: false, action: 'view-tavily' },
      
      { id: 'models', label: '🤖 Models', level: 0, isExpanded: false, hasChildren: true },
      { id: 'models-chat', label: 'Chat Model', level: 1, isExpanded: false, hasChildren: false, action: 'view-models-chat', parent: 'models' },
      { id: 'models-image', label: 'Image Models', level: 1, isExpanded: false, hasChildren: false, action: 'view-models-image', parent: 'models' },
      
      { id: 'autonomous', label: '🔄 Autonomous', level: 0, isExpanded: false, hasChildren: true },
      { id: 'autonomous-iterations', label: 'Max Iterations', level: 1, isExpanded: false, hasChildren: false, action: 'edit-iterations', parent: 'autonomous' },
      { id: 'autonomous-timeout', label: 'Timeout', level: 1, isExpanded: false, hasChildren: false, action: 'edit-timeout', parent: 'autonomous' },
      
      { id: 'debug', label: '🐛 Debug', level: 0, isExpanded: false, hasChildren: false, action: 'toggle-debug' },
    ];
    
    setTreeNodes(nodes);
    if (nodes.length > 0) {
      setSelectedNode(nodes[0]);
    }
  };

  const toggleNode = (nodeId: string) => {
    setTreeNodes(prevNodes => 
      prevNodes.map(node => 
        node.id === nodeId ? { ...node, isExpanded: !node.isExpanded } : node
      )
    );
  };

  const getVisibleNodes = () => {
    const visible: TreeNode[] = [];
    
    for (const node of treeNodes) {
      if (node.level === 0) {
        visible.push(node);
      } else {
        // Check if parent is expanded
        const parent = treeNodes.find(n => n.id === node.parent);
        if (parent && parent.isExpanded) {
          visible.push(node);
        }
      }
    }
    
    return visible;
  };

  useInput((input, key) => {
    if (key.tab && !editing) {
      setFocusPane(prev => prev === 'tree' ? 'details' : 'tree');
      return;
    }

    if (focusPane === 'tree' && !editing) {
      if (key.return && selectedNode) {
        if (selectedNode.hasChildren) {
          toggleNode(selectedNode.id);
        } else if (selectedNode.action) {
          // Do nothing, details pane handles actions
        }
      }

      // Use [ and ] keys to expand/collapse
      if (input === '[' && selectedNode && selectedNode.hasChildren && selectedNode.isExpanded) {
        toggleNode(selectedNode.id);
      }
      if (input === ']' && selectedNode && selectedNode.hasChildren && !selectedNode.isExpanded) {
        toggleNode(selectedNode.id);
      }
    }

    if (key.ctrl && input === 'c') {
      if (editing) {
        setEditing(false);
        setEditValue('');
      } else {
        onExit();
      }
    }
  });

  const startEdit = (action: string, currentValue: string) => {
    setEditValue(currentValue);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!selectedNode) return;

    if (selectedNode.action === 'edit-name') {
      await config.save((data) => {
        data.user.name = editValue;
      });
      setMessage(`✓ Name updated to: ${editValue}`);
    } else if (selectedNode.action === 'edit-pronouns') {
      await config.save((data) => {
        data.user.pronouns = editValue;
      });
      setMessage(`✓ Pronouns updated`);
    } else if (selectedNode.action === 'edit-prompt') {
      await config.save((data) => {
        data.user.globalPrompt = editValue;
      });
      setMessage(`✓ Global prompt updated`);
    } else if (selectedNode.action === 'edit-iterations') {
      const value = parseInt(editValue);
      if (!isNaN(value) && value >= AUTONOMOUS.MIN_ITERATIONS) {
        await config.save((data) => {
          data.user.autonomous = data.user.autonomous || { maxIterations: AUTONOMOUS.DEFAULT_MAX_ITERATIONS, timeout: AUTONOMOUS.DEFAULT_TIMEOUT_MS };
          data.user.autonomous.maxIterations = value;
        });
        setMessage(`✓ Max iterations updated to: ${value}`);
      } else {
        setMessage(`⚠ Invalid value`);
      }
    } else if (selectedNode.action === 'edit-timeout') {
      const minutes = parseInt(editValue);
      const minMinutes = Math.ceil(AUTONOMOUS.MIN_TIMEOUT_MS / AUTONOMOUS.MS_PER_MINUTE);
      if (!isNaN(minutes) && minutes >= minMinutes) {
        const timeoutMs = minutes * AUTONOMOUS.MS_PER_MINUTE;
        await config.save((data) => {
          data.user.autonomous = data.user.autonomous || { maxIterations: AUTONOMOUS.DEFAULT_MAX_ITERATIONS, timeout: AUTONOMOUS.DEFAULT_TIMEOUT_MS };
          data.user.autonomous.timeout = timeoutMs;
        });
        setMessage(`✓ Timeout updated to: ${minutes}m`);
      } else {
        setMessage(`⚠ Invalid value`);
      }
    }

    setEditing(false);
    setEditValue('');
  };

  const renderTreePane = () => {
    const visibleNodes = getVisibleNodes();
    const items = visibleNodes.map(node => {
      const indent = '  '.repeat(node.level);
      const expandIndicator = node.hasChildren ? (node.isExpanded ? '[-] ' : '[+] ') : '';
      return {
        label: `${indent}${expandIndicator}${node.label}`,
        value: node.id,
      };
    });

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold dimColor>Settings Tree</Text>
        </Box>
        <SelectInput
          items={items}
          isFocused={focusPane === 'tree'}
          onSelect={(item) => {
            const node = treeNodes.find(n => n.id === item.value);
            if (node) {
              setSelectedNode(node);
              setFocusPane('details');
            }
          }}
        />
        <Box marginTop={1}>
          <Text dimColor>[ ] to expand/collapse</Text>
        </Box>
      </Box>
    );
  };

  const renderDetailsPane = () => {
    if (!selectedNode) {
      return <Text dimColor>Select an item from the tree</Text>;
    }

    if (editing) {
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="cyan">Editing {selectedNode.label}:</Text>
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

    if (selectedNode.action === 'edit-name') {
      const userData = config.getData().user;
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Name</Text>
          </Box>
          <Text>Current: {userData.name}</Text>
          {message && (
            <Box marginTop={1}>
              <Text color="green">{message}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <SelectInput
              items={[{ label: 'Edit name', value: 'edit' }]}
              isFocused={focusPane === 'details'}
              onSelect={() => startEdit('edit-name', userData.name)}
            />
          </Box>
        </Box>
      );
    }

    if (selectedNode.action === 'edit-pronouns') {
      const userData = config.getData().user;
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Pronouns</Text>
          </Box>
          <Text>Current: {userData.pronouns || '(none)'}</Text>
          {message && (
            <Box marginTop={1}>
              <Text color="green">{message}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <SelectInput
              items={[{ label: 'Edit pronouns', value: 'edit' }]}
              isFocused={focusPane === 'details'}
              onSelect={() => startEdit('edit-pronouns', userData.pronouns || '')}
            />
          </Box>
        </Box>
      );
    }

    if (selectedNode.action === 'edit-prompt') {
      const userData = config.getData().user;
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Global Prompt</Text>
          </Box>
          <Text>{userData.globalPrompt || '(none)'}</Text>
          {message && (
            <Box marginTop={1}>
              <Text color="green">{message}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <SelectInput
              items={[{ label: 'Edit global prompt', value: 'edit' }]}
              isFocused={focusPane === 'details'}
              onSelect={() => startEdit('edit-prompt', userData.globalPrompt || '')}
            />
          </Box>
        </Box>
      );
    }

    if (selectedNode.action === 'view-prompts') {
      const promptFiles = config.getData().user.promptFiles || ['cletus.md', 'agents.md', 'claude.md'];
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Prompt Files</Text>
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

    if (selectedNode.action === 'view-memories') {
      const memories = config.getData().user.memory;
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Memories ({memories.length})</Text>
          </Box>
          {memories.length === 0 ? (
            <Text dimColor>No memories saved yet</Text>
          ) : (
            memories.slice(0, 5).map((memory, index) => (
              <Box key={index} marginBottom={1}>
                <Text>{index + 1}. {memory.text.substring(0, 60)}...</Text>
              </Box>
            ))
          )}
          {memories.length > 5 && (
            <Text dimColor>... and {memories.length - 5} more</Text>
          )}
        </Box>
      );
    }

    if (selectedNode.action === 'view-chats') {
      const chats = config.getChats();
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Chats</Text>
          </Box>
          <Text>Total: {chats.length}</Text>
          <Box marginTop={1}>
            <Text dimColor>Chat deletion available in other menu views</Text>
          </Box>
        </Box>
      );
    }

    if (selectedNode.action === 'view-assistants') {
      const assistants = config.getData().assistants;
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Assistants</Text>
          </Box>
          <Text>Total: {assistants.length}</Text>
          {assistants.slice(0, 5).map((assistant, index) => (
            <Text key={index}>  • {assistant.name}</Text>
          ))}
        </Box>
      );
    }

    if (selectedNode.action === 'view-types') {
      const types = config.getData().types;
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Data Types</Text>
          </Box>
          <Text>Total: {types.length}</Text>
          {types.slice(0, 5).map((type, index) => (
            <Text key={index}>  • {type.friendlyName}</Text>
          ))}
        </Box>
      );
    }

    if (selectedNode.action?.startsWith('view-') && selectedNode.parent === 'providers') {
      const providers = config.getData().providers;
      const providerName = selectedNode.action.replace('view-', '');
      const isConfigured = providers[providerName as keyof typeof providers] !== null;
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>{selectedNode.label}</Text>
          </Box>
          <Text>Status: {isConfigured ? '✅ Configured' : '❌ Not configured'}</Text>
          <Box marginTop={1}>
            <Text dimColor>Configuration available in other menu views</Text>
          </Box>
        </Box>
      );
    }

    if (selectedNode.action === 'view-tavily') {
      const tavily = config.getData().tavily;
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Tavily Web Search</Text>
          </Box>
          <Text>Status: {tavily ? '✅ Configured' : '❌ Not configured'}</Text>
          <Box marginTop={1}>
            <Text dimColor>Configuration available in other menu views</Text>
          </Box>
        </Box>
      );
    }

    if (selectedNode.action?.startsWith('view-models')) {
      const currentModels = config.getData().user.models || {};
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>{selectedNode.label}</Text>
          </Box>
          {selectedNode.action === 'view-models-chat' && (
            <Text>Current: {currentModels.chat || '(none)'}</Text>
          )}
          {selectedNode.action === 'view-models-image' && (
            <>
              <Text>Generation: {currentModels.imageGenerate || '(none)'}</Text>
              <Text>Analysis: {currentModels.imageAnalyze || '(none)'}</Text>
            </>
          )}
          <Box marginTop={1}>
            <Text dimColor>Model configuration available in other menu views</Text>
          </Box>
        </Box>
      );
    }

    if (selectedNode.action === 'edit-iterations') {
      const maxIterations = config.getData().user.autonomous?.maxIterations ?? AUTONOMOUS.DEFAULT_MAX_ITERATIONS;
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Max Autonomous Iterations</Text>
          </Box>
          <Text>Current: {maxIterations}</Text>
          {message && (
            <Box marginTop={1}>
              <Text color="green">{message}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <SelectInput
              items={[{ label: 'Edit max iterations', value: 'edit' }]}
              isFocused={focusPane === 'details'}
              onSelect={() => startEdit('edit-iterations', maxIterations.toString())}
            />
          </Box>
        </Box>
      );
    }

    if (selectedNode.action === 'edit-timeout') {
      const timeoutMinutes = Math.round((config.getData().user.autonomous?.timeout ?? AUTONOMOUS.DEFAULT_TIMEOUT_MS) / AUTONOMOUS.MS_PER_MINUTE);
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Autonomous Timeout</Text>
          </Box>
          <Text>Current: {timeoutMinutes} minutes</Text>
          {message && (
            <Box marginTop={1}>
              <Text color="green">{message}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <SelectInput
              items={[{ label: 'Edit timeout', value: 'edit' }]}
              isFocused={focusPane === 'details'}
              onSelect={() => startEdit('edit-timeout', timeoutMinutes.toString())}
            />
          </Box>
        </Box>
      );
    }

    if (selectedNode.action === 'toggle-debug') {
      const debugEnabled = config.getData().user.debug;
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Debug Settings</Text>
          </Box>
          <Text>Status: {debugEnabled ? '✅ Enabled' : '❌ Disabled'}</Text>
          {message && (
            <Box marginTop={1}>
              <Text color="green">{message}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <SelectInput
              items={[{ label: debugEnabled ? 'Disable debug' : 'Enable debug', value: 'toggle' }]}
              isFocused={focusPane === 'details'}
              onSelect={async () => {
                await config.save((cfg) => {
                  cfg.user.debug = !cfg.user.debug;
                });
                const enabled = config.getData().user.debug;
                logger.setDebug(enabled);
                setMessage(`✓ Debug ${enabled ? 'enabled' : 'disabled'}`);
              }}
            />
          </Box>
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>{selectedNode.label}</Text>
        </Box>
        {selectedNode.hasChildren ? (
          <Text dimColor>Select a sub-item from the tree</Text>
        ) : (
          <Text dimColor>No details available</Text>
        )}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">
          Settings (Tree View)
        </Text>
      </Box>

      <Box flexDirection="row">
        {/* Left: Tree */}
        <Box flexDirection="column" width="40%" borderStyle="round" borderColor={focusPane === 'tree' ? 'cyan' : 'gray'} paddingX={1} marginRight={1}>
          {renderTreePane()}
        </Box>

        {/* Right: Details */}
        <Box flexDirection="column" width="58%" borderStyle="round" borderColor={focusPane === 'details' ? 'cyan' : 'gray'} paddingX={1}>
          {renderDetailsPane()}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Tab to switch panes • [ ] to expand/collapse • ↑↓ to navigate • Ctrl+C to exit
        </Text>
      </Box>
    </Box>
  );
};
