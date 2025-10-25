/**
 * OpenRouter Provider
 *
 * Provider for OpenRouter API with provider-specific routing and fallback options.
 */

import OpenAI from 'openai';
import type { ModelInfo, Provider } from '@aits/ai';
import type { Request, Response, Executor, Streamer, Chunk } from '@aits/core';
import { detectTier, detectCapabilitiesFromModality } from '@aits/ai';
import { OpenAIProvider, OpenAIConfig, ProviderError, RateLimitError } from '@aits/openai';

/**
 * OpenRouter provider configuration
 */
export interface OpenRouterConfig extends OpenAIConfig {
  defaultParams?: {
    siteUrl?: string;
    appName?: string;
    allowFallbacks?: boolean;
    requireParameters?: boolean;
    dataCollection?: 'deny' | 'allow';
    order?: string[];
    providers?: {
      allow?: string[];
      deny?: string[];
      prefer?: string[];
      ignore?: string[];
      order?: string[];
      quantizations?: string[];
      dataCollection?: 'deny' | 'allow';
    };
    transforms?: string[];
  };
}

/**
 * OpenRouter chat request with extensions
 */
type OpenRouterChatRequest = OpenAI.Chat.ChatCompletionCreateParams & {
  // OpenRouter-specific extensions
  reasoning?: {
    enabled: boolean;
    effort?: 'low' | 'medium' | 'high';
    max_tokens?: number;
  };
  provider?: {
    allow_fallbacks?: boolean;
    require_parameters?: boolean;
    data_collection?: 'deny' | 'allow';
    order?: string[];
    allow?: string[];
    deny?: string[];
    prefer?: string[];
    ignore?: string[];
    quantizations?: string[];
  };
  transforms?: string[];
};

/**
 * OpenRouter's extended usage information
 */
type OpenRouterUsage = {
  completion_tokens?: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
  cost?: number;
  cost_details?: {
    upstream_inference_cost?: number;
  };
  prompt_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    audio_tokens?: number;
  };
  total_tokens?: number;
}

/**
 * OpenRouter reasoning information
 */
type OpenRouterReasoning = {
  reasoning?: string;
  reasoning_details?: {
    id?: string | null;
    type: 'reasoning.encrypted' | 'reasoning.summary' | 'reasoning.text';
    format: 'unknown' | 'openai-responses-v1' | 'xai-responses-v1' | 'anthropic-claude-v1';
    index?: number;
    summary?: string;
    text?: string;
    encrypted?: string;
    signature?: string;
    data?: string;
  }[];
};

/**
 * OpenRouter chunk with extended usage info
 */
type OpenRouterChatChunk = OpenAI.Chat.Completions.ChatCompletionChunk & {
  usage?: (OpenRouterUsage & OpenAI.CompletionUsage) | null;
} & OpenRouterReasoning;

/**
 * OpenRouter response with extended usage info
 */
type OpenRouterChatResponse = OpenAI.Chat.ChatCompletion & {
  choices: Array<OpenAI.ChatCompletion.Choice & {
    message: OpenAI.Chat.Completions.ChatCompletionMessage & OpenRouterReasoning;
  }>;
  usage?: OpenRouterUsage;
};

/**
 * OpenRouter model response from API
 */
interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  architecture: {
    modality: string;
    tokenizer: string;
    instruct_type: string | null;
  };
  pricing: {
    prompt: string;
    completion: string;
    image?: string;
    request?: string;
  };
  top_provider: {
    context_length: number;
    max_completion_tokens: number | null;
    is_moderated: boolean;
  };
  description?: string;
}

/**
 * ZDR model info from OpenRouter ZDR endpoint
 */
interface ZDRModel {
  name: string;
  model_name: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
    request: string;
    image: string;
  };
  provider_name: string;
  tag: string;
  quantization: string | null;
  max_completion_tokens: number | null;
  max_prompt_tokens: number | null;
  supported_parameters: string[];
  status: number;
  uptime_last_30m: number | null;
  supports_implicit_caching: boolean;
}

/**
 * Fetch ZDR (Zero Data Retention) compliant models
 */
async function fetchZDRModels(): Promise<Set<string>> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/endpoints/zdr', {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn('Failed to fetch ZDR models from OpenRouter');
      return new Set();
    }

    const data = (await response.json()) as { data: ZDRModel[] };
    return new Set(data.data.map((model) => model.model_name));
  } catch (error) {
    console.warn('Error fetching ZDR models:', error);
    return new Set();
  }
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
        allow_fallbacks: dp.allowFallbacks,
        require_parameters: dp.requireParameters,
        data_collection: dp.dataCollection,
        order: dp.order,
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
      const [modelsResponse, zdrModelIds] = await Promise.all([
        fetch('https://openrouter.ai/api/v1/models', {
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
          },
        }),
        fetchZDRModels(),
      ]);

      if (!modelsResponse.ok) {
        throw new Error(`Failed to fetch models: ${modelsResponse.statusText}`);
      }

      const data = (await modelsResponse.json()) as { data: OpenRouterModel[] };

      return data.data.map((model) => convertOpenRouterModel(model, zdrModelIds));
    } catch (error) {
      throw new Error(`Failed to list OpenRouter models: ${error}`);
    }
  }
}

