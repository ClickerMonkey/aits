/**
 * OpenRouter Provider
 *
 * Provider for OpenRouter API with provider-specific routing and fallback options.
 */

import type { ModelInfo, Provider } from '@aits/ai';
import { detectCapabilitiesFromModality, detectTier } from '@aits/ai';
import type { Chunk, Request, Response } from '@aits/core';
import { OpenAIConfig, OpenAIProvider } from '@aits/openai';
import OpenAI from 'openai';
import { fetchModels, fetchZDRModels } from './source';
import { OpenRouterChatChunk, OpenRouterChatRequest, OpenRouterChatResponse, OpenRouterModel } from './types';

/**
 * OpenRouter provider configuration
 */
export interface OpenRouterConfig extends OpenAIConfig {
  defaultParams?: {
    siteUrl?: string;
    appName?: string;
    providers?: {
      order?: string[];
      allowFallbacks?: boolean;
      requireParameters?: boolean;
      dataCollection?: 'deny' | 'allow';
      zdr?: boolean;
      only?: string[];
      ignore?: string[];
      quantizations?: ('int4' | 'int8' | 'fp4' | 'fp6' | 'fp8' | 'fp16' | 'bf16' | 'fp32' | 'unknown')[];
      sort?: 'price' | 'throughput' | 'latency';
      maxPrice?: {
        prompt?: number; // dollars per million tokens
        completion?: number; // dollars per million tokens
        image?: number; // dollars per image
      };
    };
    transforms?: string[];
  };
}

/**
 * Convert OpenRouter model to ModelInfo
 */
function convertOpenRouterModel(model: OpenRouterModel, zdrModelIds: Set<string>): ModelInfo {
  const capabilities = detectCapabilitiesFromModality(model.architecture.modality, model.id);
  const tier = detectTier(model.name);
  if (zdrModelIds.has(model.id) ) {
    capabilities.add('zdr');
  }

  // TODO supportedParameters, capabilities based on input/output modalities, tokenizer

  return {
    provider: 'openrouter',
    id: model.id,
    name: model.name,
    capabilities,
    tier,
    pricing: {
      inputTokensPer1M: parseFloat(model.pricing.prompt) * 1_000_000,
      outputTokensPer1M: parseFloat(model.pricing.completion) * 1_000_000,
      imageInputPer1M: model.pricing.image ? parseFloat(model.pricing.image) * 1_000_000 : undefined,
      requestCost: model.pricing.request ? parseFloat(model.pricing.request) : undefined,
    },
    contextWindow: model.context_length,
    maxOutputTokens: model.top_provider.max_completion_tokens ?? undefined,
    metadata: {
      description: model.description,
      architecture: model.architecture,
    },
  };
}

/**
 * OpenRouter provider implementation extending base OpenAI-compatible provider
 */
export class OpenRouterProvider extends OpenAIProvider<OpenRouterConfig> implements Provider<OpenRouterConfig> {
  readonly name = 'openrouter';

