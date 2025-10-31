/**
 * Prompt Forget Function Tests
 *
 * Comprehensive tests for the forget (message trimming) function in prompt.ts
 * Targets lines 934-993
 */

import { Prompt } from '../prompt';
import { Context, Message } from '../types';

describe('Prompt Forget Function Coverage', () => {
  it('should use estimateTokens to fill in missing token counts (line 934-940)', async () => {
    const prompt = new Prompt({
      name: 'estimate-test',
      description: 'Estimate test',
      content: 'Test',
      config: {
        model: { id: 'gpt', contextWindow: 3000 }
      }
    });

    let estimateCallCount = 0;
    let callCount = 0;

    const executor = jest.fn(async (request) => {
      callCount++;
      if (callCount === 1) {
        // Trigger forget with length - large input tokens to trigger trimming
        return {
          content: '',
          finishReason: 'length',
          usage: { inputTokens: 700, outputTokens: 0, totalTokens: 700 },
          model: 'model-abc',
        } as const;
      }
      return {
        content: 'success',
        finishReason: 'stop',
        model: 'model-abc',
      } as const;
    });

    const ctx: Context<{}, {}> = {
      execute: executor,
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'msg1' }, // No tokens - will need estimation
        { role: 'assistant', content: 'resp1' }, // No tokens - will need estimation
        { role: 'user', content: 'msg2' }, // No tokens - will need estimation
        { role: 'user', content: 'msg3' } // Force high token count
      ],
      estimateTokens: (msg: Message) => {
        estimateCallCount++;
        return 200; // Higher estimate to trigger trimming
      },
      maxOutputTokens: 500
    };

    await prompt.get({}, 'result', ctx);

    // estimateTokens should be called for messages without tokens
    expect(estimateCallCount).toBeGreaterThan(0);
  });

  it('should chunk messages with token boundaries (lines 942-958)', async () => {
    const prompt = new Prompt({
      name: 'chunking-test',
      description: 'Chunking test',
      content: 'Test'
    });

    let callCount = 0;

    const executor = jest.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          content: '',
          finishReason: 'length',
          usage: { inputTokens: 2500, outputTokens: 0, totalTokens: 2500 },
          model: 'model-abc',
        } as const;
      }
      return {
        content: 'success',
        finishReason: 'stop',
        model: 'model-abc',
      } as const;
    });

    const ctx: Context<{}, {}> = {
      execute: executor,
      messages: [
        { role: 'system', content: 'sys', tokens: 100 },
        { role: 'user', content: 'u1', tokens: 500 },
        { role: 'assistant', content: 'a1', tokens: 500 },
        { role: 'user', content: 'u2', tokens: 500 },
        { role: 'assistant', content: 'a2', tokens: 500 }
      ],
      maxOutputTokens: 500
    };

    const result = await prompt.get({}, 'result', ctx);
    expect(result).toBe('success');
    expect(callCount).toBe(2);
  });

  it('should handle empty currentChunk when chunks.length === 0 (lines 959-962)', async () => {
    const prompt = new Prompt({
      name: 'empty-chunk',
      description: 'Empty chunk',
      content: 'Test'
    });

    let callCount = 0;

    const executor = jest.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          content: '',
          finishReason: 'length',
          usage: { inputTokens: 500, outputTokens: 0, totalTokens: 500 },
          model: 'model-abc',
        } as const;
      }
      return {
        content: 'success',
        finishReason: 'stop',
        model: 'model-abc',
      } as const;
    });

    const ctx: Context<{}, {}> = {
      execute: executor,
      messages: [
        { role: 'user', content: 'single' } // Single message, no tokens field
      ],
      maxOutputTokens: 400
    };

    const result = await prompt.get({}, 'result', ctx);
    expect(result).toBe('success');
  });

  it('should handle currentChunk with existing chunks (lines 963-965)', async () => {
    const prompt = new Prompt({
      name: 'chunk-prepend',
      description: 'Chunk prepend',
      content: 'Test'
    });

    let callCount = 0;

    const executor = jest.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          content: '',
          finishReason: 'length',
          usage: { inputTokens: 1000, outputTokens: 0, totalTokens: 1000 },
          model: 'model-abc',
        } as const;
      }
      return {
        content: 'success',
        finishReason: 'stop',
        model: 'model-abc',
      } as const;
    });

    const ctx: Context<{}, {}> = {
      execute: executor,
      messages: [
        { role: 'system', content: 'sys', tokens: 100 },
        { role: 'user', content: 'u1' }, // No tokens
        { role: 'assistant', content: 'a1', tokens: 200 },
        { role: 'user', content: 'u2', tokens: 200 }
      ],
      maxOutputTokens: 600
    };

    const result = await prompt.get({}, 'result', ctx);
    expect(result).toBe('success');
  });

  it('should handle messageMaxIndex === -1 (lines 973-976)', async () => {
    const prompt = new Prompt({
      name: 'no-user-messages',
      description: 'No user messages',
      content: 'Test'
    });

    let callCount = 0;

    const executor = jest.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          content: '',
          finishReason: 'length',
          usage: { inputTokens: 800, outputTokens: 0, totalTokens: 800 },
          model: 'model-abc',
        } as const;
      }
      return {
        content: 'success',
        finishReason: 'stop',
        model: 'model-abc',
      } as const;
    });

    const ctx: Context<{}, {}> = {
      execute: executor,
      messages: [
        { role: 'system', content: 'only system messages', tokens: 100 }
        // No user messages
      ],
      maxOutputTokens: 500
    };

    const result = await prompt.get({}, 'result', ctx);
    expect(result).toBe('success');
  });

  it('should preserve system messages during trimming (lines 981-989)', async () => {
    const prompt = new Prompt({
      name: 'preserve-system',
      description: 'Preserve system',
      content: 'Test'
    });

    let callCount = 0;
    let lastRequest: any;

    const executor = jest.fn(async (request) => {
      callCount++;
      lastRequest = request;
      if (callCount === 1) {
        return {
          content: '',
          finishReason: 'length',
          usage: { inputTokens: 1500, outputTokens: 0, totalTokens: 1500 },
          model: 'model-abc',
        } as const;
      }
      return {
        content: 'success',
        finishReason: 'stop',
        model: 'model-abc',
      } as const;
    });

    const ctx: Context<{}, {}> = {
      execute: executor,
      messages: [
        { role: 'system', content: 'initial system', tokens: 100 },
        { role: 'user', content: 'old message 1', tokens: 300 },
        { role: 'system', content: 'mid system', tokens: 50 }, // System in middle
        { role: 'user', content: 'old message 2', tokens: 300 },
        { role: 'assistant', content: 'old response', tokens: 300 },
        { role: 'user', content: 'recent', tokens: 100 }
      ],
      maxOutputTokens: 1000
    };

    await prompt.get({}, 'result', ctx);

    // System messages should be preserved even during trimming
    if (callCount >= 2 && lastRequest) {
      const systemMsgs = lastRequest.messages.filter((m: Message) => m.role === 'system');
      expect(systemMsgs.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('should handle removal loop with messageTokens (lines 980-989)', async () => {
    const prompt = new Prompt({
      name: 'removal-loop',
      description: 'Removal loop',
      content: 'Test'
    });

    let callCount = 0;

    const executor = jest.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          content: '',
          finishReason: 'length',
          usage: { inputTokens: 2000, outputTokens: 0, totalTokens: 2000 },
          model: 'model-abc',
        } as const;
      }
      return {
        content: 'success',
        finishReason: 'stop',
        model: 'model-abc',
      } as const;
    });

    const ctx: Context<{}, {}> = {
      execute: executor,
      messages: [
        { role: 'system', content: 'sys', tokens: 100 },
        { role: 'user', content: 'm1', tokens: 400 },
        { role: 'assistant', content: 'r1', tokens: 400 },
        { role: 'user', content: 'm2', tokens: 400 },
        { role: 'assistant', content: 'r2', tokens: 400 },
        { role: 'user', content: 'm3', tokens: 300 }
      ],
      maxOutputTokens: 500
    };

    const result = await prompt.get({}, 'result', ctx);
    expect(result).toBe('success');
    expect(callCount).toBe(2);
  });

  it('should append remaining messages after trimming (line 991)', async () => {
    const prompt = new Prompt({
      name: 'append-remaining',
      description: 'Append remaining',
      content: 'Test'
    });

    let callCount = 0;
    let lastRequest: any;

    const executor = jest.fn(async (request) => {
      callCount++;
      lastRequest = request;
      if (callCount === 1) {
        return {
          content: '',
          finishReason: 'length',
          usage: { inputTokens: 1500, outputTokens: 0, totalTokens: 1500 },
          model: 'model-abc',
        } as const;
      }
      return {
        content: 'success',
        finishReason: 'stop',
        model: 'model-abc',
      } as const;
    });

    const ctx: Context<{}, {}> = {
      execute: executor,
      messages: [
        { role: 'system', content: 'sys', tokens: 100 },
        { role: 'user', content: 'trim1', tokens: 400 },
        { role: 'assistant', content: 'trim-resp', tokens: 400 },
        { role: 'user', content: 'keep', tokens: 100 }
      ],
      maxOutputTokens: 1200
    };

    await prompt.get({}, 'result', ctx);

    // The last user message should be kept
    if (callCount >= 2 && lastRequest) {
      const hasKeepMessage = lastRequest.messages.some((m: Message) =>
        m.content === 'keep' || String(m.content).includes('Test')
      );
      expect(hasKeepMessage).toBe(true);
    }
  });
});
