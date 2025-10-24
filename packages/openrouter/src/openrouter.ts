/**
 * OpenRouter Provider
 *
 * Provider for OpenRouter API with provider-specific routing and fallback options.
 */

import OpenAI from 'openai';
import type { ModelInfo } from '@aits/ai';
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
 * OpenRouter's extended usage information with cost
 */
interface OpenRouterUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  total_cost?: number;
  native_tokens_prompt?: number;
  native_tokens_completion?: number;
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
export class OpenRouterProvider extends OpenAIProvider<OpenRouterConfig> {
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

  protected customizeChatParams(
    params: OpenAI.Chat.ChatCompletionCreateParams,
    config: OpenRouterConfig,
    request: Request
  ): OpenRouterChatRequest {
    const orRequest: OpenRouterChatRequest = { ...params };

    // Add reasoning if specified
    if (request.reason) {
      orRequest.reasoning = {
        enabled: true,
        effort: request.reason.effort,
        max_tokens: request.reason.maxTokens,
      };
    }

    // Merge provider parameters from config defaults
    if (config.defaultParams) {
      const dp = config.defaultParams;

      orRequest.provider = {
        allow_fallbacks: dp.allowFallbacks,
        require_parameters: dp.requireParameters,
        data_collection: dp.dataCollection,
        order: dp.order,
        ...dp.providers,
      };

      if (dp.transforms) {
        orRequest.transforms = dp.transforms;
      }
    }

    return orRequest;
  }

  /**
   * Override createExecutor to include cost from OpenRouter's usage data
   */
  createExecutor<TContext, TMetadata>(config?: OpenRouterConfig): Executor<TContext, TMetadata> {
    const effectiveConfig = config || this.config;
    const client = this.createClient(effectiveConfig);

    return async (request: Request, _ctx: TContext, metadata?: TMetadata, signal?: AbortSignal): Promise<Response> => {
      const model = (metadata as any)?.model;
      if (!model) {
        throw new ProviderError(this.name, `Model is required for ${this.name} requests`);
      }

      try {
        const messages = this.convertMessages(request);
        const tools = this.convertTools(request);
        const tool_choice = this.convertToolChoice(request);
        const response_format = this.convertResponseFormat(request);

        let params: any = this.customizeChatParams({
          model,
          messages,
          temperature: request.temperature,
          top_p: request.topP,
          max_tokens: request.maxTokens,
          stop: request.stop,
          tools,
          tool_choice,
          response_format,
          stream: false,
        }, effectiveConfig, request);

        const completion = await client.chat.completions.create(params, { signal });

        const choice = completion.choices[0];
        if (!choice) {
          throw new ProviderError(this.name, 'No choices in response');
        }

        const toolCalls = choice.message.tool_calls
          ?.filter((tc) => tc.type === 'function')
          .map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
          }));

        const reasoning = this.extractReasoning(choice.message);

        // Extract cost from OpenRouter's extended usage field
        const orUsage = completion.usage as any as OpenRouterUsage | undefined;
        const cost = orUsage?.total_cost;

