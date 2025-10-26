/**
 * Models API Tests
 *
 * Tests for the Models API covering model listing and information retrieval.
 */

import { AI } from '../ai';
import { createMockProvider, createMockModels } from './mocks/provider.mock';

describe('Models API', () => {
  describe('Model Listing', () => {
    it('should list all models', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      await ai.registry.refresh();

      const models = ai.models.list();

      expect(models).toBeDefined();
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
    });

    it('should list models from multiple providers', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });
      const provider2 = createMockProvider({ name: 'provider2' });

      const ai = AI.with()
        .providers({ provider1, provider2 })
        .create({});

      await ai.registry.refresh();

      const models = ai.models.list();

      const provider1Models = models.filter(m => m.provider === 'provider1');
      const provider2Models = models.filter(m => m.provider === 'provider2');

      expect(provider1Models.length).toBeGreaterThan(0);
      expect(provider2Models.length).toBeGreaterThan(0);
    });

    it('should list models with capabilities', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      await ai.registry.refresh();

      const models = ai.models.list();

      models.forEach(model => {
        expect(model.capabilities).toBeDefined();
        expect(model.capabilities.size).toBeGreaterThan(0);
      });
    });

    it('should list models with pricing info', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      await ai.registry.refresh();

      const models = ai.models.list();

      models.forEach(model => {
        expect(model.pricing).toBeDefined();
      });
    });
  });

  describe('Model Filtering', () => {
    it('should filter models by capability', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      await ai.registry.refresh();

      const allModels = ai.models.list();
      const chatModels = allModels.filter(m => m.capabilities.has('chat'));

      expect(chatModels.length).toBeGreaterThan(0);
      chatModels.forEach(model => {
        expect(model.capabilities.has('chat')).toBe(true);
      });
    });

    it('should filter models by provider', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });
      const provider2 = createMockProvider({ name: 'provider2' });

      const ai = AI.with()
        .providers({ provider1, provider2 })
        .create({});

      await ai.registry.refresh();

      const allModels = ai.models.list();
      const provider1Models = allModels.filter(m => m.provider === 'provider1');

      expect(provider1Models.length).toBeGreaterThan(0);
      provider1Models.forEach(model => {
        expect(model.provider).toBe('provider1');
      });
    });

    it('should filter models by tier', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      await ai.registry.refresh();

      const allModels = ai.models.list();
      const flagshipModels = allModels.filter(m => m.tier === 'flagship');
      const efficientModels = allModels.filter(m => m.tier === 'efficient');

      expect(flagshipModels.length).toBeGreaterThan(0);
      expect(efficientModels.length).toBeGreaterThan(0);
    });
  });

  describe('Model Information', () => {
    it('should get model by id', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      await ai.registry.refresh();

      const models = ai.models.list();
      const firstModel = models[0];

      const model = ai.models.get(firstModel.id);

      expect(model).toBeDefined();
      expect(model?.id).toBe(firstModel.id);
    });

    it('should return undefined for non-existent model', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      await ai.registry.refresh();

      const model = ai.models.get('non-existent-model');

      expect(model).toBeUndefined();
    });

    it('should get models with context window info', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      await ai.registry.refresh();

      const models = ai.models.list();

      models.forEach(model => {
        expect(model.contextWindow).toBeDefined();
        expect(typeof model.contextWindow).toBe('number');
        expect(model.contextWindow).toBeGreaterThan(0);
      });
    });
  });

  describe('Model Refresh', () => {
    it('should refresh models from providers', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      const modelsBefore = ai.models.list();
      expect(modelsBefore.length).toBe(0);

      await ai.registry.refresh();

      const modelsAfter = ai.models.list();
      expect(modelsAfter.length).toBeGreaterThan(0);
    });
  });

  describe('Model Selection', () => {
    it('should help identify best model for use case', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      await ai.registry.refresh();

      const models = ai.models.list();
      const chatModels = models.filter(m =>
        m.capabilities.has('chat') && m.capabilities.has('streaming')
      );

      expect(chatModels.length).toBeGreaterThan(0);
    });

    it('should identify models by tier and capability', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      await ai.registry.refresh();

      const models = ai.models.list();
      const efficientChatModels = models.filter(m =>
        m.tier === 'efficient' && m.capabilities.has('chat')
      );

      expect(efficientChatModels.length).toBeGreaterThan(0);
    });
  });
});
