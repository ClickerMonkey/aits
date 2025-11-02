/**
 * AI Class Methods Tests
 *
 * Tests for AI instance methods like buildContext, buildMetadata,
 * selectModel, estimateTokens, etc.
 */

import { AI } from '../ai';
import { createMockProvider } from './mocks/provider.mock';
import type { ModelHandler, Request } from '../types';

describe('AI Class Methods', () => {
  describe('buildContext', () => {
    it('should build context with provided fields', async () => {
      interface AppContext {
        userId: string;
        sessionId?: string;
      }

      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with<AppContext>()
        .providers({ provider1 })
        .create({});

      const ctx = await ai.buildContext({
        userId: 'user-123',
        sessionId: 'session-456'
      });

      expect(ctx).toBeDefined();
      expect(ctx.userId).toBe('user-123');
      expect(ctx.sessionId).toBe('session-456');
    });

    it('should merge provided context', async () => {
      interface AppContext {
        userId: string;
        requestId?: string;
      }

      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with<AppContext>()
        .providers({ provider1 })
        .create({
          providedContext: async (ctx) => ({
            requestId: 'req-789'
          })
        });

      const ctx = await ai.buildContext({
        userId: 'user-123'
      });

      expect(ctx.userId).toBe('user-123');
      expect(ctx.requestId).toBe('req-789');
    });

    it('should include instance in context', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      const ctx = await ai.buildContext({});

      expect(ctx.ai).toBeDefined();
      expect(ctx.ai).toBe(ai);
    });
  });

  describe('buildMetadata', () => {
    it('should build metadata with default values', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      const metadata = await ai.buildMetadata({});

      expect(metadata).toBeDefined();
    });

    it('should include model in metadata', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      const metadata = await ai.buildMetadata({
        model: 'gpt-4'
      });

      expect(metadata.model).toBe('gpt-4');
    });

    it('should include required capabilities', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      const metadata = await ai.buildMetadata({
        required: ['chat', 'streaming']
      });

      expect(metadata.required).toEqual(['chat', 'streaming']);
    });
  });

  describe('selectModel', () => {
    it('should select flagship model by default', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      await ai.models.refresh();
      
      const selected = ai.selectModel({
        required: ['chat']
      });

      expect(selected).toBeDefined();
      expect(selected?.model.tier).toBeDefined();
    });

    it('should select efficient model when requested', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      await ai.models.refresh();

      const selected = ai.selectModel({
        required: ['chat'],
        tier: 'efficient'
      });

      expect(selected).toBeDefined();
      expect(selected?.model.tier).toBe('efficient');
    });

    it('should select model with required capabilities', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      await ai.models.refresh();

      const selected = ai.selectModel({
        required: ['chat', 'streaming']
      });

      expect(selected).toBeDefined();
      expect(selected?.model.capabilities.has('chat')).toBe(true);
      expect(selected?.model.capabilities.has('streaming')).toBe(true);
    });

    it('should return undefined when no models match', async () => {
      const provider1 = createMockProvider({
        name: 'provider1',
        models: [] // No models
      });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      const selected = ai.selectModel({
        required: ['chat']
      });

      expect(selected).toBeUndefined();
    });
  });

  describe('estimateRequestTokens', () => {
    it('should estimate tokens for simple message', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      const request: Request = {
        messages: [
          { role: 'user', content: 'Hello world' }
        ]
      };

      const tokens = ai.estimateRequestTokens(request);

      expect(tokens).toBeGreaterThan(0);
    });

    it('should estimate tokens for multiple messages', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      const request: Request = {
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' }
        ]
      };

      const tokens = ai.estimateRequestTokens(request);

      expect(tokens).toBeGreaterThan(0);
    });

    it('should estimate tokens for long messages', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      const longContent = 'word '.repeat(1000); // ~1000 words

      const request: Request = {
        messages: [
          { role: 'user', content: longContent }
        ]
      };

      const tokens = ai.estimateRequestTokens(request);

      expect(tokens).toBeGreaterThan(100); // Should be hundreds of tokens
    });
  });

  describe('estimateMessageTokens', () => {
    it('should estimate tokens for text message', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      const tokens = ai.estimateMessageTokens({
        role: 'user',
        content: 'Hello world this is a test message'
      });

      expect(tokens).toBeGreaterThan(0);
    });

    it('should estimate tokens for multipart message', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      const tokens = ai.estimateMessageTokens({
        role: 'user',
        content: [
          { type: 'text', content: 'What is in this image?' },
          { type: 'image', content: 'https://example.com/image.png' }
        ]
      });

      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('estimateContentTokens', () => {
    it('should estimate text content', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      const tokens = ai.estimateMessageTokens({ role: 'user', content: 'Hello world' });

      expect(tokens).toBeGreaterThan(0);
    });

    it('should estimate image content', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      const tokens = ai.estimateMessageTokens({ role: 'user', content: [{
        type: 'image',
        content: 'https://example.com/image.png'
      }]});

      expect(tokens).toBeGreaterThan(0);
    });

    it('should estimate audio content', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      const tokens = ai.estimateMessageTokens({ role: 'user', content: [{
        type: 'audio',
        content: Buffer.from('audio-data')
      }]});

      expect(tokens).toBeGreaterThan(0);
    });

    it('should estimate file content', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      const tokens = ai.estimateMessageTokens({ role: 'user', content: [{
        type: 'file',
        content: Buffer.from('file-data')
      }]});

      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
    it('should return initial stats', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      const stats = ai.stats();

      expect(stats).toBeDefined();
      expect(stats.averageCost).toBe(0);
      expect(stats.totalRequests).toBe(0);
      expect(stats.averageLatency).toBe(0);
    });
  });

  describe('Component Registration', () => {
    it('should start with empty components array', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      expect(ai.components).toBeDefined();
      expect(ai.components.length).toBe(0);
    });
  });

  describe('Model Handlers', () => {
    it('should register model handlers from config', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const handler: ModelHandler = {
        models: ['provider1-chat-flagship'],
      };

      const ai = AI.with()
        .providers({ provider1 })
        .create({
          modelHandlers: [handler]
        });

      const retrievedHandler = ai.registry.getHandler('provider1', 'provider1-chat-flagship');
      expect(retrievedHandler).toBeDefined();
    });
  });
});
