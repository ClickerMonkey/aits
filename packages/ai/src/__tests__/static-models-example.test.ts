/**
 * Static Models Example Tests
 *
 * Demonstrates how to use the static OpenRouter models in tests.
 */

import {
  OPENROUTER_MODELS,
  getModelsByProvider,
  getModelsByCapability,
  getModelsByTier,
  getModelById
} from '../__static__/openrouter-models';

describe('Static Models', () => {
  describe('Basic Usage', () => {
    it('should have models available', () => {
      expect(OPENROUTER_MODELS).toBeDefined();
      expect(OPENROUTER_MODELS.length).toBeGreaterThan(0);
    });

    it('should get model by ID', () => {
      const model = getModelById('openai/gpt-4');

      expect(model).toBeDefined();
      expect(model?.provider).toBe('openai');
      expect(model?.capabilities).toContain('chat');
    });

    it('should filter by provider', () => {
      const openaiModels = getModelsByProvider('openai');

      expect(openaiModels.length).toBeGreaterThan(0);
      openaiModels.forEach(model => {
        expect(model.provider).toBe('openai');
      });
    });

    it('should filter by capability', () => {
      const visionModels = getModelsByCapability('vision');

      expect(visionModels.length).toBeGreaterThan(0);
      visionModels.forEach(model => {
        expect(model.capabilities).toContain('vision');
      });
    });

    it('should filter by tier', () => {
      const efficientModels = getModelsByTier('efficient');

      expect(efficientModels.length).toBeGreaterThan(0);
      efficientModels.forEach(model => {
        expect(model.tier).toBe('efficient');
      });
    });
  });

  describe('Model Selection Logic', () => {
    it('should find cheapest chat model', () => {
      const chatModels = getModelsByCapability('chat');

      const cheapest = chatModels.reduce((min, model) => {
        const cost = model.pricing.inputTokensPer1M + model.pricing.outputTokensPer1M;
        const minCost = min.pricing.inputTokensPer1M + min.pricing.outputTokensPer1M;
        return cost < minCost ? model : min;
      });

      expect(cheapest).toBeDefined();
      expect(cheapest.capabilities).toContain('chat');

      // Should be either free or very cheap
      const totalCost = cheapest.pricing.inputTokensPer1M + cheapest.pricing.outputTokensPer1M;
      expect(totalCost).toBeLessThan(1); // Less than $1 per million tokens
    });

    it('should find models with largest context', () => {
      const allModels = OPENROUTER_MODELS;

      const largest = allModels.reduce((max, model) => {
        return model.contextWindow > max.contextWindow ? model : max;
      });

      expect(largest.contextWindow).toBeGreaterThan(100000);
    });

    it('should find vision models for image understanding', () => {
      const visionModels = getModelsByCapability('vision');
      const chatModels = getModelsByCapability('chat');

      const visionChatModels = visionModels.filter(v =>
        chatModels.some(c => c.id === v.id)
      );

      expect(visionChatModels.length).toBeGreaterThan(0);

      // Each should support both vision and chat
      visionChatModels.forEach(model => {
        expect(model.capabilities).toContain('vision');
        expect(model.capabilities).toContain('chat');
      });
    });

    it('should compare pricing across providers', () => {
      const gpt4 = getModelById('openai/gpt-4');
      const claude3Opus = getModelById('anthropic/claude-3-opus');

      if (gpt4 && claude3Opus) {
        const gpt4Cost = gpt4.pricing.inputTokensPer1M + gpt4.pricing.outputTokensPer1M;
        const claudeCost = claude3Opus.pricing.inputTokensPer1M + claude3Opus.pricing.outputTokensPer1M;

        // Both should be expensive flagship models
        expect(gpt4Cost).toBeGreaterThan(10);
        expect(claudeCost).toBeGreaterThan(10);
      }
    });
  });

  describe('Cost Estimation', () => {
    it('should calculate request cost', () => {
      const model = getModelById('openai/gpt-3.5-turbo');

      if (model) {
        const inputTokens = 1000;
        const outputTokens = 500;

        const cost =
          (inputTokens / 1_000_000) * model.pricing.inputTokensPer1M +
          (outputTokens / 1_000_000) * model.pricing.outputTokensPer1M;

        expect(cost).toBeGreaterThan(0);
        expect(cost).toBeLessThan(0.01); // Should be less than 1 cent
      }
    });

    it('should compare costs between tiers', () => {
      const flagshipModels = getModelsByTier('flagship');
      const efficientModels = getModelsByTier('efficient');

      if (flagshipModels.length > 0 && efficientModels.length > 0) {
        const avgFlagshipCost = flagshipModels.reduce((sum, m) => {
          return sum + m.pricing.inputTokensPer1M + m.pricing.outputTokensPer1M;
        }, 0) / flagshipModels.length;

        const avgEfficientCost = efficientModels.reduce((sum, m) => {
          return sum + m.pricing.inputTokensPer1M + m.pricing.outputTokensPer1M;
        }, 0) / efficientModels.length;

        // Flagship models should generally be more expensive
        expect(avgFlagshipCost).toBeGreaterThan(avgEfficientCost);
      }
    });
  });

  describe('Provider Ecosystem', () => {
    it('should have major providers', () => {
      const providers = ['openai', 'anthropic', 'google', 'mistralai', 'meta-llama'];

      providers.forEach(provider => {
        const models = getModelsByProvider(provider);
        expect(models.length).toBeGreaterThan(0);
      });
    });

    it('should have diverse modalities', () => {
      const modalities = new Set(OPENROUTER_MODELS.map(m => m.modality));

      // Should have at least text, vision, and image generation
      expect(Array.from(modalities).some(m => m?.includes('text->text'))).toBe(true);
      expect(Array.from(modalities).some(m => m?.includes('image'))).toBe(true);
    });

    it('should have models across all tiers', () => {
      const flagship = getModelsByTier('flagship');
      const efficient = getModelsByTier('efficient');
      const experimental = getModelsByTier('experimental');

      expect(flagship.length).toBeGreaterThan(0);
      expect(efficient.length).toBeGreaterThan(0);
      expect(experimental.length).toBeGreaterThan(0);
    });
  });

  describe('Real-World Use Cases', () => {
    it('should find suitable model for code generation', () => {
      const chatModels = getModelsByCapability('chat');

      // Look for models commonly used for coding
      const codingModels = chatModels.filter(m =>
        m.name.toLowerCase().includes('code') ||
        m.name.toLowerCase().includes('deepseek') ||
        m.id.includes('gpt-4')
      );

      expect(codingModels.length).toBeGreaterThan(0);
    });

    it('should find suitable model for long documents', () => {
      const chatModels = getModelsByCapability('chat');

      // Find models with large context windows
      const longContextModels = chatModels.filter(m => m.contextWindow >= 100000);

      expect(longContextModels.length).toBeGreaterThan(0);
    });

    it('should find suitable model for production with budget', () => {
      const chatModels = getModelsByCapability('chat');
      const efficientModels = getModelsByTier('efficient');

      // Intersection: efficient chat models
      const budgetModels = chatModels.filter(c =>
        efficientModels.some(e => e.id === c.id)
      );

      expect(budgetModels.length).toBeGreaterThan(0);

      // All should be relatively cheap
      budgetModels.forEach(model => {
        const totalCost = model.pricing.inputTokensPer1M + model.pricing.outputTokensPer1M;
        expect(totalCost).toBeLessThan(5); // Less than $5 per million tokens
      });
    });
  });
});
