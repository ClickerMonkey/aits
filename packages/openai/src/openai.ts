/**
 * OpenAI Provider
 *
 * Provider for OpenAI's GPT models, DALL-E, Whisper, and TTS.
 * Also serves as base class for OpenAI-compatible providers.
 */

import fs from 'fs';
import OpenAI, { Uploadable } from 'openai';
import z from 'zod';
import type {
  Provider,
  ModelInfo,
  ImageGenerationRequest,
  ImageGenerationResponse,
  TranscriptionRequest,
  TranscriptionResponse,
  SpeechRequest,
  SpeechResponse,
  EmbeddingRequest,
  EmbeddingResponse,
} from '@aits/ai';
import type { Executor, Streamer, Request, Response, Chunk, MessageContent, ToolCall, FinishReason } from '@aits/core';
import { ProviderError, RateLimitError } from './types';
import { detectTier } from '@aits/ai';

// ============================================================================
// OpenAI Provider Configuration
// ============================================================================

/**
 * Configuration options for the OpenAI provider.
 *
 * @example
 * ```typescript
 * const config: OpenAIConfig = {
 *   apiKey: process.env.OPENAI_API_KEY!,
 *   organization: 'org-123456', // Optional
 * };
 * ```
 */
export interface OpenAIConfig {
  // OpenAI API key for authentication
  apiKey: string;
  // Custom base URL for OpenAI-compatible APIs (e.g., Azure OpenAI)
  baseURL?: string;
  // OpenAI organization ID for multi-org accounts
  organization?: string;
}

// ============================================================================
// OpenAI Provider Class
// ============================================================================

/**
 * OpenAI provider implementation for the AITS framework.
 *
 * Supports the full range of OpenAI capabilities including:
 * - Chat completions with GPT-4, GPT-4 Turbo, GPT-3.5 Turbo
 * - Vision with GPT-4 Vision (GPT-4V)
 * - Reasoning models (o1, o3-mini)
 * - Image generation with DALL-E 2 and DALL-E 3
 * - Speech-to-text with Whisper
 * - Text-to-speech with TTS
 * - Text embeddings
 * - Function calling and structured outputs
 * - Streaming responses
 *
 * Can be extended by other OpenAI-compatible providers (e.g., Azure OpenAI, OpenRouter).
 *
 * @example Basic usage
 * ```typescript
 * import { OpenAIProvider } from '@aits/openai';
 *
 * const provider = new OpenAIProvider({
 *   apiKey: process.env.OPENAI_API_KEY!,
 * });
 *
 * // Create an executor for chat completions
 * const executor = provider.createExecutor();
 *
 * const response = await executor(
 *   {
 *     messages: [
 *       { role: 'user', content: 'Hello!' }
 *     ]
 *   },
 *   {},
 *   { model: 'gpt-4' }
 * );
 * ```
 *
 * @example With function calling
 * ```typescript
 * import { z } from 'zod';
 *
 * const response = await executor(
 *   {
 *     messages: [
 *       { role: 'user', content: 'What is the weather in San Francisco?' }
 *     ],
 *     tools: [
 *       {
 *         name: 'get_weather',
 *         description: 'Get current weather',
 *         parameters: z.object({
 *           location: z.string(),
 *         }),
 *       }
 *     ],
 *     toolChoice: 'auto',
 *   },
 *   {},
 *   { model: 'gpt-4' }
 * );
 * ```
 *
 * @example Extending for custom providers
 * ```typescript
 * class CustomProvider extends OpenAIProvider {
 *   readonly name = 'custom';
 *
 *   protected createClient(config: OpenAIConfig) {
 *     return new OpenAI({
 *       apiKey: config.apiKey,
 *       baseURL: 'https://custom-api.example.com/v1',
 *     });
 *   }
 *
 *   protected modelFilter(model: OpenAI.Model): boolean {
 *     return model.id.startsWith('custom-');
 *   }
 * }
 * ```
 *
 * @template TConfig Configuration type extending OpenAIConfig
 *
 * Subclasses can optionally override:
 * - `listModels(config)`: Custom model listing logic
 * - `modelFilter(model)`: Filter which models to include
 * - `createClient(config)`: Customize client creation
 * - `convertModel(model)`: Customize model conversion
 * - `customizeChatParams(params, config, request)`: Modify chat params
 * - `customizeImageParams(params, config)`: Modify image params
 * - `customizeTranscriptionParams(params, config)`: Modify transcription params
 * - `customizeSpeechParams(params, config)`: Modify speech params
 * - `customizeEmbeddingParams(params, config)`: Modify embedding params
 */
export class OpenAIProvider<TConfig extends OpenAIConfig = OpenAIConfig> implements Provider<TConfig> {
  // Provider name for error messages and identification
  readonly name: string = 'openai';

  // Config stored in the provider instance (used as fallback)
  readonly config: TConfig;

  // Default metadata to apply to all requests
  defaultMetadata?: Provider['defaultMetadata'];

