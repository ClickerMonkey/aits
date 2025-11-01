import * as clack from '@clack/prompts';
import { ConfigFile } from './config.js';
import { KnowledgeFile } from './knowledge.js';
import type { Providers } from './schemas.js';

/**
 * Run the initialization wizard to create config
 */
export async function initWizard(): Promise<ConfigFile> {
  clack.intro('Welcome to Cletus! Let\'s get you set up.');

  // Check environment variables for API keys
  const openaiKey = process.env.OPENAI_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const replicateKey = process.env.REPLICATE_API_KEY;

  const providers: Providers = {
    openai: null,
    openrouter: null,
    replicate: null,
  };

  // OpenAI setup
  if (openaiKey) {
    const useOpenAI = await clack.confirm({
      message: `OpenAI API key detected in environment. Use it?`,
      initialValue: true,
    });

    if (clack.isCancel(useOpenAI)) {
      clack.cancel('Setup cancelled');
      process.exit(0);
    }

    if (useOpenAI) {
      providers.openai = { apiKey: openaiKey };
    }
  }

  if (!providers.openai) {
    const enterOpenAI = await clack.confirm({
      message: 'Would you like to configure OpenAI?',
      initialValue: true,
    });

    if (clack.isCancel(enterOpenAI)) {
      clack.cancel('Setup cancelled');
      process.exit(0);
    }

    if (enterOpenAI) {
      clack.note(
        'Get your API key from: \x1b]8;;https://platform.openai.com/api-keys\x1b\\https://platform.openai.com/api-keys\x1b]8;;\x1b\\\n\nNote: You\'ll need to create an account and add credits to use OpenAI.',
        'OpenAI Setup'
      );

      const apiKey = await clack.text({
        message: 'Enter your OpenAI API key:',
        placeholder: 'sk-...',
        validate: (value) => {
          if (!value) return 'API key is required';
          if (!value.startsWith('sk-')) return 'OpenAI API keys start with sk-';
        },
      });

      if (clack.isCancel(apiKey)) {
        clack.cancel('Setup cancelled');
        process.exit(0);
      }

      providers.openai = { apiKey };
    }
  }

  // OpenRouter setup
  if (openrouterKey) {
    const useOpenRouter = await clack.confirm({
      message: `OpenRouter API key detected in environment. Use it?`,
      initialValue: false,
    });

    if (clack.isCancel(useOpenRouter)) {
      clack.cancel('Setup cancelled');
      process.exit(0);
    }

    if (useOpenRouter) {
      providers.openrouter = { apiKey: openrouterKey };
    }
  } else {
    const enterOpenRouter = await clack.confirm({
      message: 'Would you like to configure OpenRouter?',
      initialValue: false,
    });

    if (clack.isCancel(enterOpenRouter)) {
      clack.cancel('Setup cancelled');
      process.exit(0);
    }

    if (enterOpenRouter) {
      clack.note(
        'Get your API key from: \x1b]8;;https://openrouter.ai/settings/keys\x1b\\https://openrouter.ai/settings/keys\x1b]8;;\x1b\\\n\nNote: You\'ll need to create an account and add credits to use OpenRouter.',
        'OpenRouter Setup'
      );

      const apiKey = await clack.text({
        message: 'Enter your OpenRouter API key:',
        placeholder: 'sk-or-...',
        validate: (value) => {
          if (!value) return 'API key is required';
        },
      });

      if (clack.isCancel(apiKey)) {
        clack.cancel('Setup cancelled');
        process.exit(0);
      }

      providers.openrouter = { apiKey: apiKey as string };
    }
  }

  // Replicate setup
  if (replicateKey) {
    const useReplicate = await clack.confirm({
      message: `Replicate API key detected in environment. Use it?`,
      initialValue: false,
    });

    if (clack.isCancel(useReplicate)) {
      clack.cancel('Setup cancelled');
      process.exit(0);
    }

    if (useReplicate) {
      providers.replicate = { apiKey: replicateKey };
    }
  } else {
    const enterReplicate = await clack.confirm({
      message: 'Would you like to configure Replicate?',
      initialValue: false,
    });

    if (clack.isCancel(enterReplicate)) {
      clack.cancel('Setup cancelled');
      process.exit(0);
    }

    if (enterReplicate) {
      clack.note(
        'Get your API key from: \x1b]8;;https://replicate.com/account/api-tokens\x1b\\https://replicate.com/account/api-tokens\x1b]8;;\x1b\\\n\nNote: You\'ll need to create an account and add credits to use Replicate.',
        'Replicate Setup'
      );

      const apiKey = await clack.text({
        message: 'Enter your Replicate API key:',
        placeholder: 'r8_...',
        validate: (value) => {
          if (!value) return 'API key is required';
        },
      });

      if (clack.isCancel(apiKey)) {
        clack.cancel('Setup cancelled');
        process.exit(0);
      }

      providers.replicate = { apiKey: apiKey as string };
    }
  }

  // User info
  const name = await clack.text({
    message: 'What is your name?',
    placeholder: 'Your name',
    validate: (value) => {
      if (!value) return 'Name is required';
    },
  });

  if (clack.isCancel(name)) {
    clack.cancel('Setup cancelled');
    process.exit(0);
  }

  const pronouns = await clack.text({
    message: 'What are your pronouns? (optional)',
    placeholder: 'e.g., he/him, she/her, they/them',
  });

  if (clack.isCancel(pronouns)) {
    clack.cancel('Setup cancelled');
    process.exit(0);
  }

  const memory = await clack.text({
    message: 'Is there anything we should always remember when talking to you? (optional)',
    placeholder: 'e.g., I prefer concise responses',
  });

  if (clack.isCancel(memory)) {
    clack.cancel('Setup cancelled');
    process.exit(0);
  }

  // Create config file
  const config = new ConfigFile();
  await config.save((data) => {
    data.user.name = name as string;
    data.user.pronouns = pronouns as string;
    if (memory && typeof memory === 'string' && memory.trim()) {
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

  const spinner = clack.spinner();
  spinner.start('Setting up your Cletus workspace...');

  // Give it a moment to feel authentic
  await new Promise((resolve) => setTimeout(resolve, 500));

  spinner.stop('Setup complete!');

  clack.outro(`Welcome, ${name}! Cletus is ready to help you.`);

  return config;
}
