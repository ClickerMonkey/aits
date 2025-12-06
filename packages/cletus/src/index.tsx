#!/usr/bin/env node

import { render, Text } from 'ink';
import React, { useState } from 'react';

import './logger';

import { InkChatView } from './components/InkChatView';
import { InkInitWizard } from './components/InkInitWizard';
import { InkMainMenu } from './components/InkMainMenu';
import { ConfigFile } from './config';
import { configExists, setProfile } from './file-manager';
import { initWorker } from './embed';

type AppView = 'loading' | 'init' | 'main' | 'chat';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('loading');
  const [config, setConfig] = useState<ConfigFile | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  // Check if config exists
  React.useEffect(() => {
    async function checkConfig() {
      const exists = await configExists();
      if (exists) {
        // Config exists, load it
        const cfg = new ConfigFile();
        await cfg.load();
        setConfig(cfg);
        setView('main');
      } else {
        // Config doesn't exist, show init wizard
        setView('init');
      }
    }
    checkConfig();
  }, []);

  // Loading state
  if (view === 'loading') {
    return <Text>Loading...</Text>;
  }

  // Init Wizard
  if (view === 'init') {
    return (
      <InkInitWizard
        onComplete={(cfg) => {
          setConfig(cfg);
          setView('main');
        }}
      />
    );
  }

  // Chat View
  if (view === 'chat' && selectedChatId && config) {
    return (
      <InkChatView
        chatId={selectedChatId}
        config={config}
        onExit={() => setView('main')}
      />
    );
  }

  // Main Menu
  if (view === 'main' && config) {
    return (
      <InkMainMenu
        config={config}
        onChatSelect={(chatId) => {
          setSelectedChatId(chatId);
          setView('chat');
        }}
        onExit={() => {
          process.exit(0);
        }}
      />
    );
  }

  return <Text>Loading...</Text>;
};

/**
 * Parse command line arguments
 */
function parseArgs(): { profile?: string } {
  const args = process.argv.slice(2);
  let profile: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Handle --profile=name format
    if (arg.startsWith('--profile=')) {
      profile = arg.substring('--profile='.length);
    }
    // Handle --profile name format
    else if (arg === '--profile' && i + 1 < args.length) {
      profile = args[i + 1];
      i++; // Skip next argument
    }
  }

  return { profile };
}

async function main() {
  // Parse command line arguments and set global profile
  const { profile } = parseArgs();
  setProfile(profile);

  // Clear screen and move cursor to top
  process.stdout.write('\x1Bc');

  // Initialize embed worker (don't await - let it init in background)
  initWorker();

  const { waitUntilExit } = render(React.createElement(App), {
    exitOnCtrlC: false,
  });
  await waitUntilExit();
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
