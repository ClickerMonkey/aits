/**
 * Transcribe API
 *
 * Provides speech-to-text functionality.
 */

import { ModelInput } from '@aeye/core';
import type { AI } from '../ai';
import type {
  AIBaseTypes,
  AIContext,
  ModelCapability,
  ModelHandlerFor,
  ModelParameter,
  SelectedModelFor,
  TranscriptionChunk,
  TranscriptionRequest,
  TranscriptionResponse,
  Usage
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

  protected getRequiredCapabilities(provided: ModelCapability[], request: TranscriptionRequest, forStreaming: boolean): ModelCapability[] {
    return ['hearing', ...provided];
  }

  protected getRequiredParameters(provided: ModelParameter[], request: TranscriptionRequest, forStreaming: boolean): ModelParameter[] {
    const params = new Set<ModelParameter>();

    if (request.prompt !== undefined) {
      params.add('transcribePrompt');
    }
    if (forStreaming) {
      params.add('transcribeStream');
    }

    return Array.from(params);
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
    return await selected.provider.transcribe!(
      request,
      ctx,
      selected.providerConfig
    );
  }

  // ============================================================================
  // OPTIONAL OVERRIDES
  // ============================================================================

  protected estimateRequestUsage(): Usage {
    // Default estimate for audio transcription
    // Assume 1 minute of audio ~ 200 tokens of output
    const estimatedMinutes = 1;
    const estimatedTokens = estimatedMinutes * 200;
    
    return {
      audio: {
        seconds: estimatedMinutes * 60,
        input: 1000 // Rough estimate for audio input tokens
      },
      text: {
        output: estimatedTokens
      }
    };
  }

  protected async *executeStreamRequest(
    request: TranscriptionRequest,
    selected: SelectedModelFor<T>,
    ctx: AIContext<T>
  ): AsyncIterable<TranscriptionChunk> {
    if (!selected.provider.transcribeStream) {
      throw new Error(`Provider ${selected.model.provider} does not support streaming transcription`);
    }

    return yield* selected.provider.transcribeStream(
      request,
      ctx,
      selected.providerConfig
    );
  }

  protected responseToChunks(response: TranscriptionResponse): TranscriptionChunk[] {
    return [{
      text: response.text,
      model: response.model,
      usage: response.usage,
    }];
  }

  protected chunksToResponse(chunks: TranscriptionChunk[], givenModel: SelectedModelFor<T>): TranscriptionResponse {
    let text = '';
    let model: ModelInput = givenModel.model;
    let usage: Usage | undefined;

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
