/**
 * Speech API
 *
 * Provides text-to-speech functionality.
 */
import type { AI } from '../ai';
import type { AIBaseTypes, AIContext, ModelCapability, ModelHandlerFor, ModelParameter, SelectedModelFor, SpeechRequest, SpeechResponse } from '../types';
import { BaseAPI } from './base';
export declare class SpeechAPI<T extends AIBaseTypes> extends BaseAPI<T, SpeechRequest, SpeechResponse, SpeechResponse> {
    constructor(ai: AI<T>);
    protected getRequiredCapabilities(provided: ModelCapability[], request: SpeechRequest, forStreaming: boolean): ModelCapability[];
    protected getRequiredParameters(provided: ModelParameter[], request: SpeechRequest, forStreaming: boolean): ModelParameter[];
    protected getNoModelFoundError(): string;
    protected getErrorType(operation: 'request' | 'stream'): string;
    protected getErrorMessage(operation: 'request' | 'stream'): string;
    protected executeRequest(request: SpeechRequest, selected: SelectedModelFor<T>, ctx: AIContext<T>): Promise<SpeechResponse>;
    protected executeStreamRequest(request: SpeechRequest, selected: SelectedModelFor<T>, ctx: AIContext<T>): AsyncIterable<SpeechResponse>;
    protected estimateRequestTokens(request: SpeechRequest): number;
    protected responseToChunks(response: SpeechResponse): SpeechResponse[];
    protected chunksToResponse(chunks: SpeechResponse[], model: string): SpeechResponse;
    protected getHandlerGetMethod(handler?: ModelHandlerFor<T>): ((request: SpeechRequest, ctx: AIContext<T>) => Promise<SpeechResponse>) | undefined;
    protected getHandlerStreamMethod(handler?: ModelHandlerFor<T>): ((request: SpeechRequest, ctx: AIContext<T>) => AsyncIterable<SpeechResponse>) | undefined;
    protected hasProviderExecutor(selected: SelectedModelFor<T>): boolean;
    protected hasProviderStreamer(selected: SelectedModelFor<T>): boolean;
}
//# sourceMappingURL=speech.d.ts.map