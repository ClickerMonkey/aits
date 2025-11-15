/**
 * Transcribe API
 *
 * Provides speech-to-text functionality.
 */
import { BaseAPI } from './base';
export class TranscribeAPI extends BaseAPI {
    constructor(ai) {
        super(ai);
    }
    // ============================================================================
    // REQUIRED ABSTRACT METHOD IMPLEMENTATIONS
    // ============================================================================
    getRequiredCapabilities(provided, request, forStreaming) {
        return ['hearing', ...provided];
    }
    getRequiredParameters(provided, request, forStreaming) {
        const params = new Set();
        if (request.prompt !== undefined) {
            params.add('transcribePrompt');
        }
        if (forStreaming) {
            params.add('transcribeStream');
        }
        return Array.from(params);
    }
    getNoModelFoundError() {
        return 'No compatible model found for transcription';
    }
    getErrorType() {
        return 'transcription-failed';
    }
    getErrorMessage() {
        return 'Transcription failed';
    }
    async executeRequest(request, selected, ctx) {
        return await selected.provider.transcribe(request, ctx, selected.providerConfig);
    }
    // ============================================================================
    // OPTIONAL OVERRIDES
    // ============================================================================
    estimateRequestTokens() {
        return 1000; // Default estimate for audio
    }
    async *executeStreamRequest(request, selected, ctx) {
        if (!selected.provider.transcribeStream) {
            throw new Error(`Provider ${selected.model.provider} does not support streaming transcription`);
        }
        yield* selected.provider.transcribeStream(request, ctx, selected.providerConfig);
    }
    responseToChunks(response) {
        return [{
                text: response.text,
                model: response.model,
                usage: response.usage,
            }];
    }
    chunksToResponse(chunks, givenModel) {
        let text = '';
        let model = givenModel;
        let usage;
        for (const chunk of chunks) {
            if (chunk.model) {
                model = chunk.model;
            }
            if (chunk.usage) {
                usage = chunk.usage;
            }
            if (chunk.delta) {
                text += chunk.delta;
            }
            if (chunk.text) {
                text = chunk.text;
            }
        }
        return { text, model, usage };
    }
    getHandlerGetMethod(handler) {
        return handler?.transcribe?.get;
    }
    getHandlerStreamMethod(handler) {
        return handler?.transcribe?.stream;
    }
    hasProviderExecutor(selected) {
        return !!selected.provider.transcribe;
    }
    hasProviderStreamer(selected) {
        return !!selected.provider.transcribeStream;
    }
}
//# sourceMappingURL=transcribe.js.map