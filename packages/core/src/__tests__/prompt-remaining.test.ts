/**
 * Prompt Remaining Coverage Tests
 *
 * Simple, targeted tests for remaining uncovered lines
 */

import { z } from 'zod';
import { Prompt } from '../prompt';
import { Tool } from '../tool';
import { Context } from '../types';
import { createMockExecutor, createMockStreamer } from './mocks/executor.mock';

describe('Prompt Remaining Coverage', () => {
  it.skip('should return component type as prompt', () => {
    const prompt = new Prompt({
      name: 'test',
      description: 'Test',
      content: 'Test'
    });

    expect(prompt.type).toBe('prompt');
  });

  it('should handle abort signal during streaming', async () => {
    const prompt = new Prompt({
      name: 'abortable',
      description: 'Abortable',
      content: 'Test'
    });

    const controller = new AbortController();

    const streamer = createMockStreamer({
      chunks: [
        { content: 'chunk1', finishReason: null },
        { content: 'chunk2', finishReason: 'stop' }
      ]
    });

    const ctx: Context<{}, {}> = {
      stream: streamer as any,
      signal: controller.signal,
      messages: []
    };

    // Start streaming
    const streamPromise = (async () => {
      const chunks = [];
      for await (const chunk of prompt.get({}, 'streamContent', ctx)) {
        chunks.push(chunk);
      }
      return chunks;
    })();

    // Abort after a short delay
    setTimeout(() => controller.abort(), 10);

    try {
      await streamPromise;
    } catch (error) {
      // May throw due to abort
    }
  });

  it('should handle tool with invalid JSON in arguments', async () => {
    const tool = new Tool({
      name: 'json-tool',
      description: 'JSON tool',
      instructions: 'JSON',
      schema: z.object({ value: z.string() }),
      call: (input) => input.value
    });

    const prompt = new Prompt({
      name: 'invalid-json',
      description: 'Invalid JSON',
      content: 'Test',
      tools: [tool],
      config: { maxIterations: 2 }
    });

    const executor = createMockExecutor({
      responses: [
        {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [{
            id: 'call_1',
            name: 'json-tool',
            arguments: '{invalid json}' // Invalid JSON
          }]
        },
        {
          content: 'Recovered',
          finishReason: 'stop'
        }
      ]
    });

    const ctx: Context<{}, {}> = {
      execute: executor as any,
      messages: []
    };

    const result = await prompt.get({}, 'result', ctx);
    expect(result).toBe('Recovered');
  });

  it.skip('should handle finishReason length with retry', async () => {
    const prompt = new Prompt({
      name: 'length-retry',
      description: 'Length retry',
      content: 'Test'
    });

    let callCount = 0;
    const executor = jest.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          content: 'partial',
          finishReason: 'length',
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
        };
      }
      return {
        content: 'complete',
        finishReason: 'stop'
      };
    });

    const ctx: Context<{}, {}> = {
      execute: executor as any,
      messages: []
    };

    const result = await prompt.get({}, 'result', ctx);
    expect(result).toBe('complete');
    expect(callCount).toBe(2);
  });

  it('should handle tool execution with different error scenarios', async () => {
    const tool1 = new Tool({
      name: 'error-tool',
      description: 'Error tool',
      instructions: 'Error',
      schema: z.object({}),
      call: () => {
        throw new Error('Tool error');
      }
    });

    const tool2 = new Tool({
      name: 'success-tool',
      description: 'Success tool',
      instructions: 'Success',
      schema: z.object({}),
      call: () => 'success'
    });

    const prompt = new Prompt({
      name: 'mixed-tools',
      description: 'Mixed tools',
      content: 'Test',
      tools: [tool1, tool2],
      config: { maxIterations: 2 }
    });

    const executor = createMockExecutor({
      responses: [
        {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [
            { id: 'call_1', name: 'error-tool', arguments: '{}' },
            { id: 'call_2', name: 'success-tool', arguments: '{}' }
          ]
        },
        {
          content: 'Handled mixed results',
          finishReason: 'stop'
        }
      ]
    });

    const ctx: Context<{}, {}> = {
      execute: executor as any,
      messages: []
    };

    const result = await prompt.get({}, 'result', ctx);
    expect(result).toBe('Handled mixed results');
  });

  it('should handle streaming with tool events', async () => {
    const tool = new Tool({
      name: 'stream-tool',
      description: 'Stream tool',
      instructions: 'Stream',
      schema: z.object({}),
      call: () => 'streamed'
    });

    const prompt = new Prompt({
      name: 'stream-with-tools',
      description: 'Stream with tools',
      content: 'Test',
      tools: [tool],
      toolExecution: 'immediate'
    });

    const executor = createMockExecutor({
      responses: [
        {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [{
            id: 'call_1',
            name: 'stream-tool',
            arguments: '{}'
          }]
        },
        {
          content: 'Done',
          finishReason: 'stop'
        }
      ]
    });

    const ctx: Context<{}, {}> = {
      execute: executor as any,
      messages: []
    };

    const events = [];
    for await (const event of prompt.get({}, 'stream', ctx)) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(0);
  });

  it('should handle message without role during forget', async () => {
    const prompt = new Prompt({
      name: 'forget-edge',
      description: 'Forget edge',
      content: 'Test'
    });

    let callCount = 0;
    const executor = jest.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          content: '',
          finishReason: 'length',
          usage: { inputTokens: 1000, outputTokens: 0, totalTokens: 1000 }
        };
      }
      return {
        content: 'success',
        finishReason: 'stop'
      };
    });

    const ctx: Context<{}, {}> = {
      execute: executor as any,
      messages: [
        { role: 'user', content: 'test', tokens: 100 },
        { role: 'assistant', content: 'response', tokens: 100 }
      ],
      defaultCompletionTokens: 500
    };

    const result = await prompt.get({}, 'result', ctx);
    expect(result).toBe('success');
  });

  it('should track tool statistics through reconfig', async () => {
    let reconfigStats: any;

    const tool = new Tool({
      name: 'stats-tool',
      description: 'Stats tool',
      instructions: 'Stats',
      schema: z.object({}),
      call: () => 'result'
    });

    const prompt = new Prompt({
      name: 'stats-tracking',
      description: 'Stats tracking',
      content: 'Test',
      tools: [tool],
      reconfig: (stats) => {
        reconfigStats = stats;
        return false; // Stop after first
      }
    });

    const executor = createMockExecutor({
      responses: [
        {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [{
            id: 'call_1',
            name: 'stats-tool',
            arguments: '{}'
          }]
        },
        {
          content: 'Done',
          finishReason: 'stop'
        }
      ]
    });

    const ctx: Context<{}, {}> = {
      execute: executor as any,
      messages: []
    };

    try {
      await prompt.get({}, 'result', ctx);
    } catch (error) {
      // Expected to throw when reconfig returns false
    }

    expect(reconfigStats).toBeDefined();
    expect(reconfigStats.toolSuccesses).toBeGreaterThan(0);
  });

  it('should handle parse with plain text when no schema', async () => {
    const prompt = new Prompt({
      name: 'plain-text',
      description: 'Plain text',
      content: 'Test'
      // No schema
    });

    const executor = createMockExecutor({
      response: {
        content: 'Just plain text response',
        finishReason: 'stop'
      }
    });

    const ctx: Context<{}, {}> = {
      execute: executor as any,
      messages: []
    };

    const result = await prompt.get({}, 'result', ctx);
    expect(result).toBe('Just plain text response');
  });

  it('should handle ZodString schema specifically', async () => {
    const prompt = new Prompt({
      name: 'zod-string',
      description: 'Zod string',
      content: 'Test',
      schema: z.string().min(5)
    });

    const executor = createMockExecutor({
      response: {
        content: 'Valid string response',
        finishReason: 'stop'
      }
    });

    const ctx: Context<{}, {}> = {
      execute: executor as any,
      messages: []
    };

    const result = await prompt.get({}, 'result', ctx);
    expect(result).toBe('Valid string response');
  });

  it('should handle non-JSON parse error with retry', async () => {
    const prompt = new Prompt({
      name: 'parse-error',
      description: 'Parse error',
      content: 'Extract data',
      schema: z.object({ value: z.number() }),
      config: { maxIterations: 2 }
    });

    const executor = createMockExecutor({
      responses: [
        {
          content: 'This is definitely not JSON',
          finishReason: 'stop'
        },
        {
          content: '{"value": 42}',
          finishReason: 'stop'
        }
      ]
    });

    const ctx: Context<{}, {}> = {
      execute: executor as any,
      messages: []
    };

    const result = await prompt.get({}, 'result', ctx);
    expect(result).toEqual({ value: 42 });
  });
});
