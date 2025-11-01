/**
 * Image API Tests
 *
 * Tests for the Image API covering generation, editing, and streaming.
 */

import { models } from '@aits/models';
import { AI } from '../ai';
import { createMockProvider } from './mocks/provider.mock';
import type { ImageGenerationRequest, ImageEditRequest } from '../types';

describe('Image API', () => {
  describe('Image Generation', () => {
    it('should generate image', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({ models });

      await ai.models.refresh();

      const request: ImageGenerationRequest = {
        prompt: 'A beautiful sunset'
      };

      const response = await ai.image.generate.get(request);

      expect(response).toBeDefined();
      expect(response.images).toBeDefined();
      expect(response.images.length).toBeGreaterThan(0);
    });

    it('should generate image with options', async () => {
      const openai = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ openai })
        .create({ models });

      await ai.models.refresh();

      const request: ImageGenerationRequest = {
        prompt: 'A cat',
        size: '1024x1024',
        n: 2
      };

      const response = await ai.image.generate.get(request);

      expect(response).toBeDefined();
    });

    it('should select image model', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({ models });

      await ai.models.refresh();

      const request: ImageGenerationRequest = {
        prompt: 'A dog'
      };

      const response = await ai.image.generate.get(request, {
        metadata: { model: 'provider1-image-1' },
      });

      expect(response).toBeDefined();
    });

    it('should call hooks for image generation', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const beforeRequest = jest.fn();
      const afterRequest = jest.fn();

      const ai = AI.with()
        .providers({ provider1 })
        .create({ models })
        .withHooks({
          beforeRequest,
          afterRequest
        });

      await ai.models.refresh();

      const request: ImageGenerationRequest = {
        prompt: 'A landscape'
      };

      await ai.image.generate.get(request);

      expect(beforeRequest).toHaveBeenCalled();
      expect(afterRequest).toHaveBeenCalled();
    });
  });

  describe('Image Streaming', () => {
    it('should stream image generation', async () => {
      const openai = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ openai })
        .create({ models });

      const request: ImageGenerationRequest = {
        prompt: 'A mountain'
      };

      const chunks = [];
      for await (const chunk of ai.image.generate.stream(request)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('Image Editing', () => {
    it('should edit image', async () => {
      const openai = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ openai })
        .create({ models });

      const request: ImageEditRequest = {
        image: Buffer.from('image-data'),
        prompt: 'Make it blue'
      };

      const response = await ai.image.edit.get(request);

      expect(response).toBeDefined();
      expect(response.images).toBeDefined();
    });

    it('should edit image with mask', async () => {
      const openai = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ openai })
        .create({ models });

      const request: ImageEditRequest = {
        image: Buffer.from('image-data'),
        mask: Buffer.from('mask-data'),
        prompt: 'Remove background'
      };

      const response = await ai.image.edit.get(request);

      expect(response).toBeDefined();
    });

    it('should stream image editing', async () => {
      const openai = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ openai })
        .create({ models });

      const request: ImageEditRequest = {
        image: Buffer.from('image-data'),
        prompt: 'Make it brighter'
      };

      const chunks = [];
      for await (const chunk of ai.image.edit.stream(request)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw when no image model available', async () => {
      const provider1 = createMockProvider({
        name: 'provider1',
        models: [] // No models
      });

      const ai = AI.with()
        .providers({ provider1 })
        .create({ models });

      const request: ImageGenerationRequest = {
        prompt: 'Test'
      };

      await expect(ai.image.generate.get(request)).rejects.toThrow();
    });

    it('should propagate generation errors', async () => {
      const failingProvider = createMockProvider({
        name: 'failing',
        generateImageError: new Error('Generation failed')
      });

      const ai = AI.with()
        .providers({ failing: failingProvider })
        .create({ models });

      await ai.models.refresh();

      const request: ImageGenerationRequest = {
        prompt: 'Test'
      };

      await expect(ai.image.generate.get(request)).rejects.toThrow('Generation failed');
    });
  });
});
