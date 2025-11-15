/**
 * Embed API
 *
 * Provides text embedding functionality.
 */
import type { AI } from '../ai';
import type { AIBaseTypes, AIContext, EmbeddingRequest, EmbeddingResponse, ModelCapability, ModelParameter, ModelHandlerFor, SelectedModelFor } from '../types';
import { BaseAPI } from './base';
export declare class EmbedAPI<T extends AIBaseTypes> extends BaseAPI<T, EmbeddingRequest, EmbeddingResponse, never> {
    constructor(ai: AI<T>);
    protected getRequiredCapabilities(provided: ModelCapability[], request: EmbeddingRequest, forStreaming: boolean): ModelCapability[];
    protected getRequiredParameters(provided: ModelParameter[], request: EmbeddingRequest, forStreaming: boolean): ModelParameter[];
    protected getNoModelFoundError(): string;
    protected getErrorType(): string;
    protected getErrorMessage(): string;
    protected executeRequest(request: EmbeddingRequest, selected: SelectedModelFor<T>, ctx: AIContext<T>): Promise<EmbeddingResponse>;
    protected executeStreamRequest(request: EmbeddingRequest, selected: SelectedModelFor<T>, ctx: AIContext<T>): AsyncIterable<never>;
    protected estimateRequestTokens(request: EmbeddingRequest): number;
    protected responseToChunks(response: EmbeddingResponse): never;
    protected chunksToResponse(chunks: never[]): EmbeddingResponse;
    protected getHandlerGetMethod(handler?: ModelHandlerFor<T>): ((request: EmbeddingRequest, ctx: AIContext<T>) => Promise<EmbeddingResponse>) | undefined;
    protected getHandlerStreamMethod(handler?: ModelHandlerFor<T>): ((request: EmbeddingRequest, ctx: AIContext<T>) => AsyncIterable<never>) | undefined;
    protected hasProviderExecutor(selected: SelectedModelFor<T>): boolean;
    protected hasProviderStreamer(selected: SelectedModelFor<T>): boolean;
}
//# sourceMappingURL=embed.d.ts.map