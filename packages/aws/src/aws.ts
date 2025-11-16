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
  ImageGenerationChunk,
  ModelInfo,
  Provider,
} from '@aits/ai';
import { detectTier } from '@aits/ai';
import type {
  Chunk,
  Executor,
  FinishReason,
  Request,
  Response,
  Streamer,
  ToolCall,
  ModelInput,
} from '@aits/core';
import { getModel } from '@aits/core';
import {
  BedrockClient,
  ListFoundationModelsCommand,
  type FoundationModelSummary,
} from '@aws-sdk/client-bedrock';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
  type InvokeModelCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';
import z from 'zod';
import { AWSError, AWSAuthError, AWSRateLimitError, AWSQuotaError, AWSContextWindowError, type ModelFamilyConfig } from './types';

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
export interface AWSBedrockConfig {
  // AWS region (e.g., 'us-east-1', 'us-west-2')
  region?: string;
  // Optional explicit credentials (if not using default credential chain)
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
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
}

// ============================================================================
// AWS Bedrock Provider Class
// ============================================================================

/**
 * AWS Bedrock provider implementation for the @aits framework.
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
 * import { AWSBedrockProvider } from '@aits/aws';
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
    
    const clientConfig = {
      region: config.region || process.env.AWS_REGION || 'us-east-1',
      credentials: config.credentials,
    };

    this.bedrockClient = new BedrockClient(clientConfig);
    this.bedrockRuntimeClient = new BedrockRuntimeClient(clientConfig);
  }

  // ============================================================================
  // Model Information & Detection
  // ============================================================================

  /**
   * Detect model family from model ID
   */
  private detectModelFamily(modelId: string): string {
    if (modelId.startsWith('anthropic.')) return 'anthropic';
    if (modelId.startsWith('amazon.')) return 'amazon';
    if (modelId.startsWith('meta.')) return 'meta';
    if (modelId.startsWith('mistral.')) return 'mistral';
    if (modelId.startsWith('cohere.')) return 'cohere';
    if (modelId.startsWith('ai21.')) return 'ai21';
    if (modelId.startsWith('stability.')) return 'stability';
    return 'unknown';
  }

  /**
   * Convert AWS Bedrock model to @aits ModelInfo format
   */
  private convertModel(model: FoundationModelSummary): ModelInfo {
    const modelId = model.modelId || '';
    const family = this.detectModelFamily(modelId);
    const tier = detectTier(modelId);

    // Detect capabilities based on model family and ID
    const capabilities = new Set<'chat' | 'tools' | 'vision' | 'json' | 'structured' | 'streaming' | 'reasoning' | 'image' | 'audio' | 'hearing' | 'embedding' | 'zdr'>();
    
    // Chat models
    if (family === 'anthropic' || family === 'meta' || family === 'mistral' || family === 'cohere' || family === 'ai21') {
      capabilities.add('chat');
      capabilities.add('streaming');
    }
    
    // Vision support (Claude 3 models)
    if (modelId.includes('claude-3') || modelId.includes('claude-3-5')) {
      capabilities.add('vision');
    }
    
    // Tools support
    if (family === 'anthropic' && (modelId.includes('claude-3') || modelId.includes('claude-3-5'))) {
      capabilities.add('tools');
    }
    
    // Image generation
    if (family === 'stability') {
      capabilities.add('image');
    }
    
    // Embeddings
    if (family === 'amazon' && modelId.includes('embed')) {
      capabilities.add('embedding');
    }

    return {
      provider: this.name,
      id: modelId,
      name: model.modelName || modelId,
      capabilities,
      tier,
      pricing: {},
      contextWindow: 0, // Will need to be populated from external sources
      maxOutputTokens: undefined,
      metadata: {
        modelArn: model.modelArn,
        responseStreamingSupported: model.responseStreamingSupported,
        customizationsSupported: model.customizationsSupported,
        inferenceTypesSupported: model.inferenceTypesSupported,
        inputModalities: model.inputModalities,
        outputModalities: model.outputModalities,
      },
    };
  }

  // ============================================================================
  // Provider Interface Implementation
  // ============================================================================

  /**
   * List available models from AWS Bedrock
   */
  async listModels(config?: AWSBedrockConfig): Promise<ModelInfo[]> {
    try {
      const command = new ListFoundationModelsCommand({});
      const response = await this.bedrockClient.send(command);
      
      if (!response.modelSummaries) {
        return [];
      }

      return response.modelSummaries
        .filter(m => m.modelId) // Filter out models without IDs
        .map(m => this.convertModel(m));
    } catch (error) {
      throw new AWSError('Failed to list models', error as Error);
    }
  }

  /**
   * Check if AWS Bedrock is accessible
   */
  async checkHealth(config?: AWSBedrockConfig): Promise<boolean> {
    try {
      const command = new ListFoundationModelsCommand({});
      await this.bedrockClient.send(command);
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

    return async (request: Request, ctx: AIContextAny, metadata?: AIMetadataAny): Promise<Response> => {
      const model = getModel(request.model || ctx.metadata?.model || metadata?.model || effectiveConfig.defaultModels?.chat);
      if (!model) {
        throw new AWSError('Model is required for AWS Bedrock requests');
      }

      const family = this.detectModelFamily(model.id);
      
      // Route to appropriate model handler
      if (family === 'anthropic') {
        return this.executeAnthropicModel(model.id, request, ctx);
      } else if (family === 'meta' || family === 'mistral') {
        return this.executeLlamaStyleModel(model.id, request, ctx);
      } else if (family === 'cohere') {
        return this.executeCohereModel(model.id, request, ctx);
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

      const family = this.detectModelFamily(model.id);
      
      // Route to appropriate model handler
      if (family === 'anthropic') {
        yield* this.streamAnthropicModel(model.id, request, ctx);
      } else if (family === 'meta' || family === 'mistral') {
        yield* this.streamLlamaStyleModel(model.id, request, ctx);
      } else if (family === 'cohere') {
        yield* this.streamCohereModel(model.id, request, ctx);
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
  private convertToolsToAnthropic(request: Request): any[] | undefined {
    if (!request.tools || request.tools.length === 0) return undefined;

    return request.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: z.toJSONSchema(tool.parameters, { target: 'draft-7' }),
    }));
  }

  /**
   * Convert tool choice to Anthropic format
   */
  private convertToolChoiceToAnthropic(request: Request): any | undefined {
    if (!request.toolChoice) return undefined;

    if (request.toolChoice === 'auto') return { type: 'auto' };
    if (request.toolChoice === 'required') return { type: 'any' };
    if (request.toolChoice === 'none') return undefined;
    if (typeof request.toolChoice === 'object') {
      return { type: 'tool', name: request.toolChoice.tool };
    }

    return undefined;
  }

  private async executeAnthropicModel(modelId: string, request: Request, ctx: AIContextAny): Promise<Response> {
    // Convert messages to Anthropic format
    const messages = this.convertMessagesToAnthropic(request);
    
    // Join all system messages
    const systemMessages = request.messages.filter(m => m.role === 'system');
    const system = systemMessages.length > 0
      ? systemMessages.map(m => typeof m.content === 'string' ? m.content : '').join('\n\n')
      : undefined;

    // Convert tools
    const tools = this.convertToolsToAnthropic(request);
    const tool_choice = tools ? this.convertToolChoiceToAnthropic(request) : undefined;

    interface AnthropicRequestBody {
      anthropic_version: string;
      max_tokens: number;
      messages: any[];
      system?: string;
      temperature?: number;
      top_p?: number;
      stop_sequences?: string | string[];
      tools?: any[];
      tool_choice?: any;
    }

    const body: AnthropicRequestBody = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: request.maxTokens || 4096,
      messages,
      system,
      temperature: request.temperature,
      top_p: request.topP,
      stop_sequences: request.stop,
      tools,
      tool_choice,
    };

    try {
      const command = new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body),
      });

      const response = await this.bedrockRuntimeClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      // Extract text content and tool calls
      let content = '';
      const toolCalls: ToolCall[] = [];

      if (responseBody.content && Array.isArray(responseBody.content)) {
        for (const block of responseBody.content) {
          if (block.type === 'text') {
            content += block.text;
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id,
              name: block.name,
              arguments: JSON.stringify(block.input),
            });
          }
        }
      }

      return {
        content,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason: this.mapAnthropicStopReason(responseBody.stop_reason),
        model: { id: modelId },
        usage: {
          text: {
            input: responseBody.usage?.input_tokens ?? -1,
            output: responseBody.usage?.output_tokens ?? -1,
          },
        },
      };
    } catch (error: any) {
      this.handleAWSError(error);
      throw error;
    }
  }

  private async* streamAnthropicModel(modelId: string, request: Request, ctx: AIContextAny): AsyncGenerator<Chunk> {
    const messages = this.convertMessagesToAnthropic(request);
    
    // Join all system messages
    const systemMessages = request.messages.filter(m => m.role === 'system');
    const system = systemMessages.length > 0
      ? systemMessages.map(m => typeof m.content === 'string' ? m.content : '').join('\n\n')
      : undefined;

    // Convert tools
    const tools = this.convertToolsToAnthropic(request);
    const tool_choice = tools ? this.convertToolChoiceToAnthropic(request) : undefined;

    interface AnthropicRequestBody {
      anthropic_version: string;
      max_tokens: number;
      messages: any[];
      system?: string;
      temperature?: number;
      top_p?: number;
      stop_sequences?: string | string[];
      tools?: any[];
      tool_choice?: any;
    }

    const body: AnthropicRequestBody = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: request.maxTokens || 4096,
      messages,
      system,
      temperature: request.temperature,
      top_p: request.topP,
      stop_sequences: request.stop,
      tools,
      tool_choice,
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

      let inputTokens = 0;
      let outputTokens = 0;
      
      // Track tool calls similar to OpenAI implementation
      type ToolCallItem = { id: string; name: string; arguments: string; named: boolean; finished: boolean };
      const toolCallsMap = new Map<number, ToolCallItem>();

      for await (const event of response.body) {
        if (event.chunk) {
          const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
          
          if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
            yield {
              content: chunk.delta.text,
              finishReason: undefined,
            };
          } else if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'tool_use') {
            // Start of a tool use block
            const index = chunk.index;
            const toolCall: ToolCallItem = {
              id: chunk.content_block.id,
              name: chunk.content_block.name,
              arguments: '',
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
          } else if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'input_json_delta') {
            // Tool input accumulation
            const index = chunk.index;
            const toolCall = toolCallsMap.get(index);
            if (toolCall) {
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
              yield {
                content: undefined,
                finishReason: this.mapAnthropicStopReason(chunk.delta.stop_reason),
                usage: {
                  text: {
                    input: inputTokens,
                    output: chunk.usage?.output_tokens || 0,
                  },
                },
              };
            }
          }
        }
      }
    } catch (error: any) {
      this.handleAWSError(error);
      throw error;
    }
  }

  private convertMessagesToAnthropic(request: Request): any[] {
    return request.messages
      .filter(m => m.role !== 'system')
      .map(msg => {
        if (msg.role === 'assistant') {
          // Handle assistant messages with tool calls
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            const content: any[] = [];
            
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
                input: JSON.parse(toolCall.arguments),
              });
            }
            
            return {
              role: 'assistant',
              content,
            };
          }
          
          return {
            role: 'assistant',
            content: typeof msg.content === 'string' ? msg.content : '',
          };
        } else if (msg.role === 'tool') {
          // Handle tool result messages
          return {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: msg.toolCallId,
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
            const content = msg.content.map(part => {
              if (part.type === 'text') {
                return { type: 'text', text: String(part.content) };
              } else if (part.type === 'image') {
                // Convert image to base64 if needed
                let source: any;
                if (typeof part.content === 'string') {
                  if (part.content.startsWith('data:')) {
                    const match = part.content.match(/^data:([^;]+);base64,(.+)$/);
                    if (match) {
                      source = {
                        type: 'base64',
                        media_type: match[1],
                        data: match[2],
                      };
                    }
                  } else if (part.content.startsWith('http')) {
                    source = {
                      type: 'url',
                      url: part.content,
                    };
                  }
                }
                return { type: 'image', source };
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
          content: '',
        };
      });
  }

  private mapAnthropicStopReason(reason: string): FinishReason {
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

      const response = await this.bedrockRuntimeClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      return {
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

      const response = await this.bedrockRuntimeClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      return {
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

  generateImage: Provider['generateImage'] = async (request, ctx, config) => {
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

      const response = await this.bedrockRuntimeClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      const images = responseBody.artifacts?.map((artifact: any) => ({
        url: `data:image/png;base64,${artifact.base64}`,
        base64: artifact.base64,
        revisedPrompt: undefined,
      })) || [];

      return {
        images,
        model,
      };
    } catch (error: any) {
      this.handleAWSError(error);
      throw error;
    }
  };

  // ============================================================================
  // Embeddings (Amazon Titan)
  // ============================================================================

  embed: Provider['embed'] = async (request, ctx, config) => {
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

      const response = await this.bedrockRuntimeClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      // Handle multiple texts if provided
      const embeddings = request.texts.map(() => responseBody.embedding);

      return {
        embeddings,
        model,
        usage: {
          embeddings: {
            tokens: responseBody.inputTextTokenCount ?? -1,
          },
        },
      };
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
