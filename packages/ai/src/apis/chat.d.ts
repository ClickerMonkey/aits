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
import { type Executor, type Streamer } from '@aits/core';
import type { AI } from '../ai';
import type { AIBaseTypes, AIContext, AIContextRequired, AIMetadataRequired, Chunk, ModelCapability, ModelHandlerFor, ModelParameter, Request, Response, SelectedModelFor } from '../types';
import { BaseAPI } from './base';
/**
 * ChatAPI provides methods for chat completions with automatic model selection.
 * Inherits get() and stream() methods from BaseAPI.
 *
 * @template T - AIBaseTypes container with all type information
 */
export declare class ChatAPI<T extends AIBaseTypes> extends BaseAPI<T, Request, Response, Chunk> {
    constructor(ai: AI<T>);
    protected getRequiredCapabilities(provided: ModelCapability[], request: Request, forStreaming: boolean): ModelCapability[];
    protected getRequiredParameters(provided: ModelParameter[], request: Request, forStreaming: boolean): ModelParameter[];
    protected getNoModelFoundError(): string;
    protected getErrorType(operation: 'request' | 'stream'): string;
    protected getErrorMessage(operation: 'request' | 'stream'): string;
    protected estimateRequestTokens(request: Request, selected: SelectedModelFor<T>): number;
    protected executeRequest<TRuntimeContext extends AIContext<T>>(request: Request, selected: SelectedModelFor<T>, ctx: TRuntimeContext): Promise<Response>;
    protected executeStreamRequest<TRuntimeContext extends AIContext<T>>(request: Request, selected: SelectedModelFor<T>, ctx: TRuntimeContext): AsyncIterable<Chunk>;
    protected responseToChunks(response: Response): Chunk[];
    protected chunksToResponse(chunks: Chunk[], model: string): Response;
    protected getHandlerGetMethod(handler?: ModelHandlerFor<T>): (<TRuntimeContext extends AIContext<T>>(request: Request, ctx: TRuntimeContext) => Promise<Response>) | undefined;
    protected getHandlerStreamMethod(handler?: ModelHandlerFor<T>): (<TRuntimeContext extends AIContext<T>>(request: Request, ctx: TRuntimeContext) => AsyncIterable<Chunk>) | undefined;
    protected hasProviderExecutor(selected: SelectedModelFor<T>): boolean;
    protected hasProviderStreamer(selected: SelectedModelFor<T>): boolean;
    /**
     * Create an executor function for use in core Context.
     * This executor routes through ChatAPI's get method, allowing Prompts
     * to execute chat completions through the context.
     *
     * @returns Executor function
     * @internal
     */
    createExecutor<TRuntimeContext extends AIContextRequired<T>, TRuntimeMetadata extends AIMetadataRequired<T>>(): Executor<TRuntimeContext, TRuntimeMetadata>;
    /**
     * Create a streamer function for use in core Context.
     * This streamer routes through ChatAPI's stream method, allowing Prompts
     * to execute streaming chat completions through the context.
     *
     * @returns Streamer function
     * @internal
     */
    createStreamer<TRuntimeContext extends AIContextRequired<T>, TRuntimeMetadata extends AIMetadataRequired<T>>(): Streamer<TRuntimeContext, TRuntimeMetadata>;
}
//# sourceMappingURL=chat.d.ts.map