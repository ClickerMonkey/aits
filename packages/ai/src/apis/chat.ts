/**
 * Chat API
 *
 * Provides chat completion functionality with automatic model selection, streaming support,
 * and lifecycle hooks. The Chat API is the primary interface for conversational AI.
 *
 * @example
 * ```typescript
 * // Simple chat completion
 * const response = await ai.chat.get([
 *   { role: 'user', content: 'What is TypeScript?' }
 * ]);
 * console.log(response.content);
 *
 * // Streaming chat
 * for await (const chunk of ai.chat.stream([
 *   { role: 'user', content: 'Write a poem about TypeScript' }
 * ])) {
 *   if (chunk.content) {
 *     process.stdout.write(chunk.content);
 *   }
 * }
 *
 * // With context and metadata
 * const response = await ai.chat.get(
 *   [{ role: 'user', content: 'Hello' }],
 *   {
 *     userId: '123',
 *     metadata: {
 *       model: 'gpt-4',
 *       required: ['chat', 'streaming']
 *     }
 *   }
 * );
 * ```
 */

import type { Executor, FinishReason, Streamer, ToolCall } from '@aits/core';
import type { AI } from '../ai';
import type {
  AIBaseTypes,
  AIContext,
  AIContextRequired,
  AIMetadataRequired,
  Chunk,
  ModelCapability,
  ModelParameter,
  ModelHandlerFor,
  Request,
  Response,
  SelectedModelFor,
  Usage
} from '../types';
import { BaseAPI } from './base';

/**
 * ChatAPI provides methods for chat completions with automatic model selection.
 * Inherits get() and stream() methods from BaseAPI.
 *
 * @template T - AIBaseTypes container with all type information
 */
export class ChatAPI<T extends AIBaseTypes> extends BaseAPI<
  T,
  Request,
  Response,
  Chunk
