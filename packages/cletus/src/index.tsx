#!/usr/bin/env node

import { render, Text } from 'ink';
import React, { useState } from 'react';

import './logger';

import { InkChatView } from './components/InkChatView';
import { InkInitWizard } from './components/InkInitWizard';
import { InkMainMenu } from './components/InkMainMenu';
import { ConfigFile } from './config';
import { configExists } from './file-manager';

type AppView = 'loading' | 'init' | 'main' | 'chat';

interface AppProps {
  profile?: string;
}

const App = ({ profile }: AppProps) => {
  const [view, setView] = useState<AppView>('loading');
  const [config, setConfig] = useState<ConfigFile | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  // Check if config exists
  React.useEffect(() => {
    async function checkConfig() {
      const exists = await configExists(profile);
      if (exists) {
        // Config exists, load it
        const cfg = new ConfigFile(profile);
        await cfg.load();
        setConfig(cfg);
        setView('main');
      } else {
        // Config doesn't exist, show init wizard
        setView('init');
      }
    }
    checkConfig();
  }, [profile]);

  // Loading state
  if (view === 'loading') {
    return <Text>Loading...</Text>;
  }

  // Init Wizard
  if (view === 'init') {
    return (
      <InkInitWizard
        profile={profile}
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
        profile={profile}
        onExit={() => setView('main')}
      />
    );
  }

  // Main Menu
  if (view === 'main' && config) {
    return (
      <InkMainMenu
        config={config}
        profile={profile}
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
  // Parse command line arguments
  const { profile } = parseArgs();

  // Clear screen and move cursor to top
  process.stdout.write('\x1Bc');

  const { waitUntilExit } = render(React.createElement(App, { profile }), {
    exitOnCtrlC: false,
  });
  await waitUntilExit();
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
