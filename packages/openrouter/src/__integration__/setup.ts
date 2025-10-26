/**
 * OpenRouter Integration Test Setup
 */

import dotenv from 'dotenv';
import path from 'path';

// Load .env.test from root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env.test') });

export const getAPIKey = (): string => {
  const key = process.env.OPENROUTER_API_KEY;

  if (!key) {
    throw new Error(
      'Missing OPENROUTER_API_KEY in environment. ' +
      'Add it to .env.test or set it as an environment variable.'
    );
  }

  return key;
};

export const hasAPIKey = (): boolean => {
  return !!process.env.OPENROUTER_API_KEY;
};

export const skipIfNoAPIKey = () => {
  if (!hasAPIKey()) {
    console.warn('Skipping OpenRouter integration tests - no API key found');
    return describe.skip;
  }
  return describe;
};
