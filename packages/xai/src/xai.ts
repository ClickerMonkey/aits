/**
 * xAI Provider
 *
 * Provider for xAI's Grok models using OpenAI-compatible API.
 */

import OpenAI from 'openai';
import type { ModelInfo } from '@aits/ai';
import { detectTier } from '@aits/ai';
import { OpenAIProvider, OpenAIConfig } from '@aits/openai';

/**
 * xAI provider configuration
 */
export interface XAIConfig extends OpenAIConfig {
  // Inherits baseURL from OpenAIConfig
}

/**
 * xAI provider implementation extending OpenAI provider
 */
export class XAIProvider extends OpenAIProvider<XAIConfig> {
  readonly name = 'xai';

  protected createClient(config: XAIConfig): OpenAI {
    return new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || 'https://api.x.ai/v1',
    });
  }

  protected convertModel(model: OpenAI.Model): ModelInfo {
    const tier = detectTier(model.id);

    return {
      id: model.id,
      provider: 'xai',
      name: model.id,
      capabilities: new Set(['chat', 'streaming']), // Minimal default, enriched by model sources
      pricing: {
        inputTokensPer1M: 0, // Will be enriched by model sources (e.g., OpenRouter)
        outputTokensPer1M: 0,
      },
      contextWindow: 0, // Will be enriched by model sources
      maxOutputTokens: undefined,
      tier,
      metadata: {
        created: model.created,
        ownedBy: model.owned_by,
      },
    };
  }

  protected modelFilter(model: OpenAI.Model): boolean {
    return model.id.includes('grok');
  }
}
