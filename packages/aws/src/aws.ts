/**
 * AWS Bedrock Provider
 *
 * Provider for AWS Bedrock models including Claude, Llama, Titan, Mistral, and more.
 * Uses AWS SDK v3 to automatically pick up credentials from environment, IAM roles, or credential files.
 */

import type {
  AIContextAny,
  AIMetadataAny,
  EmbeddingRequest,
  EmbeddingResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ModelInfo,
  Provider
} from '@aeye/ai';
import {
  Chunk,
  Executor,
  FinishReason,
  getModel,
  ModelInput,
  Request,
  Response,
  Streamer,
  toJSONSchema,
  ToolCall,
} from '@aeye/core';
import type { Anthropic } from '@anthropic-ai/sdk';
import {
  BedrockClient,
  BedrockClientConfig,
  ListFoundationModelsCommand
} from '@aws-sdk/client-bedrock';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand
} from '@aws-sdk/client-bedrock-runtime';
import { isModelInfo } from 'packages/ai/src/common';
import { convertAWSModel, detectAWSFamily } from './common';
import { AWSAuthError, AWSContextWindowError, AWSError, AWSQuotaError, AWSRateLimitError, type ModelFamilyConfig } from './types';
import { get } from 'http';
import { Base64ImageSource, URLImageSource } from '@anthropic-ai/sdk/resources/messages.mjs';

// ============================================================================
// AWS Bedrock Provider Configuration
// ============================================================================

/**
 * Configuration options for the AWS Bedrock provider.
 *
 * Credentials are automatically discovered using the AWS SDK credential chain:
 * 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 * 2. Shared credentials file (~/.aws/credentials)
 * 3. IAM roles (when running on EC2, ECS, Lambda, etc.)
 *
 * @example
 * ```typescript
 * const config: AWSBedrockConfig = {
 *   region: 'us-east-1', // Optional, defaults to AWS_REGION env var
 *   // Credentials are picked up automatically from environment
 * };
 * ```
 *
 * @example With explicit credentials
 * ```typescript
 * const config: AWSBedrockConfig = {
 *   region: 'us-west-2',
 *   credentials: {
 *     accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
 *   },
 * };
 * ```
 */
/**
 * Hook called before a request is made to the provider.
 * 
 * @template TRequest - The request type
 * @template TCommand - The AWS command type
 * @param request - The request object
 * @param command - The AWS SDK command being sent
 * @param ctx - The context object
 */
export type PreRequestHook<TRequest = any, TCommand = any> = (
  request: TRequest,
  command: TCommand,
  ctx: AIContextAny
) => void | Promise<void>;

/**
 * Hook called after a response is received from the provider.
 * 
 * @template TRequest - The request type
 * @template TCommand - The AWS command type
 * @template TResponse - The response type
 * @param request - The request object
 * @param command - The AWS SDK command that was sent
 * @param response - The response object
 * @param ctx - The context object
 */
export type PostRequestHook<TRequest = any, TCommand = any, TResponse = any> = (
  request: TRequest,
  command: TCommand,
  response: TResponse,
  ctx: AIContextAny
) => void | Promise<void>;

/**
 * Hooks for different operation types.
 */
export interface AWSBedrockHooks {
  // Chat completion hooks
  chat?: {
    beforeRequest?: PreRequestHook<Request, InvokeModelCommand | InvokeModelWithResponseStreamCommand>;
    afterRequest?: PostRequestHook<Request, InvokeModelCommand | InvokeModelWithResponseStreamCommand, Response>;
  };
  // Image generation hooks
  imageGenerate?: {
    beforeRequest?: PreRequestHook<ImageGenerationRequest, InvokeModelCommand>;
    afterRequest?: PostRequestHook<ImageGenerationRequest, InvokeModelCommand, ImageGenerationResponse>;
  };
  // Embedding hooks
  embed?: {
    beforeRequest?: PreRequestHook<EmbeddingRequest, InvokeModelCommand>;
    afterRequest?: PostRequestHook<EmbeddingRequest, InvokeModelCommand, EmbeddingResponse>;
  };
}