  protected createClient(config: OpenRouterConfig): OpenAI {
    return new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': config.defaultParams?.siteUrl,
        'X-Title': config.defaultParams?.appName,
      },
    });
  }

  protected convertModel(model: OpenAI.Model): ModelInfo {
    // This won't be used since we override listModels, but provide implementation
    return {
      provider: 'openrouter',
      id: model.id,
      name: model.id,
      capabilities: new Set(['chat', 'streaming']),
      tier: detectTier(model.id),
      pricing: {
        inputTokensPer1M: 0,
        outputTokensPer1M: 0,
      },
      contextWindow: 0,
      maxOutputTokens: undefined,
      metadata: {},
    };
  }

  /**
   * Augment chat request with OpenRouter-specific parameters
   */
  protected override augmentChatRequest(
    params: OpenRouterChatRequest,
    request: Request,
    config: OpenRouterConfig
  ) {
    // Add reasoning if specified
    if (request.reason) {
      params.reasoning = {
        enabled: true,
        effort: request.reason.effort,
        max_tokens: request.reason.maxTokens,
      };
    }

    // Merge provider parameters from config defaults
    if (config.defaultParams) {
      const dp = config.defaultParams;

      params.provider = {
        allow_fallbacks: dp.providers?.allowFallbacks,
        require_parameters: dp.providers?.requireParameters,
        data_collection: dp.providers?.dataCollection,
        max_price: dp.providers?.maxPrice,
        ...dp.providers,
      };

      if (dp.transforms) {
        params.transforms = dp.transforms;
      }
    }
  }

  /**
   * 
   * @param expected 
   * @param response 
   */
  protected override augmentChatResponse(
    expected: OpenRouterChatResponse, 
    response: Response,
    config: OpenRouterConfig
  ) {
    const message = expected.choices?.[0]?.message;
    if (message) {
      if (message.reasoning) {
        response.reasoning = message.reasoning;
      } else if (message.reasoning_details) {
        response.reasoning = message.reasoning_details
          .map(rd => [rd.text, rd.summary])
          .flat()
          .filter(Boolean)
          .join('\n');
      }
    }
    const usage = expected.usage;
    if (usage) {
      if (!response.usage) {
        response.usage = {};
      }
      if (usage.completion_tokens) {
        response.usage.outputTokens = usage.completion_tokens;
      }
      if (usage.prompt_tokens) {
        response.usage.inputTokens = usage.prompt_tokens;
      }
      if (usage.total_tokens) {
        response.usage.totalTokens = usage.total_tokens;
      }
      if (usage.cost) {
        response.usage.cost = usage.cost;
      }
    }
  }

  protected override augmentChatChunk(
    expected: OpenRouterChatChunk,
    chunk: Chunk,
    config: OpenRouterConfig
  ) {
    
    const usage = expected.usage;
    if (usage) {
      if (!chunk.usage) {
        chunk.usage = {};
      }
      if (usage.completion_tokens) {
        chunk.usage.outputTokens = usage.completion_tokens;
      }
      if (usage.prompt_tokens) {
        chunk.usage.inputTokens = usage.prompt_tokens;
      }
      if (usage.total_tokens) {
        chunk.usage.totalTokens = usage.total_tokens;
      }
      if (usage.cost) {
        chunk.usage.cost = usage.cost;
      }
    }
    if (expected.reasoning) {
      chunk.reasoning = expected.reasoning;
    } else if (expected.reasoning_details) {
      chunk.reasoning = expected.reasoning_details
        .map(rd => [rd.text, rd.summary])
        .flat()
        .filter(Boolean)
        .join('\n');
    }
  }

  /**
   * OpenRouter does not support image generation
   */
  override generateImage = undefined;

  /**
   * OpenRouter does not support image generation streaming
   */
  override generateImageStream = undefined;

  /**
   * OpenRouter does not support image editing
   */
  override editImage = undefined;

  /**
   * OpenRouter does not support image editing
   */
  override editImageStream = undefined;

  /**
   * OpenRouter does not support audio transcription
   */
  override transcribe = undefined;

  /**
   * OpenRouter does not support audio transcription streaming
   */
  override transcribeStream = undefined;

  /**
   * OpenRouter does not support speech synthesis
   */
  override speech = undefined;

  /**
   * OpenRouter does not support embeddings
   */
  override embed = undefined;

  /**
   * Override listModels to use OpenRouter's model API with ZDR support
   */
  async listModels(config: OpenRouterConfig): Promise<ModelInfo[]> {
    try {
      // Fetch both models and ZDR models in parallel
      const [models, zdrModels] = await Promise.all([
        fetchModels(config.apiKey),
        fetchZDRModels(config.apiKey),
      ]);

      return models.map((model) => convertOpenRouterModel(model, zdrModels));
    } catch (error) {
      throw new Error(`Failed to list OpenRouter models: ${error}`);
    }
  }
}

