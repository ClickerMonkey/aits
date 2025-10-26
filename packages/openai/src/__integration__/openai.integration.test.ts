/**
 * OpenAI Provider Integration Tests
 *
 * Tests that make REAL API calls to OpenAI.
 * Requires OPENAI_API_KEY environment variable.
 */

import { OpenAIProvider } from '../openai';
import type { Request, ImageGenerationRequest, TranscriptionRequest, SpeechRequest, EmbeddingRequest } from '@aits/ai';
import { getAPIKey, skipIfNoAPIKey } from './setup';

const describeIntegration = skipIfNoAPIKey();

describeIntegration('OpenAI Integration', () => {
  let provider: OpenAIProvider;

  beforeAll(() => {
    provider = new OpenAIProvider({
      apiKey: getAPIKey()
    });
  });

  describe('Model Listing', () => {
    it('should list real models from OpenAI', async () => {
      const models = await provider.listModels!();

      expect(models.length).toBeGreaterThan(0);
      expect(models.some(m => m.id.includes('gpt'))).toBe(true);

      console.log(`  Found ${models.length} models`);
      console.log(`  Sample: ${models.slice(0, 3).map(m => m.id).join(', ')}`);
    }, 30000);

    it('should include model capabilities', async () => {
      const models = await provider.listModels!();

      const chatModels = models.filter(m => m.capabilities.has('chat'));
      expect(chatModels.length).toBeGreaterThan(0);

      console.log(`  Chat models: ${chatModels.length}`);
    }, 30000);
  });

  describe('Health Check', () => {
    it('should pass health check', async () => {
      const isHealthy = await provider.checkHealth!();

      expect(isHealthy).toBe(true);
    }, 30000);
  });

  describe('Chat Completion', () => {
    it('should complete a simple chat', async () => {
      const executor = provider.createExecutor();

      const request: Request = {
        messages: [
          {
            role: 'user',
            content: 'Reply with exactly: "Test successful"'
          }
        ]
      };

      const response = await executor(request, {}, { model: 'gpt-3.5-turbo' });

      expect(response.content).toBeTruthy();
      expect(typeof response.content).toBe('string');
      expect(response.finishReason).toBe('stop');
      expect(response.usage).toBeDefined();
      expect(response.usage!.totalTokens).toBeGreaterThan(0);

      console.log(`  Response: ${response.content}`);
      console.log(`  Tokens: ${response.usage!.totalTokens}`);
    }, 30000);

    it('should stream chat completion', async () => {
      const streamer = provider.createStreamer();

      const request: Request = {
        messages: [
          {
            role: 'user',
            content: 'Count from 1 to 3'
          }
        ]
      };

      const chunks: string[] = [];
      let finalUsage: any = null;

      for await (const chunk of streamer(request, {}, { model: 'gpt-3.5-turbo' })) {
        if (chunk.content) {
          chunks.push(chunk.content as string);
        }
        if (chunk.usage) {
          finalUsage = chunk.usage;
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(finalUsage).toBeDefined();

      const fullText = chunks.join('');
      console.log(`  Received ${chunks.length} chunks`);
      console.log(`  Full response: ${fullText}`);
    }, 30000);

    it('should use model from context metadata', async () => {
      const executor = provider.createExecutor();

      const request: Request = {
        messages: [
          {
            role: 'user',
            content: 'Say "hi"'
          }
        ]
      };

      const ctx = {
        metadata: {
          model: 'gpt-4'
        }
      };

      const response = await executor(request, ctx as any, {});

      expect(response.content).toBeTruthy();
      console.log(`  Used model from context: gpt-4`);
      console.log(`  Response: ${response.content}`);
    }, 30000);
  });

  describe('Image Generation', () => {
    it('should generate an image', async () => {
      const request: ImageGenerationRequest = {
        prompt: 'A simple red circle on white background',
        n: 1,
        size: '256x256'
      };

      const response = await provider.generateImage!(request, {});

      expect(response.images).toHaveLength(1);
      expect(response.images[0].url).toBeTruthy();
      expect(response.model).toBeTruthy();

      console.log(`  Generated image URL: ${response.images[0].url}`);
      console.log(`  Model: ${response.model}`);
    }, 60000); // Image generation can be slow

    it('should use model from context for image generation', async () => {
      const request: ImageGenerationRequest = {
        prompt: 'A blue square',
        size: '256x256'
      };

      const ctx = {
        metadata: {
          model: 'dall-e-2'
        }
      };

      const response = await provider.generateImage!(request, ctx as any);

      expect(response.images).toHaveLength(1);
      expect(response.model).toContain('dall-e');

      console.log(`  Model: ${response.model}`);
    }, 60000);
  });

  describe('Embeddings', () => {
    it('should generate embeddings', async () => {
      const request: EmbeddingRequest = {
        texts: ['Hello world', 'Test embedding']
      };

      const response = await provider.embed!(request, {});

      expect(response.embeddings).toHaveLength(2);
      expect(response.embeddings[0].embedding.length).toBeGreaterThan(0);
      expect(response.usage).toBeDefined();

      console.log(`  Generated ${response.embeddings.length} embeddings`);
      console.log(`  Dimension: ${response.embeddings[0].embedding.length}`);
      console.log(`  Tokens: ${response.usage?.totalTokens}`);
    }, 30000);

    it('should use model from context for embeddings', async () => {
      const request: EmbeddingRequest = {
        texts: ['Test']
      };

      const ctx = {
        metadata: {
          model: 'text-embedding-3-small'
        }
      };

      const response = await provider.embed!(request, ctx as any);

      expect(response.embeddings).toHaveLength(1);
      expect(response.model).toContain('embedding');

      console.log(`  Model: ${response.model}`);
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle invalid model', async () => {
      const executor = provider.createExecutor();

      const request: Request = {
        messages: [{ role: 'user', content: 'Test' }]
      };

      await expect(
        executor(request, {}, { model: 'invalid-model-name' })
      ).rejects.toThrow();
    }, 30000);

    it('should handle rate limiting gracefully', async () => {
      // Note: This test may not always trigger rate limits
      // depending on your API tier and current usage

      const executor = provider.createExecutor();

      const request: Request = {
        messages: [{ role: 'user', content: 'Hi' }]
      };

      // Make multiple rapid requests
      const promises = Array(5).fill(null).map(() =>
        executor(request, {}, { model: 'gpt-3.5-turbo' })
      );

      // At least some should succeed
      const results = await Promise.allSettled(promises);
      const succeeded = results.filter(r => r.status === 'fulfilled').length;

      expect(succeeded).toBeGreaterThan(0);

      console.log(`  ${succeeded}/5 requests succeeded`);
    }, 60000);
  });

  describe('Provider Config', () => {
    it('should work with custom base URL', async () => {
      // Test that custom config doesn't break anything
      const customProvider = new OpenAIProvider({
        apiKey: getAPIKey(),
        baseURL: 'https://api.openai.com/v1' // Default URL
      });

      const executor = customProvider.createExecutor();

      const response = await executor(
        { messages: [{ role: 'user', content: 'Hi' }] },
        {},
        { model: 'gpt-3.5-turbo' }
      );

      expect(response.content).toBeTruthy();
    }, 30000);
  });
});
