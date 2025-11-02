#!/usr/bin/env node

import * as clack from '@clack/prompts';
import { configExists } from './file-manager.js';
import { ConfigFile } from './config.js';
import { initWizard } from './init-wizard.js';
import { mainMenu, startChatInteraction } from './main-menu.js';

async function main() {
  console.clear();

  try {
    // Check if config exists
    const hasConfig = await configExists();
    let config: ConfigFile;

    if (!hasConfig) {
      // Run initialization wizard
      config = await initWizard();
    } else {
      // Load existing config
      config = new ConfigFile();

      try {
        await config.load();

        // Validate the config loaded successfully
        const data = config.getData();
        if (!data.user.name) {
          clack.log.warn('Config appears corrupted, re-running setup...');
          config = await initWizard();
        }
      } catch (error: any) {
        clack.log.error(`Failed to load config: ${error.message}`);
        clack.log.warn('Your config.json may be corrupted. Please fix it or delete it to re-initialize.');
        process.exitCode = 1;
      }
    }

    // Main application loop
    while (true) {
      const chatId = await mainMenu(config);

      // Exit if user chose to exit
      if (chatId === null) {
        process.exitCode = 0;
        break;
      }

      // Launch chat interface (Ink UI)
      await startChatInteraction(chatId, config);

      // Reload config in case it was modified
      await config.load();
    }

  } catch (error: any) {
    clack.log.error(`Fatal error: ${error.message}`);
    console.error(error);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exitCode = 1;
});