export interface AWSBedrockConfig {
  // AWS region (e.g., 'us-east-1', 'us-west-2')
  region?: string;
  // Optional explicit credentials (if not using default credential chain)
  credentials?: {
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
  };
  // Model family configurations
  modelFamilies?: Record<string, ModelFamilyConfig>;
  // Default models for different capabilities
  defaultModels?: {
    chat?: ModelInput;
    imageGenerate?: ModelInput;
    embedding?: ModelInput;
  };
  // Anthropic-specific configuration
  anthropic?: {
    version?: string;
    beta?: AnthropicBeta[];
    emptyMessage?: Anthropic.MessageParam;
  },
  // Hooks for intercepting requests and responses
  hooks?: AWSBedrockHooks;
}


// Helper types
type AnthropicBeta = 'computer-use-2025-01-24' | 'token-efficient-tools-2025-02-19' | 'Interleaved-thinking-2025-05-14' | 'output-128k-2025-02-19' | 'dev-full-thinking-2025-05-14' | 'context-1m-2025-08-07' | 'context-management-2025-06-27';
type AnthropicRequest = Omit<Anthropic.MessageCreateParams, 'model' | 'stream'> & {
  anthropic_version: string;
  anthropic_beta?: AnthropicBeta[];
};

// ============================================================================
// AWS Bedrock Provider Class
// ============================================================================

/**
 * AWS Bedrock provider implementation for the @aeye framework.
 *
 * Supports the full range of AWS Bedrock capabilities including:
 * - Chat completions with Claude, Llama, Mistral, Cohere, and more
 * - Image generation with Stability AI models
 * - Text embeddings with Amazon Titan
 * - Streaming responses
 *
 * Uses AWS SDK v3 for automatic credential discovery and management.
 *
 * @example Basic usage
 * ```typescript
 * import { AWSBedrockProvider } from '@aeye/aws';
 *
 * const provider = new AWSBedrockProvider({
 *   region: 'us-east-1',
 * });
 *
 * const executor = provider.createExecutor();
 * const response = await executor(
 *   {
 *     messages: [
 *       { role: 'user', content: 'Hello!' }
 *     ]
 *   },
 *   {},
 *   { model: 'anthropic.claude-3-sonnet-20240229-v1:0' }
 * );
 * ```
 */
export class AWSBedrockProvider implements Provider<AWSBedrockConfig> {
  readonly name: string = 'aws-bedrock';
  readonly config: AWSBedrockConfig;
  defaultMetadata?: Provider['defaultMetadata'];

  private bedrockClient: BedrockClient;
  private bedrockRuntimeClient: BedrockRuntimeClient;

  constructor(config: AWSBedrockConfig) {
    this.config = config;
    
    const clientConfig = AWSBedrockProvider.convertConfig(config);

    this.bedrockClient = new BedrockClient(clientConfig);
    this.bedrockRuntimeClient = new BedrockRuntimeClient(clientConfig);
  }

