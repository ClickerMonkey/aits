/**
 * Speech API
 *
 * Provides text-to-speech functionality.
 */
import { BaseAPI } from './base';
export class SpeechAPI extends BaseAPI {
    constructor(ai) {
        super(ai);
    }
    // ============================================================================
    // REQUIRED ABSTRACT METHOD IMPLEMENTATIONS
    // ============================================================================
    getRequiredCapabilities(provided, request, forStreaming) {
        return ['audio', ...provided];
    }
    getRequiredParameters(provided, request, forStreaming) {
        const params = new Set(provided);
        if (request.instructions !== undefined) {
            params.add('speechInstructions');
        }
        return Array.from(params);
    }
    getNoModelFoundError() {
        return 'No compatible model found for speech generation';
    }
    getErrorType(operation) {
        return operation === 'request'
            ? 'speech-generation-failed'
            : 'speech-generation-stream-failed';
    }
    getErrorMessage(operation) {
        return operation === 'request'
            ? 'Speech generation failed'
            : 'Speech generation streaming failed';
    }
    async executeRequest(request, selected, ctx) {
        return await selected.provider.speech(request, ctx, selected.providerConfig);
    }
    async *executeStreamRequest(request, selected, ctx) {
        yield this.executeRequest(request, selected, ctx);
    }
    // ============================================================================
    // OPTIONAL OVERRIDES
    // ============================================================================
    estimateRequestTokens(request) {
        return Math.ceil(request.text.length / 4);
    }
    responseToChunks(response) {
        return [response];
    }
    chunksToResponse(chunks, model) {
        return chunks[0];
    }
    getHandlerGetMethod(handler) {
        return handler?.speech?.get;
    }
    getHandlerStreamMethod(handler) {
        return undefined;
    }
    hasProviderExecutor(selected) {
        return !!selected.provider.speech;
    }
    hasProviderStreamer(selected) {
        return false;
    }
}
//# sourceMappingURL=speech.js.map