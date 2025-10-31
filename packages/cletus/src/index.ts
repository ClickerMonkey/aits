#!/usr/bin/env node

import * as clack from '@clack/prompts';
import { AI } from '@aits/ai';
import { OpenAIProvider } from '@aits/openai';

async function main() {
  console.clear();

  clack.intro('Welcome to Cletus - AITS Demo CLI');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    clack.outro('OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  // Initialize AI with OpenAI provider
  const provider = new OpenAIProvider({ apiKey });
  const ai = new AI({ provider });

  const name = await clack.text({
    message: 'What is your name?',
    placeholder: 'Enter your name',
    validate: (value) => {
      if (!value) return 'Name is required';
    },
  });

  if (clack.isCancel(name)) {
    clack.cancel('Operation cancelled');
    process.exit(0);
  }

  clack.outro(`Hello, ${name}! AITS is ready to go.`);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