  /**
   * Convert AWSBedrockConfig to BedrockClientConfig
   * 
   * @param config 
   * @returns 
   */
  private static convertConfig(config: AWSBedrockConfig): BedrockClientConfig {
    const clientConfig: BedrockClientConfig = {
      region: config.region || process.env.AWS_REGION || 'us-east-1',
    };
    if (config.credentials && config.credentials.accessKeyId && config.credentials.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.credentials.accessKeyId,
        secretAccessKey: config.credentials.secretAccessKey,
        sessionToken: config.credentials.sessionToken,
      };
    }
    return clientConfig;
  }

  // ============================================================================
  // Provider Interface Implementation
  // ============================================================================

  /**
   * List available models from AWS Bedrock
   */
  async listModels(config?: AWSBedrockConfig): Promise<ModelInfo[]> {
    try {
      const client = config && JSON.stringify(config) !== JSON.stringify(this.config)
        ? new BedrockClient(AWSBedrockProvider.convertConfig(config)) 
        : this.bedrockClient;
      const command = new ListFoundationModelsCommand({});
      const response = await client.send(command);
      
      if (!response.modelSummaries) {
        return [];
      }

      return response.modelSummaries
        .filter(m => m.modelId) // Filter out models without IDs
        .map(m => convertAWSModel(m))
        .filter(m => !!m);
    } catch (error) {
      throw new AWSError('Failed to list models', error as Error);
    }
  }

  /**
   * Check if AWS Bedrock is accessible
   */
  async checkHealth(config?: AWSBedrockConfig): Promise<boolean> {
    
    try {
      const client = config && JSON.stringify(config) !== JSON.stringify(this.config)
        ? new BedrockClient(AWSBedrockProvider.convertConfig(config)) 
        : this.bedrockClient;

      const command = new ListFoundationModelsCommand({});
      await client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create an executor for chat completion requests
   */
  createExecutor(config?: AWSBedrockConfig): Executor<AIContextAny, AIMetadataAny> {
    const effectiveConfig = { ...this.config, ...config };
    const self = this;

    return async (request: Request, ctx: AIContextAny, metadata?: AIMetadataAny): Promise<Response> => {
      const modelInput = request.model || ctx.metadata?.model || metadata?.model || effectiveConfig.defaultModels?.chat
      if (!modelInput) {
        throw new AWSError('Model is required for AWS Bedrock requests');
      }
      
      const model = getModel(modelInput);
      const family = detectAWSFamily(model.id);
      
      // Route to appropriate model handler
      if (family === 'anthropic') {
        return self.executeAnthropicModel(modelInput, request, ctx);
      } else if (family === 'meta' || family === 'mistral') {
        return self.executeLlamaStyleModel(model.id, request, ctx);
      } else if (family === 'cohere') {
        return self.executeCohereModel(model.id, request, ctx);
      } else {
        throw new AWSError(`Unsupported model family: ${family}`);
      }
    };
  }

  /**
   * Create a streamer for streaming chat completion requests
   */
  createStreamer(config?: AWSBedrockConfig): Streamer<AIContextAny, AIMetadataAny> {
    const effectiveConfig = { ...this.config, ...config };
    const self = this;

    return async function* (
      this: AWSBedrockProvider,
      request: Request,
      ctx: AIContextAny,
      metadata?: AIMetadataAny
    ): AsyncGenerator<Chunk> {
      const model = getModel(request.model || ctx.metadata?.model || metadata?.model || effectiveConfig.defaultModels?.chat);
      if (!model) {
        throw new AWSError('Model is required for AWS Bedrock requests');
      }

      const family = detectAWSFamily(model.id);
      
      // Route to appropriate model handler
      if (family === 'anthropic') {
        return yield* self.streamAnthropicModel(model.id, request, ctx);
      } else if (family === 'meta' || family === 'mistral') {
        return yield* self.streamLlamaStyleModel(model.id, request, ctx);
      } else if (family === 'cohere') {
        return yield* self.streamCohereModel(model.id, request, ctx);
      } else {
        throw new AWSError(`Unsupported model family for streaming: ${family}`);
      }
    };
  }

  // ============================================================================
  // Anthropic (Claude) Model Implementation
  // ============================================================================

  /**
   * Convert tools to Anthropic format
   */
  private convertToolsToAnthropic(request: Request): Anthropic.Tool[] | undefined {
    if (!request.tools || request.tools.length === 0) return undefined;

    return request.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: toJSONSchema(tool.parameters, tool.strict ?? true) as Anthropic.Tool.InputSchema,
    }));
  }

  /**
   * Convert tool choice to Anthropic format
   */
  private convertToolChoiceToAnthropic(request: Request): Anthropic.ToolChoice | undefined {
    if (!request.toolChoice) return undefined;

    if (request.toolChoice === 'auto') return { type: 'auto' };
    if (request.toolChoice === 'required') return { type: 'any' };
    if (request.toolChoice === 'none') return undefined;
    if (typeof request.toolChoice === 'object') {
      return { type: 'tool', name: request.toolChoice.tool };
    }

    return undefined;
  }

  private convertRequestToAnthropic(model: ModelInput, request: Request): AnthropicRequest {
    const messages = this.convertMessagesToAnthropic(request);
    const tools = this.convertToolsToAnthropic(request);
    const tool_choice = tools ? this.convertToolChoiceToAnthropic(request) : undefined;
    const systemMessages = request.messages.filter(m => m.role === 'system');
    const system = systemMessages.length > 0
      ? systemMessages.map((m): Anthropic.TextBlockParam => ({
          type: 'text', 
          text: typeof m.content === 'string' ? m.content : m.content.map(m => m.content).join('\n'),
        }))
      : undefined;

    const modelMax = isModelInfo(model) ? model.maxOutputTokens : undefined;

    return {
      anthropic_version: this.config.anthropic?.version ?? 'bedrock-2023-05-31',
      anthropic_beta: this.config.anthropic?.beta,
      max_tokens: modelMax || 4096,
      messages,
      system,
      temperature: request.temperature,
      top_p: request.topP,
      stop_sequences: request.stop ? Array.isArray(request.stop) ? request.stop : [request.stop] : undefined,
      tools,
      tool_choice,
      metadata: {
        user_id: request.userKey || undefined,
      },
      ...request.extra,
    };
  }

  private async executeAnthropicModel(model: ModelInput, request: Request, ctx: AIContextAny): Promise<Response> {
    const body = this.convertRequestToAnthropic(model, request);
    const modelId = getModel(model)?.id || '';
    
    try {
      const command = new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body),
      });

      // Call pre-request hook with command
      await this.config.hooks?.chat?.beforeRequest?.(request, command, ctx);

      const response = await this.bedrockRuntimeClient.send(command);
      const responseBody: Anthropic.Message = JSON.parse(new TextDecoder().decode(response.body));

      // Extract text content and tool calls
      let content = '';
      let reasoning = undefined as string | undefined;
      const toolCalls: ToolCall[] = [];

      if (responseBody.content) {
        for (const block of responseBody.content) {
          if (block.type === 'text') {
            content += block.text;
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id,
              name: block.name,
              arguments: JSON.stringify(block.input),
            });
          } else if (block.type === 'thinking') {
            reasoning = (reasoning || '') + block.thinking;
          }
        }
      }

      const result: Response = {
        content,
        reasoning,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason: this.mapAnthropicStopReason(responseBody.stop_reason),
        model,
        usage: {
          text: {
            input: responseBody.usage?.input_tokens ?? -1,
            output: responseBody.usage?.output_tokens ?? -1,
          },
        },
      };

      // Call post-request hook with command
      await this.config.hooks?.chat?.afterRequest?.(request, command, result, ctx);

      return result;
    } catch (error: any) {
      this.handleAWSError(error);
      throw error;
    }
  }

  private async* streamAnthropicModel(model: ModelInput, request: Request, ctx: AIContextAny): AsyncGenerator<Chunk> {
    const body = this.convertRequestToAnthropic(model, request);
    const modelId = getModel(model)?.id || '';
    
    try {
      const command = new InvokeModelWithResponseStreamCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body),
      });

      // Call pre-request hook with command
      await this.config.hooks?.chat?.beforeRequest?.(request, command, ctx);

      const response = await this.bedrockRuntimeClient.send(command);
      
      if (!response.body) {
        throw new AWSError('No response body in streaming response');
      }

      let inputTokens = 0;
      let outputTokens = 0;
      let accumulatedContent = '';
      let accumulatedReasoning = '';
      let finishReason: any = undefined;
      
      // Track tool calls similar to OpenAI implementation
      type ToolCallItem = { id: string; name: string; arguments: string; named: boolean; finished: boolean };
      const toolCallsMap = new Map<number, ToolCallItem>();
      
      try {
        for await (const event of response.body) {
          if (event.chunk) {
            const chunk: Anthropic.MessageStreamEvent = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
            
            if (chunk.type === 'content_block_delta' && chunk.delta) {
              switch (chunk.delta.type) {
              case 'text_delta':
                accumulatedContent += chunk.delta.text;
                yield {
                  content: chunk.delta.text,
                  finishReason: undefined,
                };
                break;
              case 'thinking_delta':
                accumulatedReasoning += chunk.delta.thinking;
                yield {
                  reasoning: chunk.delta.thinking,
                };
                break;
              case 'input_json_delta':
                // Tool input accumulation
                const index = chunk.index;
                const toolCall = toolCallsMap.get(index);
                if (toolCall && chunk.delta.partial_json) {
                  if (toolCall.arguments === '{}') {
                    toolCall.arguments = '';
                  }
                  toolCall.arguments += chunk.delta.partial_json;
                  
                  // Yield toolCallArguments event
                  yield {
                    toolCallArguments: {
                      id: toolCall.id,
                      name: toolCall.name,
                      arguments: toolCall.arguments,
                    },
                  };
                }
                break;
              }
            } else if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'tool_use') {
              // Start of a tool use block
              const index = chunk.index;
              const toolCall: ToolCallItem = {
                id: chunk.content_block.id,
                name: chunk.content_block.name,
                arguments: chunk.content_block.input ? JSON.stringify(chunk.content_block.input) : '',
                named: true,
                finished: false,
              };
              toolCallsMap.set(index, toolCall);
              
              // Yield toolCallNamed event
              yield {
                toolCallNamed: {
                  id: toolCall.id,
                  name: toolCall.name,
                  arguments: toolCall.arguments,
                },
              };
            } else if (chunk.type === 'content_block_stop') {
              // Tool use block completed
              const index = chunk.index;
              const toolCall = toolCallsMap.get(index);
              if (toolCall && !toolCall.finished) {
                toolCall.finished = true;
                
                // Yield toolCall event
                yield {
                  toolCall: {
                    id: toolCall.id,
                    name: toolCall.name,
                    arguments: toolCall.arguments,
                  },
                };
              }
            } else if (chunk.type === 'message_start' && chunk.message?.usage) {
              inputTokens = chunk.message.usage.input_tokens || 0;
            } else if (chunk.type === 'message_delta') {
              if (chunk.delta?.stop_reason) {
                finishReason = this.mapAnthropicStopReason(chunk.delta.stop_reason);
                
                yield {
                  finishReason,
                  usage: {
                    text: {
                      input: chunk.usage.input_tokens || inputTokens || undefined,
                      output: chunk.usage.output_tokens || undefined,
                      cached: chunk.usage.cache_read_input_tokens || undefined,
                    },
                  },
                };
              }
            }
          }
        }
      } finally {
        // Call post-request hook with accumulated response
        const toolCalls = Array.from(toolCallsMap.values()).map(tc => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
        }));

        const accumulatedResponse: Response = {
          content: accumulatedContent,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          finishReason,
          model,
          usage: {
            text: {
              input: inputTokens,
              output: outputTokens,
            },
          },
        };
        
        await this.config.hooks?.chat?.afterRequest?.(request, command, accumulatedResponse, ctx);
      }
    } catch (error: any) {
      this.handleAWSError(error);
      throw error;
    }
  }

  private convertMessagesToAnthropic(request: Request): Anthropic.MessageParam[] {
    const toContent = (part: string | Anthropic.ContentBlockParam[]): Anthropic.ContentBlockParam[] => {
      if (typeof part === 'string') {
        return [{ type: 'text', text: part }];
      } else {
        return part;
      }
    };

    const messages = request.messages
      .filter(m => m.role !== 'system')
      .map((msg): Anthropic.MessageParam => {
        if (msg.role === 'assistant') {
          // Handle assistant messages with tool calls
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            const content: Anthropic.ContentBlockParam[] = [];
            
            // Add text content if present
            if (msg.content && typeof msg.content === 'string' && msg.content.trim()) {
              content.push({ type: 'text', text: msg.content });
            }
            
            // Add tool use blocks
            for (const toolCall of msg.toolCalls) {
              content.push({
                type: 'tool_use',
                id: toolCall.id,
                name: toolCall.name,
                input: (() => {
                  try {
                    return JSON.parse(toolCall.arguments);
                  } catch (e) {
                    return { badArguments: toolCall.arguments };
                  }
                })(),
              });
            }
            
            return {
              role: 'assistant',
              content,
            };
          }
          
          return {
            role: 'assistant',
            content: typeof msg.content === 'string' ? msg.content : msg.content.map(m => m.content).join('\n\n'),
          };
        } else if (msg.role === 'tool') {
          // Handle tool result messages
          return {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: msg.toolCallId!,
                content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
              },
            ],
          };
        } else if (msg.role === 'user') {
          // Handle text and image content
          if (typeof msg.content === 'string') {
            return {
              role: 'user',
              content: msg.content,
            };
          } else if (Array.isArray(msg.content)) {
            const content = msg.content.map((part): Anthropic.ContentBlockParam => {
              if (part.type === 'text') {
                return { type: 'text', text: String(part.content) };
              } else if (part.type === 'image') {
                // Convert image to base64 if needed
                let source: Base64ImageSource | URLImageSource | undefined;
                if (typeof part.content === 'string') {
                  if (part.content.startsWith('data:')) {
                    const match = part.content.match(/^data:([^;]+);base64,(.+)$/);
                    if (match) {
                      source = {
                        type: 'base64',
                        media_type: match[1] as Base64ImageSource['media_type'],
                        data: match[2],
                      };
                    } else if (part.content.startsWith('http')) {
                      source = {
                        type: 'url',
                        url: part.content,
                      };
                    }
                  } else {
                    source = {
                      type: 'url',
                      url: part.content,
                    };
                  }
                } else if (part.content instanceof URL) {
                  source = {
                    type: 'url',
                    url: part.content.toString(),
                  };
                }
                if (source) {
                  return { type: 'image', source };
                }
              }
              return { type: 'text', text: '[Unsupported content type]' };
            });

            return {
              role: 'user',
              content,
            };
          }
        }

        return {
          role: 'user',
          content: '<unsupported role>',
        };
      });

    // Filter out empty messages
    const nonEmptyMessages = messages.filter(m => {
      const contentArray = toContent(m.content);
      return contentArray.some(c => c.type === 'text' ? c.text.trim().length > 0 : true);
    });

    // Join up consecutive messages with the same role
    const joinedMessages: Anthropic.MessageParam[] = [];
    let lastMessage: Anthropic.MessageParam | null = null;

    for (const msg of nonEmptyMessages) {
      if (lastMessage && lastMessage.role === msg.role) {
        const lastContent = toContent(lastMessage.content);
        const newContent = toContent(msg.content);
        const allContent = lastContent.concat(newContent);

        lastMessage.content = allContent;
      } else {
        if (lastMessage) {
          joinedMessages.push(lastMessage);
        }
        lastMessage = msg;
      }
    }
    if (lastMessage) {
      joinedMessages.push(lastMessage);
    }

    // Simplify content if single text block
    for (const msg of joinedMessages) {
      const contentArray = toContent(msg.content);
      if (contentArray.every(c => c.type === 'text')) {
        msg.content = contentArray.map(c => c.text).join('\n\n');
      }
    }

    if (joinedMessages.length === 0) {
      if (this.config.anthropic?.emptyMessage) {
        joinedMessages.push(this.config.anthropic.emptyMessage);
      } else {
        joinedMessages.push({
          role: 'user',
          content: 'Perform the requested operation.',
        });
      }
    }

    return joinedMessages;
  }

  private mapAnthropicStopReason(reason: Anthropic.StopReason | null): FinishReason {
    if (!reason) return 'stop';
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'stop_sequence':
        return 'stop';
      case 'tool_use':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }

  // ============================================================================
  // Llama/Mistral Model Implementation
  // ============================================================================

  private async executeLlamaStyleModel(modelId: string, request: Request, ctx: AIContextAny): Promise<Response> {
    const prompt = this.convertMessagesToLlamaPrompt(request);

    const body = {
      prompt,
      max_gen_len: request.maxTokens || 2048,
      temperature: request.temperature,
      top_p: request.topP,
    };

    try {
      const command = new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body),
      });

      // Call pre-request hook with command
      await this.config.hooks?.chat?.beforeRequest?.(request, command, ctx);

      const response = await this.bedrockRuntimeClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      const result: Response = {
        content: responseBody.generation || '',
        toolCalls: [],
        finishReason: responseBody.stop_reason === 'stop' ? 'stop' : 'length',
        model: { id: modelId },
        usage: {
          text: {
            input: responseBody.prompt_token_count ?? -1,
            output: responseBody.generation_token_count ?? -1,
          },
        },
      };

      // Call post-request hook with command
      await this.config.hooks?.chat?.afterRequest?.(request, command, result, ctx);

      return result;
    } catch (error: any) {
      this.handleAWSError(error);
      throw error;
    }
  }

  private async* streamLlamaStyleModel(modelId: string, request: Request, ctx: AIContextAny): AsyncGenerator<Chunk> {
    const prompt = this.convertMessagesToLlamaPrompt(request);

    const body = {
      prompt,
      max_gen_len: request.maxTokens || 2048,
      temperature: request.temperature,
      top_p: request.topP,
    };

    try {
      const command = new InvokeModelWithResponseStreamCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body),
      });

      const response = await this.bedrockRuntimeClient.send(command);
      
      if (!response.body) {
        throw new AWSError('No response body in streaming response');
      }

      for await (const event of response.body) {
        if (event.chunk) {
          const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
          
          if (chunk.generation) {
            yield {
              content: chunk.generation,
              finishReason: chunk.stop_reason === 'stop' ? 'stop' : undefined,
            };
          }
        }
      }
    } catch (error: any) {
      this.handleAWSError(error);
      throw error;
    }
  }

  private convertMessagesToLlamaPrompt(request: Request): string {
    // Simple prompt construction for Llama-style models
    const messages = request.messages.map(msg => {
      const role = msg.role === 'assistant' ? 'Assistant' : msg.role === 'system' ? 'System' : 'User';
      const content = typeof msg.content === 'string' ? msg.content : '[Complex content]';
      return `${role}: ${content}`;
    });
    return messages.join('\n\n') + '\n\nAssistant:';
  }

  // ============================================================================
  // Cohere Model Implementation
  // ============================================================================

  private async executeCohereModel(modelId: string, request: Request, ctx: AIContextAny): Promise<Response> {
    const prompt = this.convertMessagesToCoherePrompt(request);

    const body = {
      prompt,
      max_tokens: request.maxTokens || 2048,
      temperature: request.temperature,
      p: request.topP,
      stop_sequences: request.stop,
    };

    try {
      const command = new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body),
      });

      // Call pre-request hook with command
      await this.config.hooks?.chat?.beforeRequest?.(request, command, ctx);

      const response = await this.bedrockRuntimeClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      const result: Response = {
        content: responseBody.generations?.[0]?.text || '',
        toolCalls: [],
        finishReason: responseBody.generations?.[0]?.finish_reason === 'COMPLETE' ? 'stop' : 'length',
        model: { id: modelId },
        usage: {
          text: {
            input: -1,
            output: -1,
          },
        },
      };

      // Call post-request hook with command
      await this.config.hooks?.chat?.afterRequest?.(request, command, result, ctx);

      return result;
    } catch (error: any) {
      this.handleAWSError(error);
      throw error;
    }
  }

  private async* streamCohereModel(modelId: string, request: Request, ctx: AIContextAny): AsyncGenerator<Chunk> {
    const prompt = this.convertMessagesToCoherePrompt(request);

    const body = {
      prompt,
      max_tokens: request.maxTokens || 2048,
      temperature: request.temperature,
      p: request.topP,
      stop_sequences: request.stop,
      stream: true,
    };

    try {
      const command = new InvokeModelWithResponseStreamCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body),
      });

      const response = await this.bedrockRuntimeClient.send(command);
      
      if (!response.body) {
        throw new AWSError('No response body in streaming response');
      }

      for await (const event of response.body) {
        if (event.chunk) {
          const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
          
          if (chunk.text) {
            yield {
              content: chunk.text,
              finishReason: chunk.finish_reason === 'COMPLETE' ? 'stop' : undefined,
            };
          }
        }
      }
    } catch (error: any) {
      this.handleAWSError(error);
      throw error;
    }
  }

  private convertMessagesToCoherePrompt(request: Request): string {
    const messages = request.messages.map(msg => {
      const content = typeof msg.content === 'string' ? msg.content : '[Complex content]';
      return content;
    });
    return messages.join('\n\n');
  }

  // ============================================================================
  // Image Generation (Stability AI)
  // ============================================================================

  generateImage: Provider['generateImage'] = async (request, ctx, config: AWSBedrockConfig) => {
    const effectiveConfig = { ...this.config, ...config };
    const model = getModel(request.model || effectiveConfig.defaultModels?.imageGenerate);
    
    if (!model) {
      throw new AWSError('Model is required for image generation');
    }

    // Parse size string (e.g., "1024x1024")
    let width = 1024;
    let height = 1024;
    if (request.size) {
      const sizeMatch = request.size.match(/^(\d+)x(\d+)$/);
      if (sizeMatch) {
        width = parseInt(sizeMatch[1], 10);
        height = parseInt(sizeMatch[2], 10);
      }
    }

    const body = {
      text_prompts: [
        {
          text: request.prompt,
          weight: 1,
        },
      ],
      cfg_scale: 7,
      steps: 30,
      seed: request.seed,
      width,
      height,
    };

    try {
      const command = new InvokeModelCommand({
        modelId: model.id,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body),
      });

      // Call pre-request hook with command
      await effectiveConfig.hooks?.imageGenerate?.beforeRequest?.(request, command, ctx);

      const response = await this.bedrockRuntimeClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      const images = responseBody.artifacts?.map((artifact: any) => ({
        url: `data:image/png;base64,${artifact.base64}`,
        base64: artifact.base64,
        revisedPrompt: undefined,
      })) || [];

      const result = {
        images,
        model,
      };

      // Call post-request hook with command
      await effectiveConfig.hooks?.imageGenerate?.afterRequest?.(request, command, result, ctx);

      return result;
    } catch (error: any) {
      this.handleAWSError(error);
      throw error;
    }
  };

  // ============================================================================
  // Embeddings (Amazon Titan)
  // ============================================================================

  embed: Provider['embed'] = async (request, ctx, config: AWSBedrockConfig) => {
    const effectiveConfig = { ...this.config, ...config };
    const model = getModel(request.model || effectiveConfig.defaultModels?.embedding);
    
    if (!model) {
      throw new AWSError('Model is required for embeddings');
    }

    // AWS Titan embeddings expect a single text input
    const body = {
      inputText: request.texts[0] || '',
    };

    try {
      const command = new InvokeModelCommand({
        modelId: model.id,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body),
      });

      // Call pre-request hook with command
      await effectiveConfig.hooks?.embed?.beforeRequest?.(request, command, ctx);

      const response = await this.bedrockRuntimeClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      // Handle multiple texts if provided
      const embeddings = request.texts.map(() => responseBody.embedding);

      const result = {
        embeddings,
        model,
        usage: {
          embeddings: {
            tokens: responseBody.inputTextTokenCount ?? -1,
          },
        },
      };

      // Call post-request hook with command
      await effectiveConfig.hooks?.embed?.afterRequest?.(request, command, result, ctx);

      return result;
    } catch (error: any) {
      this.handleAWSError(error);
      throw error;
    }
  };

  // ============================================================================
  // Error Handling
  // ============================================================================

  private handleAWSError(error: any): void {
    const errorName = error.name || '';
    const errorMessage = error.message || '';

    // Authentication errors
    if (errorName === 'UnrecognizedClientException' || errorName === 'InvalidSignatureException') {
      throw new AWSAuthError(error);
    }

    // Rate limiting
    if (errorName === 'ThrottlingException' || errorName === 'TooManyRequestsException') {
      throw new AWSRateLimitError('Rate limit exceeded', undefined, error);
    }

    // Quota errors
    if (errorName === 'ServiceQuotaExceededException') {
      throw new AWSQuotaError(error);
    }

    // Context window errors
    if (errorMessage.includes('context length') || errorMessage.includes('token limit')) {
      throw new AWSContextWindowError('Context window exceeded', undefined, error);
    }

    // Re-throw as generic AWS error
    throw new AWSError(errorMessage || 'Unknown AWS Bedrock error', error);
  }
}
