import { AI } from '@aits/ai';
import { OpenAIProvider } from '@aits/openai';
import { OpenRouterProvider } from '@aits/openrouter';
import { ReplicateProvider } from '@aits/replicate';
import { models } from '@aits/models';
import { ConfigFile } from './config';
import { ChatFile } from './chat';
import { ChatMeta } from './schemas';

/**
 * Cletus AI Context
 */
export interface CletusContext {
  config: ConfigFile;
  chatData?: ChatFile;
  chat?: ChatMeta;
  cwd: string;
}

/**
 * Cletus AI Metadata
 */
export interface CletusMetadata {
  // Model selection metadata can go here
}

/**
 * Create the Cletus AI instance
 */
export function createCletusAI(configFile: ConfigFile) {
  const config = configFile.getData();

  // Initialize providers based on config
  const providers = {
    ...(config.providers.openai ? { openai: new OpenAIProvider(config.providers.openai) } : {}),
    ...(config.providers.openrouter ? { openrouter: new OpenRouterProvider(config.providers.openrouter) } : {}),
    ...(config.providers.replicate ? { replicate: new ReplicateProvider(config.providers.replicate) } : {}),
  } as const;

  // Create AI instance with context and metadata types
  const ai = AI.with<CletusContext, CletusMetadata>()
    .providers(providers)
    .create({
      defaultContext: {
        config: configFile,
        cwd: process.cwd(),
      },
      models,
    });

  return ai;
}

export type CletusAI = ReturnType<typeof createCletusAI>;
