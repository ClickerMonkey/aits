/**
 * Image API
 *
 * Provides image generation, editing, and analysis functionality.
 */
import { ModelInput } from '@aits/core';
import type { AI } from '../ai';
import type { AIBaseTypes, AIContext, Chunk, ImageAnalyzeRequest, ImageEditRequest, ImageGenerationChunk, ImageGenerationRequest, ImageGenerationResponse, ModelCapability, ModelParameter, ModelHandlerFor, Response, SelectedModelFor } from '../types';
import { BaseAPI } from './base';
declare class ImageGenerateAPI<T extends AIBaseTypes> extends BaseAPI<T, ImageGenerationRequest, ImageGenerationResponse, ImageGenerationChunk> {
    constructor(ai: AI<T>);
    protected getRequiredCapabilities(provided: ModelCapability[], request?: ImageGenerationRequest): ModelCapability[];
    protected getRequiredParameters(provided: ModelParameter[], request: ImageGenerationRequest, forStreaming: boolean): ModelParameter[];
    protected getNoModelFoundError(): string;
    protected getErrorType(operation: 'request' | 'stream'): string;
    protected getErrorMessage(operation: 'request' | 'stream'): string;
    protected estimateRequestTokens(request: ImageGenerationRequest): number;
    protected executeRequest(request: ImageGenerationRequest, selected: SelectedModelFor<T>, ctx: AIContext<T>): Promise<ImageGenerationResponse>;
    protected executeStreamRequest(request: ImageGenerationRequest, selected: SelectedModelFor<T>, ctx: AIContext<T>): AsyncIterable<ImageGenerationChunk>;
    protected responseToChunks(response: ImageGenerationResponse): ImageGenerationChunk[];
    protected chunksToResponse(chunks: ImageGenerationChunk[], model: string): ImageGenerationResponse;
    protected getHandlerGetMethod(handler?: ModelHandlerFor<T>): ((request: ImageGenerationRequest, ctx: AIContext<T>) => Promise<ImageGenerationResponse>) | undefined;
    protected getHandlerStreamMethod(handler?: ModelHandlerFor<T>): ((request: ImageGenerationRequest, ctx: AIContext<T>) => AsyncIterable<ImageGenerationChunk>) | undefined;
    protected hasProviderExecutor(selected: SelectedModelFor<T>): boolean;
    protected hasProviderStreamer(selected: SelectedModelFor<T>): boolean;
}
declare class ImageEditAPI<T extends AIBaseTypes> extends BaseAPI<T, ImageEditRequest, ImageGenerationResponse, ImageGenerationChunk> {
    constructor(ai: AI<T>);
    protected getModel(request: ImageEditRequest): ModelInput | undefined;
    protected getRequiredCapabilities(provided: ModelCapability[], request: ImageEditRequest, forStreaming: boolean): ModelCapability[];
    protected getRequiredParameters(provided: ModelParameter[], request: ImageEditRequest, forStreaming: boolean): ModelParameter[];
    protected getNoModelFoundError(): string;
    protected getErrorType(operation: 'request' | 'stream'): string;
    protected getErrorMessage(operation: 'request' | 'stream'): string;
    protected estimateRequestTokens(request: ImageEditRequest): number;
    protected executeRequest(request: ImageEditRequest, selected: SelectedModelFor<T>, ctx: AIContext<T>): Promise<ImageGenerationResponse>;
    protected executeStreamRequest(request: ImageEditRequest, selected: SelectedModelFor<T>, ctx: AIContext<T>): AsyncIterable<ImageGenerationChunk>;
    protected responseToChunks(response: ImageGenerationResponse): ImageGenerationChunk[];
    protected chunksToResponse(chunks: ImageGenerationChunk[], model: string): ImageGenerationResponse;
    protected getHandlerGetMethod(handler?: ModelHandlerFor<T>): ((request: ImageEditRequest, ctx: AIContext<T>) => Promise<ImageGenerationResponse>) | undefined;
    protected getHandlerStreamMethod(handler?: ModelHandlerFor<T>): ((request: ImageEditRequest, ctx: AIContext<T>) => AsyncIterable<ImageGenerationChunk>) | undefined;
    protected hasProviderExecutor(selected: SelectedModelFor<T>): boolean;
    protected hasProviderStreamer(selected: SelectedModelFor<T>): boolean;
}
declare class ImageAnalyzeAPI<T extends AIBaseTypes = AIBaseTypes> extends BaseAPI<T, ImageAnalyzeRequest, Response, Chunk> {
    constructor(ai: AI<T>);
    protected getRequiredCapabilities(provided: ModelCapability[], request: ImageAnalyzeRequest, forStreaming: boolean): ModelCapability[];
    protected getRequiredParameters(provided: ModelParameter[], request: ImageAnalyzeRequest, forStreaming: boolean): ModelParameter[];
    protected getNoModelFoundError(): string;
    protected getErrorType(operation: 'request' | 'stream'): string;
    protected getErrorMessage(operation: 'request' | 'stream'): string;
    protected getNoModelFoundErrorForStreaming(): string;
    /**
     * Convert ImageAnalyzeRequest to chat Request with multimodal content
     */
    private convertToChatRequest;
    protected estimateRequestTokens(request: ImageAnalyzeRequest, selected: SelectedModelFor<T>): number;
    protected executeRequest(request: ImageAnalyzeRequest, selected: SelectedModelFor<T>, ctx: AIContext<T>): Promise<Response>;
    protected executeStreamRequest(request: ImageAnalyzeRequest, selected: SelectedModelFor<T>, ctx: AIContext<T>): AsyncIterable<Chunk>;
    protected responseToChunks(response: Response): Chunk[];
    protected chunksToResponse(chunks: Chunk[], model: string): Response;
    protected getHandlerGetMethod(handler?: ModelHandlerFor<T>): ((request: ImageAnalyzeRequest, ctx: AIContext<T>) => Promise<Response>) | undefined;
    protected getHandlerStreamMethod(handler?: ModelHandlerFor<T>): ((request: ImageAnalyzeRequest, ctx: AIContext<T>) => AsyncIterable<Chunk>) | undefined;
    protected hasProviderExecutor(selected: SelectedModelFor<T>): boolean;
    protected hasProviderStreamer(selected: SelectedModelFor<T>): boolean;
}
/**
 * Image API - Facade providing access to generate, edit, and analyze sub-APIs
 */
export declare class ImageAPI<T extends AIBaseTypes> {
    readonly generate: ImageGenerateAPI<T>;
    readonly edit: ImageEditAPI<T>;
    readonly analyze: ImageAnalyzeAPI<T>;
    constructor(ai: AI<T>);
}
export {};
//# sourceMappingURL=image.d.ts.map