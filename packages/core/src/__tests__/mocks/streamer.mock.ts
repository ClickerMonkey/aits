/**
 * Mock Streamer Utilities
 *
 * Provides mock streamer implementations for testing streaming without real API calls.
 */

import type { Streamer, Chunk } from '../../types';

export interface MockStreamerOptions {
  chunks?: Partial<Chunk>[];
  error?: Error;
  delay?: number;
  throwAfterChunk?: number;
}

/**
 * Creates a mock streamer for testing
 */
export const createMockStreamer = (options?: MockStreamerOptions): Streamer<any, any> => {
  return async function* (request, ctx, metadata, signal) {
    const chunks = options?.chunks || [
      { content: 'Hello', finishReason: null },
      { content: ' world', finishReason: null },
      { content: '!', finishReason: 'stop', usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 } }
    ];

    for (let i = 0; i < chunks.length; i++) {
      // Simulate delay if specified
      if (options?.delay) {
        await new Promise(resolve => setTimeout(resolve, options.delay));
      }

      // Check for abort signal
      if (signal?.aborted) {
        throw new Error('Request aborted');
      }

      // Throw error after specific chunk if specified
      if (options?.throwAfterChunk !== undefined && i === options.throwAfterChunk) {
        throw options.error || new Error('Stream error');
      }

      yield chunks[i] as Chunk;
    }

    // Throw error at end if specified and not already thrown
    if (options?.error && options?.throwAfterChunk === undefined) {
      throw options.error;
    }
  };
};

/**
 * Creates a mock streamer that yields tool calls
 */
export const createMockStreamerWithTools = (
  toolCalls: Array<{ id: string; name: string; arguments: any }>
): Streamer<any, any> => {
  return async function* (request, ctx, metadata, signal) {
    // Yield initial chunk
    yield { content: '', finishReason: null };

    // Yield tool calls chunk
    yield {
      content: '',
      finishReason: 'tool_calls',
      toolCalls: toolCalls.map(tc => ({
        ...tc,
        type: 'function' as const
      })),
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
    };
  };
};

/**
 * Creates a spy streamer that tracks chunks
 */
export const createSpyStreamer = (
  baseStreamer?: Streamer<any, any>
): Streamer<any, any> & { chunks: Chunk[] } => {
  const chunks: Chunk[] = [];

  const streamer = async function* (request: any, ctx: any, metadata?: any, signal?: AbortSignal) {
    const generator = baseStreamer
      ? baseStreamer(request, ctx, metadata, signal)
      : createMockStreamer()(request, ctx, metadata, signal);

    for await (const chunk of generator) {
      chunks.push(chunk);
      yield chunk;
    }
  };

  (streamer as any).chunks = chunks;
  return streamer as Streamer<any, any> & { chunks: Chunk[] };
};

/**
 * Collects all chunks from a streamer into an array
 */
export const collectChunks = async (
  streamer: AsyncIterable<Chunk>
): Promise<Chunk[]> => {
  const chunks: Chunk[] = [];
  for await (const chunk of streamer) {
    chunks.push(chunk);
  }
  return chunks;
};
