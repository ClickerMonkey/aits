/**
 * Mock Executor Utilities
 *
 * Provides mock executor implementations for testing without real API calls.
 */

import { accumulateUsage } from '../../common';
import type { Chunk, Executor, Request, Response, Streamer, Usage } from '../../types';

export interface MockExecutorOptions {
  response?: Partial<Response>;
  error?: Error;
  delay?: number;
}

/**
 * Creates a mock executor for testing.
 * Can be configured with a single response or multiple responses for sequential calls.
 */
export const createMockExecutor = (options?: MockExecutorOptions | { responses: Partial<Response>[] }) => {
  // Check if we have multiple responses
  if (options && 'responses' in options) {
    let callIndex = 0;
    return jest.fn(async (request, ctx, metadata, signal) => {
      if (signal?.aborted) {
        throw new Error('Request aborted');
      }

      await new Promise(resolve => setTimeout(resolve, 5));

      const response = options.responses[callIndex++] || options.responses[options.responses.length - 1];
      const defaultResponse: Response = {
        content: 'Mock response',
        finishReason: 'stop',
        usage: {
          text: {
            input: 10,
            output: 20,
            total: 30
          }
        },
        model: 'mock-model',
      };

      return {
        ...defaultResponse,
        ...response
      };
    });
  }

  // Single response mode
  return jest.fn(async (request, ctx, metadata, signal) => {
    const opts = options as MockExecutorOptions | undefined;

    // Simulate delay if specified
    await new Promise(resolve => setTimeout(resolve, opts?.delay ?? 5));

    // Check for abort signal
    if (signal?.aborted) {
      throw new Error('Request aborted');
    }

    // Throw error if specified
    if (opts?.error) {
      throw opts.error;
    }

    // Return mock response
    const defaultResponse: Response = {
      content: 'Mock response',
      finishReason: 'stop',
      usage: {
        text: {
          input: 10,
          output: 20,
          total: 30
        }
      },
      model: 'mock-model',
    };

    return {
      ...defaultResponse,
      ...opts?.response
    };
  });
};

/**
 * Creates a mock executor that returns tool calls
 */
export const createMockExecutorWithTools = (
  toolCalls: Array<{ id: string; name: string; arguments: any }>
): Executor<any, any> => {
  return createMockExecutor({
    response: {
      content: '',
      finishReason: 'tool_calls',
      toolCalls: toolCalls.map(tc => ({
        ...tc,
        type: 'function' as const
      }))
    }
  });
};

/**
 * Creates a spy executor that tracks calls
 */
export const createSpyExecutor = (
  baseExecutor?: Executor<any, any>
): Executor<any, any> & { calls: any[] } => {
  const calls: any[] = [];

  const executor = async (request: any, ctx: any, metadata?: any, signal?: AbortSignal) => {
    calls.push({ request, ctx, metadata, signal });

    if (baseExecutor) {
      return await baseExecutor(request, ctx, metadata, signal);
    }

    return createMockExecutor()(request, ctx, metadata, signal);
  };

  (executor as any).calls = calls;
  return executor as Executor<any, any> & { calls: any[] };
};

/**
 * Creates a mock streamer for testing
 */
export const createMockStreamer = <TContext extends object = {}, TMetadata extends object = {}>(options: {
  chunks: Chunk[];
}): Streamer<TContext, TMetadata> => {
  const fn: Streamer<TContext, TMetadata> = async function* (request: Request, ctx: TContext, metadata?: TMetadata, signal?: AbortSignal): AsyncGenerator<Chunk, Response, void> {
    for (const chunk of options.chunks) {
      if (signal?.aborted) {
        throw new Error('Request aborted');
      }
      yield chunk;
    }
    return {
      content: options.chunks.map(c => c.content).join(''),
      finishReason: options.chunks.find(c => c.finishReason)?.finishReason || 'stop',
      usage: options.chunks.reduce((acc, chunk) => (accumulateUsage(acc, chunk.usage), acc), {} as Usage),
      reasoning: options.chunks.map(c => c.reasoning).filter(Boolean).join(''),
      refusal: options.chunks.map(c => c.refusal).filter(Boolean).join(''),
      model: options.chunks.find(c => c.model)?.model || 'mock-model',
    };
  };

  return jest.fn(fn);
};
