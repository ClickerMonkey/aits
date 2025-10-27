/**
 * Integration Test Setup
 *
 * Loads environment variables and provides utilities for conditional test execution
 */

import dotenv from 'dotenv';
import path from 'path';

// Load .env.test from root directory
dotenv.config({ path: path.resolve(__dirname, '../../../.env.test') });

/**
 * Get API key from environment
 */
export const getAPIKey = (provider: string): string => {
  const envVar = `${provider.toUpperCase()}_API_KEY`;
  const key = process.env[envVar];

  if (!key) {
    throw new Error(
      `Missing ${envVar} in environment. ` +
      `Add it to .env.test or set it as an environment variable.`
    );
  }

  return key;
};

/**
 * Check if API key is available
 */
export const hasAPIKey = (provider: string): boolean => {
  const envVar = `${provider.toUpperCase()}_API_KEY`;
  return !!process.env[envVar];
};

/**
 * Skip test suite if API key is not available
 */
export const skipIfNoAPIKey = (provider: string) => {
  if (!hasAPIKey(provider)) {
    console.warn(`Skipping ${provider} tests - no API key found`);
    return describe.skip;
  }
  return describe;
};

/**
 * Get all available providers based on environment variables
 */
export const getAvailableProviders = (): string[] => {
  const providers = ['openai', 'openrouter', 'replicate'];
  return providers.filter(hasAPIKey);
};

/**
 * Require minimum number of providers for multi-provider tests
 */
export const requireMinimumProviders = (minCount: number) => {
  const available = getAvailableProviders();
  if (available.length < minCount) {
    return describe.skip;
  }
  return describe;
};
