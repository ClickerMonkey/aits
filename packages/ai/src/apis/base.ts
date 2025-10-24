/**
 * Base API
 *
 * Abstract base class for all AI API implementations.
 * Implements the template method pattern to eliminate code duplication.
 */

import type { AI } from '../ai';
import type {
  AIBaseTypes,
  AIContext,
  AIContextOptional,
  AIContextRequired,
  AIMetadataRequired,
  AIProviderNames,
  ModelHandler,
  ModelCapability,
  SelectedModelFor,
  Usage,
  Executor,
  Streamer,
  ModelHandlerFor,
} from '../types';

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
export abstract class BaseAPI<
  T extends AIBaseTypes,
  TRequest = unknown,
  TResponse = unknown,
  TChunk = unknown
> {
  constructor(protected ai: AI<T>) {}

  /**
   * Execute a non-streaming request
   *
   * Single optional context parameter pattern
   */
  async get(
    request: TRequest,
    ...[ctx]: AIContextOptional<T>
  ): Promise<TResponse> {
    const { hooks, registry } = this.ai;

    try {
      // Build full context
      const fullCtx = await this.ai.buildContext(ctx || {} as AIContextRequired<T>);

      // Build metadata with required capabilities
      const metadataRequired: AIMetadataRequired<T> = {
        ...fullCtx.metadata,
        required: this.getRequiredCapabilities(fullCtx.metadata?.required || []),
      } as AIMetadataRequired<T>;

      const metadata = await this.ai.buildMetadata(metadataRequired);

      // Run beforeModelSelection hook
      const enrichedMetadata = hooks.beforeModelSelection
        ? await hooks.beforeModelSelection(fullCtx, metadata)
        : metadata;

      // Select model
      const selected = this.ai.selectModel(enrichedMetadata);
      if (!selected) {
        throw new Error(this.getNoModelFoundError());
      }

      // Run onModelSelected hook
      const finalSelected = (await hooks.onModelSelected?.(fullCtx, selected)) || selected;

      // Validate provider capability
      this.validateProviderCapability(finalSelected);

      // Estimate tokens
      const estimatedTokens = this.estimateRequestTokens(request, finalSelected);

      // Run beforeRequest hook
      await hooks.beforeRequest?.(fullCtx, finalSelected, estimatedTokens);

      // Get handler if available
      const handler = registry.getHandler(finalSelected.model.provider, finalSelected.model.id);

      // Execute request with fallback logic
      const response = await this.executeRequestWithFallback(
        request,
        finalSelected,
        fullCtx,
        handler
      );

      // Calculate cost and extract usage
      const usage = this.extractUsage(response, estimatedTokens);
      const cost = this.calculateResponseCost(response, finalSelected, estimatedTokens);

      // Run afterRequest hook
      await hooks.afterRequest?.(fullCtx, finalSelected, usage, cost);

      return response;
    } catch (error) {
      hooks.onError?.(
        this.getErrorType('request'),
        this.getErrorMessage('request'),
        error instanceof Error ? error : undefined,
        undefined
      );
      throw error;
    }
  }

  /**
   * Execute a streaming request
   *
   * Single optional context parameter pattern
   */
  async *stream(
    request: TRequest,
    ...[ctx]: AIContextOptional<T>
  ): AsyncIterable<TChunk> {
    const { hooks, registry } = this.ai;

    try {
      // Build full context
      const fullCtx = await this.ai.buildContext(ctx || {} as AIContextRequired<T>);

      // Build metadata with required capabilities (including streaming)
      const metadataRequired: AIMetadataRequired<T> = {
        ...fullCtx.metadata,
        required: this.getRequiredCapabilitiesForStreaming(fullCtx.metadata?.required || []),
      } as AIMetadataRequired<T>;

      const metadata = await this.ai.buildMetadata(metadataRequired);

      // Run beforeModelSelection hook
      const enrichedMetadata = hooks.beforeModelSelection
        ? await hooks.beforeModelSelection(fullCtx, metadata)
        : metadata;

      // Select model
      const selected = this.ai.selectModel(enrichedMetadata);
      if (!selected) {
        throw new Error(this.getNoModelFoundErrorForStreaming());
      }

      // Run onModelSelected hook
      const finalSelected = hooks.onModelSelected
        ? (await hooks.onModelSelected(fullCtx, selected)) || selected
        : selected;

      // Validate provider streaming capability
      this.validateProviderStreamingCapability(finalSelected);

      // Estimate tokens
      const estimatedTokens = this.estimateRequestTokens(request, finalSelected);

      // Run beforeRequest hook
      await hooks.beforeRequest?.(fullCtx, finalSelected, estimatedTokens);

      // Get handler if available
      const handler = registry.getHandler(finalSelected.model.provider, finalSelected.model.id);

      // Stream request and accumulate usage
      let accumulatedUsage: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

      for await (const chunk of this.streamRequestWithFallback(request, finalSelected, fullCtx, handler)) {
        const usage = this.extractChunkUsage(chunk);
        if (usage) {
          // Accumulate all usage fields
          accumulatedUsage.inputTokens = Math.max(accumulatedUsage.inputTokens, usage.inputTokens);
          accumulatedUsage.outputTokens = Math.max(accumulatedUsage.outputTokens, usage.outputTokens);
          accumulatedUsage.totalTokens = Math.max(accumulatedUsage.totalTokens, usage.totalTokens);

          // Accumulate optional fields if present
          if (usage.cachedTokens !== undefined) {
            accumulatedUsage.cachedTokens = Math.max(accumulatedUsage.cachedTokens || 0, usage.cachedTokens);
          }
          if (usage.reasoningTokens !== undefined) {
            accumulatedUsage.reasoningTokens = Math.max(accumulatedUsage.reasoningTokens || 0, usage.reasoningTokens);
          }
          if (usage.cost !== undefined) {
            accumulatedUsage.cost = Math.max(accumulatedUsage.cost || 0, usage.cost);
          }
        }
        yield chunk;
      }

      // Calculate cost
      const cost = this.calculateStreamCost(accumulatedUsage, finalSelected);

      // Run afterRequest hook
      await hooks.afterRequest?.(fullCtx, finalSelected, accumulatedUsage, cost);
    } catch (error) {
      hooks.onError?.(
        this.getErrorType('stream'),
        this.getErrorMessage('stream'),
        error instanceof Error ? error : undefined,
        undefined
      );
      throw error;
    }
  }

  // ============================================================================
  // ABSTRACT METHODS (must be implemented by subclasses)
  // ============================================================================

  /**
   * Get required capabilities for model selection
   * @param provided - Additional capabilities provided by caller
   */
  protected abstract getRequiredCapabilities(provided: ModelCapability[]): ModelCapability[];

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
  protected abstract executeRequest(
    request: TRequest,
    selected: SelectedModelFor<T>,
    ctx: AIContext<T>
  ): Promise<TResponse>;

  /**
   * Stream the request with the selected provider
   * Called by streamRequestWithFallback when handler doesn't provide stream method
   * @param request - The request to stream
   * @param selected - The selected model and provider
   * @param ctx - The execution context
   */
  protected abstract executeStreamRequest(
    request: TRequest,
    selected: SelectedModelFor<T>,
    ctx: AIContext<T>
  ): AsyncIterable<TChunk>;

  /**
   * Convert a response to a single chunk (for executor-to-streamer fallback)
   * @param response - The response to convert
   */
  protected abstract responseToChunk(response: TResponse): TChunk;

  /**
   * Convert accumulated chunks to a response (for streamer-to-executor fallback)
   * @param chunks - Array of chunks to convert
   */
  protected abstract chunksToResponse(chunks: TChunk[]): TResponse;

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
  protected abstract getHandlerGetMethod(
    handler?: ModelHandlerFor<T>
  ): ((request: any, ctx: AIContext<T>) => Promise<any>) | undefined;

  /**
   * Get the appropriate handler stream method for this API
   * Subclasses can override to specify which handler method to use
   */
  protected abstract getHandlerStreamMethod(
    handler?: ModelHandlerFor<T>
  ): ((request: any, ctx: AIContext<T>) => AsyncIterable<any>) | undefined;

  // ============================================================================
  // OPTIONAL OVERRIDES (default implementations provided)
  // ============================================================================

  /**
   * Get required capabilities for streaming (default: adds 'streaming')
   * @param provided - Additional capabilities provided by caller
   */
  protected getRequiredCapabilitiesForStreaming(provided: ModelCapability[]): ModelCapability[] {
    return [...this.getRequiredCapabilities(provided), 'streaming'];
  }

  /**
   * Get error message for streaming when no compatible model is found
   * (default: modifies base error to mention streaming)
   */
  protected getNoModelFoundErrorForStreaming(): string {
    return this.getNoModelFoundError().replace('criteria', 'streaming criteria');
  }

  /**
   * Validate that the provider supports this operation
   * (default: no validation)
   * @param selected - The selected model and provider
   */
  protected validateProviderCapability(selected: SelectedModelFor<T>): void {
    // Default: no validation
  }

  /**
   * Validate that the provider supports streaming for this operation
   * (default: no validation)
   * @param selected - The selected model and provider
   */
  protected validateProviderStreamingCapability(selected: SelectedModelFor<T>): void {
    // Default: no validation
  }

  /**
   * Whether to use an adapter for this request
   * (default: false)
   */
  protected shouldUseAdapter(): boolean {
    return false;
  }

  /**
   * Estimate tokens for the request
   * (default: delegates to AI instance method)
   * @param request - The request to estimate
   * @param selected - The selected model and provider
   */
  protected estimateRequestTokens(request: TRequest, selected: SelectedModelFor<T>): number {
    return 0;
  }

  /**
   * Calculate cost for a completed response
   * (default: extracts from response.cost or calculates from usage)
   * @param response - The response
   * @param selected - The selected model and provider
   * @param estimatedTokens - Estimated token count
   */
  protected calculateResponseCost(
    response: TResponse,
    selected: SelectedModelFor<T>,
    estimatedTokens: number
  ): number {
    // Try to extract from response first
    const cost = (response as any).cost;
    if (cost !== undefined) return cost;

    // Otherwise extract usage and check if cost is included
    const usage = this.extractUsage(response, estimatedTokens);
    if (usage.cost !== undefined) return usage.cost;

    // If no cost provided, calculate it
    return this.ai.calculateCost(selected.model, usage);
  }

  /**
   * Calculate cost for a completed stream
   * (default: calculates from accumulated usage)
   * @param usage - Accumulated token usage
   * @param selected - The selected model and provider
   */
  protected calculateStreamCost(
    usage: Usage,
    selected: SelectedModelFor<T>
  ): number {
    // If cost is already included in usage, return it
    if (usage.cost !== undefined) {
      return usage.cost;
    }
    return this.ai.calculateCost(selected.model, usage);
  }

  /**
   * Extract usage from response
   * (default: extracts from response.usage or uses estimate)
   * @param response - The response
   * @param estimatedTokens - Estimated token count
   */
  protected extractUsage(response: TResponse, estimatedTokens: number): Usage {
    // Try to extract from response
    const usage = (response as any).usage;
    if (usage) return usage;

    // Otherwise use estimate
    return { inputTokens: estimatedTokens, outputTokens: 0, totalTokens: estimatedTokens };
  }

  /**
   * Extract usage from a streaming chunk
   * (default: extracts from chunk.usage)
   * @param chunk - The chunk
   */
  protected extractChunkUsage(chunk: TChunk): Usage | undefined {
    return (chunk as any).usage;
  }

  /**
   * Execute request with fallback logic:
   * 1. Try handler.get() if available
   * 2. Try handler-specific method (e.g., handler.chat.get)
   * 3. Try executeRequest() (provider method)
   * 4. Try streamer-to-executor conversion if provider has streamer
   */
  protected async executeRequestWithFallback(
    request: TRequest,
    selected: SelectedModelFor<T>,
    ctx: AIContext<T>,
    handler?: ModelHandlerFor<T>
  ): Promise<TResponse> {
    // Try handler first
    const handlerMethod = this.getHandlerGetMethod(handler);
    if (handlerMethod) {
      return await handlerMethod(request as any, ctx);
    }

    // Try provider executor
    if (this.hasProviderExecutor(selected)) {
      return await this.executeRequest(request, selected, ctx);
    }

    // Fallback: try converting streamer to executor
    const streamerMethod = this.getHandlerStreamMethod(handler);
    if (streamerMethod) {
      const chunks: TChunk[] = [];
      for await (const chunk of streamerMethod(request as any, ctx)) {
        chunks.push(chunk);
      }
      return this.chunksToResponse(chunks);
    }

    // Try provider streamer as fallback
    if (this.hasProviderStreamer(selected)) {
      const chunks: TChunk[] = [];
      for await (const chunk of this.executeStreamRequest(request, selected, ctx)) {
        chunks.push(chunk);
      }
      return this.chunksToResponse(chunks);
    }

    throw new Error(
      `Provider "${selected.model.provider}" does not support non-streaming requests for this operation and no fallback is available`
    );
  }

  /**
   * Stream request with fallback logic:
   * 1. Try handler.stream() if available
   * 2. Try handler-specific method (e.g., handler.chat.stream)
   * 3. Try executeStreamRequest() (provider streaming method)
   * 4. Try executor-to-streamer conversion if provider has executor
   */
  protected async *streamRequestWithFallback(
    request: TRequest,
    selected: SelectedModelFor<T>,
    ctx: AIContext<T>,
    handler?: ModelHandlerFor<T>
  ): AsyncIterable<TChunk> {
    // Try handler first
    const handlerMethod = this.getHandlerStreamMethod(handler);
    if (handlerMethod) {
      yield* handlerMethod(request as any, ctx);
      return;
    }

    // Try provider streamer
    if (this.hasProviderStreamer(selected)) {
      yield* this.executeStreamRequest(request, selected, ctx);
      return;
    }

    // Fallback: try converting executor to streamer
    const getMethod = this.getHandlerGetMethod(handler);
    if (getMethod) {
      const response = await getMethod(request as any, ctx);
      yield this.responseToChunk(response);
      return;
    }

    // Try provider executor as fallback
    if (this.hasProviderExecutor(selected)) {
      const response = await this.executeRequest(request, selected, ctx);
      yield this.responseToChunk(response);
      return;
    }

    throw new Error(
      `Provider "${selected.model.provider}" does not support streaming requests for this operation and no fallback is available`
    );
  }
}
