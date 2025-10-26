/**
 * AI Class Tests
 *
 * Tests for the main AI class including initialization, configuration,
 * API surface creation, and basic functionality.
 */

import { AI } from '../ai';
import { createMockProvider, createMockModels } from './mocks/provider.mock';
import type { ModelInfo } from '../types';

describe('AI Class', () => {
  describe('Initialization', () => {
    it('should create AI instance with basic config', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      expect(ai).toBeDefined();
      expect(ai.providers).toBeDefined();
      expect(ai.providers.provider1).toBe(provider1);
    });

    it('should create AI instance with context and metadata types', () => {
      interface AppContext {
        userId: string;
        sessionId: string;
      }

      interface AppMetadata {
        version: string;
        environment: string;
      }

      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with<AppContext, AppMetadata>()
        .providers({ provider1 })
        .create({});

      expect(ai).toBeDefined();
    });

    it('should initialize with multiple providers', () => {
      const provider1 = createMockProvider({ name: 'provider1' });
      const provider2 = createMockProvider({ name: 'provider2' });

      const ai = AI.with()
        .providers({ provider1, provider2 })
        .create({});

      expect(ai.providers.provider1).toBe(provider1);
      expect(ai.providers.provider2).toBe(provider2);
    });

    it('should initialize registry with providers', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      expect(ai.registry).toBeDefined();
    });

    it('should initialize all API surfaces', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      expect(ai.chat).toBeDefined();
      expect(ai.image).toBeDefined();
      expect(ai.speech).toBeDefined();
      expect(ai.transcribe).toBeDefined();
      expect(ai.embed).toBeDefined();
      expect(ai.models).toBeDefined();
    });

    it('should store config', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const config = {
        defaultCostPerMillionTokens: 10.0
      };

      const ai = AI.with()
        .providers({ provider1 })
        .create(config);

      expect(ai.config).toBeDefined();
      expect(ai.config.defaultCostPerMillionTokens).toBe(10.0);
    });
  });

  describe('Configuration', () => {
    it.skip('should register base models', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const customModels: ModelInfo[] = [
        {
          id: 'custom-model-1',
          provider: 'provider1',
          name: 'Custom Model 1',
          capabilities: new Set(['chat']),
          tier: 'flagship',
          pricing: {
            inputTokensPer1M: 5.0,
            outputTokensPer1M: 15.0
          },
          contextWindow: 8192
        }
      ];

      const ai = AI.with()
        .providers({ provider1 })
        .create({
          models: customModels
        });

      await ai.registry.refresh();
      const models = ai.registry.listModels();

      const customModel = models.find(m => m.id === 'custom-model-1');
      expect(customModel).toBeDefined();
      expect(customModel?.name).toBe('Custom Model 1');
    });

    it.skip('should apply model overrides', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({
          modelOverrides: [
            {
              modelId: 'provider1-chat-flagship',
              overrides: {
                contextWindow: 200000  // Override context window
              },
            }
          ]
        });

      await ai.registry.refresh();
      const models = ai.registry.listModels();

      // Model overrides should be applied after refresh
      const overriddenModel = models.find(m => m.id === 'provider1-chat-flagship');
      expect(overriddenModel).toBeDefined();
      if (overriddenModel) {
        expect(overriddenModel.contextWindow).toBe(200000);
      }
    });

    it('should set default cost per million tokens', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({
          defaultCostPerMillionTokens: 7.5
        });

      expect(ai.config.defaultCostPerMillionTokens).toBe(7.5);
    });

    it('should configure token calculation settings', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({
          tokens: {
            textDivisor: 5,
            textFallback: 2000,
            imageDivisor: 1200
          }
        });

      expect(ai.tokens.text.divisor).toBe(5);
      expect(ai.tokens.text.fallback).toBe(2000);
      expect(ai.tokens.image.divisor).toBe(1200);
    });

    it('should use default token settings when not provided', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      expect(ai.tokens.text.divisor).toBe(4);
      expect(ai.tokens.text.fallback).toBe(1000);
      expect(ai.tokens.image.divisor).toBe(1125);
      expect(ai.tokens.audio.divisor).toBe(3);
      expect(ai.tokens.file.divisor).toBe(3);
    });
  });

  describe('Hooks', () => {
    it('should initialize with empty hooks', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      expect(ai.hooks).toBeDefined();
      expect(ai.hooks).toEqual({});
    });

    it('should allow setting hooks via withHooks', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      const beforeRequest = jest.fn();
      const afterRequest = jest.fn();

      ai.withHooks({
        beforeRequest,
        afterRequest
      });

      expect(ai.hooks.beforeRequest).toBe(beforeRequest);
      expect(ai.hooks.afterRequest).toBe(afterRequest);
    });

    it('should return AI instance from withHooks', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      const result = ai.withHooks({
        beforeRequest: jest.fn()
      });

      expect(result).toBe(ai);
    });
  });

  describe('Components', () => {
    it('should initialize with empty components array', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      expect(ai.components).toBeDefined();
      expect(ai.components).toEqual([]);
    });
  });

  describe('Token Helpers', () => {
    it('should provide token calculation config for text', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      expect(ai.tokens.text).toBeDefined();
      expect(ai.tokens.text.divisor).toBe(4);
      expect(ai.tokens.text.base64Divisor).toBe(3);
      expect(ai.tokens.text.fallback).toBe(1000);
    });

    it('should provide token calculation config for images', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      expect(ai.tokens.image).toBeDefined();
      expect(ai.tokens.image.divisor).toBe(1125);
      expect(ai.tokens.image.base64Divisor).toBe(1500);
      expect(ai.tokens.image.fallback).toBe(1360);
      expect(ai.tokens.image.max).toBe(1360);
    });

    it('should provide token calculation config for audio', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      expect(ai.tokens.audio).toBeDefined();
      expect(ai.tokens.audio.divisor).toBe(3);
      expect(ai.tokens.audio.base64Divisor).toBe(4);
      expect(ai.tokens.audio.fallback).toBe(200);
    });

    it('should provide token calculation config for files', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      expect(ai.tokens.file).toBeDefined();
      expect(ai.tokens.file.divisor).toBe(3);
      expect(ai.tokens.file.base64Divisor).toBe(4);
      expect(ai.tokens.file.fallback).toBe(1000);
    });
  });

  describe('Static Builder', () => {
    it('should create AI with static with() method', () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      expect(ai).toBeInstanceOf(AI);
    });

    it('should support type parameters in with() method', () => {
      interface MyContext {
        user: string;
      }

      interface MyMetadata {
        version: number;
      }

      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with<MyContext, MyMetadata>()
        .providers({ provider1 })
        .create({});

      expect(ai).toBeInstanceOf(AI);
    });

    it('should chain providers() and create() fluently', () => {
      const provider1 = createMockProvider({ name: 'provider1' });
      const provider2 = createMockProvider({ name: 'provider2' });

      const ai = AI
        .with()
        .providers({ provider1, provider2 })
        .create({
          defaultCostPerMillionTokens: 5.0
        });

      expect(ai).toBeInstanceOf(AI);
      expect(ai.config.defaultCostPerMillionTokens).toBe(5.0);
    });
  });
});
