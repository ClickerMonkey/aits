/**
 * OpenRouter Provider
 *
 * Provider for OpenRouter API with provider-specific routing and fallback options.
 */

import type { ModelCapability, ModelInfo, ModelParameter, ModelTokenizer, Provider } from '@aits/ai';
import { detectTier } from '@aits/ai';
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
 * Convert OpenRouter parameter names to our ModelParameter format
 */
function convertSupportedParameters(openRouterParams: string[]): ModelParameter[] {
  const paramMap: Record<string, ModelParameter> = {
    'max_tokens': 'maxTokens',
    'temperature': 'temperature',
    'top_p': 'topP',
    'frequency_penalty': 'frequencyPenalty',
    'presence_penalty': 'presencePenalty',
    'stop': 'stop',
    'seed': 'seed',
    'response_format': 'responseFormat',
    'structured_outputs': 'structuredOutput',
    'tools': 'tools',
    'tool_choice': 'toolChoice',
    'logit_bias': 'logitBias',
    'logprobs': 'logProbabilities',
    'top_logprobs': 'logProbabilities',
    'reasoning': 'reason',
    'include_reasoning': 'reason',
  };

  const converted = new Set<ModelParameter>();
  for (const param of openRouterParams) {
    const mapped = paramMap[param];
    if (mapped) {
      converted.add(mapped);
    }
  }

  return Array.from(converted);
}

/**
 * Detect capabilities from input/output modalities
 */
function detectCapabilities(model: OpenRouterModel): ModelCapability[] {
  const capabilities = new Set<ModelCapability>();

  // Chat capability - if model outputs text
  if (model.architecture.output_modalities.includes('text')) {
    capabilities.add('chat');
  }

  // Image generation - if model outputs images
  if (model.architecture.output_modalities.includes('image')) {
    capabilities.add('image');
  }

  // Vision capability - if model accepts images as input
  if (model.architecture.input_modalities.includes('image')) {
    capabilities.add('vision');
  }

  // Audio/hearing capability - if model accepts audio as input
  if (model.architecture.input_modalities.includes('audio')) {
    capabilities.add('hearing');
  }

  // File handling capability
  if (model.architecture.input_modalities.includes('file')) {
    capabilities.add('vision'); // Files often imply document/vision capabilities
  }

  // Tools/function calling
  if (model.supported_parameters.includes('tools') || model.supported_parameters.includes('tool_choice')) {
    capabilities.add('tools');
  }

  // Reasoning capability
  if (model.supported_parameters.includes('reasoning') || model.supported_parameters.includes('include_reasoning')) {
    capabilities.add('reasoning');
  }

  // JSON output capability
  if (model.supported_parameters.includes('response_format')) {
    capabilities.add('json');
  }

  // Structured output capability
  if (model.supported_parameters.includes('structured_outputs')) {
    capabilities.add('structured');
  }

  // Streaming capability (most models support this)
  capabilities.add('streaming');

  return Array.from(capabilities);
}


/**
 * Convert OpenRouter model to ModelInfo with full details
 */
export function convertOpenRouterModel(
  model: OpenRouterModel,
  zdrModelIds: Set<string>,
  metrics?: { latency?: number; throughput?: number; uptime?: number } | null
): ModelInfo {
  const capabilities = detectCapabilities(model);
  const supportedParameters = convertSupportedParameters(model.supported_parameters);
  const tier = detectTier(model.name);

  // Update ZDR support from ZDR endpoint
  if (zdrModelIds.has(model.id)) {
    capabilities.push('zdr');
  }

  // Extract provider from model ID (format: provider/model-name)
  const provider = model.id.includes('/') ? model.id.split('/')[0] : 'openrouter';

  const hasValue = (x: string | undefined): x is string => {
    return x !== undefined && x !== null && x !== '' && x !== '0';
  }

  return {
    provider,
    id: model.id,
    name: model.name,
    capabilities: new Set(capabilities), // Will be serialized as array
    tier,
    pricing: {
      text: hasValue(model.pricing.prompt) || hasValue(model.pricing.completion) ? {
        input: hasValue(model.pricing.prompt) ? parseFloat(model.pricing.prompt) * 1_000_000 : undefined,
        output: hasValue(model.pricing.completion) ? parseFloat(model.pricing.completion) * 1_000_000 : undefined,
      } : undefined,
      image: hasValue(model.pricing.image) ? {
        input: parseFloat(model.pricing.image) * 1_000_000,
      } : undefined,
      reasoning: hasValue(model.pricing.internal_reasoning) ? {
        output: parseFloat(model.pricing.internal_reasoning) * 1_000_000,
      } : undefined,
      perRequest: hasValue(model.pricing.request) 
        ? parseFloat(model.pricing.request) 
        : undefined,
    },
    contextWindow: model.context_length,
    maxOutputTokens: model.top_provider.max_completion_tokens ?? undefined,
    tokenizer: model.architecture.tokenizer as ModelTokenizer,
    supportedParameters: new Set(supportedParameters), // Will be serialized as array
    metrics: metrics ? {
      timeToFirstToken: metrics.latency,
      tokensPerSecond: metrics.throughput,
      // Store uptime in metadata since it's not a standard metric
    } : undefined,
    metadata: {
      description: model.description,
      defaultParameters: model.default_parameters,
      source: 'openrouter',
      canonicalSlug: model.canonical_slug,
      huggingFaceId: model.hugging_face_id,
      created: model.created,
      uptime: metrics?.uptime,
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
      pricing: {},
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