        return {
          content: choice.message.content || '',
          toolCalls,
          finishReason: choice.finish_reason as any || 'stop',
          refusal: (choice.message as any).refusal || undefined,
          reasoning,
          usage: {
            inputTokens: completion.usage?.prompt_tokens ?? -1,
            outputTokens: completion.usage?.completion_tokens ?? -1,
            totalTokens: completion.usage?.total_tokens ?? -1,
            cost,
          },
        };
      } catch (error) {
        if (error instanceof Error && 'status' in error && (error as any).status === 429) {
          throw new RateLimitError(this.name, error.message);
        }
        if (error instanceof ProviderError) throw error;
        throw new ProviderError(this.name, 'Request failed', error as Error);
      }
    };
  }

  /**
   * Override createStreamer to include cost from OpenRouter's usage data
   */
  createStreamer<TContext, TMetadata>(config?: OpenRouterConfig): Streamer<TContext, TMetadata> {
    const effectiveConfig = config || this.config;
    const client = this.createClient(effectiveConfig);

    return async function* (
      this: OpenRouterProvider,
      request: Request,
      _ctx: TContext,
      metadata?: TMetadata,
      signal?: AbortSignal
    ): AsyncGenerator<Chunk> {
      const model = (metadata as any)?.model;
      if (!model) {
        throw new ProviderError(this.name, `Model is required for ${this.name} requests`);
      }

      try {
        const messages = this.convertMessages(request);
        const tools = this.convertTools(request);
        const tool_choice = this.convertToolChoice(request);
        const response_format = this.convertResponseFormat(request);

        let params: any = this.customizeChatParams({
          model,
          messages,
          temperature: request.temperature,
          top_p: request.topP,
          max_tokens: request.maxTokens,
          stop: request.stop,
          tools,
          tool_choice,
          response_format,
          stream: true,
        }, effectiveConfig, request);

        const stream = await client.chat.completions.create(params, { signal });

        const toolCallsMap = new Map<number, { id?: string; name?: string; arguments: string }>();

        for await (const chunk of stream) {
          if (signal?.aborted) {
            throw new Error('Request aborted');
          }

          const delta = chunk.choices[0]?.delta;
          if (!delta) continue;

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const existing = toolCallsMap.get(tc.index) || { id: '', name: '', arguments: '' };

              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) existing.arguments += tc.function.arguments;

              toolCallsMap.set(tc.index, existing);

              if (existing.id && existing.name && existing.arguments) {
                yield {
                  toolCall: {
                    id: existing.id,
                    name: existing.name,
                    arguments: existing.arguments,
                  },
                  finishReason: 'tool_calls',
                };
              }
            }
          }

          const reasoning = this.extractChunkReasoning(delta);
          const refusal = (delta as any).refusal || undefined;

          // Extract cost from OpenRouter's extended usage field
          const orUsage = chunk.usage as any as OpenRouterUsage | undefined;
          const cost = orUsage?.total_cost;

          yield {
            content: delta.content || undefined,
            finishReason: chunk.choices[0]?.finish_reason as any,
            refusal,
            reasoning,
            usage: chunk.usage
              ? {
                  inputTokens: chunk.usage.prompt_tokens || 0,
                  outputTokens: chunk.usage.completion_tokens || 0,
                  totalTokens: chunk.usage.total_tokens || 0,
                  cost,
                }
              : undefined,
          };
        }

        if (toolCallsMap.size > 0) {
          const toolCalls = Array.from(toolCallsMap.values())
            .filter((tc) => tc.id && tc.name)
            .map((tc) => ({
              id: tc.id!,
              name: tc.name!,
              arguments: tc.arguments,
            }));

          for (const toolCall of toolCalls) {
            yield {
              toolCall,
              finishReason: 'tool_calls',
            };
          }
        }
      } catch (error) {
        if (error instanceof Error && 'status' in error && (error as any).status === 429) {
          throw new RateLimitError(this.name, error.message);
        }
        if (error instanceof ProviderError) throw error;
        throw new ProviderError(this.name, 'Streaming failed', error as Error);
      }
    }.bind(this);
  }

  /**
   * OpenRouter does not support image generation
   */
  generateImage = undefined;

  /**
   * OpenRouter does not support image generation streaming
   */
  generateImageStream = undefined;

  /**
   * OpenRouter does not support image editing
   */
  editImage = undefined;

  /**
   * OpenRouter does not support audio transcription
   */
  transcribe = undefined;

  /**
   * OpenRouter does not support audio transcription streaming
   */
  transcribeStream = undefined;

  /**
   * OpenRouter does not support speech synthesis
   */
  generateSpeech = undefined;

  /**
   * OpenRouter does not support speech synthesis streaming
   */
  generateSpeechStream = undefined;

  /**
   * OpenRouter does not support embeddings
   */
  embed = undefined;

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

