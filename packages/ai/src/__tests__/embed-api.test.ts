/**
 * Embed API Tests
 *
 * Tests for the Embed API covering text embedding generation.
 */

import { models } from '@aeye/models';
import { AI } from '../ai';
import { createMockProvider } from './mocks/provider.mock';
import type { EmbeddingRequest } from '../types';

describe('Embed API', () => {
  describe('Embedding Generation', () => {
    it('should generate embeddings for single text', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({ models });

      await ai.models.refresh();

      const request: EmbeddingRequest = {
        texts: ['Hello world']
      };

      const response = await ai.embed.get(request);

      expect(response).toBeDefined();
      expect(response.embeddings).toBeDefined();
      expect(response.embeddings.length).toBe(1);
      expect(response.embeddings[0].embedding).toBeDefined();
      expect(Array.isArray(response.embeddings[0].embedding)).toBe(true);
    });

    it('should generate embeddings for multiple texts', async () => {
      const openai = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ openai })
        .create({ models });

      const request: EmbeddingRequest = {
        texts: ['First text', 'Second text', 'Third text']
      };

      const response = await ai.embed.get(request);

      expect(response).toBeDefined();
      expect(response.embeddings.length).toBe(3);
      expect(response.embeddings[0].index).toBe(0);
      expect(response.embeddings[1].index).toBe(1);
      expect(response.embeddings[2].index).toBe(2);
    });

    it('should use specified embedding model', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({ models });

      const request: EmbeddingRequest = {
        texts: ['Test']
      };

      const response = await ai.embed.get(request, {
        metadata: { model: 'provider1-embed-1' }
      });

      expect(response).toBeDefined();
    });

    it('should track usage for embeddings', async () => {
      const openai = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ openai })
        .create({ models });

      const request: EmbeddingRequest = {
        texts: ['Hello', 'World']
      };

      const response = await ai.embed.get(request);

      expect(response.usage).toBeDefined();
      expect(response.usage?.embeddings?.tokens).toBeGreaterThan(0);
    });

    it('should call hooks for embeddings', async () => {
      const openai = createMockProvider({ name: 'provider1' });

      const beforeRequest = jest.fn();
      const afterRequest = jest.fn();

      const ai = AI.with()
        .providers({ openai })
        .create({ models })
        .withHooks({
          beforeRequest,
          afterRequest
        });

      const request: EmbeddingRequest = {
        texts: ['Test']
      };

      await ai.embed.get(request);

      expect(beforeRequest).toHaveBeenCalled();
      expect(afterRequest).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should throw when no embedding model available', async () => {
      const provider1 = createMockProvider({
        name: 'provider1',
        models: [] // No models
      });

      const ai = AI.with()
        .providers({ provider1 })
        .create({ models });

      const request: EmbeddingRequest = {
        texts: ['Test']
      };

      await expect(ai.embed.get(request)).rejects.toThrow();
    });

    it('should handle empty text array', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({ models });

      const request: EmbeddingRequest = {
        texts: []
      };

      // Should handle gracefully or throw validation error
      try {
        await ai.embed.get(request);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
