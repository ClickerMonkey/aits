/**
 * Embed API
 *
 * Provides text embedding functionality.
 */

import type { Usage } from '@aits/core';
import type { AI } from '../ai';
import type {
  AIBaseTypes,
  AIContext,
  EmbeddingRequest,
  EmbeddingResponse,
  ModelCapability,
  ModelParameter,
  ModelHandlerFor,
  SelectedModelFor
} from '../types';
import { BaseAPI } from './base';

export class EmbedAPI<T extends AIBaseTypes> extends BaseAPI<
  T,
  EmbeddingRequest,
  EmbeddingResponse,
  never
> {
  constructor(ai: AI<T>) {
    super(ai);
  }

  // ============================================================================
  // REQUIRED ABSTRACT METHOD IMPLEMENTATIONS
  // ============================================================================

  protected getRequiredCapabilities(provided: ModelCapability[], request: EmbeddingRequest, forStreaming: boolean): ModelCapability[] {
    return ['embedding', ...provided];
  }

  protected getRequiredParameters(provided: ModelParameter[], request: EmbeddingRequest, forStreaming: boolean): ModelParameter[] {
    const params = new Set<ModelParameter>([...provided]);

    if (request.dimensions !== undefined) params.add('embeddingDimensions');

    return Array.from(params);
  }

  protected getNoModelFoundError(): string {
    return 'No compatible model found for embeddings';
  }

  protected getErrorType(): string {
    return 'embedding-generation-failed';
  }

  protected getErrorMessage(): string {
    return 'Embedding generation failed';
  }

  protected async executeRequest(
    request: EmbeddingRequest,
    selected: SelectedModelFor<T>,
    ctx: AIContext<T>
  ): Promise<EmbeddingResponse> {
    return await selected.provider.embed!(
      request,
      ctx,
      selected.providerConfig
    );
  }

  protected async *executeStreamRequest(
    request: EmbeddingRequest,
    selected: SelectedModelFor<T>,
    ctx: AIContext<T>
  ): AsyncIterable<never> {
    throw new Error('Streaming not supported for embeddings');
  }

  // ============================================================================
  // OPTIONAL OVERRIDES
  // ============================================================================

  protected estimateRequestUsage(request: EmbeddingRequest): Usage {
    const totalTextLength = request.texts.reduce((sum, text) => sum + text.length, 0);
    const tokens = Math.ceil(totalTextLength / 4);
    return {
      embeddings: {
        count: request.texts.length,
        tokens
      }
    };
  }

  protected responseToChunks(response: EmbeddingResponse): never {
    throw new Error('Embeddings do not support chunking');
  }

  protected chunksToResponse(chunks: never[]): EmbeddingResponse {
    throw new Error('Embeddings do not support chunking');
  }

  protected getHandlerGetMethod(
    handler?: ModelHandlerFor<T>
  ): ((request: EmbeddingRequest, ctx: AIContext<T>) => Promise<EmbeddingResponse>) | undefined {
    return handler?.embed?.get;
  }

  protected getHandlerStreamMethod(
    handler?: ModelHandlerFor<T>
  ): ((request: EmbeddingRequest, ctx: AIContext<T>) => AsyncIterable<never>) | undefined {
    return undefined;
  }

  protected hasProviderExecutor(selected: SelectedModelFor<T>): boolean {
    return !!selected.provider.embed;
  }

  protected hasProviderStreamer(selected: SelectedModelFor<T>): boolean {
    return false; // Embed API doesn't support streaming
  }
}
