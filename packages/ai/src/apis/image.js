/**
 * Image API
 *
 * Provides image generation, editing, and analysis functionality.
 */
import { getChunksFromResponse, getResponseFromChunks } from '@aits/core';
import { BaseAPI } from './base';
// ============================================================================
// Image Generate API
// ============================================================================
class ImageGenerateAPI extends BaseAPI {
    constructor(ai) {
        super(ai);
    }
    getRequiredCapabilities(provided, request) {
        return ['image', ...provided];
    }
    getRequiredParameters(provided, request, forStreaming) {
        const params = new Set(provided);
        if (request.n !== undefined && request.n !== 1) {
            params.add('imageMultiple');
        }
        if (request.background !== undefined) {
            params.add('imageBackground');
        }
        if (request.responseFormat !== undefined) {
            params.add('imageFormat');
        }
        if (request.style !== undefined) {
            params.add('imageStyle');
        }
        if (forStreaming && request.streamCount !== 0) {
            params.add('imageStream');
        }
        return Array.from(params);
    }
    getNoModelFoundError() {
        return 'No compatible model found for image generation';
    }
    getErrorType(operation) {
        return operation === 'request'
            ? 'image-generation-failed'
            : 'image-generation-stream-failed';
    }
    getErrorMessage(operation) {
        return operation === 'request'
            ? 'Image generation failed'
            : 'Image generation streaming failed';
    }
    estimateRequestTokens(request) {
        // Rough estimate based on prompt length and image size
        const promptTokens = Math.ceil(request.prompt.length / 4);
        const sizeMultiplier = request.size?.includes('1024') ? 2 : 1;
        const qualityMultiplier = request.quality === 'high' ? 2 : 1;
        return promptTokens * sizeMultiplier * qualityMultiplier;
    }
    async executeRequest(request, selected, ctx) {
        return await selected.provider.generateImage(request, ctx, selected.providerConfig);
    }
    async *executeStreamRequest(request, selected, ctx) {
        yield* selected.provider.generateImageStream(request, ctx, selected.providerConfig);
    }
    responseToChunks(response) {
        return response.images.map((img) => ({
            progress: 1,
            done: true,
            image: img,
            model: response.model,
            usage: response.usage,
        }));
    }
    chunksToResponse(chunks, model) {
        const images = chunks
            .filter(c => c.image)
            .map(c => c.image);
        return {
            images: images,
            model: chunks.find(c => c.model)?.model || model,
            usage: chunks.find(c => c.usage)?.usage,
        };
    }
    getHandlerGetMethod(handler) {
        return handler?.imageGenerate?.get;
    }
    getHandlerStreamMethod(handler) {
        return handler?.imageGenerate?.stream;
    }
    hasProviderExecutor(selected) {
        return !!selected.provider.generateImage;
    }
    hasProviderStreamer(selected) {
        return !!selected.provider.generateImageStream;
    }
}
// ============================================================================
// Image Edit API
// ============================================================================
class ImageEditAPI extends BaseAPI {
    constructor(ai) {
        super(ai);
    }
    getModel(request) {
        return request.model;
    }
    getRequiredCapabilities(provided, request, forStreaming) {
        return ['image', ...provided];
    }
    getRequiredParameters(provided, request, forStreaming) {
        const params = new Set(provided);
        if (request.n !== undefined && request.n !== 1) {
            params.add('imageMultiple');
        }
        if (request.responseFormat !== undefined) {
            params.add('imageFormat');
        }
        if (forStreaming && request.streamCount !== 0) {
            params.add('imageStream');
        }
        return Array.from(params);
    }
    getNoModelFoundError() {
        return 'No compatible model found for image editing';
    }
    getErrorType(operation) {
        return operation === 'request'
            ? 'image-edit-failed'
            : 'image-edit-stream-failed';
    }
    getErrorMessage(operation) {
        return operation === 'request'
            ? 'Image editing failed'
            : 'Image editing streaming failed';
    }
    estimateRequestTokens(request) {
        // Rough estimate based on prompt length and image size
        const promptTokens = Math.ceil(request.prompt.length / 4);
        const sizeMultiplier = request.size?.includes('1024') ? 2 : 1;
        return promptTokens * sizeMultiplier;
    }
    async executeRequest(request, selected, ctx) {
        return await selected.provider.editImage(request, ctx, selected.providerConfig);
    }
    async *executeStreamRequest(request, selected, ctx) {
        yield* selected.provider.editImageStream(request, ctx, selected.providerConfig);
    }
    responseToChunks(response) {
        return response.images.map((img) => ({
            progress: 1,
            done: true,
            image: img,
            model: response.model,
            usage: response.usage,
        }));
    }
    chunksToResponse(chunks, model) {
        const images = chunks
            .filter(c => c.image)
            .map(c => c.image);
        return {
            images: images,
            model: chunks.find(c => c.model)?.model || model,
            usage: chunks.find(c => c.usage)?.usage,
        };
    }
    getHandlerGetMethod(handler) {
        return handler?.imageEdit?.get;
    }
    getHandlerStreamMethod(handler) {
        return handler?.imageEdit?.stream;
    }
    hasProviderExecutor(selected) {
        return !!selected.provider.editImage;
    }
    hasProviderStreamer(selected) {
        return !!selected.provider.editImageStream;
    }
}
// ============================================================================
// Image Analyze API
// ============================================================================
class ImageAnalyzeAPI extends BaseAPI {
    constructor(ai) {
        super(ai);
    }
    getRequiredCapabilities(provided, request, forStreaming) {
        return ['chat', 'vision', ...provided];
    }
    getRequiredParameters(provided, request, forStreaming) {
        const params = new Set(provided);
        if (request.maxTokens !== undefined) {
            params.add('maxTokens');
        }
        if (request.temperature !== undefined) {
            params.add('temperature');
        }
        return Array.from(params);
    }
    getNoModelFoundError() {
        return 'No compatible vision model found for image analysis';
    }
    getErrorType(operation) {
        return operation === 'request'
            ? 'image-analyze-failed'
            : 'image-analyze-stream-failed';
    }
    getErrorMessage(operation) {
        return operation === 'request'
            ? 'Image analysis failed'
            : 'Image analysis streaming failed';
    }
    getNoModelFoundErrorForStreaming() {
        return 'No compatible vision model found for streaming image analysis';
    }
    /**
     * Convert ImageAnalyzeRequest to chat Request with multimodal content
     */
    convertToChatRequest(request) {
        return {
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', content: request.prompt },
                        ...request.images.map((img) => ({
                            type: 'image',
                            content: img,
                        })),
                    ],
                },
            ],
            maxTokens: request.maxTokens,
            temperature: request.temperature,
        };
    }
    estimateRequestTokens(request, selected) {
        const chatRequest = this.convertToChatRequest(request);
        return super.estimateRequestTokens(chatRequest, selected);
    }
    async executeRequest(request, selected, ctx) {
        const chatRequest = this.convertToChatRequest(request);
        const executor = selected.provider.createExecutor(selected.providerConfig);
        return await executor(chatRequest, ctx, ctx.metadata);
    }
    async *executeStreamRequest(request, selected, ctx) {
        const chatRequest = this.convertToChatRequest(request);
        const streamer = selected.provider.createStreamer(selected.providerConfig);
        yield* streamer(chatRequest, ctx, ctx.metadata);
    }
    responseToChunks(response) {
        return getChunksFromResponse(response);
    }
    chunksToResponse(chunks, model) {
        return getResponseFromChunks(chunks);
    }
    getHandlerGetMethod(handler) {
        return handler?.imageAnalyze?.get;
    }
    getHandlerStreamMethod(handler) {
        return undefined; // Image analyze doesn't have streaming handler
    }
    hasProviderExecutor(selected) {
        return !!selected.provider.createExecutor;
    }
    hasProviderStreamer(selected) {
        return !!selected.provider.createStreamer;
    }
}
// ============================================================================
// Image API Facade
// ============================================================================
/**
 * Image API - Facade providing access to generate, edit, and analyze sub-APIs
 */
export class ImageAPI {
    generate;
    edit;
    analyze;
    constructor(ai) {
        this.generate = new ImageGenerateAPI(ai);
        this.edit = new ImageEditAPI(ai);
        this.analyze = new ImageAnalyzeAPI(ai);
    }
}
//# sourceMappingURL=image.js.map