> {
  constructor(ai: AI<T>) {
    super(ai);
  }

  // ============================================================================
  // REQUIRED ABSTRACT METHOD IMPLEMENTATIONS
  // ============================================================================

  protected getRequiredCapabilities(provided: ModelCapability[], request: Request, forStreaming: boolean): ModelCapability[] {
    const capabilities = new Set<ModelCapability>(['chat', ...provided]);

    // Check if request contains images - requires vision capability
    if (request) {
      const hasImages = request.messages.some(message => {
        if (Array.isArray(message.content)) {
          return message.content.some(part => part.type === 'image');
        }
        return false;
      });

      if (hasImages) {
        capabilities.add('vision');
      }

      const hasAudio = request.messages.some(message => {
        if (Array.isArray(message.content)) {
          return message.content.some(part => part.type === 'audio');
        }
        return false;
      });

      if (hasAudio) {
        capabilities.add('hearing');
      }

      // Check if request uses reasoning
      if (request.reason !== undefined) {
        capabilities.add('reasoning');
      }

      // Check if request expects JSON output
      if (request.responseFormat) {
        if (request.responseFormat === 'json') {
          capabilities.add('json');
        } else if (typeof request.responseFormat === 'object') {
          capabilities.add('structured');
        }
      }

      // Check if request uses tools
      if (request.tools && request.tools.length > 0) {
        capabilities.add('tools');
      }
    }

    return Array.from(capabilities);
  }

  protected getRequiredParameters(provided: ModelParameter[], request: Request, forStreaming: boolean): ModelParameter[] {
    const params = new Set<ModelParameter>([...provided]);

    if (request.maxTokens !== undefined) {
      params.add('maxTokens');
    }
    if (request.temperature !== undefined) {
      params.add('temperature');
    }
    if (request.topP !== undefined) {
      params.add('topP');
    }
    if (request.frequencyPenalty !== undefined) {
      params.add('frequencyPenalty');
    }
    if (request.presencePenalty !== undefined) {
      params.add('presencePenalty');
    }
    if (request.stop !== undefined) {
      params.add('stop');
    }
    if (request.logProbabilities !== undefined) {
      params.add('logProbabilities');
    }
    if (request.logitBias !== undefined) {
      params.add('logitBias');
    }
    if (request.responseFormat !== undefined) {
      params.add('responseFormat');
      if (typeof request.responseFormat === 'object') {
        params.add('structuredOutput');
      }
    }
    if (request.reason !== undefined) {
      params.add('reason');
    }
    if (request.tools !== undefined || request.toolChoice !== undefined || request.toolsOnly) {
      params.add('tools');
      if (request.toolChoice !== undefined) {
        params.add('toolChoice');
      }
    }

    return Array.from(params);
  }

  protected getNoModelFoundError(): string {
    return 'No compatible model found for criteria';
  }

  protected getErrorType(operation: 'request' | 'stream'): string {
    return operation === 'request' ? 'chat-request-failed' : 'chat-stream-failed';
  }

  protected getErrorMessage(operation: 'request' | 'stream'): string {
    return operation === 'request' ? 'Chat request failed' : 'Chat streaming failed';
  }

  protected estimateRequestTokens(request: Request, selected: SelectedModelFor<T>): number {
    return this.ai.estimateRequestTokens(request);
  }

  protected async executeRequest(
    request: Request,
    selected: SelectedModelFor<T>,
    ctx: AIContext<T>
  ): Promise<Response> {
    if (!selected.provider.createExecutor) {
      throw new Error(`Provider ${selected.provider.name} does not support chat requests`);
    }

    const executor = selected.provider.createExecutor(selected.providerConfig);
    return await executor(request, ctx, ctx.metadata);
  }

  protected async *executeStreamRequest(
    request: Request,
    selected: SelectedModelFor<T>,
    ctx: AIContext<T>
  ): AsyncIterable<Chunk> {
    if (!selected.provider.createStreamer) {
      throw new Error(`Provider ${selected.provider.name} does not support chat streaming`);
    }

    const streamer = selected.provider.createStreamer(selected.providerConfig);
    yield* streamer(request, ctx, ctx.metadata);
  }

  protected responseToChunk(response: Response): Chunk {
    return {
      content: response.content,
      finishReason: response.finishReason,
      usage: response.usage,
      refusal: response.refusal,
      reasoning: response.reasoning,
      toolCall: response.toolCalls?.[0], // Send first tool call if any
      model: response.model,
    };
  }

  protected chunksToResponse(chunks: Chunk[], model: string): Response {
    let content = '';
    let finishReason: FinishReason = 'stop';
    let refusal: string | undefined;
    let reasoning: string | undefined;
    const toolCalls: ToolCall[] = [];
    let usage: Usage | undefined;

    for (const chunk of chunks) {
      if (chunk.content) {
        content += chunk.content;
      }
      if (chunk.toolCall) {
        toolCalls.push(chunk.toolCall);
      }
      if (chunk.finishReason) {
        finishReason = chunk.finishReason;
      }
      if (chunk.refusal) {
        refusal = (refusal || '') + chunk.refusal;
      }
      if (chunk.reasoning) {
        reasoning = (reasoning || '') + chunk.reasoning;
      }
      if (chunk.usage) {
        usage = chunk.usage;
      }
      if (chunk.model) {
        model = chunk.model;
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason,
      refusal,
      reasoning,
      model,
      usage,
    };
  }

  protected getHandlerGetMethod(
    handler?: ModelHandlerFor<T>
  ): ((request: Request, ctx: AIContext<T>) => Promise<Response>) | undefined {
    return handler?.chat?.get;
  }

  protected getHandlerStreamMethod(
    handler?: ModelHandlerFor<T>
  ): ((request: Request, ctx: AIContext<T>) => AsyncIterable<Chunk>) | undefined {
    return handler?.chat?.stream;
  }

  protected hasProviderExecutor(selected: SelectedModelFor<T>): boolean {
    return !!selected.provider.createExecutor;
  }

  protected hasProviderStreamer(selected: SelectedModelFor<T>): boolean {
    return !!selected.provider.createStreamer;
  }

  /**
   * Create an executor function for use in core Context.
   * This executor routes through ChatAPI's get method, allowing Prompts
   * to execute chat completions through the context.
   *
   * @returns Executor function
   * @internal
   */
  createExecutor(): Executor<AIContextRequired<T>, AIMetadataRequired<T>> {
    return async (
      request: Request,
      ctx: AIContextRequired<T>,
      metadata?: AIMetadataRequired<T>,
      signal?: AbortSignal
    ): Promise<Response> => {
      return await this.get(request, { ...ctx, metadata, signal });
    };
  }

  /**
   * Create a streamer function for use in core Context.
   * This streamer routes through ChatAPI's stream method, allowing Prompts
   * to execute streaming chat completions through the context.
   *
   * @returns Streamer function
   * @internal
   */
  createStreamer(): Streamer<AIContextRequired<T>, AIMetadataRequired<T>> {
    const chatAPI = this;
    return async function* (
      request: Request,
      ctx: AIContextRequired<T>,
      metadata?: AIMetadataRequired<T>,
      signal?: AbortSignal
    ): AsyncGenerator<Chunk, Response> {
      const chunks: Chunk[] = [];
      for await (const chunk of chatAPI.stream(request, { ...ctx, metadata, signal })) {
        yield chunk;
        chunks.push(chunk);
      }

      return chatAPI.chunksToResponse(chunks, 'unknown');
    };
  }
}