  constructor(config: TConfig) {
    this.config = config;
  }

  // ============================================================================
  // Client Creation (Can Override)
  // ============================================================================

  /**
   * Create OpenAI client from provider config.
   *
   * Subclasses can override this method to customize client initialization,
   * such as setting a custom base URL for OpenAI-compatible APIs.
   *
   * @param config Provider configuration
   * @returns Configured OpenAI client instance
   *
   * @example
   * ```typescript
   * protected createClient(config: OpenAIConfig): OpenAI {
   *   return new OpenAI({
   *     apiKey: config.apiKey,
   *     baseURL: 'https://custom-endpoint.example.com/v1',
   *   });
   * }
   * ```
   */
  protected createClient(config: TConfig): OpenAI {
    return new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      organization: config.organization,
    });
  }

  /**
   * Convert OpenAI's model format to AITS ModelInfo format.
   *
   * Subclasses can override this to enrich model metadata with
   * provider-specific information.
   *
   * @param model OpenAI model object
   * @returns Standardized ModelInfo object
   */
  protected convertModel(model: OpenAI.Model): ModelInfo {
    const tier = detectTier(model.id);

    return {
      provider: this.name,
      id: model.id,
      name: model.id,
      capabilities: new Set(['chat', 'streaming']), // Minimal default, enriched by model sources
      tier,
      pricing: {
        inputTokensPer1M: 0, // Will be enriched by model sources (e.g., OpenRouter)
        outputTokensPer1M: 0,
      },
      contextWindow: 0, // Will be enriched by model sources
      maxOutputTokens: undefined,
      metadata: {
        ownedBy: model.owned_by,
        created: model.created,
      },
    };
  }

  /**
   * Filter which models to include from listModels API.
   *
   * Default implementation includes only official OpenAI models
   * (GPT, o1/o3, DALL-E, Whisper, TTS, embeddings).
   *
   * Subclasses can override this to include custom model patterns.
   *
   * @param model OpenAI model object
   * @returns true if model should be included, false otherwise
   */
  protected modelFilter(model: OpenAI.Model): boolean {
    return (
      model.id.startsWith('gpt-') ||
      model.id.startsWith('o1') ||
      model.id.startsWith('dall-e') ||
      model.id.startsWith('whisper') ||
      model.id.startsWith('tts-') ||
      model.id.includes('embedding')
    );
  }

  // ============================================================================
  // Optional Override Methods for Request Customization
  // ============================================================================

  /**
   * Customize chat completion params before sending to API.
   *
   * Override this method to modify request parameters for custom providers
   * or to add provider-specific features.
   *
   * @param params OpenAI chat completion parameters
   * @param config Provider configuration
   * @param request Original AITS request
   * @returns Modified parameters
   */
  protected customizeChatParams?(
    params: OpenAI.Chat.ChatCompletionCreateParams,
    config: TConfig,
    request: Request
  ): OpenAI.Chat.ChatCompletionCreateParams | any;

  /**
   * Customize image generation params before sending to API.
   *
   * @param params Image generation parameters
   * @param config Provider configuration
   * @returns Modified parameters
   */
  protected customizeImageParams?(params: any, config: TConfig): any;

  /**
   * Customize transcription params before sending to API.
   *
   * @param params Transcription parameters
   * @param config Provider configuration
   * @returns Modified parameters
   */
  protected customizeTranscriptionParams?(params: any, config: TConfig): any;

  /**
   * Customize speech generation params before sending to API.
   *
   * @param params Speech synthesis parameters
   * @param config Provider configuration
   * @returns Modified parameters
   */
  protected customizeSpeechParams?(params: any, config: TConfig): any;

  /**
   * Customize embedding params before sending to API.
   *
   * @param params Embedding parameters
   * @param config Provider configuration
   * @returns Modified parameters
   */
  protected customizeEmbeddingParams?(params: any, config: TConfig): any;

  /**
   * Extract reasoning content from response message.
   * Override this method for provider-specific reasoning formats.
   *
   * @param message Response message
   * @returns Extracted reasoning text or undefined
   */
  protected extractReasoning(message: any): string | undefined {
    const reasoning =
      'reasoning' in message && typeof message.reasoning === 'string'
        ? message.reasoning
        : undefined;
    const reasoningDetails =
      'reasoning_details' in message
        ? (message.reasoning_details as Array<{ summary?: string; text?: string }> | undefined)
        : undefined;

    return reasoning ?? reasoningDetails?.map((r) => r.summary || r.text)?.filter(Boolean)?.join('\n');
  }

  /**
   * Extract reasoning content from streaming chunk delta.
   * Override this method for provider-specific reasoning formats.
   *
   * @param delta Chunk delta
   * @returns Extracted reasoning text or undefined
   */
  protected extractChunkReasoning(delta: any): string | undefined {
    const reasoningDetails =
      'reasoning_details' in delta && delta.reasoning_details
        ? (delta.reasoning_details as Array<{ summary?: string; text?: string }>)
            .map((r) => r.summary || r.text)
            .filter(Boolean)
            .join('\n')
        : undefined;

    return reasoningDetails;
  }

  // ============================================================================
  // Message & Request Conversion (Protected - Reusable)
  // ============================================================================

  protected convertContentString(x: MessageContent['content'], from: string): string {
    if (typeof x === 'string') {
      return x;
    }
    if (x instanceof Blob) {
      return x.toString();
    }
    if (x instanceof URL) {
      return x.toString();
    }
    return '';
  }

  protected convertContentText(
    x: string | MessageContent[],
    name: string
  ): string | OpenAI.Chat.Completions.ChatCompletionContentPartText[] {
    if (typeof x === 'string') {
      return x;
    }
    return x.map((part): OpenAI.Chat.Completions.ChatCompletionContentPartText => {
      if (part.type === 'text') {
        return { type: 'text', text: String(part.content) };
      } else if (part.type === 'image') {
        return { type: 'text', text: `Image sent by ${name} not included in content.` };
      } else if (part.type === 'file') {
        return { type: 'text', text: `File sent by ${name} not included in content.` };
      } else if (part.type === 'audio') {
        return { type: 'text', text: `Audio sent by ${name} not included in content.` };
      }
      return { type: 'text', text: `Unsupported content type from ${name}.` };
    });
  }

  protected convertContent(
    x: string | MessageContent[],
    name: string
  ): string | OpenAI.Chat.Completions.ChatCompletionContentPart[] {
    if (typeof x === 'string') {
      return x;
    }
    return x.map((part): OpenAI.Chat.Completions.ChatCompletionContentPart => {
      switch (part.type) {
        case 'text':
          return {
            type: 'text',
            text: String(part.content),
          };

        case 'image': {
          // Convert content to URL or base64 data URL
          let url: string;
          if (typeof part.content === 'string') {
            // Check if it's already a data URL or regular URL
            if (part.content.startsWith('data:')) {
              url = part.content;
            } else if (part.content.startsWith('http://') || part.content.startsWith('https://')) {
              url = part.content;
            } else {
              // Assume it's base64 encoded data without the data URL prefix
              const mimeType = part.format || 'image/png';
              url = `data:${mimeType};base64,${part.content}`;
            }
          } else if (part.content instanceof URL) {
            url = part.content.toString();
          } else if (part.content instanceof Buffer) {
            // Convert Buffer to base64 data URL
            const base64 = part.content.toString('base64');
            const mimeType = part.format || 'image/png';
            url = `data:${mimeType};base64,${base64}`;
          } else {
            // ReadableStream - not supported, return text fallback
            return {
              type: 'text',
              text: `Image (stream) sent by ${name} cannot be converted to URL.`,
            };
          }
          return {
            type: 'image_url',
            image_url: { url },
          };
        }

        case 'audio': {
          // Convert audio content to base64 data
          let data: string;
          let format: 'wav' | 'mp3' = 'mp3';

          if (typeof part.content === 'string') {
            // Check if it's a data URL
            if (part.content.startsWith('data:')) {
              const dataUrlMatch = part.content.match(/^data:([^;]+);base64,(.+)$/);
              if (dataUrlMatch) {
                const mimeType = dataUrlMatch[1];
                data = dataUrlMatch[2];

                // Extract format from MIME type
                if (mimeType.includes('wav')) {
                  format = 'wav';
                } else if (mimeType.includes('mp3') || mimeType.includes('mpeg')) {
                  format = 'mp3';
                }
              } else {
                // Invalid data URL
                return {
                  type: 'text',
                  text: `Audio data URL sent by ${name} is not valid base64.`,
                };
              }
            } else {
              // Assume it's already base64 encoded without the data URL prefix
              data = part.content;
            }
          } else if (part.content instanceof Buffer) {
            data = part.content.toString('base64');
          } else {
            // URL or ReadableStream - not supported
            return {
              type: 'text',
              text: `Audio sent by ${name} cannot be converted to base64.`,
            };
          }

          // Override format from part.format if provided
          if (part.format) {
            if (part.format === 'wav' || part.format === 'audio/wav') {
              format = 'wav';
            } else if (part.format === 'mp3' || part.format === 'audio/mpeg' || part.format === 'audio/mp3') {
              format = 'mp3';
            }
          }

          return {
            type: 'input_audio',
            input_audio: { data, format },
          };
        }

        case 'file': {
          // Convert file content to base64 data (file IDs not supported)
          let fileData: string;

          if (typeof part.content === 'string') {
            // Check if it's a data URL
            if (part.content.startsWith('data:')) {
              const dataUrlMatch = part.content.match(/^data:[^;]+;base64,(.+)$/);
              if (dataUrlMatch) {
                fileData = dataUrlMatch[1];
              } else {
                // Invalid data URL
                return {
                  type: 'text',
                  text: `File data URL sent by ${name} is not valid base64.`,
                };
              }
            }
            // Check if it's a URL or file ID (not supported)
            else if (
              part.content.startsWith('http://') ||
              part.content.startsWith('https://') ||
              part.content.startsWith('file-')
            ) {
              return {
                type: 'text',
                text: `File URL/ID sent by ${name} cannot be used (only base64 data supported).`,
              };
            }
            // Assume it's base64 data
            else {
              fileData = part.content;
            }
          } else if (part.content instanceof Buffer) {
            fileData = part.content.toString('base64');
          } else if (part.content instanceof URL) {
            return {
              type: 'text',
              text: `File URL sent by ${name} cannot be used (only base64 data supported).`,
            };
          } else {
            // ReadableStream - not supported
            return {
              type: 'text',
              text: `File (stream) sent by ${name} cannot be converted.`,
            };
          }

          return {
            type: 'file',
            file: {
              file_data: fileData,
            },
          };
        }

        default:
          return {
            type: 'text',
            text: `Unsupported content type from ${name}.`,
          };
      }
    });
  }

  protected convertToolCall(x: ToolCall): OpenAI.Chat.ChatCompletionMessageToolCall {
    return {
      id: x.id,
      type: 'function',
      function: {
        name: x.name,
        arguments: x.arguments,
      },
    };
  }

  /**
   * Convert AITS Request messages to OpenAI format.
   *
   * Handles conversion of all message types (system, user, assistant, tool)
   * and content types (text, image, audio, file).
   *
   * @param request AITS request object
   * @returns Array of OpenAI-formatted messages
   */
  protected convertMessages(request: Request): OpenAI.Chat.ChatCompletionMessageParam[] {
    return request.messages.map((msg): OpenAI.Chat.ChatCompletionMessageParam => {
      switch (msg.role) {
        case 'system':
          return {
            role: 'developer',
            name: msg.name,
            content: this.convertContentText(msg.content, msg.name || 'system'),
          };
        case 'tool':
          return {
            role: 'tool',
            tool_call_id: msg.toolCallId!,
            content: this.convertContentText(msg.content, msg.name || 'tool'),
          };
        case 'assistant':
          return {
            role: msg.role,
            name: msg.name,
            tool_calls: msg.toolCalls?.map((tc) => this.convertToolCall(tc)),
            content: this.convertContentText(msg.content, msg.name || 'assistant'),
          };
        case 'user':
          return {
            role: msg.role,
            name: msg.name,
            content: this.convertContent(msg.content, msg.name || 'user'),
          };
      }
    });
  }

  /**
   * Convert AITS tool definitions to OpenAI format.
   *
   * Transforms Zod schemas into JSON Schema format required by OpenAI.
   *
   * @param request AITS request object
   * @returns Array of OpenAI-formatted tools or undefined
   */
  protected convertTools(request: Request): OpenAI.Chat.ChatCompletionTool[] | undefined {
    if (!request.tools || request.tools.length === 0) return undefined;

    return request.tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: z.toJSONSchema(tool.parameters, { target: 'draft-7' }),
      },
    }));
  }

  /**
   * Convert AITS tool choice to OpenAI format.
   *
   * Supports auto, required, none, and specific tool selection.
   *
   * @param request AITS request object
   * @returns OpenAI-formatted tool choice option or undefined
   */
  protected convertToolChoice(
    request: Request
  ): OpenAI.Chat.ChatCompletionToolChoiceOption | undefined {
    if (!request.toolChoice) return undefined;

    if (request.toolChoice === 'auto') return 'auto';
    if (request.toolChoice === 'required') return 'required';
    if (request.toolChoice === 'none') return 'none';
    if (typeof request.toolChoice === 'object') {
      return {
        type: 'function' as const,
        function: { name: request.toolChoice.tool },
      };
    }

    return undefined;
  }

  /**
   * Convert AITS response format to OpenAI format.
   *
   * Supports text, JSON object mode, and structured output with Zod schemas.
   *
   * @param request AITS request object
   * @returns OpenAI-formatted response format or undefined
   */
  protected convertResponseFormat(
    request: Request
  ): OpenAI.Chat.ChatCompletionCreateParams['response_format'] | undefined {
    if (!request.responseFormat) return undefined;

    if (typeof request.responseFormat === 'string') {
      if (request.responseFormat === 'text') {
        return { type: 'text' };
      }
      if (request.responseFormat === 'json') {
        return { type: 'json_object' };
      }
      return undefined;
    }

    // Zod schema
    return {
      type: 'json_schema',
      json_schema: {
        name: 'response',
        schema: z.toJSONSchema(request.responseFormat, { target: 'draft-7' }),
        strict: true,
      },
    };
  }

  // ============================================================================
  // Provider Interface Implementation
  // ============================================================================

  /**
   * List available models from OpenAI.
   *
   * @param config Optional configuration override
   * @returns Array of available models with metadata
   * @throws {ProviderError} If listing models fails
   */
  async listModels(config?: TConfig): Promise<ModelInfo[]> {
    const effectiveConfig = config || this.config;
    const client = this.createClient(effectiveConfig);

    try {
      const response = await client.models.list();
      const models = response.data.filter((m) => this.modelFilter(m));
      return models.map((m) => this.convertModel(m));
    } catch (error) {
      throw new ProviderError(this.name, 'Failed to list models', error as Error);
    }
  }

  /**
   * Check if the OpenAI API is accessible with the provided credentials.
   *
   * @param config Optional configuration override
   * @returns true if API is accessible, false otherwise
   */
  async checkHealth(config?: TConfig): Promise<boolean> {
    try {
      const effectiveConfig = config || this.config;
      const client = this.createClient(effectiveConfig);
      await client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create an executor for chat completion requests.
   *
   * The executor handles non-streaming chat completions with support for:
   * - Multi-turn conversations
   * - Function calling
   * - Structured outputs
   * - Vision (images)
   * - Audio inputs
   *
   * @param config Optional configuration override
   * @returns Executor function for chat completions
   * @throws {ProviderError} If request fails
   * @throws {RateLimitError} If rate limit is exceeded
   */
  createExecutor<TContext, TMetadata>(config?: TConfig): Executor<TContext, TMetadata> {
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

        let params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
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
        };

        // Apply provider-specific customizations
        if (this.customizeChatParams) {
          params = this.customizeChatParams(params, effectiveConfig, request);
        }

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

        // Extract reasoning using overrideable method
        const reasoning = this.extractReasoning(choice.message);

        return {
          content: choice.message.content || '',
          toolCalls,
          finishReason: (choice.finish_reason as FinishReason) || 'stop',
          refusal: (choice.message as any).refusal || undefined,
          reasoning,
          usage: {
            inputTokens: completion.usage?.prompt_tokens ?? -1,
            outputTokens: completion.usage?.completion_tokens ?? -1,
            totalTokens: completion.usage?.total_tokens ?? -1,
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
   * Create a streamer for streaming chat completion requests.
   *
   * The streamer yields chunks as they arrive from OpenAI, enabling
   * real-time response rendering.
   *
   * @param config Optional configuration override
   * @returns Streamer async generator function
   * @throws {ProviderError} If request fails
   * @throws {RateLimitError} If rate limit is exceeded
   */
  createStreamer<TContext, TMetadata>(config?: TConfig): Streamer<TContext, TMetadata> {
    const effectiveConfig = config || this.config;
    const client = this.createClient(effectiveConfig);

    return async function* (
      this: OpenAIProvider<TConfig>,
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

        let params: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
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
        };

        // Apply provider-specific customizations
        if (this.customizeChatParams) {
          params = this.customizeChatParams(params, effectiveConfig, request);
        }

        const stream = await client.chat.completions.create(params, { signal });

        // Track accumulated tool calls
        const toolCallsMap = new Map<number, { id?: string; name?: string; arguments: string }>();

        for await (const chunk of stream) {
          if (signal?.aborted) {
            throw new Error('Request aborted');
          }

          const delta = chunk.choices[0]?.delta;
          if (!delta) continue;

          // Handle tool calls
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const existing = toolCallsMap.get(tc.index) || { id: '', name: '', arguments: '' };

              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) existing.arguments += tc.function.arguments;

              toolCallsMap.set(tc.index, existing);

              // Yield tool call as it arrives if complete
              if (existing.id && existing.name && existing.arguments) {
                yield {
                  toolCall: {
                    id: existing.id,
                    name: existing.name,
                    arguments: existing.arguments,
                  },
                  finishReason: 'tool_calls' as FinishReason,
                };
              }
            }
          }

          // Handle reasoning using overrideable method
          const reasoning = this.extractChunkReasoning(delta);

          // Handle refusal
          const refusal = (delta as any).refusal || undefined;

          yield {
            content: delta.content || undefined,
            finishReason: chunk.choices[0]?.finish_reason as FinishReason | undefined,
            refusal,
            reasoning,
            usage: chunk.usage
              ? {
                  inputTokens: chunk.usage.prompt_tokens || 0,
                  outputTokens: chunk.usage.completion_tokens || 0,
                  totalTokens: chunk.usage.total_tokens || 0,
                }
              : undefined,
          };
        }

        // Emit any remaining tool calls that weren't yielded yet
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
              finishReason: 'tool_calls' as FinishReason,
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
   * Generate images using DALL-E models.
   *
   * Supports DALL-E 2 and DALL-E 3 with various sizes and quality settings.
   *
   * @param request Image generation request parameters
   * @param _ctx Context object (not used)
   * @param config Optional configuration override
   * @returns Generated image URLs or base64 data
   * @throws {ProviderError} If generation fails
   * @throws {RateLimitError} If rate limit is exceeded
   */
  async generateImage<TContext>(
    request: ImageGenerationRequest,
    _ctx: TContext,
    config?: TConfig
  ): Promise<ImageGenerationResponse> {
    const effectiveConfig = config || this.config;
    const client = this.createClient(effectiveConfig);

    try {
      let params: any = {
        model: request.model || 'dall-e-3',
        prompt: request.prompt,
        n: request.n,
        size: request.size as '1024x1024' | '1024x1792' | '1792x1024' | null | undefined,
        quality: request.quality as 'standard' | 'hd' | undefined,
        style: request.style as 'vivid' | 'natural' | undefined,
        response_format: request.responseFormat,
      };

      // Apply provider-specific customizations
      if (this.customizeImageParams) {
        params = this.customizeImageParams(params, effectiveConfig);
      }

      const response = await client.images.generate(params);

      return {
        images: (response.data || []).map((img) => ({
          url: img.url || undefined,
          b64_json: img.b64_json || undefined,
          revisedPrompt: img.revised_prompt || undefined,
        })),
        model: request.model || 'dall-e-3',
      };
    } catch (error) {
      if (error instanceof Error && 'status' in error && (error as any).status === 429) {
        throw new RateLimitError(this.name, error.message);
      }
      throw new ProviderError(this.name, 'Image generation failed', error as Error);
    }
  }

  /**
   * Generate images with streaming progress updates.
   *
   * Note: OpenAI's API doesn't natively support streaming image generation,
   * so this implementation polls for progress or returns the result immediately.
   *
   * @param request Image generation request parameters
   * @param _ctx Context object (not used)
   * @param config Optional configuration override
   * @returns Async generator yielding progress chunks
   * @throws {ProviderError} If generation fails
   * @throws {RateLimitError} If rate limit is exceeded
   */
  async *generateImageStream<TContext>(
    request: ImageGenerationRequest,
    _ctx: TContext,
    config?: TConfig
  ): AsyncIterable<ImageGenerationChunk> {
    const effectiveConfig = config || this.config;
    const client = this.createClient(effectiveConfig);

    try {
      // Yield initial status
      yield {
        status: 'Starting image generation...',
        progress: 0,
        done: false,
      };

      let params: any = {
        model: request.model || 'dall-e-3',
        prompt: request.prompt,
        n: request.n,
        size: request.size as '1024x1024' | '1024x1792' | '1792x1024' | null | undefined,
        quality: request.quality as 'standard' | 'hd' | undefined,
        style: request.style as 'vivid' | 'natural' | undefined,
        response_format: request.responseFormat,
      };

      if (this.customizeImageParams) {
        params = this.customizeImageParams(params, effectiveConfig);
      }

      // Yield processing status
      yield {
        status: 'Generating image...',
        progress: 50,
        done: false,
      };

      const response = await client.images.generate(params);

      // Yield completion with results
      for (const img of response.data || []) {
        yield {
          status: 'Image generation complete',
          progress: 100,
          done: true,
          image: {
            url: img.url || undefined,
            b64_json: img.b64_json || undefined,
          },
        };
      }
    } catch (error) {
      if (error instanceof Error && 'status' in error && (error as any).status === 429) {
        throw new RateLimitError(this.name, error.message);
      }
      throw new ProviderError(this.name, 'Image generation streaming failed', error as Error);
    }
  }

  /**
   * Convert various audio input types to Uploadable format.
   * 
   * @param data - 
   * @returns 
   */
  protected toUploadableAudio(data: TranscriptionRequest['audio']): Uploadable {
    if (typeof data === 'string') {
      // URL
      if (data.startsWith('http://') || data.startsWith('https://')) {
        return fs.createReadStream(data);
      }
      // Data URL
      if (data.startsWith('data:')) {
        const match = data.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) {
          throw new Error('Invalid data URL');
        }
        const base64Data = match[2];
        const buffer = Buffer.from(base64Data, 'base64');

        return new File([buffer], 'audio', { type: match[1] });
      }
      // File path
      if (data.startsWith('/')) {
        return fs.createReadStream(data);
      }

      // Raw base64
      const buffer = Buffer.from(data, 'base64');
      return new File([buffer], 'audio', {});
    } else if (Buffer.isBuffer(data)) {
      return new File([data], 'audio', {});
    } else {
      return data;
    }
  }

  /**
   * Transcribe audio to text using Whisper models.
   *
   * Supports multiple audio formats and optional timestamps.
   *
   * @param request Transcription request parameters
   * @param _ctx Context object (not used)
   * @param config Optional configuration override
   * @returns Transcription text and optional metadata
   * @throws {ProviderError} If transcription fails
   * @throws {RateLimitError} If rate limit is exceeded
   */
  async transcribe<TContext>(
    request: TranscriptionRequest,
    _ctx: TContext,
    config?: TConfig
  ): Promise<TranscriptionResponse> {
    const effectiveConfig = config || this.config;
    const client = this.createClient(effectiveConfig);

    try {
      // Convert audio to appropriate format
      let file: Uploadable = this.toUploadableAudio(request.audio);
      let params: OpenAI.Audio.Transcriptions.TranscriptionCreateParamsNonStreaming = {
        model: request.model || 'whisper-1',
        file,
        language: request.language,
        prompt: request.prompt,
        temperature: request.temperature,
        response_format: request.responseFormat as 'json' | 'text' | 'srt' | 'vtt' | 'verbose_json' | undefined,
        timestamp_granularities: request.timestampGranularities as ('word' | 'segment')[] | undefined,
      };

      // Apply provider-specific customizations
      if (this.customizeTranscriptionParams) {
        params = this.customizeTranscriptionParams(params, effectiveConfig);
      }

      const response = await client.audio.transcriptions.create(params);

      // Handle different response formats
      if (typeof response === 'string') {
        return {
          text: response,
          model: request.model || 'whisper-1',
        };
      }

      interface VerboseResponse {
        text: string;
        language?: string;
        duration?: number;
        words?: Array<{ word: string; start: number; end: number }>;
        segments?: Array<{ text: string; start: number; end: number }>;
      }

      const verboseResponse = response as VerboseResponse;

      return {
        text: verboseResponse.text,
        language: verboseResponse.language,
        duration: verboseResponse.duration,
        words: verboseResponse.words,
        segments: verboseResponse.segments,
        model: request.model || 'whisper-1',
      };
    } catch (error) {
      if (error instanceof Error && 'status' in error && (error as any).status === 429) {
        throw new RateLimitError(this.name, error.message);
      }
      throw new ProviderError(this.name, 'Transcription failed', error as Error);
    }
  }

  /**
   * Transcribe audio with streaming progress updates.
   *
   * Note: OpenAI's API doesn't natively support streaming transcription,
   * so this implementation returns the result with progress indicators.
   *
   * @param request Transcription request parameters
   * @param _ctx Context object (not used)
   * @param config Optional configuration override
   * @returns Async generator yielding transcription chunks
   * @throws {ProviderError} If transcription fails
   * @throws {RateLimitError} If rate limit is exceeded
   */
  async *transcribeStream<TContext>(
    request: TranscriptionRequest,
    _ctx: TContext,
    config?: TConfig
  ): AsyncIterable<TranscriptionChunk> {
    const effectiveConfig = config || this.config;
    const client = this.createClient(effectiveConfig);

    try {
      // Yield initial status
      yield {
        status: 'Starting transcription...',
        progress: 0,
        done: false,
      };

      let file: Uploadable = this.toUploadableAudio(request.audio);
      let params: OpenAI.Audio.Transcriptions.TranscriptionCreateParamsNonStreaming = {
        model: request.model || 'whisper-1',
        file,
        language: request.language,
        prompt: request.prompt,
        temperature: request.temperature,
        response_format: request.responseFormat as 'json' | 'text' | 'srt' | 'vtt' | 'verbose_json' | undefined,
        timestamp_granularities: request.timestampGranularities as ('word' | 'segment')[] | undefined,
      };

      if (this.customizeTranscriptionParams) {
        params = this.customizeTranscriptionParams(params, effectiveConfig);
      }

      // Yield processing status
      yield {
        status: 'Transcribing audio...',
        progress: 50,
        done: false,
      };

      const response = await client.audio.transcriptions.create(params);

      // Handle different response formats
      if (typeof response === 'string') {
        yield {
          text: response,
          progress: 100,
          status: 'Transcription complete',
          done: true,
        };
        return;
      }

      interface VerboseResponse {
        text: string;
        language?: string;
        duration?: number;
        words?: Array<{ word: string; start: number; end: number }>;
        segments?: Array<{ text: string; start: number; end: number }>;
      }

      const verboseResponse = response as VerboseResponse;

      // Yield words if available
      if (verboseResponse.words) {
        for (const word of verboseResponse.words) {
          yield {
            word,
            progress: 90,
            done: false,
          };
        }
      }

      // Yield segments if available
      if (verboseResponse.segments) {
        for (const segment of verboseResponse.segments) {
          yield {
            segment,
            progress: 95,
            done: false,
          };
        }
      }

      // Yield final complete text
      yield {
        text: verboseResponse.text,
        progress: 100,
        status: 'Transcription complete',
        done: true,
      };
    } catch (error) {
      if (error instanceof Error && 'status' in error && (error as any).status === 429) {
        throw new RateLimitError(this.name, error.message);
      }
      throw new ProviderError(this.name, 'Transcription streaming failed', error as Error);
    }
  }

  /**
   * Generate speech from text using TTS models.
   *
   * Supports multiple voices and audio formats.
   *
   * @param request Speech synthesis request parameters
   * @param _ctx Context object (not used)
   * @param config Optional configuration override
   * @returns Audio buffer and content type
   * @throws {ProviderError} If speech generation fails
   * @throws {RateLimitError} If rate limit is exceeded
   */
  async generateSpeech<TContext>(
    request: SpeechRequest,
    _ctx: TContext,
    config?: TConfig
  ): Promise<SpeechResponse> {
    const effectiveConfig = config || this.config;
    const client = this.createClient(effectiveConfig);

    try {
      const voice = request.voice || 'alloy';
      const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
      const selectedVoice = validVoices.includes(voice) ? voice : 'alloy';

      let params: any = {
        model: request.model || 'tts-1',
        input: request.text,
        voice: selectedVoice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
        speed: request.speed,
        response_format: request.responseFormat,
      };

      // Apply provider-specific customizations
      if (this.customizeSpeechParams) {
        params = this.customizeSpeechParams(params, effectiveConfig);
      }

      const response = await client.audio.speech.create(params);

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      const format = request.responseFormat || 'mp3';
      const contentType =
        format === 'mp3'
          ? 'audio/mpeg'
          : format === 'opus'
          ? 'audio/opus'
          : format === 'aac'
          ? 'audio/aac'
          : format === 'flac'
          ? 'audio/flac'
          : format === 'wav'
          ? 'audio/wav'
          : format === 'pcm'
          ? 'audio/pcm'
          : 'audio/mpeg';

      return {
        audioBuffer,
        contentType,
        model: request.model || 'tts-1',
      };
    } catch (error) {
      if (error instanceof Error && 'status' in error && (error as any).status === 429) {
        throw new RateLimitError(this.name, error.message);
      }
      throw new ProviderError(this.name, 'Speech generation failed', error as Error);
    }
  }

  /**
   * Generate speech with streaming audio chunks.
   *
   * Note: OpenAI's API doesn't natively support streaming speech generation,
   * so this implementation returns the complete audio with progress indicators.
   *
   * @param request Speech synthesis request parameters
   * @param _ctx Context object (not used)
   * @param config Optional configuration override
   * @returns Async generator yielding speech chunks
   * @throws {ProviderError} If speech generation fails
   * @throws {RateLimitError} If rate limit is exceeded
   */
  async *generateSpeechStream<TContext>(
    request: SpeechRequest,
    _ctx: TContext,
    config?: TConfig
  ): AsyncIterable<SpeechChunk> {
    const effectiveConfig = config || this.config;
    const client = this.createClient(effectiveConfig);

    try {
      // Yield initial status
      yield {
        status: 'Starting speech generation...',
        progress: 0,
        done: false,
      };

      const voice = request.voice || 'alloy';
      const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
      const selectedVoice = validVoices.includes(voice) ? voice : 'alloy';

      let params: any = {
        model: request.model || 'tts-1',
        input: request.text,
        voice: selectedVoice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
        speed: request.speed,
        response_format: request.responseFormat,
      };

      if (this.customizeSpeechParams) {
        params = this.customizeSpeechParams(params, effectiveConfig);
      }

      // Yield processing status
      yield {
        status: 'Generating speech...',
        progress: 50,
        done: false,
      };

      const response = await client.audio.speech.create(params);
      const audioBuffer = Buffer.from(await response.arrayBuffer());

      // Yield complete audio
      yield {
        audioData: audioBuffer,
        progress: 100,
        status: 'Speech generation complete',
        done: true,
      };
    } catch (error) {
      if (error instanceof Error && 'status' in error && (error as any).status === 429) {
        throw new RateLimitError(this.name, error.message);
      }
      throw new ProviderError(this.name, 'Speech generation streaming failed', error as Error);
    }
  }

  /**
   * Generate text embeddings for semantic search and similarity.
   *
   * Supports text-embedding-3-small, text-embedding-3-large, and ada-002 models.
   *
   * @param request Embedding request parameters
   * @param _ctx Context object (not used)
   * @param config Optional configuration override
   * @returns Array of embeddings with usage information
   * @throws {ProviderError} If embedding generation fails
   * @throws {RateLimitError} If rate limit is exceeded
   */
  async embed<TContext>(
    request: EmbeddingRequest,
    _ctx: TContext,
    config?: TConfig
  ): Promise<EmbeddingResponse> {
    const effectiveConfig = config || this.config;
    const client = this.createClient(effectiveConfig);

    try {
      let params: any = {
        model: request.model || 'text-embedding-3-small',
        input: request.texts,
        dimensions: request.dimensions,
        encoding_format: request.encodingFormat,
      };

      // Apply provider-specific customizations
      if (this.customizeEmbeddingParams) {
        params = this.customizeEmbeddingParams(params, effectiveConfig);
      }

      const response = await client.embeddings.create(params);

      return {
        embeddings: response.data.map((item) => ({
          embedding: item.embedding,
          index: item.index,
        })),
        model: response.model,
        usage: response.usage
          ? {
              inputTokens: response.usage.prompt_tokens,
              outputTokens: 0,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      if (error instanceof Error && 'status' in error && (error as any).status === 429) {
        throw new RateLimitError(this.name, error.message);
      }
      throw new ProviderError(this.name, 'Embedding generation failed', error as Error);
    }
  }
}
