/**
 * Speech API
 *
 * Provides text-to-speech functionality.
 */

import type { Usage } from '@aeye/core';
import type { AI } from '../ai';
import type {
  AIBaseTypes,
  AIContext,
  ModelCapability,
  ModelHandlerFor,
  ModelParameter,
  SelectedModelFor,
  SpeechRequest,
  SpeechResponse
} from '../types';
import { BaseAPI } from './base';

export class SpeechAPI<T extends AIBaseTypes> extends BaseAPI<
  T,
  SpeechRequest,
  SpeechResponse,
  SpeechResponse
> {
  constructor(ai: AI<T>) {
    super(ai);
  }

  // ============================================================================
  // REQUIRED ABSTRACT METHOD IMPLEMENTATIONS
  // ============================================================================

  protected getRequiredCapabilities(provided: ModelCapability[], request: SpeechRequest, forStreaming: boolean): ModelCapability[] {
    return ['audio', ...provided];
  }

  protected getRequiredParameters(provided: ModelParameter[], request: SpeechRequest, forStreaming: boolean): ModelParameter[] {
    const params = new Set<ModelParameter>(provided);

    if (request.instructions !== undefined) {
      params.add('speechInstructions');
    }

    return Array.from(params);
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
    return await selected.provider.speech!(
      request,
      ctx,
      selected.providerConfig
    );
  }

  protected async *executeStreamRequest(
    request: SpeechRequest,
    selected: SelectedModelFor<T>,
    ctx: AIContext<T>
  ): AsyncIterable<SpeechResponse> {
    yield this.executeRequest(request, selected, ctx);
  }

  // ============================================================================
  // OPTIONAL OVERRIDES
  // ============================================================================

  protected estimateRequestUsage(request: SpeechRequest): Usage {
    const tokens = Math.ceil(request.text.length / 4);
    // Estimate output audio duration (rough estimate: 150 words per minute, 4 chars per word)
    const estimatedMinutes = (request.text.length / 4 / 150);
    const estimatedSeconds = estimatedMinutes * 60;
    
    return {
      text: {
        input: tokens
      },
      audio: {
        seconds: estimatedSeconds
      }
    };
  }

  protected responseToChunks(response: SpeechResponse): SpeechResponse[] {
    return [response];
  }

  protected chunksToResponse(chunks: SpeechResponse[], model: string): SpeechResponse {
    return chunks[0];
  }

  protected getHandlerGetMethod(
    handler?: ModelHandlerFor<T>
  ): ((request: SpeechRequest, ctx: AIContext<T>) => Promise<SpeechResponse>) | undefined {
    return handler?.speech?.get;
  }

  protected getHandlerStreamMethod(
    handler?: ModelHandlerFor<T>
  ): ((request: SpeechRequest, ctx: AIContext<T>) => AsyncIterable<SpeechResponse>) | undefined {
    return undefined;
  }

  protected hasProviderExecutor(selected: SelectedModelFor<T>): boolean {
    return !!selected.provider.speech;
  }

  protected hasProviderStreamer(selected: SelectedModelFor<T>): boolean {
    return false;
  }
}
