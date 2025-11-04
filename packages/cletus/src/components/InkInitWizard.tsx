import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import React, { useState, useEffect } from 'react';
import { ConfigFile } from '../config.js';
import { KnowledgeFile } from '../knowledge.js';
import type { Providers } from '../schemas.js';

type WizardStep =
  | 'openai-env'
  | 'openai-confirm'
  | 'openai-input'
  | 'openrouter-env'
  | 'openrouter-confirm'
  | 'openrouter-input'
  | 'replicate-env'
  | 'replicate-confirm'
  | 'replicate-input'
  | 'user-name'
  | 'user-pronouns'
  | 'user-memory'
  | 'complete';

interface InkInitWizardProps {
  onComplete: (config: ConfigFile) => void;
}

export const InkInitWizard: React.FC<InkInitWizardProps> = ({ onComplete }) => {
  const [step, setStep] = useState<WizardStep>('openai-env');
  const [providers, setProviders] = useState<Providers>({
    openai: null,
    openrouter: null,
    replicate: null,
  });
  const [name, setName] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [memory, setMemory] = useState('');

  // Input states for all steps (moved to top level to avoid hooks violations)
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Set terminal title
  useEffect(() => {
    process.stdout.write('\x1b]0;Cletus: Setup\x07');
    return () => {
      process.stdout.write('\x1b]0;Cletus\x07');
    };
  }, []);

  // Check environment variables
  const openaiKey = process.env.OPENAI_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const replicateKey = process.env.REPLICATE_API_KEY;

  // Reset input states when step changes
  React.useEffect(() => {
    setApiKey('');
    setError(null);
  }, [step]);

  // OpenAI - Environment Key Detected
  if (step === 'openai-env' && openaiKey) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Welcome to Cletus! Let's get you set up.
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text>OpenAI API key detected in environment. Use it?</Text>
        </Box>
        <SelectInput
          items={[
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
          ]}
          onSelect={(item) => {
            if (item.value === 'yes') {
              setProviders({ ...providers, openai: { apiKey: openaiKey } });
            }
            setStep(openrouterKey ? 'openrouter-env' : 'openrouter-confirm');
          }}
        />
      </Box>
    );
  }

  // OpenAI - Ask to Configure
  if (step === 'openai-env' && !openaiKey) {
    setStep('openai-confirm');
  }

  if (step === 'openai-confirm') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Welcome to Cletus! Let's get you set up.
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text>Would you like to configure OpenAI?</Text>
        </Box>
        <SelectInput
          items={[
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
          ]}
          onSelect={(item) => {
            if (item.value === 'yes') {
              setStep('openai-input');
            } else {
              setStep(openrouterKey ? 'openrouter-env' : 'openrouter-confirm');
            }
          }}
        />
      </Box>
    );
  }

  // OpenAI - Input API Key
  if (step === 'openai-input') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            OpenAI Setup
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>Get your API key from: https://platform.openai.com/api-keys</Text>
          <Text dimColor>Note: You'll need to create an account and add credits to use OpenAI.</Text>
        </Box>
        <Box>
          <Text color="cyan">▶ </Text>
          <TextInput
            value={apiKey}
            onChange={(value) => {
              setApiKey(value);
              setError(null);
            }}
            placeholder="sk-..."
            onSubmit={() => {
              if (!apiKey) {
                setError('API key is required');
                return;
              }
              if (!apiKey.startsWith('sk-')) {
                setError('OpenAI API keys start with sk-');
                return;
              }
              setProviders({ ...providers, openai: { apiKey } });
              setStep(openrouterKey ? 'openrouter-env' : 'openrouter-confirm');
            }}
          />
        </Box>
        {error && (
          <Box marginTop={1}>
            <Text color="red">{error}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text dimColor>Enter to continue, ESC to skip</Text>
        </Box>
      </Box>
    );
  }

  // OpenRouter - Environment Key Detected
  if (step === 'openrouter-env' && openrouterKey) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text>OpenRouter API key detected in environment. Use it?</Text>
        </Box>
        <SelectInput
          items={[
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
          ]}
          onSelect={(item) => {
            if (item.value === 'yes') {
              setProviders({ ...providers, openrouter: { apiKey: openrouterKey } });
            }
            setStep(replicateKey ? 'replicate-env' : 'replicate-confirm');
          }}
        />
      </Box>
    );
  }

  // OpenRouter - Ask to Configure
  if (step === 'openrouter-env' && !openrouterKey) {
    setStep('openrouter-confirm');
  }

  if (step === 'openrouter-confirm') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text>Would you like to configure OpenRouter?</Text>
        </Box>
        <SelectInput
          items={[
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
          ]}
          onSelect={(item) => {
            if (item.value === 'yes') {
              setStep('openrouter-input');
            } else {
              setStep(replicateKey ? 'replicate-env' : 'replicate-confirm');
            }
          }}
        />
      </Box>
    );
  }

  // OpenRouter - Input API Key
  if (step === 'openrouter-input') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            OpenRouter Setup
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>Get your API key from: https://openrouter.ai/settings/keys</Text>
          <Text dimColor>Note: You'll need to create an account and add credits.</Text>
        </Box>
        <Box>
          <Text color="cyan">▶ </Text>
          <TextInput
            value={apiKey}
            onChange={(value) => {
              setApiKey(value);
              setError(null);
            }}
            placeholder="sk-or-..."
            onSubmit={() => {
              if (!apiKey) {
                setError('API key is required');
                return;
              }
              setProviders({ ...providers, openrouter: { apiKey } });
              setStep(replicateKey ? 'replicate-env' : 'replicate-confirm');
            }}
          />
        </Box>
        {error && (
          <Box marginTop={1}>
            <Text color="red">{error}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text dimColor>Enter to continue, ESC to skip</Text>
        </Box>
      </Box>
    );
  }

  // Replicate - Environment Key Detected
  if (step === 'replicate-env' && replicateKey) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text>Replicate API key detected in environment. Use it?</Text>
        </Box>
        <SelectInput
          items={[
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
          ]}
          onSelect={(item) => {
            if (item.value === 'yes') {
              setProviders({ ...providers, replicate: { apiKey: replicateKey } });
            }
            setStep('user-name');
          }}
        />
      </Box>
    );
  }

  // Replicate - Ask to Configure
  if (step === 'replicate-env' && !replicateKey) {
    setStep('replicate-confirm');
  }

  if (step === 'replicate-confirm') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text>Would you like to configure Replicate?</Text>
        </Box>
        <SelectInput
          items={[
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
          ]}
          onSelect={(item) => {
            if (item.value === 'yes') {
              setStep('replicate-input');
            } else {
              setStep('user-name');
            }
          }}
        />
      </Box>
    );
  }

  // Replicate - Input API Key
  if (step === 'replicate-input') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Replicate Setup
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>Get your API key from: https://replicate.com/account/api-tokens</Text>
          <Text dimColor>Note: You'll need to create an account and add credits.</Text>
        </Box>
        <Box>
          <Text color="cyan">▶ </Text>
          <TextInput
            value={apiKey}
            onChange={(value) => {
              setApiKey(value);
              setError(null);
            }}
            placeholder="r8_..."
            onSubmit={() => {
              if (!apiKey) {
                setError('API key is required');
                return;
              }
              setProviders({ ...providers, replicate: { apiKey } });
              setStep('user-name');
            }}
          />
        </Box>
        {error && (
          <Box marginTop={1}>
            <Text color="red">{error}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text dimColor>Enter to continue, ESC to skip</Text>
        </Box>
      </Box>
    );
  }

  // User Name
  if (step === 'user-name') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            What is your name?
          </Text>
        </Box>
        <Box>
          <Text color="cyan">▶ </Text>
          <TextInput
            value={name}
            onChange={(value) => {
              setName(value);
              setError(null);
            }}
            placeholder="Your name"
            onSubmit={() => {
              if (!name.trim()) {
                setError('Name is required');
                return;
              }
              setStep('user-pronouns');
            }}
          />
        </Box>
        {error && (
          <Box marginTop={1}>
            <Text color="red">{error}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text dimColor>Enter to continue</Text>
        </Box>
      </Box>
    );
  }

  // User Pronouns
  if (step === 'user-pronouns') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            What are your pronouns? (optional)
          </Text>
        </Box>
        <Box>
          <Text color="cyan">▶ </Text>
          <TextInput
            value={pronouns}
            onChange={setPronouns}
            placeholder="e.g., he/him, she/her, they/them"
            onSubmit={() => {
              setStep('user-memory');
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter to continue, ESC to skip</Text>
        </Box>
      </Box>
    );
  }

  // User Memory
  if (step === 'user-memory') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Is there anything we should always remember when talking to you? (optional)
          </Text>
        </Box>
        <Box>
          <Text color="cyan">▶ </Text>
          <TextInput
            value={memory}
            onChange={setMemory}
            placeholder="e.g., I prefer concise responses"
            onSubmit={async () => {
              // Create config file
              const config = new ConfigFile();
              await config.save((data) => {
                data.user.name = name;
                data.user.pronouns = pronouns;
                if (memory.trim()) {
                  data.user.memory.push({
                    text: memory,
                    created: Date.now(),
                  });
                }
                data.providers = providers;
              });

              // Create knowledge file
              const knowledge = new KnowledgeFile();
              await knowledge.save(() => {
                // Initialize with empty knowledge
              });

              setStep('complete');

              // Small delay then call onComplete
              setTimeout(() => {
                onComplete(config);
              }, 1000);
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter to complete setup</Text>
        </Box>
      </Box>
    );
  }

  // Complete
  if (step === 'complete') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="green">
            ✓ Setup complete!
          </Text>
        </Box>
        <Box>
          <Text>Welcome, {name}! Cletus is ready to help you.</Text>
        </Box>
      </Box>
    );
  }

  return null;
};
