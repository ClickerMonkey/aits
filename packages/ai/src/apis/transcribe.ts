/**
 * Transcribe API
 *
 * Provides speech-to-text functionality.
 */

import type { AI } from '../ai';
import type {
  AIBaseTypes,
  AIContext,
  ModelCapability,
  ModelHandlerFor,
  SelectedModelFor,
  TranscriptionChunk,
  TranscriptionRequest,
  TranscriptionResponse
} from '../types';
import { BaseAPI } from './base';

export class TranscribeAPI<T extends AIBaseTypes> extends BaseAPI<
  T,
  TranscriptionRequest,
  TranscriptionResponse,
  TranscriptionChunk
> {
  constructor(ai: AI<T>) {
    super(ai);
  }

  // ============================================================================
  // REQUIRED ABSTRACT METHOD IMPLEMENTATIONS
  // ============================================================================

  protected getModel(request: TranscriptionRequest): string | undefined {
    return request.model;
  }

  protected getRequiredCapabilities(provided: ModelCapability[]): ModelCapability[] {
    return ['hearing', ...provided];
  }

  protected getNoModelFoundError(): string {
    return 'No compatible model found for transcription';
  }

  protected getErrorType(): string {
    return 'transcription-failed';
  }

  protected getErrorMessage(): string {
    return 'Transcription failed';
  }

  protected async executeRequest(
    request: TranscriptionRequest,
    selected: SelectedModelFor<T>,
    ctx: AIContext<T>
  ): Promise<TranscriptionResponse> {
    return await selected.provider.transcribe!<AIContext<T>>(
      request,
      ctx,
      selected.providerConfig
    );
  }

  // ============================================================================
  // OPTIONAL OVERRIDES
  // ============================================================================

  protected validateProviderCapability(selected: SelectedModelFor<T>): void {
    if (!selected.provider.transcribe) {
      throw new Error(`Provider ${selected.model.provider} does not support transcription`);
    }
  }

  protected shouldUseAdapter(): boolean {
    return true;
  }

  protected estimateRequestTokens(): number {
    return 1000; // Default estimate for audio
  }

  protected async *executeStreamRequest(
    request: TranscriptionRequest,
    selected: SelectedModelFor<T>,
    ctx: AIContext<T>
  ): AsyncIterable<TranscriptionChunk> {
    if (!selected.provider.transcribeStream) {
      throw new Error(`Provider ${selected.model.provider} does not support streaming transcription`);
    }

    yield* selected.provider.transcribeStream<AIContext<T>>(
      request,
      ctx,
      selected.providerConfig
    );
  }

  protected responseToChunk(response: TranscriptionResponse): TranscriptionChunk {
    return {
      text: response.text,
      done: true,
    };
  }

  protected chunksToResponse(chunks: TranscriptionChunk[], model: string): TranscriptionResponse {
    const text = chunks.map(c => c.text || '').join('');
    const words = chunks.flatMap(c => c.word ? [c.word] : []);
    const segments = chunks.flatMap(c => c.segment ? [c.segment] : []);

    return {
      text,
      words: words.length > 0 ? words : undefined,
      segments: segments.length > 0 ? segments : undefined,
      model,
    };
  }

  protected getHandlerGetMethod(
    handler?: ModelHandlerFor<T>
  ): ((request: TranscriptionRequest, ctx: AIContext<T>) => Promise<TranscriptionResponse>) | undefined {
    return handler?.transcribe?.get;
  }

  protected getHandlerStreamMethod(
    handler?: ModelHandlerFor<T>
  ): ((request: TranscriptionRequest, ctx: AIContext<T>) => AsyncIterable<TranscriptionChunk>) | undefined {
    return handler?.transcribe?.stream;
  }

  protected hasProviderExecutor(selected: SelectedModelFor<T>): boolean {
    return !!selected.provider.transcribe;
  }

  protected hasProviderStreamer(selected: SelectedModelFor<T>): boolean {
    return !!selected.provider.transcribeStream;
  }
}
