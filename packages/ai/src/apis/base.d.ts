/**
 * Base API
 *
 * Abstract base class for all AI API implementations.
 * Implements the template method pattern to eliminate code duplication.
 */
import { BaseChunk, BaseRequest, BaseResponse } from '@aits/core';
import type { AI } from '../ai';
import type { AIBaseTypes, AIContext, AIContextRequired, ModelCapability, ModelHandlerFor, ModelParameter, OptionalParams, SelectedModelFor, Usage } from '../types';
/**
 * Abstract base class for all API implementations
 *
 * Provides the complete lifecycle for AI operations with variation points
 * for subclass-specific behavior.
 *
 * @template T - AIBaseTypes container with all type information
 * @template TRequest - Request type for this API
 * @template TResponse - Response type for this API
 * @template TChunk - Chunk type for streaming (use never if no streaming)
 */
export declare abstract class BaseAPI<T extends AIBaseTypes, TRequest extends BaseRequest = BaseRequest, TResponse extends BaseResponse = BaseResponse, TChunk extends BaseChunk = BaseChunk> {
    protected ai: AI<T>;
    constructor(ai: AI<T>);
    /**
     * Gets the selected model for a given request and context.
     *
     * @param request - The request to get the model for
     * @param ctx - The AI context
     * @returns
     */
    getModelFor<TRuntimeContext extends AIContext<T>>(request: TRequest, ctx: TRuntimeContext, forStreaming: boolean): Promise<SelectedModelFor<T> | null>;
    /**
     * Execute a non-streaming request
     *
     * Single optional context parameter pattern
     */
    get<TRuntimeContext extends AIContextRequired<T>>(request: TRequest, ...[ctx]: OptionalParams<[TRuntimeContext]>): Promise<TResponse>;
    /**
     * Execute a streaming request
     *
     * Single optional context parameter pattern
     */
    stream<TRuntimeContext extends AIContextRequired<T>>(request: TRequest, ...[ctx]: OptionalParams<[TRuntimeContext]>): AsyncIterable<TChunk>;
    /**
     * Get required capabilities for model selection
     * @param provided - Additional capabilities provided by caller
     * @param request - Optional request to analyze for additional capability needs
     */
    protected abstract getRequiredCapabilities(provided: ModelCapability[], request: TRequest, forStreaming: boolean): ModelCapability[];
    /**
     * Get required parameters for model selection based on the request
     * @param request - The request to analyze
     * @returns Set of parameters required by this request
     */
    protected abstract getRequiredParameters(provided: ModelParameter[], request: TRequest, forStreaming: boolean): ModelParameter[];
    /**
     * Get error message when no compatible model is found
     */
    protected abstract getNoModelFoundError(): string;
    /**
     * Get error type string for error handling
     * @param operation - Whether this is a request or stream operation
     */
    protected abstract getErrorType(operation: 'request' | 'stream'): string;
    /**
     * Get error message for error handling
     * @param operation - Whether this is a request or stream operation
     */
    protected abstract getErrorMessage(operation: 'request' | 'stream'): string;
    /**
     * Execute the request with the selected provider
     * Called by executeRequestWithFallback when handler doesn't provide get method
     * @param request - The request to execute
     * @param selected - The selected model and provider
     * @param ctx - The execution context
     */
    protected abstract executeRequest<TRuntimeContext extends AIContext<T>>(request: TRequest, selected: SelectedModelFor<T>, ctx: TRuntimeContext): Promise<TResponse>;
    /**
     * Stream the request with the selected provider
     * Called by streamRequestWithFallback when handler doesn't provide stream method
     * @param request - The request to stream
     * @param selected - The selected model and provider
     * @param ctx - The execution context
     */
    protected abstract executeStreamRequest<TRuntimeContext extends AIContext<T>>(request: TRequest, selected: SelectedModelFor<T>, ctx: TRuntimeContext): AsyncIterable<TChunk>;
    /**
     * Convert a response to a single chunk (for executor-to-streamer fallback)
     * @param response - The response to convert
     */
    protected abstract responseToChunks(response: TResponse): TChunk[];
    /**
     * Convert accumulated chunks to a response (for streamer-to-executor fallback)
     * @param chunks - Array of chunks to convert
     */
    protected abstract chunksToResponse(chunks: TChunk[], model: string): TResponse;
    /**
     * Check if the provider supports non-streaming execution for this operation
     * @param selected - The selected model and provider
     */
    protected abstract hasProviderExecutor(selected: SelectedModelFor<T>): boolean;
    /**
     * Check if the provider supports streaming execution for this operation
     * @param selected - The selected model and provider
     */
    protected abstract hasProviderStreamer(selected: SelectedModelFor<T>): boolean;
    /**
     * Get the appropriate handler get method for this API
     * Subclasses can override to specify which handler method to use
     */
    protected abstract getHandlerGetMethod<TRuntimeContext extends AIContext<T>>(handler?: ModelHandlerFor<T>): ((request: TRequest, ctx: TRuntimeContext) => Promise<TResponse>) | undefined;
    /**
     * Get the appropriate handler stream method for this API
     * Subclasses can override to specify which handler method to use
     */
    protected abstract getHandlerStreamMethod<TRuntimeContext extends AIContext<T>>(handler?: ModelHandlerFor<T>): ((request: TRequest, ctx: TRuntimeContext) => AsyncIterable<TChunk>) | undefined;
    /**
     * Get required capabilities for streaming (default: adds 'streaming')
     * @param provided - Additional capabilities provided by caller
     * @param request - Optional request to analyze for additional capability needs
     */
    protected getRequiredCapabilitiesForStreaming(provided: ModelCapability[], request: TRequest): ModelCapability[];
    /**
     * Get error message for streaming when no compatible model is found
     * (default: modifies base error to mention streaming)
     */
    protected getNoModelFoundErrorForStreaming(): string;
    /**
     * Estimate tokens for the request
     * (default: delegates to AI instance method)
     * @param request - The request to estimate
     * @param selected - The selected model and provider
     */
    protected estimateRequestTokens(request: TRequest, selected: SelectedModelFor<T>): number;
    /**
     * Estimate cost for a request before execution
     *
     * @param estimatedTokens - Estimated token count
     * @param selected - The selected model and provider
     * @returns Estimated cost
     */
    protected estimateRequestCost(estimatedTokens: number, selected: SelectedModelFor<T>): number;
    /**
     * Calculate cost for a completed response
     * (default: extracts from response.cost or calculates from usage)
     * @param response - The response
     * @param selected - The selected model and provider
     * @param estimatedTokens - Estimated token count
     */
    protected calculateResponseCost(response: TResponse, selected: SelectedModelFor<T>, estimatedTokens: number): number;
    /**
     * Calculate cost for a completed stream
     * (default: calculates from accumulated usage)
     * @param usage - Accumulated token usage
     * @param selected - The selected model and provider
     */
    protected calculateStreamCost(usage: Usage, selected: SelectedModelFor<T>): number;
    /**
     * Extract usage from response
     * (default: extracts from response.usage or uses estimate)
     * @param response - The response
     * @param estimatedTokens - Estimated token count
     */
    protected extractUsage(response: TResponse, estimatedTokens: number): Usage;
    /**
     * Execute request with fallback logic:
     * 1. Try handler.get() if available
     * 2. Try handler-specific method (e.g., handler.chat.get)
     * 3. Try executeRequest() (provider method)
     * 4. Try streamer-to-executor conversion if provider has streamer
     */
    protected executeRequestWithFallback<TRuntimeContext extends AIContext<T>>(request: TRequest, selected: SelectedModelFor<T>, ctx: TRuntimeContext, handler?: ModelHandlerFor<T>): Promise<TResponse>;
    /**
     * Stream request with fallback logic:
     * 1. Try handler.stream() if available
     * 2. Try handler-specific method (e.g., handler.chat.stream)
     * 3. Try executeStreamRequest() (provider streaming method)
     * 4. Try executor-to-streamer conversion if provider has executor
     */
    protected streamRequestWithFallback<TRuntimeContext extends AIContext<T>>(request: TRequest, selected: SelectedModelFor<T>, ctx: TRuntimeContext, handler?: ModelHandlerFor<T>): AsyncIterable<TChunk>;
}
//# sourceMappingURL=base.d.ts.map