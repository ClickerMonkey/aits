/**
 * Base API
 *
 * Abstract base class for all AI API implementations.
 * Implements the template method pattern to eliminate code duplication.
 */
import { accumulateUsage, getModel } from '@aits/core';
import { isModelInfo } from '../common';
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
export class BaseAPI {
    ai;
    constructor(ai) {
        this.ai = ai;
    }
    /**
     * Gets the selected model for a given request and context.
     *
     * @param request - The request to get the model for
     * @param ctx - The AI context
     * @returns
     */
    async getModelFor(request, ctx, forStreaming) {
        const { hooks, registry } = this.ai;
        // Check if model is already specified
        const model = getModel(request.model || ctx.metadata?.model);
        if (model) {
            const modelInfo = isModelInfo(model)
                ? model
                : registry.getModel(model.id);
            if (modelInfo) {
                const provider = registry.getProvider(modelInfo.provider)
                    ?? registry.getProviderFor(model.id)[1];
                if (!provider) {
                    return null;
                }
                return {
                    model: modelInfo,
                    provider: provider,
                    score: 1.0,
                };
            }
            else {
                const { contextWindow = 0, maxOutputTokens = 0 } = model;
                const [providerKey, provider] = this.ai.registry.getProviderFor(model.id);
                if (!provider || !providerKey) {
                    return null;
                }
                return {
                    model: {
                        id: model.id,
                        provider: providerKey,
                        name: model.id,
                        capabilities: new Set(),
                        tier: 'flagship',
                        pricing: {},
                        contextWindow,
                        maxOutputTokens,
                    },
                    provider,
                    score: 1.0,
                };
            }
        }
        else {
            // No model specified - use selection system
            // Build metadata with required capabilities and parameters
            const metadataRequired = {
                ...ctx.metadata,
                required: this.getRequiredCapabilities(ctx.metadata?.required || [], request, forStreaming),
                requiredParameters: this.getRequiredParameters(ctx.metadata?.requiredParameters || [], request, forStreaming),
            };
            // Build metadata from what used passed in context
            const metadata = await this.ai.buildMetadata(metadataRequired);
            // Run beforeModelSelection hook to affect which model might be selected (like restricting providers, zdr, etc)
            const enrichedMetadata = hooks.beforeModelSelection
                ? await hooks.beforeModelSelection(ctx, request, metadata)
                : metadata;
            // Select model
            const dynamicSelection = registry.selectModel(enrichedMetadata);
            if (!dynamicSelection) {
                return null;
            }
            return dynamicSelection;
        }
    }
    /**
     * Execute a non-streaming request
     *
     * Single optional context parameter pattern
     */
    async get(request, ...[ctx]) {
        const { hooks, registry } = this.ai;
        let latestCtx = ctx;
        try {
            // Build full context
            const fullCtx = await this.ai.buildContext(ctx || {});
            latestCtx = fullCtx;
            // Get model for request
            const selected = await this.getModelFor(request, fullCtx, false);
            if (!selected) {
                throw new Error(this.getNoModelFoundError());
            }
            // Inject selected model into context for provider access
            fullCtx.metadata = {
                ...fullCtx.metadata,
                model: selected.model,
            };
            // Run onModelSelected hook
            const finalSelected = (await hooks.onModelSelected?.(fullCtx, request, selected)) || selected;
            // Estimate tokens
            const estimatedTokens = this.estimateRequestTokens(request, finalSelected);
            const estimatedCost = this.estimateRequestCost(estimatedTokens, finalSelected);
            // Run beforeRequest hook (hook can override provider config)
            await hooks.beforeRequest?.(fullCtx, request, finalSelected, estimatedTokens, estimatedCost);
            // Get handler if available
            const handler = registry.getHandler(finalSelected.model.provider, finalSelected.model.id);
            // Execute request with fallback logic
            const response = await this.executeRequestWithFallback(request, finalSelected, fullCtx, handler);
            // Calculate cost and extract usage
            const usage = this.extractUsage(response, estimatedTokens);
            const cost = this.calculateResponseCost(response, finalSelected, estimatedTokens);
            // Run afterRequest hook
            await hooks.afterRequest?.(fullCtx, request, response, true, finalSelected, usage, cost);
            return response;
        }
        catch (error) {
            hooks.onError?.(this.getErrorType('request'), this.getErrorMessage('request'), error instanceof Error ? error : undefined, latestCtx, request);
            throw error;
        }
    }
    /**
     * Execute a streaming request
     *
     * Single optional context parameter pattern
     */
    async *stream(request, ...[ctx]) {
        const { hooks, registry } = this.ai;
        let latestCtx = ctx;
        try {
            // Build full context
            const fullCtx = await this.ai.buildContext(ctx || {});
            latestCtx = fullCtx;
            // Get model for request
            const selected = await this.getModelFor(request, fullCtx, true);
            if (!selected) {
                throw new Error(this.getNoModelFoundErrorForStreaming());
            }
            // Inject selected model into context for provider access
            fullCtx.metadata = {
                ...fullCtx.metadata,
                model: selected.model.id,
            };
            // Run onModelSelected hook
            const finalSelected = hooks.onModelSelected
                ? (await hooks.onModelSelected(fullCtx, request, selected)) || selected
                : selected;
            // Estimate tokens
            const estimatedTokens = this.estimateRequestTokens(request, finalSelected);
            const estimatedCost = this.estimateRequestCost(estimatedTokens, finalSelected);
            // Run beforeRequest hook
            await hooks.beforeRequest?.(fullCtx, request, finalSelected, estimatedTokens, estimatedCost);
            // Get handler if available
            const handler = registry.getHandler(finalSelected.model.provider, finalSelected.model.id);
            // Stream request and accumulate usage
            const accumulatedUsage = {};
            const chunks = [];
            let finished = false;
            try {
                for await (const chunk of this.streamRequestWithFallback(request, finalSelected, fullCtx, handler)) {
                    const usage = chunk.usage;
                    if (usage) {
                        accumulateUsage(accumulatedUsage, usage);
                    }
                    chunks.push(chunk);
                    yield chunk;
                }
                finished = true;
            }
            finally {
                // Calculate cost
                const cost = this.calculateStreamCost(accumulatedUsage, finalSelected);
                // Build response from chunks
                const response = this.chunksToResponse(chunks, finalSelected.model.id);
                // Run afterRequest hook
                await hooks.afterRequest?.(fullCtx, request, response, finished, finalSelected, accumulatedUsage, cost);
            }
        }
        catch (error) {
            hooks.onError?.(this.getErrorType('stream'), this.getErrorMessage('stream'), error instanceof Error ? error : undefined, latestCtx, request);
            throw error;
        }
    }
    // ============================================================================
    // OPTIONAL OVERRIDES (default implementations provided)
    // ============================================================================
    /**
     * Get required capabilities for streaming (default: adds 'streaming')
     * @param provided - Additional capabilities provided by caller
     * @param request - Optional request to analyze for additional capability needs
     */
    getRequiredCapabilitiesForStreaming(provided, request) {
        return [...this.getRequiredCapabilities(provided, request, true), 'streaming'];
    }
    /**
     * Get error message for streaming when no compatible model is found
     * (default: modifies base error to mention streaming)
     */
    getNoModelFoundErrorForStreaming() {
        return this.getNoModelFoundError().replace('criteria', 'streaming criteria');
    }
    /**
     * Estimate tokens for the request
     * (default: delegates to AI instance method)
     * @param request - The request to estimate
     * @param selected - The selected model and provider
     */
    estimateRequestTokens(request, selected) {
        return 0;
    }
    /**
     * Estimate cost for a request before execution
     *
     * @param estimatedTokens - Estimated token count
     * @param selected - The selected model and provider
     * @returns Estimated cost
     */
    estimateRequestCost(estimatedTokens, selected) {
        const usage = { inputTokens: estimatedTokens, outputTokens: 0, totalTokens: estimatedTokens };
        // If no cost provided, calculate it
        return this.ai.calculateCost(selected.model, usage);
    }
    /**
     * Calculate cost for a completed response
     * (default: extracts from response.cost or calculates from usage)
     * @param response - The response
     * @param selected - The selected model and provider
     * @param estimatedTokens - Estimated token count
     */
    calculateResponseCost(response, selected, estimatedTokens) {
        // Otherwise extract usage and check if cost is included
        const usage = this.extractUsage(response, estimatedTokens);
        if (usage.cost !== undefined) {
            return usage.cost;
        }
        // If no cost provided, calculate it
        return this.ai.calculateCost(selected.model, usage);
    }
    /**
     * Calculate cost for a completed stream
     * (default: calculates from accumulated usage)
     * @param usage - Accumulated token usage
     * @param selected - The selected model and provider
     */
    calculateStreamCost(usage, selected) {
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
    extractUsage(response, estimatedTokens) {
        // Try to extract from response
        const usage = response.usage;
        if (usage)
            return usage;
        // Otherwise use estimate
        return { inputTokens: estimatedTokens, outputTokens: 0, totalTokens: estimatedTokens };
    }
    /**
     * Execute request with fallback logic:
     * 1. Try handler.get() if available
     * 2. Try handler-specific method (e.g., handler.chat.get)
     * 3. Try executeRequest() (provider method)
     * 4. Try streamer-to-executor conversion if provider has streamer
     */
    async executeRequestWithFallback(request, selected, ctx, handler) {
        // Try handler first
        const handlerMethod = this.getHandlerGetMethod(handler);
        if (handlerMethod) {
            return await handlerMethod(request, ctx);
        }
        // Try provider executor
        if (this.hasProviderExecutor(selected)) {
            return await this.executeRequest(request, selected, ctx);
        }
        // Fallback: try converting streamer to executor
        const streamerMethod = this.getHandlerStreamMethod(handler);
        if (streamerMethod) {
            const chunks = [];
            for await (const chunk of streamerMethod(request, ctx)) {
                chunks.push(chunk);
            }
            return this.chunksToResponse(chunks, selected.model.id);
        }
        // Try provider streamer as fallback
        if (this.hasProviderStreamer(selected)) {
            const chunks = [];
            for await (const chunk of this.executeStreamRequest(request, selected, ctx)) {
                chunks.push(chunk);
            }
            return this.chunksToResponse(chunks, selected.model.id);
        }
        throw new Error(`Provider "${selected.model.provider}" does not support non-streaming requests for this operation and no fallback is available`);
    }
    /**
     * Stream request with fallback logic:
     * 1. Try handler.stream() if available
     * 2. Try handler-specific method (e.g., handler.chat.stream)
     * 3. Try executeStreamRequest() (provider streaming method)
     * 4. Try executor-to-streamer conversion if provider has executor
     */
    async *streamRequestWithFallback(request, selected, ctx, handler) {
        // Try handler first
        const handlerMethod = this.getHandlerStreamMethod(handler);
        if (handlerMethod) {
            yield* handlerMethod(request, ctx);
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
            const response = await getMethod(request, ctx);
            for (const chunk of this.responseToChunks(response)) {
                yield chunk;
            }
            return;
        }
        // Try provider executor as fallback
        if (this.hasProviderExecutor(selected)) {
            const response = await this.executeRequest(request, selected, ctx);
            for (const chunk of this.responseToChunks(response)) {
                yield chunk;
            }
            return;
        }
        throw new Error(`Provider "${selected.model.provider}" does not support streaming requests for this operation and no fallback is available`);
    }
}
//# sourceMappingURL=base.js.map