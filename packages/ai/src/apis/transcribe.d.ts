/**
 * Transcribe API
 *
 * Provides speech-to-text functionality.
 */
import type { AI } from '../ai';
import type { AIBaseTypes, AIContext, ModelCapability, ModelHandlerFor, ModelParameter, SelectedModelFor, TranscriptionChunk, TranscriptionRequest, TranscriptionResponse } from '../types';
import { BaseAPI } from './base';
export declare class TranscribeAPI<T extends AIBaseTypes> extends BaseAPI<T, TranscriptionRequest, TranscriptionResponse, TranscriptionChunk> {
    constructor(ai: AI<T>);
    protected getRequiredCapabilities(provided: ModelCapability[], request: TranscriptionRequest, forStreaming: boolean): ModelCapability[];
    protected getRequiredParameters(provided: ModelParameter[], request: TranscriptionRequest, forStreaming: boolean): ModelParameter[];
    protected getNoModelFoundError(): string;
    protected getErrorType(): string;
    protected getErrorMessage(): string;
    protected executeRequest(request: TranscriptionRequest, selected: SelectedModelFor<T>, ctx: AIContext<T>): Promise<TranscriptionResponse>;
    protected estimateRequestTokens(): number;
    protected executeStreamRequest(request: TranscriptionRequest, selected: SelectedModelFor<T>, ctx: AIContext<T>): AsyncIterable<TranscriptionChunk>;
    protected responseToChunks(response: TranscriptionResponse): TranscriptionChunk[];
    protected chunksToResponse(chunks: TranscriptionChunk[], givenModel: string): TranscriptionResponse;
    protected getHandlerGetMethod(handler?: ModelHandlerFor<T>): ((request: TranscriptionRequest, ctx: AIContext<T>) => Promise<TranscriptionResponse>) | undefined;
    protected getHandlerStreamMethod(handler?: ModelHandlerFor<T>): ((request: TranscriptionRequest, ctx: AIContext<T>) => AsyncIterable<TranscriptionChunk>) | undefined;
    protected hasProviderExecutor(selected: SelectedModelFor<T>): boolean;
    protected hasProviderStreamer(selected: SelectedModelFor<T>): boolean;
}
//# sourceMappingURL=transcribe.d.ts.map