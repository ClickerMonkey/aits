/**
 * Speech API
 *
 * Provides text-to-speech functionality.
 */

import type { AI } from '../ai';
import type {
  AIBaseTypes,
  AIContext,
  AIProviderNames,
  ModelHandler,
  ModelCapability,
  SelectedModelFor,
  SpeechChunk,
  SpeechRequest,
  SpeechResponse,
  ModelHandlerFor
} from '../types';
import { BaseAPI } from './base';

export class SpeechAPI<T extends AIBaseTypes> extends BaseAPI<
  T,
  SpeechRequest,
  SpeechResponse,
  SpeechChunk
> {
  constructor(ai: AI<T>) {
    super(ai);
  }

  // ============================================================================
  // REQUIRED ABSTRACT METHOD IMPLEMENTATIONS
  // ============================================================================

  protected getRequiredCapabilities(provided: ModelCapability[]): ModelCapability[] {
    return ['audio', ...provided];
  }

  protected getNoModelFoundError(): string {
    return 'No compatible model found for speech generation';
  }

  protected getErrorType(operation: 'request' | 'stream'): string {
    return operation === 'request'
      ? 'speech-generation-failed'
      : 'speech-generation-stream-failed';
  }

  protected getErrorMessage(operation: 'request' | 'stream'): string {
    return operation === 'request'
      ? 'Speech generation failed'
      : 'Speech generation streaming failed';
  }

  protected async executeRequest(
    request: SpeechRequest,
    selected: SelectedModelFor<T>,
    ctx: AIContext<T>
  ): Promise<SpeechResponse> {
    return await selected.provider.generateSpeech!(
      request,
      ctx,
      selected.providerConfig
    );
  }

  protected async *executeStreamRequest(
    request: SpeechRequest,
    selected: SelectedModelFor<T>,
    ctx: AIContext<T>
  ): AsyncIterable<SpeechChunk> {
    yield* selected.provider.generateSpeechStream!(
      request,
      ctx,
      selected.providerConfig
    );
  }

  // ============================================================================
  // OPTIONAL OVERRIDES
  // ============================================================================

  protected validateProviderCapability(selected: SelectedModelFor<T>): void {
    if (!selected.provider.generateSpeech) {
      throw new Error(`Provider ${selected.model.provider} does not support speech generation`);
    }
  }

  protected validateProviderStreamingCapability(selected: SelectedModelFor<T>): void {
    if (!selected.provider.generateSpeechStream) {
      throw new Error(`Provider ${selected.model.provider} does not support streaming speech generation`);
    }
  }

  protected estimateRequestTokens(request: SpeechRequest): number {
    return Math.ceil(request.text.length / 4);
  }

  protected responseToChunk(response: SpeechResponse): SpeechChunk {
    return {
      audioData: response.audioBuffer,
      done: true,
    };
  }

  protected chunksToResponse(chunks: SpeechChunk[]): SpeechResponse {
    const buffers = chunks
      .filter(c => c.audioData)
      .map(c => c.audioData!);

    const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
    const combined = Buffer.concat(buffers, totalLength);

    return {
      audioBuffer: combined,
      contentType: 'audio/mpeg',
      model: 'unknown',
    };
  }

  protected getHandlerGetMethod(
    handler?: ModelHandlerFor<T>
  ): ((request: SpeechRequest, ctx: AIContext<T>) => Promise<SpeechResponse>) | undefined {
    return handler?.speech?.get;
  }

  protected getHandlerStreamMethod(
    handler?: ModelHandlerFor<T>
  ): ((request: SpeechRequest, ctx: AIContext<T>) => AsyncIterable<SpeechChunk>) | undefined {
    return handler?.speech?.stream;
  }

  protected hasProviderExecutor(selected: SelectedModelFor<T>): boolean {
    return !!selected.provider.generateSpeech;
  }

  protected hasProviderStreamer(selected: SelectedModelFor<T>): boolean {
    return !!selected.provider.generateSpeechStream;
  }
}
