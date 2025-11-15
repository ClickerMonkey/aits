/**
 * Embed API
 *
 * Provides text embedding functionality.
 */
import { BaseAPI } from './base';
export class EmbedAPI extends BaseAPI {
    constructor(ai) {
        super(ai);
    }
    // ============================================================================
    // REQUIRED ABSTRACT METHOD IMPLEMENTATIONS
    // ============================================================================
    getRequiredCapabilities(provided, request, forStreaming) {
        return ['embedding', ...provided];
    }
    getRequiredParameters(provided, request, forStreaming) {
        const params = new Set([...provided]);
        if (request.dimensions !== undefined)
            params.add('embeddingDimensions');
        return Array.from(params);
    }
    getNoModelFoundError() {
        return 'No compatible model found for embeddings';
    }
    getErrorType() {
        return 'embedding-generation-failed';
    }
    getErrorMessage() {
        return 'Embedding generation failed';
    }
    async executeRequest(request, selected, ctx) {
        return await selected.provider.embed(request, ctx, selected.providerConfig);
    }
    async *executeStreamRequest(request, selected, ctx) {
        throw new Error('Streaming not supported for embeddings');
    }
    // ============================================================================
    // OPTIONAL OVERRIDES
    // ============================================================================
    estimateRequestTokens(request) {
        const totalTextLength = request.texts.reduce((sum, text) => sum + text.length, 0);
        return Math.ceil(totalTextLength / 4);
    }
    responseToChunks(response) {
        throw new Error('Embeddings do not support chunking');
    }
    chunksToResponse(chunks) {
        throw new Error('Embeddings do not support chunking');
    }
    getHandlerGetMethod(handler) {
        return handler?.embed?.get;
    }
    getHandlerStreamMethod(handler) {
        return undefined;
    }
    hasProviderExecutor(selected) {
        return !!selected.provider.embed;
    }
    hasProviderStreamer(selected) {
        return false; // Embed API doesn't support streaming
    }
}
//# sourceMappingURL=embed.js.map