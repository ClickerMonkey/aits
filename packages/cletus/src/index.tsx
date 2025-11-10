#!/usr/bin/env node

import { render, Text } from 'ink';
import React, { useState } from 'react';
import { InkChatView } from './components/InkChatView.js';
import { InkInitWizard } from './components/InkInitWizard.js';
import { InkMainMenu } from './components/InkMainMenu.js';
import { ConfigFile } from './config.js';

type AppView = 'loading' | 'init' | 'main' | 'chat';

const App = () => {
  const [view, setView] = useState<AppView>('loading');
  const [config, setConfig] = useState<ConfigFile | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  // Check if config exists
  React.useEffect(() => {
    async function checkConfig() {
      const cfg = new ConfigFile();
      try {
        await cfg.load();
        setConfig(cfg);
        setView('main');
      } catch (error) {
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

async function main() {
  // Clear screen and move cursor to top
  process.stdout.write('\x1Bc');

  const { waitUntilExit } = render(React.createElement(App));
  await waitUntilExit();
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
